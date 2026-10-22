// ======================================================
// File Name : agent-actions.ts
// Purpose   : Write-side of the AI agent. The agent can only PROPOSE a
//             lifecycle event; nothing is saved until the signed-in user
//             clicks Confirm in the chat widget, which calls
//             POST /api/chat/confirm -> confirmPending().
//             The model never sees a "post" tool, so it cannot post by
//             itself, whatever the prompt says.
// ======================================================

import { randomUUID } from 'node:crypto';
import { calculateLifecyclePreview } from './depreciation.js';
import { findAsset } from '../data/assets.js';
import { postLifecycleEvent, LifecycleValidationError } from '../routes/lifecycle.js';
import type { LifecycleEventType, LifecyclePreviewResult } from '../types.js';

type Fields = Record<string, string | number | boolean>;

const PENDING_TTL_MS = 15 * 60 * 1000;

// What the model needs to collect from the user for each event.
// Mirrors client/src/data/lifecycleFormSchemas.js (read-only/auto fields left out).
export const EVENT_FIELD_HELP: Record<LifecycleEventType, Record<string, string>> = {
  Addition: {
    assetType: 'Asset Type (dropdown label, e.g. "5-Year GDS 200% DB Half-Year")', assetClass: 'Asset Class',
    description: 'Short description', cost: 'Asset cost', placedInService: 'Placed-in-service date YYYY-MM-DD',
    lifeMonths: 'Life in months', convention: 'HY (Half-Year) | MQ (Mid-Quarter) | Mid-Month | Full-Month',
    quarter: 'Q1 (Jan–Mar) | Q2 (Apr–Jun) | Q3 (Jul–Sep) | Q4 (Oct–Dec)', bonusPct: 'Bonus %',
    electOutBonus: 'true/false', accountingPeriodDate: 'YYYY-MM-DD'
  },
  Adjustment: {
    assetType: 'Asset Type', originalCost: 'Original asset cost', placedInService: 'PISD YYYY-MM-DD',
    lifeMonths: 'Life in months', existingAccumDepr: 'Existing accum depr (BOY)', priorAdjBalance: 'Prior adjustment balance',
    adjustmentAmount: 'Adjustment amount (+/-)', effectiveDate: 'YYYY-MM-DD', accountingPeriodDate: 'YYYY-MM-DD',
    convention: 'HY (Half-Year) | MQ (Mid-Quarter) | Mid-Month', quarter: 'Quarter placed in service', bonusPct: 'Bonus %'
  },
  Retirement: {
    assetType: 'Asset Type', cost: 'Asset cost', placedInService: 'PISD YYYY-MM-DD',
    recoveryPeriodYears: 'Recovery period in years', convention: 'HY (Half-Year) | MQ (Mid-Quarter) | MM (Mid-Month)',
    quarter: 'Quarter placed in service', bonusPct: 'Bonus % at addition', boyAccumDepr: 'BOY accumulated depreciation',
    monthlyDeprRate: 'Monthly depreciation rate', disposalDate: 'YYYY-MM-DD', accountingPeriodDate: 'YYYY-MM-DD',
    costDisposed: 'Cost disposed', proceeds: 'Proceeds'
  },
  Transfer: {
    totalCost: 'Total cost', totalAD: 'Total A/D', bonusAD: 'Bonus A/D', placedInService: 'PISD YYYY-MM-DD',
    lifeMonths: 'Life in months', monthlyDeprRate: 'Monthly depr rate', convention: 'HY | MQ | Mid-Month', bonusPct: 'Bonus %',
    costTransferred: 'Cost transferred', transferDate: 'YYYY-MM-DD', accountingPeriodDate: 'YYYY-MM-DD',
    sourceCompany: 'Source company', destCompany: 'Destination company', sourceLocation: 'Source location', destLocation: 'Destination location'
  },
  Reinstatement: {
    assetType: 'Asset Type', originalCost: 'Original cost', placedInService: 'PISD YYYY-MM-DD', lifeMonths: 'Life in months',
    originalDisposalDate: 'YYYY-MM-DD', originalADAtDisposal: 'A/D at disposal', originalGainLoss: 'Original gain/loss',
    convention: 'HY (Half-Year) | MQ (Mid-Quarter) | Mid-Month', bonusPct: 'Bonus % at addition',
    reinstatementDate: 'YYYY-MM-DD', accountingPeriodDate: 'YYYY-MM-DD'
  },
  Reclassification: {
    originalCost: 'Original cost', existingAD: 'Existing A/D', placedInService: 'PISD YYYY-MM-DD',
    oldAssetType: 'Old asset type', oldMethod: 'Old method', oldLifeMonths: 'Old life (months)', oldConvention: 'HY | MQ | Mid-Month', oldBonusPct: 'Old bonus %',
    newAssetType: 'New asset type', newMethod: 'New method', newLifeMonths: 'New life (months)', newConvention: 'HY | MQ | Mid-Month', newBonusPct: 'New bonus %',
    effectiveDate: 'YYYY-MM-DD', accountingPeriodDate: 'YYYY-MM-DD'
  }
};

