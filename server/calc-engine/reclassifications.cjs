// ======================================================
// File Name : reclassifications.cjs
// Purpose   : Depreciation calc-engine module: reclassifications
// ======================================================

// ---- prepended: same RATE_TABLES engine the browser calculators load via <script> ----
const RATE_TABLES = require("./rate-tables.cjs");


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// ============================================================
// Reclassifications Visual Calculator — Calculation Engine
// Each step is a separate function for easy editing.
// Master function: calculateReclassification(input)
// Ref: TRD Section 5.3.5
// ============================================================

// ── Step 1: Validate Inputs ──────────────────────────────────
// ======================================================
// Function : validateReclassInput
// Purpose  : Step 1: checks the required Reclassification inputs (old/new asset type, dates, cost) and returns the errors.
// ======================================================

function validateReclassInput(input) {
  var errors = [];
  if (!input.oldAssetType) {
    errors.push({ field: 'oldAssetType', rule: 'oldAssetType required', message: 'Old asset type is required' });
  }
  if (!input.newAssetType) {
    errors.push({ field: 'newAssetType', rule: 'newAssetType required', message: 'New asset type is required' });
  }
  if (input.oldAssetType && input.newAssetType && input.oldAssetType === input.newAssetType &&
      input.oldMethod === input.newMethod && input.oldLifeMonths === input.newLifeMonths &&
      input.oldConvention === input.newConvention && input.oldBonusPercent === input.newBonusPercent) {
    errors.push({ field: 'newAssetType', rule: 'parameters must differ', message: 'At least one parameter (method, life, convention, or bonus) must change' });
  }
  if (!input.effectiveDate) {
    errors.push({ field: 'effectiveDate', rule: 'effectiveDate required', message: 'Effective date is required' });
  }
  if (!input.accountingPeriodDate) {
    errors.push({ field: 'accountingPeriodDate', rule: 'accountingPeriodDate required', message: 'Accounting period date is required' });
  }
  if (!input.originalCost || input.originalCost <= 0) {
    errors.push({ field: 'originalCost', rule: 'originalCost > 0', message: 'Original cost must be greater than zero' });
  }
  if (input.existingAD === undefined || input.existingAD === null || input.existingAD < 0) {
    errors.push({ field: 'existingAD', rule: 'existingAD >= 0', message: 'Existing A/D must be zero or positive' });
  }
  if (!input.pisd) {
    errors.push({ field: 'pisd', rule: 'pisd required', message: 'Placed-in-service date (PISD) is required' });
  }
  return { valid: errors.length === 0, errors: errors };
}

// ======================================================
// END: validateReclassInput
// ======================================================

// ── Step 2: Determine Reclassification Type ──────────────────
// ======================================================
// Function : determineReclassType
// Purpose  : Step 2: compares old and new method / life / convention / bonus to classify the reclass.
// ======================================================

function determineReclassType(input) {
  // Lookup new M/L/C/Bonus from new asset type config
  var oldMethod = input.oldMethod || 'MACRS';
  var oldLife = input.oldLifeMonths || 60;
  var oldConvention = input.oldConvention || 'HY';
  var oldBonus = input.oldBonusPercent || 0;

  var newMethod = input.newMethod || 'MACRS';
  var newLife = input.newLifeMonths || 60;
  var newConvention = input.newConvention || 'HY';
  var newBonus = input.newBonusPercent || 0;

  var methodChanged = (oldMethod !== newMethod);
  var lifeChanged = (oldLife !== newLife);
  var conventionChanged = (oldConvention !== newConvention);
  var bonusChanged = (oldBonus !== newBonus);

  var changeType = [];
  if (methodChanged) changeType.push('method');
  if (lifeChanged) changeType.push('life');
  if (conventionChanged) changeType.push('convention');
  if (bonusChanged) changeType.push('bonus');

  return {
    oldParams: { method: oldMethod, lifeMonths: oldLife, convention: oldConvention, bonusPercent: oldBonus },
    newParams: { method: newMethod, lifeMonths: newLife, convention: newConvention, bonusPercent: newBonus },
    methodChanged: methodChanged,
    lifeChanged: lifeChanged,
    conventionChanged: conventionChanged,
    bonusChanged: bonusChanged,
    changeType: changeType.length > 0 ? changeType.join(', ') : 'asset type only',
    formula: 'Compare old M/L/C/Bonus vs new M/L/C/Bonus from asset type config',
    formulaValues: oldMethod + '/' + oldLife + 'mo/' + oldConvention + '/' + oldBonus + '% → ' + newMethod + '/' + newLife + 'mo/' + newConvention + '/' + newBonus + '%'
  };
}

