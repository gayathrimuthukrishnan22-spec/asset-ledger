// ======================================================
// File Name : formOptions.ts
// Purpose   : Dropdown choices for the Lifecycle forms and Asset Register
//             filter, read from Postgres (form_option_lists) plus the asset
//             type labels from asset_type_config. Rows come from db/config-tables.sql.
// ======================================================

import { loadFormOptionLists } from '../db/repo.js';
import { listAssetTypes } from './assetTypeConfig.js';

export async function initFormOptions(): Promise<void> {
  const lists = await loadFormOptionLists();
  if (!Object.keys(lists).length) throw new Error('form_option_lists is empty - run db/config-tables.sql');
}

// { assetType: [...labels], rateTable: [...], method: [...], conventionAddition: [...], ... }
export async function getFormOptions(): Promise<Record<string, string[]>> {
  const lists = await loadFormOptionLists();
  return { ...lists, assetType: listAssetTypes().map((t) => t.label) };
}
