// ======================================================
// File Name : lifecycleFormSchemas.js
// Purpose   : In-memory data store / accessors for lifecycleFormSchemas
// ======================================================

// ======================================================
// START: Data Functions
// ======================================================

/**
 * Field definitions for each Lifecycle Event card, ported 1:1 from the
 * standalone reference calculators (Htmls/pages/*.html — additions,
 * adjustments, disposals, transfers, reinstatements, reclassifications).
 * Each event type gets its own box set instead of one shared form.
 */

// Dropdown choices below are filled IN PLACE from the database by hydrateFormOptions()
// (GET /api/config/form-options -> asset_type_config + form_option_lists). They start empty.
export const ASSET_TYPE_OPTIONS = [];

export const RATE_TABLE_OPTIONS = [];

export const QUARTER_OPTIONS = ['Q1 (Jan–Mar)', 'Q2 (Apr–Jun)', 'Q3 (Jul–Sep)', 'Q4 (Oct–Dec)'];
export const METHOD_OPTIONS = [];
export const CONVENTION_OPTIONS = {
  addition: [],
  adjustment: [],
  retirement: [],
  transfer: [],
  reinstatement: [],
  reclassification: []
};

// ======================================================
// Function : hydrateFormOptions
// Purpose  : Fills the option arrays above in place from the server's
//            { assetType, rateTable, method, conventionAddition, ... } lists.
//            In place on purpose: FIELD_SCHEMAS (and utils/csv.js) hold these
//            same array objects, so every consumer sees the DB values.
// ======================================================

export function hydrateFormOptions(lists) {
  const fill = (arr, vals) => { if (Array.isArray(vals) && vals.length) arr.splice(0, arr.length, ...vals); };
  fill(ASSET_TYPE_OPTIONS, lists?.assetType);
  fill(RATE_TABLE_OPTIONS, lists?.rateTable);
  fill(METHOD_OPTIONS, lists?.method);
  fill(CONVENTION_OPTIONS.addition, lists?.conventionAddition);
  fill(CONVENTION_OPTIONS.adjustment, lists?.conventionAdjustment);
  fill(CONVENTION_OPTIONS.retirement, lists?.conventionRetirement);
  fill(CONVENTION_OPTIONS.transfer, lists?.conventionTransfer);
  fill(CONVENTION_OPTIONS.reinstatement, lists?.conventionReinstatement);
  fill(CONVENTION_OPTIONS.reclassification, lists?.conventionReclassification);
}