// ======================================================
// END: determineReclassType
// ======================================================

// ── Step 3: Determine Reclassification Timing ────────────────
// ======================================================
// Function : determineReclassTiming
// Purpose  : Step 3: decides whether the Reclassification is current-period or backdated.
// ======================================================

function determineReclassTiming(input) {
  var effParts = input.effectiveDate.split('-');
  var effYear = parseInt(effParts[0], 10);
  var effMonth = parseInt(effParts[1], 10);

  var apdParts = input.accountingPeriodDate.split('-');
  var apdYear = parseInt(apdParts[0], 10);
  var apdMonth = parseInt(apdParts[1], 10);

  if (effYear === apdYear && effMonth === apdMonth) {
    return { timing: 'current', backdatedMonths: 0, effectiveMonth: effMonth, effectiveYear: effYear, accountingMonth: apdMonth, accountingYear: apdYear };
  }
  var backdatedMonths = (apdYear - effYear) * 12 + (apdMonth - effMonth);
  var isPriorYear = (effYear < apdYear);
  return {
    timing: isPriorYear ? 'backdated-prior-year' : 'backdated-same-year',
    backdatedMonths: backdatedMonths,
    effectiveMonth: effMonth,
    effectiveYear: effYear,
    accountingMonth: apdMonth,
    accountingYear: apdYear
  };
}

// ======================================================
// END: determineReclassTiming
// ======================================================

// ── Step 4: Calculate Old Parameters Depreciation ────────────
// ======================================================
// Function : calculateOldParameters
// Purpose  : Performs a calculation for 'calculateOldParameters'
// ======================================================

function calculateOldParameters(input, reclassType, timingResult) {
  var cost = input.originalCost;
  var oldParams = reclassType.oldParams;
  var bonusDepr = cost * (oldParams.bonusPercent / 100);
  var depreciableBasis = cost - bonusDepr;

  // Calculate months from PISD through effective date
  var pisdParts = input.pisd.split('-');
  var pisdYear = parseInt(pisdParts[0], 10);
  var pisdMonth = parseInt(pisdParts[1], 10);

  var effParts = input.effectiveDate.split('-');
  var effYear = parseInt(effParts[0], 10);
  var effMonth = parseInt(effParts[1], 10);

  var monthsInService = (effYear - pisdYear) * 12 + (effMonth - pisdMonth);
  if (monthsInService < 0) monthsInService = 0;

  // Monthly depreciation rate under old parameters
  var monthlyRate = oldParams.lifeMonths > 0 ? depreciableBasis / oldParams.lifeMonths : 0;

  // Convention adjustment for first year
  var conventionFactor = 1.0;
  if (oldParams.convention === 'HY' && monthsInService <= 12) {
    conventionFactor = 0.5; // half-year in first year
  }

  // Total depreciation under old parameters through effective date
  var regularDepr = monthlyRate * monthsInService;
  if (monthsInService <= 12) {
    regularDepr = monthlyRate * monthsInService * conventionFactor;
  }
  var totalDeprOld = bonusDepr + regularDepr;

  // Cap at cost
  if (totalDeprOld > cost) totalDeprOld = cost;

  return {
    cost: cost,
    bonusDepr: bonusDepr,
    depreciableBasis: depreciableBasis,
    monthlyRate: monthlyRate,
    monthsInService: monthsInService,
    conventionFactor: conventionFactor,
    regularDepr: regularDepr,
    totalDeprOld: totalDeprOld,
    formula: 'bonus = cost × bonus%; regular = (cost - bonus) / life × months',
    formulaValues: 'Bonus: $' + bonusDepr.toFixed(2) + ' + Regular: $' + regularDepr.toFixed(2) + ' = $' + totalDeprOld.toFixed(2)
  };
}

