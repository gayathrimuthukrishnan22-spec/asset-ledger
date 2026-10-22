// ======================================================
// File Name : bonusRates.ts
// Purpose   : Row TYPES (keys) for the bonus-depreciation tables
//             (bonus_depreciation_rates, bonus_depreciation_rules,
//             bonus_reference_rows). The VALUES live only in Postgres
//             (db/config-tables.sql) - edit the rows there when the law changes.
// ======================================================

/** Rows of the Configuration -> Bonus Depreciation timeline table (display). */
export interface BonusRateRow { year: string; pct: number; lpp: number; law: string; notes: string; highlight?: boolean }

/** Date-range rules behind the Bonus % auto-fill: placed-in-service date -> pct. Either end may be null (open). */
export interface BonusRuleRow { effectiveFrom: string | null; effectiveTo: string | null; pct: number; label: string }

/** Customize Table row (same columns as the Default Table + Book / Company / Asset Type; active=false = untouched copy of a Default row): Book / Company / Asset Type ('' = applies to all) + Year placed in service -> Bonus %. */
export interface BonusCustomRuleRow { id: number; book: string; company: string; assetType: string; year: number; fromMonth: string; toMonth: string; fromDate: string; toDate: string; yearLabel: string; pct: number; lpp: number; law: string; notes: string; highlight: boolean; active: boolean }

export type BonusReferenceKind = 'qualifying_rule' | 'excluded_property' | 'vehicle_limit';
export interface BonusReferenceRow { kind: BonusReferenceKind; data: Record<string, string> }

// ======================================================
// END OF FILE : bonusRates.ts
// ======================================================
