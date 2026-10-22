// ======================================================
// File Name : chat.ts
// Purpose   : POST /api/chat — the AI agent. It can read the ledger and
//             PROPOSE lifecycle events; only the user's Confirm click
//             (POST /api/chat/confirm) actually posts anything.
//             With ANTHROPIC_API_KEY set: Claude answers using read-only
//             tools over the live asset book (no FAQ list needed).
//             Without a key: a small built-in answerer that still uses
//             real data, so the widget works out of the box.
// ======================================================

import { Router } from 'express';
import { assets, findAsset } from '../data/assets.js';
import { computeDashboardSummary } from '../data/activity.js';
import { resolveBook } from '../data/books.js';
import { primeBookRules, viewAssetsForBook } from '../services/book-view.js';
import { EVENT_FIELD_HELP, cancelPending, confirmPending, normalizeEventType, proposeEvent, type ActionCard } from '../services/agent-actions.js';

export const chatRouter = Router();

export const MODEL = process.env.CHAT_MODEL || 'claude-sonnet-5-5';
const money = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ---------- Read-only tools (the agent can look, never change) ----------

export const TOOLS = [
  {
    name: 'get_summary',
    description: 'Dashboard totals for the active book: asset count, gross cost, net book value, accumulated depreciation, assets by class.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'search_assets',
    description: 'Search assets. All filters optional. Returns up to 15 matches plus the total match count and summed cost/NBV.',
    input_schema: {
      type: 'object',
      properties: {
        q: { type: 'string', description: 'Text in asset number or description' },
        assetClass: { type: 'string' },
        status: { type: 'string', enum: ['Active', 'Retired', 'Transferred', 'Fully Depreciated', 'Under Review'] },
        company: { type: 'string' },
        location: { type: 'string' }
      }
    }
  },
  {
    name: 'get_asset',
    description: 'Full detail for one asset by asset number.',
    input_schema: { type: 'object', properties: { assetNumber: { type: 'string' } }, required: ['assetNumber'] }
  },
  {
    name: 'get_event_fields',
    description: 'List the fields needed for a lifecycle event type, so you know what to ask the user for.',
    input_schema: {
      type: 'object',
      properties: { eventType: { type: 'string', enum: ['Addition', 'Adjustment', 'Transfer', 'Retirement', 'Reinstatement', 'Reclassification'] } },
      required: ['eventType']
    }
  }
];

// Write-capable tool. Offered only to users who may post events. It does NOT save
// anything: it validates, runs the calculator and shows the user a preview card.
export const PROPOSE_TOOL = {
  name: 'propose_lifecycle_event',
  description: 'Prepare a lifecycle event (Addition, Adjustment, Transfer, Retirement, Reinstatement, Reclassification) for the user to review. Nothing is saved until the user clicks Confirm on the card. Values come from the user or from tools; never invent numbers. If fields are missing the tool tells you which to ask for.',
  input_schema: {
    type: 'object',
    properties: {
      eventType: { type: 'string', enum: ['Addition', 'Adjustment', 'Transfer', 'Retirement', 'Reinstatement', 'Reclassification'] },
      assetNumber: { type: 'string' },
      fields: { type: 'object', description: 'Field key/value pairs as returned by get_event_fields. Dates as YYYY-MM-DD, numbers as numbers.' }
    },
    required: ['eventType', 'assetNumber', 'fields']
  }
};

export interface AgentCtx { canEdit: boolean; actions: ActionCard[] }