// ======================================================
// END: calculateOldParameters
// ======================================================

// ── Step 5: Calculate New Parameters Depreciation ────────────
// ======================================================
// Function : calculateNewParameters
// Purpose  : Performs a calculation for 'calculateNewParameters'
// ======================================================

function calculateNewParameters(input, reclassType, timingResult) {
  var cost = input.originalCost;
  var newParams = reclassType.newParams;
  var bonusDepr = cost * (newParams.bonusPercent / 100);
  var depreciableBasis = cost - bonusDepr;

  // Calculate months from PISD through effective date
  var pisdParts = input.pisd.split('-');
  var pisdYear = parseInt(pisdParts[0], 10);
  var pisdMonth = parseInt(pisdParts[1], 10);

  var effParts = input.effectiveDate.split('-');
  var effYear = parseInt(effParts[0], 10);
  var effMonth = parseInt(effParts[1], 10);

  var monthsInService = (effYear - pisdYear) * 12 + (effMonth - pisdMonth);
  if (monthsInService < 0) monthsInService = 0;

  // Monthly depreciation rate under new parameters
  var monthlyRate = newParams.lifeMonths > 0 ? depreciableBasis / newParams.lifeMonths : 0;

  // Convention adjustment for first year
  var conventionFactor = 1.0;
  if (newParams.convention === 'HY' && monthsInService <= 12) {
    conventionFactor = 0.5;
  }

  // Total depreciation under new parameters through effective date
  var regularDepr = monthlyRate * monthsInService;
  if (monthsInService <= 12) {
    regularDepr = monthlyRate * monthsInService * conventionFactor;
  }
  var totalDeprNew = bonusDepr + regularDepr;

  // Cap at cost
  if (totalDeprNew > cost) totalDeprNew = cost;

  return {
    cost: cost,
    bonusDepr: bonusDepr,
    depreciableBasis: depreciableBasis,
    monthlyRate: monthlyRate,
    monthsInService: monthsInService,
    conventionFactor: conventionFactor,
    regularDepr: regularDepr,
    totalDeprNew: totalDeprNew,
    formula: 'bonus = cost × newBonus%; regular = (cost - newBonus) / newLife × months',
    formulaValues: 'Bonus: $' + bonusDepr.toFixed(2) + ' + Regular: $' + regularDepr.toFixed(2) + ' = $' + totalDeprNew.toFixed(2)
  };
}

// ======================================================
// END: calculateNewParameters
// ======================================================

// ── Step 6: Calculate Reclassification Revision ──────────────
// ======================================================
// Function : calculateReclassRevision
// Purpose  : Performs a calculation for 'calculateReclassRevision'
// ======================================================