// The fields without which a post makes no sense. The calc engine does the
// deep validation (it returns "Needs Attention"); this just gives the model a
// clear "ask the user for X" list instead of a vague calculation error.
const REQUIRED: Record<LifecycleEventType, string[]> = {
  Addition: ['assetClass', 'cost', 'placedInService'],
  Adjustment: ['originalCost', 'placedInService', 'adjustmentAmount', 'effectiveDate'],
  Retirement: ['assetType', 'cost', 'placedInService', 'disposalDate', 'costDisposed', 'proceeds', 'boyAccumDepr', 'monthlyDeprRate'],
  Transfer: ['costTransferred', 'transferDate', 'sourceCompany', 'destCompany'],
  Reinstatement: ['originalCost', 'placedInService', 'reinstatementDate'],
  Reclassification: ['originalCost', 'placedInService', 'newAssetType', 'effectiveDate']
};

const EVENT_BY_LOWER: Record<string, LifecycleEventType> = {
  addition: 'Addition', adjustment: 'Adjustment', transfer: 'Transfer',
  retirement: 'Retirement', reinstatement: 'Reinstatement', reclassification: 'Reclassification'
};

export function normalizeEventType(v: unknown): LifecycleEventType | null {
  return EVENT_BY_LOWER[String(v ?? '').trim().toLowerCase()] ?? null;
}

// ---------- Pending store (in memory; a pending action is short-lived by design) ----------

interface Pending {
  id: string;
  eventType: LifecycleEventType;
  assetNumber: string;
  fields: Fields;
  preview: LifecyclePreviewResult;
  expiresAt: number;
}
const pending = new Map<string, Pending>();

function sweep() {
  const now = Date.now();
  for (const [id, p] of pending) if (p.expiresAt < now) pending.delete(id);
}

export interface ActionCard {
  id: string;
  eventType: LifecycleEventType;
  assetNumber: string;
  title: string;
  badge: string;
  rows: { label: string; value: string; emphasize?: boolean }[];
  note?: string;
  inputs: { label: string; value: string }[];
}

// Fill gaps from the asset record we already hold, so the user is not asked for what the system knows.
function prefill(eventType: LifecycleEventType, assetNumber: string, given: Fields): Fields {
  const f: Fields = { ...given };
  const a = findAsset(assetNumber);
  if (!a) return f;
  const tfp = a.taxFactPattern;
  if (f.accountingPeriodDate === undefined) {
    const d = f.disposalDate ?? f.effectiveDate ?? f.transferDate ?? f.reinstatementDate;
    if (d !== undefined) f.accountingPeriodDate = d; // same period as the event unless the user says otherwise
  }
  if (eventType === 'Retirement') {
    const yrs = parseFloat(String(tfp?.recoveryPeriod ?? ''));
    if (f.recoveryPeriodYears === undefined && Number.isFinite(yrs)) f.recoveryPeriodYears = yrs;
    if (f.cost === undefined) f.cost = a.cost;
    if (f.costDisposed === undefined && given.costDisposed === undefined) f.costDisposed = a.cost;
    if (f.placedInService === undefined && tfp?.placedInService) f.placedInService = tfp.placedInService;
    if (f.bonusPct === undefined && tfp) f.bonusPct = tfp.bonusPct;
  } else if (eventType === 'Adjustment' || eventType === 'Reinstatement' || eventType === 'Reclassification') {
    if (f.originalCost === undefined) f.originalCost = a.cost;
    if (f.placedInService === undefined && tfp?.placedInService) f.placedInService = tfp.placedInService;
    if (f.bonusPct === undefined && tfp && eventType !== 'Reclassification') f.bonusPct = tfp.bonusPct;
  }
  return f;
}

