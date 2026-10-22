// ======================================================
// File Name : registerPrefill.ts
// Purpose   : Fills the fields a caller left blank from the Asset Register, so the
//             Service API / Bulk Import behave like the UI "Load Asset" auto-fill.
//             A value the caller DID send is never overwritten.
// ======================================================

import type { Asset } from '../types.js';

type Fields = Record<string, unknown>;
type EngineConfig = Record<string, { method?: string } | undefined>;

const blank = (v: unknown): boolean => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

/** "5 years" / "27.5 years" -> 5 / 27.5 */
function lifeYearsOf(a: Asset): number | undefined {
  const m = String(a.taxFactPattern?.recoveryPeriod ?? '').match(/\d+(\.\d+)?/);
  const y = m ? parseFloat(m[0]) : NaN;
  return Number.isFinite(y) && y > 0 ? y : undefined;
}

/** Register has "00.12" + "MACRS ADS (Straight-Line)" + "5 years"; the engines want a code like ADS-5 / GDS-5 / GDS150-5.
 *  Only returned when that code exists in asset_type_config, otherwise undefined (no guessing). */
export function engineCodeFor(a: Asset, cfg: EngineConfig): string | undefined {
  const y = lifeYearsOf(a);
  if (!y) return undefined;
  const method = String(a.taxFactPattern?.method ?? a.method ?? '').toUpperCase();
  const prefix = method.includes('ADS') ? 'ADS' : method.includes('150') ? 'GDS150' : 'GDS';
  const code = `${prefix}-${y}`;
  return cfg[code] ? code : undefined;
}


/** Common keys a caller can use for EVERY event type; they are renamed to the key that event's calculator really uses.
 *  A key the caller already sent in the event's own name is never overwritten. */
const ALIASES: Record<string, Record<string, string>> = {
  addition:         { date: 'placedInService' },
  adjustment:       { date: 'effectiveDate',    cost: 'originalCost', amount: 'adjustmentAmount' },
  retirement:       { date: 'disposalDate',     amount: 'costDisposed' },
  transfer:         { date: 'transferDate',     cost: 'totalCost',    amount: 'costTransferred' },
  reinstatement:    { date: 'reinstatementDate', cost: 'originalCost' },
  reclassification: { date: 'effectiveDate',    cost: 'originalCost' }
};

export function normalizeKeys(eventType: string, given: Fields): Fields {
  const f: Fields = { ...given };
  const map = ALIASES[String(eventType).trim().toLowerCase()] ?? {};
  for (const [common, own] of Object.entries(map)) {
    if (common in f && common !== own) {
      if (blank(f[own])) f[own] = f[common];
      delete f[common];
    }
  }
  // Retirement uses years; every other event uses months
  if (String(eventType).trim().toLowerCase() === 'retirement' && !blank(f['lifeMonths'])) {
    if (blank(f['recoveryPeriodYears'])) f['recoveryPeriodYears'] = Number(f['lifeMonths']) / 12;
    delete f['lifeMonths'];
  }
  return f;
}

export function fillFromRegister(eventType: string, asset: Asset | undefined, given: Fields, cfg: EngineConfig): Fields {
  const f: Fields = normalizeKeys(eventType, given);
  if (!asset) return f;

  const tfp = asset.taxFactPattern;
  const years = lifeYearsOf(asset);
  const months = years ? Math.round(years * 12) : undefined;
  const code = engineCodeFor(asset, cfg);
  const method = code ? cfg[code]?.method : undefined;
  const set = (k: string, v: unknown) => {
    if (!blank(f[k]) || v === undefined || v === null) return;
    if (typeof v === 'number' && !Number.isFinite(v)) return;
    f[k] = v;
  };

  // same period as the event unless the caller says otherwise
  set('accountingPeriodDate', f['disposalDate'] ?? f['effectiveDate'] ?? f['transferDate'] ?? f['reinstatementDate']);

  switch (String(eventType).trim().toLowerCase()) {
    case 'adjustment':
      set('originalCost', asset.cost); set('placedInService', tfp?.placedInService);
      set('lifeMonths', months); set('bonusPct', tfp?.bonusPct);
      set('assetType', code); set('convention', tfp?.convention);
      break;
    case 'retirement':
      set('cost', asset.cost); set('costDisposed', asset.cost); set('placedInService', tfp?.placedInService);
      set('recoveryPeriodYears', years); set('bonusPct', tfp?.bonusPct);
      set('assetType', code); set('convention', tfp?.convention);
      break;
    case 'transfer':
      set('totalCost', asset.cost); set('placedInService', tfp?.placedInService);
      set('lifeMonths', months); set('convention', tfp?.convention);
      set('sourceCompany', asset.company); set('sourceLocation', asset.location);
      break;
    case 'reinstatement':
      set('originalCost', asset.cost); set('placedInService', tfp?.placedInService);
      set('lifeMonths', months); set('bonusPct', tfp?.bonusPct);
      set('assetType', code); set('convention', tfp?.convention);
      set('originalDisposalDate', asset.disposal?.disposalDate);
      set('originalADAtDisposal', asset.disposal?.adAtDisposal);
      set('originalGainLoss', asset.disposal?.gainLoss);
      break;
    case 'reclassification':
      set('originalCost', asset.cost); set('placedInService', tfp?.placedInService);
      set('oldAssetType', code); set('oldMethod', method);
      set('oldLifeMonths', months); set('oldConvention', tfp?.convention); set('oldBonusPct', tfp?.bonusPct);
      break;
  }
  return f;
}

// ======================================================
// END OF FILE : registerPrefill.ts
// ======================================================