function calculateReclassRevision(input, reclassType, timingResult, oldParamsResult, newParamsResult) {
  // Revision = (Depr under new params - Depr under old params) for backdated periods
  // Can be positive (shorter life/more accelerated) or negative (longer life)
  if (timingResult.timing === 'current') {
    return {
      revision: 0,
      pyRevision: 0,
      totalRevision: 0,
      direction: 'none',
      formula: 'No revision (current period reclassification)',
      formulaValues: '$0.00'
    };
  }

  var deprDifference = newParamsResult.totalDeprNew - oldParamsResult.totalDeprOld;
  var direction = deprDifference > 0 ? 'positive (shorter life/more accelerated)' : deprDifference < 0 ? 'negative (longer life)' : 'zero';

  var revision = deprDifference;
  var pyRevision = 0;

  if (timingResult.timing === 'backdated-prior-year') {
    // Split between prior year and current year (M-1)
    var totalMonths = timingResult.backdatedMonths - 1;
    if (totalMonths < 0) totalMonths = 0;
    var monthsInPY = 12 - timingResult.effectiveMonth;
    var monthsInCY = timingResult.accountingMonth - 1; // M-1
    if (monthsInCY < 0) monthsInCY = 0;
    var pyRatio = totalMonths > 0 ? monthsInPY / totalMonths : 0;
    pyRevision = deprDifference * pyRatio;
    revision = deprDifference - pyRevision;
  }

  return {
    revision: revision,
    pyRevision: pyRevision,
    totalRevision: revision + pyRevision,
    deprUnderOld: oldParamsResult.totalDeprOld,
    deprUnderNew: newParamsResult.totalDeprNew,
    deprDifference: deprDifference,
    direction: direction,
    formula: 'revision = deprUnderNewParams - deprUnderOldParams',
    formulaValues: '$' + newParamsResult.totalDeprNew.toFixed(2) + ' - $' + oldParamsResult.totalDeprOld.toFixed(2) + ' = $' + deprDifference.toFixed(2) + ' (' + direction + ')',
    deprOldFormula: 'deprUnderOld = oldBonus + oldRegular',
    deprOldCalc: '$' + oldParamsResult.bonusDepr.toFixed(2) + ' + $' + oldParamsResult.regularDepr.toFixed(2) + ' = $' + oldParamsResult.totalDeprOld.toFixed(2),
    deprNewFormula: 'deprUnderNew = newBonus + newRegular',
    deprNewCalc: '$' + newParamsResult.bonusDepr.toFixed(2) + ' + $' + newParamsResult.regularDepr.toFixed(2) + ' = $' + newParamsResult.totalDeprNew.toFixed(2),
    diffFormula: 'difference = deprNew - deprOld',
    diffCalc: '$' + newParamsResult.totalDeprNew.toFixed(2) + ' - $' + oldParamsResult.totalDeprOld.toFixed(2) + ' = $' + deprDifference.toFixed(2),
    cyFormula: 'fed_revision = difference × CY ratio',
    cyCalc: '$' + revision.toFixed(2),
    pyFormula: 'py_revision = difference × PY ratio',
    pyCalc: '$' + pyRevision.toFixed(2),
    totalFormula: 'total = fed_revision + py_revision',
    totalCalc: '$' + revision.toFixed(2) + ' + $' + pyRevision.toFixed(2) + ' = $' + (revision + pyRevision).toFixed(2)
  };
}

// ======================================================
// END: calculateReclassRevision
// ======================================================

// ── Step 7: Build Reclassification DDV ───────────────────────
// ======================================================
// Function : buildReclassDDV
// Purpose  : Builds the Depreciation Detail View using the new parameters going forward.
// ======================================================

function buildReclassDDV(input, reclassType, timingResult, oldParamsResult, newParamsResult, revisionResult) {
  var newParams = reclassType.newParams;
  var cost = input.originalCost;

  // Going-forward depreciation uses new parameters
  var newBonusDepr = cost * (newParams.bonusPercent / 100);
  var newDepreciableBasis = cost - newBonusDepr;
  var newMonthlyRate = newParams.lifeMonths > 0 ? newDepreciableBasis / newParams.lifeMonths : 0;

  // Updated A/D = existing A/D + revision
  var updatedAD = input.existingAD + revisionResult.totalRevision;
  if (updatedAD < 0) updatedAD = 0;
  if (updatedAD > cost) updatedAD = cost;

  var nbv = cost - updatedAD;

  return {
    assetType: input.newAssetType,
    method: newParams.method,
    lifeMonths: newParams.lifeMonths,
    convention: newParams.convention,
    bonusPercent: newParams.bonusPercent,
    costEndingBalance: cost,
    deprEndingAccum: updatedAD,
    netBookValue: nbv,
    goingForwardMonthlyDepr: newMonthlyRate,
    fedRevisionAbsorbed: revisionResult.revision,
    pyFedRevision: revisionResult.pyRevision,
    revisionDirection: revisionResult.direction,
    previousAssetType: input.oldAssetType,
    previousMLC: reclassType.oldParams.method + '/' + reclassType.oldParams.lifeMonths + 'mo/' + reclassType.oldParams.convention,
    newMLC: newParams.method + '/' + newParams.lifeMonths + 'mo/' + newParams.convention
  };
}

