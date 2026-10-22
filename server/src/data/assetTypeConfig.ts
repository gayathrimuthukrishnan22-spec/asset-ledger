// ======================================================
// File Name : assetTypeConfig.ts
// Purpose   : Row TYPE for the asset_type_config table. The VALUES live
//             only in Postgres (db/asset-type-config.sql): the calc-engine and
//             depreciation service read the DB.
// ======================================================

export interface AssetTypeConfigRow {
  code: string;
  label: string;
  propertyType: string;
  method: string;
  convention: string;
  rate: number;
}
