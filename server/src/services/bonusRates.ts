// ======================================================
// File Name : bonusRates.ts
// Purpose   : In-memory copy of the bonus-depreciation tables (rates for the
//             Configuration page, date-range rules for the Bonus % auto-fill,
//             and the eligibility / excluded-property / vehicle-limit rows).
//             Postgres is the source of truth; this replaces the hard-coded
//             bonusPctForDate() if/else chain. Loaded at boot (initBonusRates)
//             and re-read after edits (refreshBonusRates).
// ======================================================

import { loadBonusConfig, loadBonusCustomRules } from '../db/repo.js';
import type { BonusConfig } from '../db/repo.js';
import type { BonusCustomRuleRow } from '../data/bonusRates.js';

let config: BonusConfig = { rates: [], rules: [], reference: { qualifyingRules: [], excludedProperty: [], vehicleLimits: [] } };

let customRules: BonusCustomRuleRow[] = [];

export async function refreshBonusRates(): Promise<number> {
  config = await loadBonusConfig();
  try { customRules = await loadBonusCustomRules(); } catch (err) { console.error('[bonusRates] custom rules not loaded:', err instanceof Error ? err.message : err); }
  return config.rules.length;
}

// Re-reads only the Customize Table (call after a rule is added / edited / deleted).
export async function refreshCustomBonusRules(): Promise<void> {
  customRules = await loadBonusCustomRules();
}

// Bonus % from the Customize Table for one asset: a rule matches when its Year equals the
// placed-in-service date falling inside its From - To range (months = whole months) and every non-blank Book / Company / Asset Type equals the asset's.
// The most specific rule (most non-blank fields) wins; a tie goes to the newest rule. null = no rule.
export function pickCustomBonusRule(rules: BonusCustomRuleRow[], q: { book?: string; company?: string; assetType?: string; date?: string | null }): BonusCustomRuleRow | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(q.date ?? '');
  if (!m) return null;
  const day = m[1];
  let best: BonusCustomRuleRow | null = null;
  let bestScore = -1;
  for (const r of rules) {
    if (!r.active) continue; // untouched copy of a Default row - the Default Table already covers it
    if ((r.fromDate && day < r.fromDate) || (r.toDate && day > r.toDate)) continue;
    if (r.book && r.book !== (q.book ?? '')) continue;
    if (r.company && r.company !== (q.company ?? '')) continue;
    if (r.assetType && r.assetType !== (q.assetType ?? '')) continue;
    // Most specific row wins (more of Book / Company / Asset Type set); on a tie Book beats Company beats
    // Asset Type; then the newest row.
    const count = (r.book ? 1 : 0) + (r.company ? 1 : 0) + (r.assetType ? 1 : 0);
    const score = count * 10 + (r.book ? 4 : 0) + (r.company ? 2 : 0) + (r.assetType ? 1 : 0);
    if (score > bestScore || (score === bestScore && best && r.id > best.id)) { best = r; bestScore = score; }
  }
  return best;
}

export function getActiveCustomBonusRuleCount(): number {
  return customRules.filter((r) => r.active).length;
}

export function matchCustomBonusRule(q: { book?: string; company?: string; assetType?: string; date?: string | null }): BonusCustomRuleRow | null {
  return pickCustomBonusRule(customRules, q);
}

export function customBonusPct(q: { book?: string; company?: string; assetType?: string; date?: string | null }): number | null {
  return matchCustomBonusRule(q)?.pct ?? null;
}

export async function initBonusRates(): Promise<number> {
  const n = await refreshBonusRates();
  if (!n) throw new Error('bonus_depreciation_rules is empty - add the date-range rules (run db/config-tables.sql)');
  return n;
}

export function getBonusConfig(): BonusConfig { return config; }

// Bonus % for a placed-in-service date 'YYYY-MM-DD' (first matching rule wins), or null when the date is blank / incomplete.
export function bonusPctForDate(iso: string | undefined | null): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '')) return null;
  const d = iso as string;
  const hit = config.rules.find((r) => (r.effectiveFrom === null || r.effectiveFrom <= d) && (r.effectiveTo === null || d <= r.effectiveTo));
  return hit ? hit.pct : null;
}