// ======================================================
// END: buildReclassDDV
// ======================================================

// ── Step 8: Validate Reclassification Post-Processing ────────
// ======================================================
// Function : validateReclassPostProcessing
// Purpose  : Runs the post-processing checks (cost unchanged, balances) within a tolerance of 0.02.
// ======================================================

function validateReclassPostProcessing(input, reclassType, ddv, revisionResult) {
  var checks = [];
  var TOLERANCE = 0.02;

  // Check 1: Cost unchanged
  var costCheck = Math.abs(ddv.costEndingBalance - input.originalCost) <= TOLERANCE;
  checks.push({
    checkName: 'cost_unchanged',
    passed: costCheck,
    expected: input.originalCost,
    actual: ddv.costEndingBalance,
    discrepancy: costCheck ? null : ddv.costEndingBalance - input.originalCost
  });

  // Check 2: A/D consistency — existing A/D + revision = ending A/D
  var expectedAD = input.existingAD + revisionResult.totalRevision;
  if (expectedAD < 0) expectedAD = 0;
  if (expectedAD > input.originalCost) expectedAD = input.originalCost;
  var adCheck = Math.abs(ddv.deprEndingAccum - expectedAD) <= TOLERANCE;
  checks.push({
    checkName: 'ad_consistency',
    passed: adCheck,
    expected: expectedAD,
    actual: ddv.deprEndingAccum,
    discrepancy: adCheck ? null : ddv.deprEndingAccum - expectedAD
  });

  // Check 3: NBV = Cost - A/D
  var expectedNBV = ddv.costEndingBalance - ddv.deprEndingAccum;
  var nbvCheck = Math.abs(ddv.netBookValue - expectedNBV) <= TOLERANCE;
  checks.push({
    checkName: 'nbv_equals_cost_minus_ad',
    passed: nbvCheck,
    expected: expectedNBV,
    actual: ddv.netBookValue,
    discrepancy: nbvCheck ? null : ddv.netBookValue - expectedNBV
  });

  // Check 4: New M/L/C applied
  var mlcCheck = (ddv.method === reclassType.newParams.method && ddv.lifeMonths === reclassType.newParams.lifeMonths && ddv.convention === reclassType.newParams.convention);
  checks.push({
    checkName: 'new_mlc_applied',
    passed: mlcCheck,
    expected: reclassType.newParams.method + '/' + reclassType.newParams.lifeMonths + '/' + reclassType.newParams.convention,
    actual: ddv.method + '/' + ddv.lifeMonths + '/' + ddv.convention,
    discrepancy: mlcCheck ? null : 'M/L/C mismatch'
  });

  return checks;
}

// ======================================================
// END: validateReclassPostProcessing
// ======================================================

// ── Master Function: calculateReclassification ───────────────
// ======================================================
// Function : calculateReclassification
// Purpose  : Performs a calculation for 'calculateReclassification'
// ======================================================

