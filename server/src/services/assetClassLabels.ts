// ======================================================
// File Name : assetClassLabels.ts
// Purpose   : In-memory copy of the asset_class_labels table (IRS class code
//             -> short label) for the synchronous Dashboard calculation.
//             Rows live only in Postgres (db/config-tables.sql).
//             A code with no label just shows the code itself.
// ======================================================

import { loadAssetClassLabels } from '../db/repo.js';

let labels: Record<string, string> = {};

export async function initAssetClassLabels(): Promise<number> {
  labels = await loadAssetClassLabels();
  return Object.keys(labels).length;
}

export function classLabel(code: string): string {
  return labels[code] ?? code;
}

// ======================================================
// END OF FILE : assetClassLabels.ts
// ======================================================