/** Per-card field list. `key` is what lands in formData / gets posted to the API. */
export const FIELD_SCHEMAS = {
  addition: [
    { key: 'book', label: 'Book', type: 'select', options: [], optionsSource: 'books', placeholder: '— Select book —', hint: 'Used to pick the Bonus % from Configuration → Bonus Depreciation → Customize Table' },
    { key: 'company', label: 'Company', type: 'select', options: ['5B', 'R9', '2D', 'GD'], placeholder: '— Select company —', hint: 'Used to pick the Bonus % from the Customize Table' },
    { key: 'assetType', label: 'Asset Type', type: 'select', options: ASSET_TYPE_OPTIONS },
    { key: 'assetClass', label: 'Asset Class', type: 'select', options: [], optionsSource: 'assetClasses', placeholder: '— Select asset class —', hint: 'Options come from Configuration → Asset Classes (database).' },
    { key: 'propertyType', label: 'Property Type', type: 'readonly', hint: 'Auto-filled from the selected Asset Class' },
    { key: 'method', label: 'Method', type: 'readonly', hint: 'Auto-filled from the selected Asset Class' },
    { key: 'ratePct', label: 'Rate %', type: 'readonly', hint: 'Auto-filled from the selected Asset Class' },
    { key: 'cost', label: 'Asset Cost', type: 'number', placeholder: 'e.g. 120000' },
    { key: 'placedInService', label: 'Placed-In-Service Date', type: 'date' },
    { key: 'lifeMonths', label: 'Life (Months)', type: 'number', hint: 'Auto-filled from the selected Asset Class' },
    { key: 'rateTable', label: 'Rate Table', type: 'select', options: RATE_TABLE_OPTIONS },
    { key: 'convention', label: 'Convention', type: 'select', options: CONVENTION_OPTIONS.addition },
    { key: 'quarter', label: 'Quarter Placed in Service', type: 'select', options: QUARTER_OPTIONS },
    { key: 'bonusPct', label: 'Bonus %', type: 'number', hint: 'Auto-filled by year: a matching Customize Table row (Book / Company / Asset Class + Placed-In-Service year) wins, else the Asset Class row, else the Default Table. Editable' },
    { key: 'electOutBonus', label: 'Elect Out Bonus', type: 'checkbox' },
    { key: 'accountingPeriodDate', label: 'Accounting Period Date', type: 'date' }
  ],

  adjustment: [
    { key: 'assetType', label: 'Asset Type', type: 'select', options: ASSET_TYPE_OPTIONS },
    { key: 'originalCost', label: 'Original Asset Cost', type: 'number', placeholder: 'e.g. 12707.12' },
    { key: 'placedInService', label: 'PISD', type: 'date' },
    { key: 'lifeMonths', label: 'Life (Months)', type: 'number', hint: 'Auto from asset type' },
    { key: 'existingAccumDepr', label: 'Existing Accum Depr (BOY)', type: 'number', placeholder: 'e.g. 12707.12' },
    { key: 'priorAdjBalance', label: 'Prior Adjustment Balance', type: 'number' },
    { key: 'adjustmentAmount', label: 'Adjustment Amount (+/-)', type: 'number', placeholder: 'e.g. 519134.02 or -813708.14' },
    { key: 'effectiveDate', label: 'Effective Date', type: 'date' },
    { key: 'accountingPeriodDate', label: 'Accounting Period Date', type: 'date' },
    { key: 'convention', label: 'Convention', type: 'select', options: CONVENTION_OPTIONS.adjustment },
    { key: 'quarter', label: 'Quarter Placed in Service', type: 'select', options: QUARTER_OPTIONS },
    { key: 'bonusPct', label: 'Bonus %', type: 'number', hint: 'Auto from PISD/type' },
    { key: 'electOutBonus', label: 'Elect Out Bonus', type: 'checkbox' }
  ],

  retirement: [
    { key: 'assetType', label: 'Asset Type', type: 'select', options: ASSET_TYPE_OPTIONS },
    { key: 'cost', label: 'Asset Cost', type: 'number', placeholder: 'e.g. 120000' },
    { key: 'placedInService', label: 'Placed-In-Service Date (PISD)', type: 'date' },
    { key: 'recoveryPeriodYears', label: 'Recovery Period (Years)', type: 'number', hint: 'Auto from asset type' },
    { key: 'convention', label: 'Convention', type: 'select', options: CONVENTION_OPTIONS.retirement },
    { key: 'quarter', label: 'Quarter Placed in Service', type: 'select', options: QUARTER_OPTIONS },
    { key: 'bonusPct', label: 'Bonus % (at addition)', type: 'number', hint: 'Auto from PISD/type' },
    { key: 'boyAccumDepr', label: 'BOY Accumulated Depr.', type: 'number', placeholder: 'e.g. 62400' },
    { key: 'monthlyDeprRate', label: 'Monthly Depreciation Rate', type: 'number', placeholder: 'e.g. 1920' },
    { key: 'disposalDate', label: 'Disposal Date', type: 'date' },
    { key: 'accountingPeriodDate', label: 'Accounting Period Date', type: 'date' },
    { key: 'costDisposed', label: 'Cost Disposed', type: 'number', placeholder: 'e.g. 30000' },
    { key: 'proceeds', label: 'Proceeds', type: 'number', placeholder: 'e.g. 26250' }
  ],

  transfer: [
    { key: 'totalCost', label: 'Total Cost', type: 'number' },
    { key: 'totalAD', label: 'Total A/D', type: 'number' },
    { key: 'bonusAD', label: 'Bonus A/D', type: 'number' },
    { key: 'placedInService', label: 'PISD', type: 'date' },
    { key: 'lifeMonths', label: 'Life (Months)', type: 'number' },
    { key: 'monthlyDeprRate', label: 'Monthly Depr Rate', type: 'number' },
    { key: 'convention', label: 'Convention', type: 'select', options: CONVENTION_OPTIONS.transfer },
    { key: 'bonusPct', label: 'Bonus %', type: 'number' },
    { key: 'costTransferred', label: 'Cost Transferred', type: 'number' },
    { key: 'transferDate', label: 'Transfer Date', type: 'date' },
    { key: 'accountingPeriodDate', label: 'Accounting Period', type: 'date' },
    { key: 'sourceCompany', label: 'Source Company', type: 'text', placeholder: 'e.g. 27' },
    { key: 'destCompany', label: 'Dest Company', type: 'text', placeholder: 'e.g. 2D' },
    { key: 'sourceLocation', label: 'Source Location', type: 'text' },
    { key: 'destLocation', label: 'Dest Location', type: 'text' }
  ],

  reinstatement: [
    { key: 'assetType', label: 'Asset Type', type: 'select', options: ASSET_TYPE_OPTIONS },
    { key: 'originalCost', label: 'Original Cost', type: 'number' },
    { key: 'placedInService', label: 'PISD', type: 'date' },
    { key: 'lifeMonths', label: 'Life (Months)', type: 'number', hint: 'Auto from asset type' },
    { key: 'originalDisposalDate', label: 'Original Disposal Date', type: 'date' },
    { key: 'originalADAtDisposal', label: 'A/D at Disposal', type: 'number' },
    { key: 'originalGainLoss', label: 'Original Gain/Loss', type: 'number' },
    { key: 'convention', label: 'Convention', type: 'select', options: CONVENTION_OPTIONS.reinstatement },
    { key: 'bonusPct', label: 'Bonus % (at addition)', type: 'number', hint: 'Auto from PISD/type' },
    { key: 'reinstatementDate', label: 'Reinstatement Date', type: 'date' },
    { key: 'accountingPeriodDate', label: 'Accounting Period', type: 'date' }
  ],

  reclassification: [
    { key: 'originalCost', label: 'Original Cost', type: 'number' },
    { key: 'existingAD', label: 'Existing A/D', type: 'number' },
    { key: 'placedInService', label: 'PISD', type: 'date' },
    { key: 'oldAssetType', label: 'Old Asset Type', type: 'text', placeholder: 'e.g. EQUIP-5YR' },
    { key: 'oldMethod', label: 'Old Method', type: 'select', options: METHOD_OPTIONS },
    { key: 'oldLifeMonths', label: 'Old Life (Months)', type: 'number' },
    { key: 'oldConvention', label: 'Old Convention', type: 'select', options: CONVENTION_OPTIONS.reclassification },
    { key: 'oldBonusPct', label: 'Old Bonus %', type: 'number' },
    { key: 'newAssetType', label: 'New Asset Type', type: 'text', placeholder: 'e.g. EQUIP-5YR-BONUS' },
    { key: 'newMethod', label: 'New Method', type: 'select', options: METHOD_OPTIONS },
    { key: 'newLifeMonths', label: 'New Life (Months)', type: 'number' },
    { key: 'newConvention', label: 'New Convention', type: 'select', options: CONVENTION_OPTIONS.reclassification },
    { key: 'newBonusPct', label: 'New Bonus %', type: 'number' },
    { key: 'effectiveDate', label: 'Effective Date', type: 'date' },
    { key: 'accountingPeriodDate', label: 'Accounting Period', type: 'date' }
  ]
};