export async function runTool(name: string, input: any, ctx: AgentCtx): Promise<unknown> {
  await primeBookRules();

  if (name === 'get_event_fields') {
    const t = normalizeEventType(input.eventType);
    return t ? { eventType: t, fields: EVENT_FIELD_HELP[t] } : { error: 'Unknown eventType' };
  }
  if (name === 'propose_lifecycle_event') {
    if (!ctx.canEdit) return { error: 'This user has view-only access and cannot post events. Tell them to ask an administrator.' };
    const r = proposeEvent(input);
    if (!r.ok) return r;
    ctx.actions.push(r.card); // the card reaches the user directly; the model only has to say it is waiting for Confirm
    return { status: 'awaiting_user_confirmation', summary: r.card.rows, badge: r.card.badge, note: 'A preview card with Confirm/Cancel buttons is now shown to the user. Do not claim it is posted.' };
  }

  const book = resolveBook(undefined);
  if (name === 'get_summary') return computeDashboardSummary(book);

  if (name === 'search_assets') {
    let list = viewAssetsForBook(assets, book);
    const has = (v?: string) => (v ?? '').toLowerCase();
    if (input.q) list = list.filter((a) => `${a.assetNumber} ${a.description}`.toLowerCase().includes(has(input.q)));
    if (input.assetClass) list = list.filter((a) => a.assetClass.toLowerCase().includes(has(input.assetClass)));
    if (input.status) list = list.filter((a) => a.status === input.status);
    if (input.company) list = list.filter((a) => a.company.toLowerCase().includes(has(input.company)));
    if (input.location) list = list.filter((a) => (a.location ?? '').toLowerCase().includes(has(input.location)));
    return {
      totalMatches: list.length,
      totalCost: list.reduce((s, a) => s + a.cost, 0),
      totalNbv: list.reduce((s, a) => s + a.nbv, 0),
      assets: list.slice(0, 15).map((a) => ({
        assetNumber: a.assetNumber, description: a.description, assetClass: a.assetClass,
        status: a.status, cost: a.cost, nbv: a.nbv, location: a.location
      }))
    };
  }

  if (name === 'get_asset') {
    const a = findAsset(String(input.assetNumber));
    return a ?? { error: 'Asset not found' };
  }
  return { error: 'Unknown tool' };
}

// ---------- Claude mode ----------

function systemPrompt(page: string, role: string) {
  return `You are the in-app assistant for "Asset Ledger", a fixed-asset and tax depreciation system (Pub 946, MACRS, bonus depreciation, multiple books, lifecycle events such as addition, transfer, retirement).
Always reply in clear English, even if the user writes in another language or style. Keep answers short, 2 to 5 lines, and plain text.
Use the tools for any question about numbers or specific assets. Never guess figures. If a tool returns nothing, say so.
You are an agent: you can read data and PREPARE lifecycle events with propose_lifecycle_event, but you can never post them. The user must click Confirm on the preview card. Never say something was posted until the user confirms.
Rules for changes: use get_asset first, then get_event_fields if unsure, then ask the user for every missing value (never invent or assume numbers or dates), then call propose_lifecycle_event once. One proposal at a time. If the user has view-only access, say so.
Bulk or unsupported changes: point to Bulk Import or the Lifecycle Events page.
App guide (use it for "how do I" questions):
- Add asset: Asset Register > "+ Add Asset" > Save Asset, or Lifecycle Events > Addition.
- Adjustment, Transfer, Retirement, Reinstatement, Reclassification: Lifecycle Events, choose the event type, select the asset, fill the fields, post.
- Retirement needs Disposal Date, Cost Disposed and Proceeds. Use Reinstatement to undo a retirement.
- Many records at once: Bulk Import (CSV template, eventType column).
- Reports: Reporting. Planning: Modeling, Forecasting. Setup: Configuration (Asset Classes, Pub 946 Tables, Bonus Depreciation, Books List). Users: User Management.
The user is on page: ${page}. Their role: ${role}.`;
}

async function askClaude(message: string, history: { role: string; text: string }[], page: string, role: string, canEdit: boolean): Promise<{ reply: string; actions: ActionCard[] }> {
  const ctx: AgentCtx = { canEdit, actions: [] };
  const tools = canEdit ? [...TOOLS, PROPOSE_TOOL] : TOOLS;
  const messages: any[] = [
    ...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
    { role: 'user', content: message }
  ];

  for (let turn = 0; turn < 8; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 800, system: systemPrompt(page, role), tools, messages })
    });
    if (!r.ok) throw new Error(`Claude API ${r.status}`);
    const data: any = await r.json();

    if (data.stop_reason !== 'tool_use') {
      const text = (data.content as any[]).filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
      return { reply: text || (ctx.actions.length ? 'Please review the details below and confirm.' : ''), actions: ctx.actions };
    }
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const block of data.content.filter((c: any) => c.type === 'tool_use')) {
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(await runTool(block.name, block.input, ctx)) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: "Sorry, I couldn't work out an answer to that. Could you rephrase it?", actions: ctx.actions };
}

// ---------- Built-in mode (no API key) ----------

