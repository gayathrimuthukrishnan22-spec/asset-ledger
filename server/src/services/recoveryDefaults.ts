// ======================================================
// File Name : recoveryDefaults.ts
// Purpose   : In-memory copy of class_default_life + the app_settings key
//             'defaultRecoveryYears', for the synchronous schedule builder.
//             Values live only in Postgres (db/config-tables.sql).
// ======================================================

import { loadAppSetting, loadClassDefaultLife } from '../db/repo.js';

export const DEFAULT_RECOVERY_YEARS_KEY = 'defaultRecoveryYears';

let byClass: Record<string, number> = {};
let fallbackYears = 0;

export async function initRecoveryDefaults(): Promise<void> {
  byClass = await loadClassDefaultLife();
  const v = Number(await loadAppSetting(DEFAULT_RECOVERY_YEARS_KEY));
  if (!Number.isFinite(v) || v <= 0) throw new Error(`app_settings key '${DEFAULT_RECOVERY_YEARS_KEY}' is missing - run db/config-tables.sql`);
  fallbackYears = v;
}

export function defaultRecoveryYears(assetClass: string): number {
  if (!fallbackYears) throw new Error('recovery defaults not loaded - call initRecoveryDefaults() at start-up');
  return byClass[assetClass] ?? fallbackYears;
}

// ======================================================
// END OF FILE : recoveryDefaults.ts
// ======================================================