/** All lifecycle cards start blank — the only way to populate a card is
 *  the "Load Test Case" dropdown above the form, which should visibly
 *  fill empty fields rather than silently overwrite pre-filled
 *  placeholder values. */
export const FIELD_DEFAULTS = {
  addition: {},
  adjustment: {},
  retirement: {},
  transfer: {},
  reinstatement: {},
  reclassification: {}
};

/** Reverse lookup for the Reinstatement card's "Load Asset" picker: given
 *  an Asset Register record's `taxFactPattern`, resolve which
 *  ASSET_TYPE_OPTIONS label it corresponds to, so picking a real (Retired)
 *  asset pre-fills the same dropdown value the reference calculators use.
 *  Best-effort match by property type / method / recovery years — falls
 *  back to the 5yr GDS 200% DB default when nothing matches closely. */
// ======================================================
// Function : assetTypeLabelFromTaxFactPattern
// Purpose  : Implements logic for 'assetTypeLabelFromTaxFactPattern'
// ======================================================

export function assetTypeLabelFromTaxFactPattern(tfp) {
  if (!tfp) return ASSET_TYPE_OPTIONS[1];
  const years = parseFloat(tfp.recoveryPeriod) || 5;
  const methodText = (tfp.method || '').toUpperCase();
  const propertyType = (tfp.propertyType || '').toLowerCase();

  const find = (pred) => ASSET_TYPE_OPTIONS.find(pred);

  if (propertyType.includes('residential') || years === 27.5 || years === 30) {
    return methodText.includes('ADS')
      ? find((o) => o.startsWith('Residential Rental') && o.includes('(ADS)')) || ASSET_TYPE_OPTIONS[1]
      : find((o) => o.startsWith('Residential Rental') && o.includes('(GDS)')) || ASSET_TYPE_OPTIONS[1];
  }
  if (propertyType.includes('nonresidential') || years === 31.5 || years === 39 || years === 40) {
    return methodText.includes('ADS')
      ? find((o) => o.startsWith('Nonresidential Real') && o.includes('(ADS)')) || ASSET_TYPE_OPTIONS[1]
      : find((o) => o.startsWith('Nonresidential Real') && o.includes('(GDS)')) || ASSET_TYPE_OPTIONS[1];
  }
  if (methodText.includes('ADS')) {
    return find((o) => o.includes(`${years}yr SL (ADS)`)) || find((o) => o.endsWith('(ADS)')) || ASSET_TYPE_OPTIONS[1];
  }
  if (methodText.includes('150')) {
    return find((o) => o.includes(`${years}yr 150% DB (GDS)`)) || ASSET_TYPE_OPTIONS[4];
  }
  return find((o) => o.includes(`${years}yr MACRS 200% DB (GDS)`)) || ASSET_TYPE_OPTIONS[1];
}