// ---------- Propose / confirm / cancel ----------

export function proposeEvent(args: { eventType: unknown; assetNumber: unknown; fields: unknown }):
  { ok: true; card: ActionCard } | { ok: false; error: string; missing?: string[]; fieldHelp?: Record<string, string> } {
  const eventType = normalizeEventType(args.eventType);
  if (!eventType) return { ok: false, error: 'Unknown eventType. Use Addition, Adjustment, Transfer, Retirement, Reinstatement or Reclassification.' };

  const assetNumber = String(args.assetNumber ?? '').trim();
  if (!assetNumber) return { ok: false, error: 'assetNumber is required.' };

  const exists = !!findAsset(assetNumber);
  if (eventType !== 'Addition' && !exists) return { ok: false, error: `Asset ${assetNumber} was not found. Ask the user to check the number.` };
  if (eventType === 'Addition' && exists) return { ok: false, error: `Asset ${assetNumber} already exists; an asset number can only have one Addition.` };

  const raw = args.fields && typeof args.fields === 'object' ? (args.fields as Fields) : {};
  const fields = prefill(eventType, assetNumber, raw);

  const missing = REQUIRED[eventType].filter((k) => fields[k] === undefined || fields[k] === '' || fields[k] === null);
  if (missing.length) {
    return { ok: false, error: 'Missing required fields. Ask the user for them; never invent values.', missing, fieldHelp: EVENT_FIELD_HELP[eventType] };
  }

  let preview: LifecyclePreviewResult;
  try {
    preview = calculateLifecyclePreview({ eventType, assetNumber, fields });
  } catch (err) {
    return { ok: false, error: `Calculation failed: ${err instanceof Error ? err.message : 'unknown error'}` };
  }
  if (preview.badgeText === 'Needs Attention') {
    const detail = (preview.rows ?? []).map((r) => `${r.label}: ${r.value}`).join('; ');
    return { ok: false, error: `The calculation needs attention, so it cannot be posted. ${detail}`.trim(), fieldHelp: EVENT_FIELD_HELP[eventType] };
  }

  // Never offer a preview with broken numbers (e.g. $NaN from a missing input).
  const broken = [...(preview.rows ?? []).map((r) => r.value), preview.formulaNote ?? ''].some((v) => /NaN|Infinity|undefined/.test(String(v)));
  if (broken) {
    return { ok: false, error: 'The calculation produced invalid numbers, so an input is probably missing or wrong. Ask the user to check the values.', fieldHelp: EVENT_FIELD_HELP[eventType] };
  }

  sweep();
  const id = randomUUID();
  pending.set(id, { id, eventType, assetNumber, fields, preview, expiresAt: Date.now() + PENDING_TTL_MS });

  return {
    ok: true,
    card: {
      id, eventType, assetNumber,
      title: `${eventType} · Asset ${assetNumber}`,
      badge: preview.badgeText,
      rows: preview.rows ?? [],
      note: preview.formulaNote,
      inputs: Object.entries(fields)
        .filter(([, v]) => v !== '' && v !== undefined)
        .map(([k, v]) => ({ label: EVENT_FIELD_HELP[eventType][k]?.split(/[(:]/)[0].trim() || k, value: String(v) }))
    }
  };
}

export async function confirmPending(id: string, postedBy: string):
  Promise<{ ok: true; message: string } | { ok: false; status: number; error: string }> {
  sweep();
  const p = pending.get(id);
  if (!p) return { ok: false, status: 404, error: 'This proposal has expired or was already handled. Ask me to prepare it again.' };
  pending.delete(id); // single use: a double click can never post twice
  try {
    await postLifecycleEvent({ eventType: p.eventType, assetNumber: p.assetNumber, fields: p.fields }, p.preview, postedBy);
    return { ok: true, message: `${p.eventType} posted for asset ${p.assetNumber}.` };
  } catch (err) {
    if (err instanceof LifecycleValidationError) return { ok: false, status: err.status, error: err.message };
    console.error('[agent] confirm failed:', err);
    return { ok: false, status: 500, error: 'Posting failed. Nothing was saved.' };
  }
}

export function cancelPending(id: string): boolean {
  return pending.delete(id);
}
