// ======================================================
// File Name : assetClasses.ts
// Purpose   : Row TYPE for the asset_classes table. The VALUES live only
//             in Postgres (db/seed-asset-classes.sql); the row's index
//             becomes its sortOrder column.
// ======================================================

// ======================================================
// START: Types
// ======================================================

export interface AssetClassSeedRow {
  name: string;
  propertyType: string;
  method: string;
  ratePct: string;
  convention: string;
  life: string;
  /** Bonus % filled into the Addition form when this class is picked ("" = none stored). */
  bonusPct?: string;
}

// ======================================================
// END OF FILE : assetClasses.ts
// ======================================================