function calculateReclassification(input) {
  var result = { activePath: [], steps: {}, error: null };
  try {
    // Step 1: Validate
    var validation = validateReclassInput(input);
    result.steps.step1 = validation;
    result.activePath.push('step1');
    if (!validation.valid) { result.error = { step: 'step1', error: 'Validation failed' }; return result; }

    // Step 2: Determine Reclass Type
    var reclassType = determineReclassType(input);
    result.steps.step2 = reclassType;
    result.activePath.push('step2');

    // Step 3: Determine Timing
    var timingResult = determineReclassTiming(input);
    result.steps.step3 = timingResult;
    result.activePath.push('step3');

    // Step 4: Calculate Old Parameters
    var oldParamsResult = calculateOldParameters(input, reclassType, timingResult);
    result.steps.step4 = oldParamsResult;
    result.activePath.push('step4');

    // Step 5: Calculate New Parameters
    var newParamsResult = calculateNewParameters(input, reclassType, timingResult);
    result.steps.step5 = newParamsResult;
    result.activePath.push('step5');

    // Step 6: Calculate Revision
    var revisionResult = calculateReclassRevision(input, reclassType, timingResult, oldParamsResult, newParamsResult);
    result.steps.step6 = revisionResult;
    if (timingResult.timing !== 'current') { result.activePath.push('step6'); }

    // Step 6B: YTD Total
    result.activePath.push('step6b');

    // Step 7: Build DDV
    var ddv = buildReclassDDV(input, reclassType, timingResult, oldParamsResult, newParamsResult, revisionResult);
    result.steps.step7 = ddv;
    result.activePath.push('step7');

    // Step 8: Post-Processing Validation
    var postChecks = validateReclassPostProcessing(input, reclassType, ddv, revisionResult);
    result.steps.step8 = postChecks;
    result.activePath.push('step8');

  } catch (e) {
    result.error = { step: 'unknown', error: e.message || String(e) };
  }
  return result;
}

// ======================================================
// END: calculateReclassification
// ======================================================

// ── Flowchart Definition Builder ─────────────────────────────
// ======================================================
// Function : buildReclassFlowchartDefinition
// Purpose  : Builds the Mermaid flowchart text, marking which steps ran, were skipped or errored.
// ======================================================

