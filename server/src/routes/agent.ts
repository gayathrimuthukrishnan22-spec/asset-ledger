// ======================================================
// File Name : agent.ts
// Purpose   : POST /api/agent — the AI Agent (second icon beside the
//             existing assistant). Always LLM-powered (Claude). It can:
//             1) read everything on the site (assets, summary, recent
//             activity, books, asset classes, forecast),
//             2) PREPARE lifecycle events (same Confirm/Cancel flow as the
//             assistant, via POST /api/chat/confirm),
//             3) go online with Anthropic's server-side web search,
//             pick up the information and come back with sources.
//             The existing /api/chat assistant is left untouched.
// ======================================================

import { Router } from 'express';
import { computeForecast } from '../data/activity.js';
import { BOOKS, resolveBook } from '../data/books.js';
import { loadAssetClasses, loadRecentActivity } from '../db/repo.js';
import { primeBookRules } from '../services/book-view.js';
import type { ActionCard } from '../services/agent-actions.js';
import { MODEL, PROPOSE_TOOL, TOOLS, runTool, type AgentCtx } from './chat.js';

export const agentRouter = Router();

// ======================================================
// START: Tools
// ======================================================

// Extra read-only tools: "everything about the website".
const SITE_TOOLS = [
  {
    name: 'get_recent_activity',
    description: 'Latest lifecycle activity shown on the Dashboard (additions, adjustments, transfers, retirements, reclassifications) with amount, date and status.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'list_books',
    description: 'All depreciation books configured in the app (Books List page): name, description, book of record.',
    input_schema: { type: 'object', properties: {} }
  },
  {
    name: 'list_asset_classes',
    description: 'Default asset classes from Configuration > Asset Classes (name, property type, method, rate, convention, life, bonus %). Optional text filter on the class name.',
    input_schema: { type: 'object', properties: { q: { type: 'string' } } }
  },
  {
    name: 'get_forecast',
    description: 'Depreciation forecast for the next N years (1 to 10) for the Federal Tax book or the book given.',
    input_schema: { type: 'object', properties: { years: { type: 'number' }, book: { type: 'string' } } }
  }
];

// Anthropic runs this one on its side: the model searches, reads pages and cites them.
const WEB_SEARCH_TOOL = { type: 'web_search_20250305', name: 'web_search', max_uses: 5 };

// ======================================================
// Function : runSiteTool
// Purpose  : Runs the extra website tools; anything else goes to the shared assistant tools.
// ======================================================

async function runSiteTool(name: string, input: any, ctx: AgentCtx): Promise<unknown> {
  await primeBookRules();
  if (name === 'get_recent_activity') return loadRecentActivity();
  if (name === 'list_books') return BOOKS.map((b) => ({ name: b.name, description: b.description, bookOfRecord: b.bookOfRecord }));
  if (name === 'list_asset_classes') {
    const rows = await loadAssetClasses();
    const q = String(input?.q ?? '').toLowerCase();
    return rows.filter((r) => !q || r.name.toLowerCase().includes(q)).slice(0, 40);
  }
  if (name === 'get_forecast') return computeForecast(Number(input?.years) || 5, {}, resolveBook(input?.book));
  return runTool(name, input, ctx);
}

// ======================================================
// END: Tools
// ======================================================

// ======================================================
// Function : agentPrompt
// Purpose  : System prompt for the agent (site data + online research + safe change flow).
// ======================================================

function agentPrompt(page: string, role: string) {
  return `You are the AI Agent inside "Asset Ledger", a fixed-asset and tax depreciation website (Pub 946, MACRS, bonus depreciation, multiple books, lifecycle events).
Reply in clear English, short (2 to 6 lines), plain text. Never guess numbers: use the site tools for anything about this website's data (assets, totals, activity, books, asset classes, forecast).
You can also go online with web_search for outside information (IRS rules, tax law changes, bonus depreciation rates, news). Search only when the answer is not in the site data or the user asks for current/external info. Say plainly that it came from the web and mention the source site names. Never mix web figures into the user's ledger numbers.
You can PREPARE lifecycle events with propose_lifecycle_event but never post them: the user must click Confirm on the preview card. Use get_asset first, ask for every missing value, never invent numbers or dates, one proposal at a time. View-only users cannot propose events.
If a tool or the web search fails, say so honestly instead of answering from memory.
The user is on page: ${page}. Their role: ${role}.`;
}

// ======================================================
// Function : askAgent
// Purpose  : Tool loop against the Claude Messages API. Handles our own tools
//            (tool_use) and Anthropic's server-side web search (pause_turn,
//            web_search_tool_result blocks) and collects source links.
// ======================================================

async function askAgent(message: string, history: { role: string; text: string }[], page: string, role: string, canEdit: boolean) {
  const ctx: AgentCtx = { canEdit, actions: [] as ActionCard[] };
  const tools: any[] = [...TOOLS, ...SITE_TOOLS, WEB_SEARCH_TOOL, ...(canEdit ? [PROPOSE_TOOL] : [])];
  const messages: any[] = [
    ...history.slice(-8).map((h) => ({ role: h.role === 'user' ? 'user' : 'assistant', content: h.text })),
    { role: 'user', content: message }
  ];
  const sources = new Map<string, string>(); // url -> title
  let usedWeb = false;

  for (let turn = 0; turn < 10; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY as string, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: 1200, system: agentPrompt(page, role), tools, messages })
    });
    if (!r.ok) throw new Error(`Claude API ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const data: any = await r.json();

    for (const block of data.content as any[]) {
      if (block.type === 'server_tool_use') usedWeb = true;
      if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
        for (const hit of block.content) if (hit?.url) sources.set(hit.url, hit.title || hit.url);
      }
    }

    // Anthropic paused a long web-search turn: send it back unchanged to continue.
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue; }

    if (data.stop_reason !== 'tool_use') {
      const text = (data.content as any[]).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
      return {
        reply: text || (ctx.actions.length ? 'Please review the details below and confirm.' : ''),
        actions: ctx.actions,
        usedWeb,
        sources: usedWeb ? [...sources].slice(0, 5).map(([url, title]) => ({ url, title })) : []
      };
    }
    messages.push({ role: 'assistant', content: data.content });
    const results = [];
    for (const block of data.content.filter((c: any) => c.type === 'tool_use')) {
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(await runSiteTool(block.name, block.input, ctx)) });
    }
    messages.push({ role: 'user', content: results });
  }
  return { reply: "Sorry, I couldn't finish that. Could you rephrase it?", actions: ctx.actions, usedWeb, sources: [] };
}

// ======================================================
// Route : POST /api/agent
// ======================================================

agentRouter.post('/', async (req, res) => {
  const { message, history = [], page = '/', role = 'user', canEdit = false } = req.body ?? {};
  if (typeof message !== 'string' || !message.trim()) return res.status(400).json({ error: 'message required' });
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.json({ reply: 'The AI Agent is not connected yet. Add ANTHROPIC_API_KEY to server/.env and restart the server.', mode: 'no-key', actions: [], sources: [] });
  }
  try {
    await primeBookRules();
    const out = await askAgent(message.slice(0, 1000), history, page, role, canEdit === true);
    res.json({ ...out, mode: 'agent' });
  } catch (err) {
    console.error('[agent] failed:', err);
    res.json({ reply: "Sorry, the AI Agent can't answer right now. Please try again in a moment.", mode: 'error', actions: [], sources: [] });
  }
});

// ======================================================
// END OF FILE : agent.ts
// ======================================================