// ======================================================
// END: assetTypeLabelFromTaxFactPattern
// ======================================================

/** Reinstatement card's "Convention" select uses the long labels
 *  ('HY (Half-Year)', 'MQ (Mid-Quarter)', 'Mid-Month'); the Asset
 *  Register's taxFactPattern.convention uses plain text ('Half-Year',
 *  'Mid-Quarter', 'Mid-Month'). */
// ======================================================
// Function : conventionLabelFromTaxFactPattern
// Purpose  : Implements logic for 'conventionLabelFromTaxFactPattern'
// ======================================================

export function conventionLabelFromTaxFactPattern(conventionText) {
  const c = (conventionText || '').trim();
  if (c.startsWith('Half')) return 'HY (Half-Year)';
  if (c.startsWith('Mid-Quarter')) return 'MQ (Mid-Quarter)';
  if (c.startsWith('Mid-Month')) return 'Mid-Month';
  return 'HY (Half-Year)';
}

// ======================================================
// END: conventionLabelFromTaxFactPattern
// ======================================================

/** '5 years' / '9 years' / '5' -> 60 / 108 / 60 (months) */
// ======================================================
// Function : lifeMonthsFromRecoveryPeriod
// Purpose  : Implements logic for 'lifeMonthsFromRecoveryPeriod'
// ======================================================

export function lifeMonthsFromRecoveryPeriod(recoveryPeriod) {
  const years = parseFloat(recoveryPeriod);
  return Number.isFinite(years) ? Math.round(years * 12) : 60;
}

// ======================================================
// END: lifeMonthsFromRecoveryPeriod
// ======================================================

/** Builds the Reinstatement card's field values from a real Asset Register
 *  record (must be status 'Retired' and carry a `disposal` snapshot —
 *  see server/src/data/assets.ts). Disposal-specific facts (disposal date,
 *  A/D at disposal, gain/loss) come from `asset.disposal`; everything else
 *  comes from `asset.taxFactPattern`. Returns null if the asset can't be
 *  reinstated (not Retired, or missing a disposal snapshot). */
// ======================================================
// Function : reinstatementFieldsFromAsset
// Purpose  : Implements logic for 'reinstatementFieldsFromAsset'
// ======================================================

export function reinstatementFieldsFromAsset(asset) {
  if (!asset || asset.status !== 'Retired' || !asset.disposal) return null;
  const tfp = asset.taxFactPattern;
  return {
    assetType: assetTypeLabelFromTaxFactPattern(tfp),
    originalCost: String(asset.cost),
    placedInService: tfp ? tfp.placedInService : '',
    lifeMonths: String(lifeMonthsFromRecoveryPeriod(tfp && tfp.recoveryPeriod)),
    originalDisposalDate: asset.disposal.disposalDate,
    originalADAtDisposal: String(asset.disposal.adAtDisposal),
    originalGainLoss: String(asset.disposal.gainLoss),
    convention: conventionLabelFromTaxFactPattern(tfp && tfp.convention),
    bonusPct: String(tfp ? tfp.bonusPct : 0)
    // reinstatementDate / accountingPeriodDate are transaction-specific
    // (today's date, this period's close) — left for the user to set.
  };
}

// ======================================================
// END: reinstatementFieldsFromAsset
// ======================================================

// ======================================================
// END: Data Functions
// ======================================================

// ======================================================
// END OF FILE : lifecycleFormSchemas.js
// ======================================================