function buildReclassFlowchartDefinition(activePath, result) {
  var allNodes = ['step1','step2','step3','step4','step5','step6','step6b','step7','step8'];
  var hasError = (activePath && activePath.length === 1 && activePath[0] === 'step1');
  var activeSet = {};
  if (activePath) { for (var i = 0; i < activePath.length; i++) activeSet[activePath[i]] = true; }
  var activeNodes = [], mutedNodes = [], errorNodes = [];
  for (var i = 0; i < allNodes.length; i++) {
    var n = allNodes[i];
    if (hasError && n === 'step1') errorNodes.push(n);
    else if (activeSet[n]) activeNodes.push(n);
    else mutedNodes.push(n);
  }
  function fmtN(v) { if (v === null || v === undefined) return '\u2014'; return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  var lines = [];
  lines.push('graph TD');
  lines.push('  step1(["Step 1: Validate Inputs"])');
  lines.push('  step2{"Step 2: Reclass Type?"}');
  lines.push('  step3{"Step 3: Timing?"}');
  lines.push('  step4["Step 4: Old Params Depr"]');
  lines.push('  step5["Step 5: New Params Depr"]');
  lines.push('  step6["Step 6: Revision"]');
  lines.push('  step6b["Step 6B: YTD Total Depr"]');
  lines.push('  step7["Step 7: Build DDV"]');
  lines.push('  step8(["Step 8: Post-Processing"])');
  lines.push('  step1 --> step2');
  lines.push('  step2 -->|"M/L/C Changed"| step3');
  lines.push('  step2 -->|"Bonus Changed"| step3');
  lines.push('  step3 -->|Current| step4');
  lines.push('  step3 -->|Backdated| step4');
  lines.push('  step4 --> step5');
  lines.push('  step5 -->|Current| step6b');
  lines.push('  step5 -->|Backdated| step6');
  lines.push('  step6 --> step6b');
  lines.push('  step6b --> step7');
  lines.push('  step7 --> step8');

  var s = result ? result.steps : null;
  if (s) {
    if (activeSet['step1'] && s.step1) { lines.push('  note1>"' + (s.step1.valid ? '✓ All inputs valid' : '✗ ' + s.step1.errors.length + ' error(s)') + '"]'); lines.push('  step1 -.- note1'); }
    if (activeSet['step2'] && s.step2) { lines.push('  note2>"' + s.step2.formula + '\\n' + s.step2.formulaValues + '"]'); lines.push('  step2 -.- note2'); }
    if (activeSet['step3'] && s.step3) {
      var tLbl = s.step3.timing === 'current' ? 'Current Period' : (s.step3.timing === 'backdated-same-year' ? 'Same-Year' : 'Prior-Year') + ' (' + s.step3.backdatedMonths + ' mo)';
      lines.push('  note3>"effectiveDate vs accountingPeriod\\n→ ' + tLbl + '"]'); lines.push('  step3 -.- note3');
    }
    if (activeSet['step4'] && s.step4) { lines.push('  note4>"' + s.step4.formula + '\\n' + s.step4.formulaValues + '"]'); lines.push('  step4 -.- note4'); }
    if (activeSet['step5'] && s.step5) { lines.push('  note5>"' + s.step5.formula + '\\n' + s.step5.formulaValues + '"]'); lines.push('  step5 -.- note5'); }
    if (activeSet['step6'] && s.step6 && s.step6.totalRevision !== 0) { lines.push('  note6>"' + s.step6.formula + '\\n' + s.step6.formulaValues + '"]'); lines.push('  step6 -.- note6'); }
    if (activeSet['step6b'] && s.step7) { lines.push('  note6b>"YTD: A/D $' + fmtN(s.step7.deprEndingAccum) + ' | NBV $' + fmtN(s.step7.netBookValue) + '\\nGoing-Forward: $' + fmtN(s.step7.goingForwardMonthlyDepr) + '/mo"]'); lines.push('  step6b -.- note6b'); }
    if (activeSet['step7'] && s.step7) { lines.push('  note7>"Cost $' + fmtN(s.step7.costEndingBalance) + ' | A/D $' + fmtN(s.step7.deprEndingAccum) + '\\nNBV $' + fmtN(s.step7.netBookValue) + ' | New M/L/C: ' + s.step7.newMLC + '"]'); lines.push('  step7 -.- note7'); }
    if (activeSet['step8'] && s.step8) { var allP = s.step8.every(function(c){return c.passed;}); lines.push('  note8>"' + (allP ? '✓ All checks passed' : '⚠ Validation warnings') + '"]'); lines.push('  step8 -.- note8'); }
  }

  lines.push('  classDef active fill:#eff6ff,stroke:#2563eb,stroke-width:2.5px,color:#1e40af');
  lines.push('  classDef muted fill:#f9fafb,stroke:#d1d5db,color:#9ca3af,opacity:0.5');
  lines.push('  classDef error fill:#fef2f2,stroke:#dc2626,stroke-width:2.5px,color:#991b1b');
  lines.push('  classDef noteStyle fill:#fefce8,stroke:#ca8a04,stroke-width:1px,color:#713f12,font-size:11px');
  if (activeNodes.length > 0) lines.push('  class ' + activeNodes.join(',') + ' active');
  if (mutedNodes.length > 0) lines.push('  class ' + mutedNodes.join(',') + ' muted');
  if (errorNodes.length > 0) lines.push('  class ' + errorNodes.join(',') + ' error');
  var noteIds = ['note1','note2','note3','note4','note5','note6','note6b','note7','note8'];
  var noteNodes = [];
  for (var i = 0; i < noteIds.length; i++) { for (var j = 0; j < lines.length; j++) { if (lines[j].indexOf('  ' + noteIds[i] + '>') === 0) { noteNodes.push(noteIds[i]); break; } } }
  if (noteNodes.length > 0) lines.push('  class ' + noteNodes.join(',') + ' noteStyle');
  return lines.join('\n');
}

// ======================================================
// END: buildReclassFlowchartDefinition
// ======================================================

// Test cases moved to Postgres (table engine_test_cases). Run them with: npm run test:engine


// ---- appended for Node/CommonJS use ----
module.exports = { calculateReclassification: calculateReclassification };

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : reclassifications.cjs
// ======================================================