async function localAnswer(message: string, assetNumber?: string): Promise<string> {
  const t = message.toLowerCase();
  await primeBookRules();
  const book = resolveBook(undefined);
  const all = viewAssetsForBook(assets, book);

  // Any word that contains a digit could be an asset number (009, 0202, 77777779, A-100 ...).
  const tokens: string[] = [...(message.match(/[A-Za-z0-9-]*\d[A-Za-z0-9-]*/g) ?? [])];
  if (assetNumber) tokens.push(assetNumber);
  const bare = /^[A-Za-z0-9-]*\d[A-Za-z0-9-]*$/.test(message.trim()) ? message.trim() : null;

  for (const tok of tokens) {
    const a = all.find((x) => x.assetNumber.toLowerCase() === tok.toLowerCase());
    if (a) {
      return `${a.assetNumber} - ${a.description}\nClass: ${a.assetClass} | Status: ${a.status}\nCost ${money(a.cost)}, Accum. Dep ${money(a.accumDepreciation)}, NBV ${money(a.nbv)}.`;
    }
  }
  if (bare) {
    const partial = all.filter((x) => x.assetNumber.toLowerCase().includes(bare.toLowerCase()));
    if (partial.length) {
      return `${partial.length} asset(s) matching ${bare}:\n` + partial.slice(0, 8).map((x) => `${x.assetNumber} - ${x.description}`).join('\n');
    }
    return `No asset found with number ${bare}. Open the Asset Register to search.`;
  }
  if (/(summary|total|how many|count|dashboard|nbv|book value|cost)/.test(t)) {
    const s: any = computeDashboardSummary(resolveBook(undefined));
    return `Active assets: ${s.totalAssets}\nGross cost: ${money(s.grossCost)}\nNet book value: ${money(s.netBookValue)}\nAccumulated depreciation: ${money(s.ytdDepreciation)}`;
  }
  const status = (['Retired', 'Fully Depreciated', 'Under Review', 'Transferred', 'Active'] as const).find((s) => t.includes(s.toLowerCase()));
  if (status) {
    const list = assets.filter((a) => a.status === status);
    if (!list.length) return `There are no ${status.toLowerCase()} assets.`;
    return `${list.length} ${status.toLowerCase()} asset(s):\n` + list.slice(0, 6).map((a) => `${a.assetNumber} - ${a.description}`).join('\n');
  }
  return 'I could not find data for that. Try "total assets", "net book value", "retired assets", or type an asset number. (For full AI answers, add ANTHROPIC_API_KEY to server/.env.)';
}

// ---------- Route ----------

chatRouter.post('/', async (req, res) => {
  const { message, history = [], page = '/', role = 'user', assetNumber, canEdit = false } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'message required' });
  }
  try {
    await primeBookRules();
    if (process.env.ANTHROPIC_API_KEY) {
      const { reply, actions } = await askClaude(message.slice(0, 1000), history, page, role, canEdit === true);
      return res.json({ reply, mode: 'ai', actions });
    }
    res.json({ reply: await localAnswer(message, assetNumber), mode: 'local' });
  } catch (err) {
    console.error('[chat] failed:', err);
    res.json({ reply: "Sorry, I can't answer right now. Please try again in a moment.", mode: 'error' });
  }
});


// ---------- Confirm / Cancel (the ONLY way an agent proposal becomes a real post) ----------
// NOTE: this app has no server-side session yet, so canEdit/postedBy come from the
// client like the existing /lifecycle/post route. Once auth tokens exist, derive both
// from the token here instead of trusting the request body.

chatRouter.post('/confirm', async (req, res) => {
  const { id, canEdit = false, postedBy } = req.body ?? {};
  if (typeof id !== 'string') return res.status(400).json({ error: 'id required' });
  if (canEdit !== true) return res.status(403).json({ error: 'You do not have permission to post events.' });
  const who = `${String(postedBy || 'user').slice(0, 80)} (via AI agent)`;
  const r = await confirmPending(id, who);
  if (!r.ok) return res.status(r.status).json({ error: r.error });
  res.json({ posted: true, message: r.message });
});

chatRouter.post('/cancel', (req, res) => {
  const { id } = req.body ?? {};
  res.json({ cancelled: typeof id === 'string' ? cancelPending(id) : false });
});
