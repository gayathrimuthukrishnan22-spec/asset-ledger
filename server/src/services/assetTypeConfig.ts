// ======================================================
// File Name : assetTypeConfig.ts
// Purpose   : In-memory copy of the asset_type_config table so the
//             (synchronous) calc-engine path never hits the DB per
//             calculation. Loaded at boot (initAssetTypeConfig) and
//             reloaded after any change (refreshAssetTypeConfig).
//             Postgres is the source of truth — nothing is hard-coded.
// ======================================================

import { loadAssetTypeConfig } from '../db/repo.js';
import type { AssetTypeConfigRow } from '../data/assetTypeConfig.js';

export interface EngineAssetConfig { type: string; method: string; conv: string; rate: number }

let rows: AssetTypeConfigRow[] = [];
let byCode: Record<string, AssetTypeConfigRow> = {};
let byLabel: Record<string, AssetTypeConfigRow> = {};
let engineMap: Record<string, EngineAssetConfig> = {};

// Loads the table; refuses to start when it is empty (run db/asset-type-config.sql).
export async function initAssetTypeConfig(): Promise<number> {
  const n = await refreshAssetTypeConfig();
  if (!n) throw new Error('asset_type_config is empty - run db/asset-type-config.sql');
  return n;
}

// Re-reads the table from Postgres; call after any edit to the rows.
export async function refreshAssetTypeConfig(): Promise<number> {
  const fresh = await loadAssetTypeConfig();
  rows = fresh;
  byCode = {};
  byLabel = {};
  engineMap = {};
  for (const r of fresh) {
    byCode[r.code] = r;
    byLabel[r.label] = r;
    engineMap[r.code] = { type: r.propertyType, method: r.method, conv: r.convention, rate: r.rate };
  }
  return fresh.length;
}

export function listAssetTypes(): AssetTypeConfigRow[] { return rows; }

// { 'GDS-5': { type, method, conv, rate }, ... } — the shape additions.cjs expects as input.assetConfig.
export function getEngineAssetConfig(): Record<string, EngineAssetConfig> { return engineMap; }

export function codeForLabel(labelOrCode: string): string {
  return byLabel[labelOrCode]?.code ?? labelOrCode;
}

export function methodForAssetCode(code: string): string {
  return byCode[code]?.method ?? 'MACRS';
}
