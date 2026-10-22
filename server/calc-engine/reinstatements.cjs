// ======================================================
// File Name : reinstatements.cjs
// Purpose   : Depreciation calc-engine module: reinstatements
// ======================================================

// ---- prepended: same RATE_TABLES engine the browser calculators load via <script> ----
const RATE_TABLES = require("./rate-tables.cjs");


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// ============================================================
// Reinstatements Visual Calculator — Calculation Engine
// Each step is a separate function for easy editing.
// Master function: calculateReinstatement(input)
// Ref: TRD Section 5.3.6
// ============================================================

// ── Step 1: Validate Inputs ──────────────────────────────────
// ======================================================
// Function : validateReinstatementInput
// Purpose  : Step 1: checks the required Reinstatement inputs (disposal and reinstatement dates, cost) and returns the errors.
// ======================================================

function validateReinstatementInput(input) {
  var errors = [];
  if (!input.originalDisposalDate) {
    errors.push({ field: 'originalDisposalDate', rule: 'originalDisposalDate required', message: 'Original disposal date is required' });
  }
  if (!input.reinstatementDate) {
    errors.push({ field: 'reinstatementDate', rule: 'reinstatementDate required', message: 'Reinstatement date is required' });
  }
  if (!input.accountingPeriodDate) {
    errors.push({ field: 'accountingPeriodDate', rule: 'accountingPeriodDate required', message: 'Accounting period date is required' });
  }
  if (!input.originalCost || input.originalCost <= 0) {
    errors.push({ field: 'originalCost', rule: 'originalCost > 0', message: 'Original cost must be greater than zero' });
  }
  if (input.originalADAtDisposal === undefined || input.originalADAtDisposal === null || input.originalADAtDisposal < 0) {
    errors.push({ field: 'originalADAtDisposal', rule: 'originalADAtDisposal >= 0', message: 'Original A/D at disposal must be zero or positive' });
  }
  if (input.originalGainLoss === undefined || input.originalGainLoss === null) {
    errors.push({ field: 'originalGainLoss', rule: 'originalGainLoss required', message: 'Original gain/loss amount is required' });
  }
  if (!input.lifeMonths || input.lifeMonths <= 0) {
    errors.push({ field: 'lifeMonths', rule: 'lifeMonths > 0', message: 'Life in months must be greater than zero' });
  }
  if (!input.pisd) {
    errors.push({ field: 'pisd', rule: 'pisd required', message: 'Placed-in-service date (PISD) is required' });
  }
  return { valid: errors.length === 0, errors: errors };
}

// ======================================================
// END: validateReinstatementInput
// ======================================================

// ── Step 2: Determine Reinstatement Timing ───────────────────
// ======================================================
// Function : determineReinstatementTiming
// Purpose  : Step 2: decides whether the Reinstatement is current-period or backdated.
// ======================================================

function determineReinstatementTiming(input) {
  var reinParts = input.reinstatementDate.split('-');
  var reinYear = parseInt(reinParts[0], 10);
  var reinMonth = parseInt(reinParts[1], 10);

  var apdParts = input.accountingPeriodDate.split('-');
  var apdYear = parseInt(apdParts[0], 10);
  var apdMonth = parseInt(apdParts[1], 10);

  var dispParts = input.originalDisposalDate.split('-');
  var dispYear = parseInt(dispParts[0], 10);
  var dispMonth = parseInt(dispParts[1], 10);

  // Months asset was disposed (from disposal to reinstatement)
  var monthsDisposed = (reinYear - dispYear) * 12 + (reinMonth - dispMonth);
  if (monthsDisposed < 0) monthsDisposed = 0;

  if (reinYear === apdYear && reinMonth === apdMonth) {
    return {
      timing: 'current',
      backdatedMonths: 0,
      monthsDisposed: monthsDisposed,
      reinstatementMonth: reinMonth,
      reinstatementYear: reinYear,
      disposalMonth: dispMonth,
      disposalYear: dispYear,
      accountingMonth: apdMonth,
      accountingYear: apdYear,
      crossYear: false
    };
  }

  var backdatedMonths = (apdYear - reinYear) * 12 + (apdMonth - reinMonth);
  var isPriorYear = (reinYear < apdYear);
  var crossYear = (dispYear < apdYear);

  return {
    timing: isPriorYear ? 'backdated-prior-year' : 'backdated-same-year',
    backdatedMonths: backdatedMonths,
    monthsDisposed: monthsDisposed,
    reinstatementMonth: reinMonth,
    reinstatementYear: reinYear,
    disposalMonth: dispMonth,
    disposalYear: dispYear,
    accountingMonth: apdMonth,
    accountingYear: apdYear,
    crossYear: crossYear
  };
}

// ======================================================
// END: determineReinstatementTiming
// ======================================================

// ── Step 3: Restore Cost and A/D ─────────────────────────────
// ======================================================
// Function : restoreCostAndAD
// Purpose  : Step 3: restores the original cost and accumulated depreciation as of the reinstatement date.
// ======================================================

function restoreCostAndAD(input, timingResult) {
  // Restore original cost and A/D as of reinstatement date
  var restoredCost = input.originalCost;
  var restoredAD = input.originalADAtDisposal;
  var restoredNBV = restoredCost - restoredAD;

  return {
    restoredCost: restoredCost,
    restoredAD: restoredAD,
    restoredNBV: restoredNBV,
    formula: 'Restore original cost and A/D as recorded at disposal date',
    formulaValues: 'Cost: $' + restoredCost.toFixed(2) + ' | A/D: $' + restoredAD.toFixed(2) + ' | NBV: $' + restoredNBV.toFixed(2)
  };
}

// ======================================================
// END: restoreCostAndAD
// ======================================================

// ── Step 4: Reverse Gain/Loss ────────────────────────────────
// ======================================================
// Function : reverseGainLoss
// Purpose  : Step 4: reverses the gain / loss recorded on the original disposal in the current period.
// ======================================================

function reverseGainLoss(input, timingResult) {
  // Reverse the prior gain/loss recorded on original disposal
  // Gain/loss reversal recorded in current period DDV (not historical periods)
  var originalGainLoss = input.originalGainLoss || 0;
  var reversalAmount = -originalGainLoss;
  var gainLossType = originalGainLoss > 0 ? 'gain' : originalGainLoss < 0 ? 'loss' : 'zero';

  return {
    originalGainLoss: originalGainLoss,
    reversalAmount: reversalAmount,
    gainLossType: gainLossType,
    formula: 'reversal = -(original gain/loss); recorded in current period DDV',
    formulaValues: 'Original ' + gainLossType + ': $' + originalGainLoss.toFixed(2) + ' → Reversal: $' + reversalAmount.toFixed(2)
  };
}

// ======================================================
// END: reverseGainLoss
// ======================================================

// ── Step 5: Calculate Resumed Depreciation ───────────────────
// ======================================================
// Function : calculateResumedDepreciation
// Purpose  : Performs a calculation for 'calculateResumedDepreciation'
// ======================================================

function calculateResumedDepreciation(input, timingResult, restoredResult) {
  // Resume depreciation from reinstatement period forward using original M/L/C
  var cost = input.originalCost;
  var bonusPercent = input.bonusPercent || 0;
  var bonusDepr = cost * (bonusPercent / 100);
  var depreciableBasis = cost - bonusDepr;
  var lifeMonths = input.lifeMonths;
  var monthlyRate = lifeMonths > 0 ? depreciableBasis / lifeMonths : 0;

  // Months from reinstatement to current accounting period
  var reinMonth = timingResult.reinstatementMonth;
  var reinYear = timingResult.reinstatementYear;
  var apdMonth = timingResult.accountingMonth;
  var apdYear = timingResult.accountingYear;
  var monthsResumed = (apdYear - reinYear) * 12 + (apdMonth - reinMonth);
  if (monthsResumed < 0) monthsResumed = 0;

  // Current period depreciation (going forward)
  var resumedDepr = monthlyRate * (monthsResumed > 0 ? monthsResumed : 1);

  // Cap: don't exceed remaining depreciable amount
  var maxDepr = cost - restoredResult.restoredAD;
  if (resumedDepr > maxDepr) resumedDepr = maxDepr;
  if (resumedDepr < 0) resumedDepr = 0;

  return {
    monthlyRate: monthlyRate,
    monthsResumed: monthsResumed,
    resumedDepr: resumedDepr,
    bonusDepr: bonusDepr,
    depreciableBasis: depreciableBasis,
    method: input.method,
    lifeMonths: lifeMonths,
    convention: input.convention || 'HY',
    formula: 'monthlyRate = (cost - bonus) / life; resumedDepr = monthlyRate × months',
    formulaValues: 'Rate: $' + monthlyRate.toFixed(2) + '/mo × ' + monthsResumed + ' mo = $' + resumedDepr.toFixed(2)
  };
}

// ======================================================
// END: calculateResumedDepreciation
// ======================================================

// ── Step 6: Calculate Reinstatement Revision ─────────────────
// ======================================================
// Function : calculateReinstatementRevision
// Purpose  : Performs a calculation for 'calculateReinstatementRevision'
// ======================================================

function calculateReinstatementRevision(input, timingResult, restoredResult, resumedDeprResult) {
  // (Backdated only) catch-up depreciation for periods where asset was
  // erroneously disposed but should have been active
  if (timingResult.timing === 'current') {
    return {
      revision: 0,
      pyRevision: 0,
      totalRevision: 0,
      catchUpMonths: 0,
      crossYearFlag: false,
      formula: 'No revision (current period reinstatement)',
      formulaValues: '$0.00'
    };
  }

  var monthlyRate = resumedDeprResult.monthlyRate;
  var monthsDisposed = timingResult.monthsDisposed;

  // Catch-up depreciation for months asset was erroneously disposed
  var catchUpDepr = monthlyRate * monthsDisposed;

  // Cap at remaining depreciable amount
  var maxCatchUp = input.originalCost - restoredResult.restoredAD;
  if (catchUpDepr > maxCatchUp) catchUpDepr = maxCatchUp;
  if (catchUpDepr < 0) catchUpDepr = 0;

  var revision = catchUpDepr;
  var pyRevision = 0;
  var crossYearFlag = timingResult.crossYear;

  if (timingResult.timing === 'backdated-prior-year') {
    // Split between prior year and current year (M-1)
    var dispMonth = timingResult.disposalMonth;
    var monthsInPY = 12 - dispMonth;
    var monthsInCY = timingResult.accountingMonth - 1; // M-1
    if (monthsInCY < 0) monthsInCY = 0;
    var totalCatchUpMonths = monthsInPY + monthsInCY;
    if (totalCatchUpMonths > 0) {
      pyRevision = catchUpDepr * (monthsInPY / totalCatchUpMonths);
      revision = catchUpDepr - pyRevision;
    }
  }

  return {
    revision: revision,
    pyRevision: pyRevision,
    totalRevision: revision + pyRevision,
    catchUpMonths: monthsDisposed,
    catchUpDepr: catchUpDepr,
    crossYearFlag: crossYearFlag,
    taxApprovalRequired: crossYearFlag,
    formula: 'catchUp = monthlyRate × monthsDisposed (periods erroneously disposed)',
    formulaValues: '$' + monthlyRate.toFixed(2) + ' × ' + monthsDisposed + ' mo = $' + catchUpDepr.toFixed(2) + (crossYearFlag ? ' [Cross-year: Tax approval required]' : ''),
    catchUpFormula: 'catchUpDepr = monthlyRate × monthsDisposed',
    catchUpCalc: '$' + monthlyRate.toFixed(2) + '/mo × ' + monthsDisposed + ' months = $' + catchUpDepr.toFixed(2),
    cyFormula: 'fed_revision = catchUpDepr × CY portion',
    cyCalc: '$' + revision.toFixed(2),
    pyFormula: 'py_revision = catchUpDepr × PY portion',
    pyCalc: '$' + pyRevision.toFixed(2),
    totalFormula: 'total = fed_revision + py_revision',
    totalCalc: '$' + revision.toFixed(2) + ' + $' + pyRevision.toFixed(2) + ' = $' + (revision + pyRevision).toFixed(2)
  };
}

// ======================================================
// END: calculateReinstatementRevision
// ======================================================

// ── Step 7: Build Reinstatement DDV ──────────────────────────
// ======================================================
// Function : buildReinstatementDDV
// Purpose  : Builds the Depreciation Detail View (restored cost, A/D, resumed depreciation, revision).
// ======================================================

function buildReinstatementDDV(input, timingResult, restoredResult, gainLossResult, resumedDeprResult, revisionResult) {
  var cost = restoredResult.restoredCost;
  var adRestored = restoredResult.restoredAD;
  var resumedDepr = resumedDeprResult.resumedDepr;
  var revision = revisionResult.totalRevision;

  var totalAD = adRestored + resumedDepr + revision;
  if (totalAD > cost) totalAD = cost;
  if (totalAD < 0) totalAD = 0;

  var nbv = cost - totalAD;

  return {
    assetNumber: input.assetNumber,
    costEndingBalance: cost,
    costReinstated: cost,
    adReinstated: adRestored,
    deprEndingAccum: totalAD,
    deprInPeriod: resumedDeprResult.resumedDepr,
    netBookValue: nbv,
    gainLossReversal: gainLossResult.reversalAmount,
    fedRevisionAbsorbed: revisionResult.revision,
    pyFedRevision: revisionResult.pyRevision,
    method: resumedDeprResult.method,
    lifeMonths: resumedDeprResult.lifeMonths,
    convention: resumedDeprResult.convention,
    pisd: input.pisd,
    reinstatementDate: input.reinstatementDate,
    originalDisposalDate: input.originalDisposalDate,
    crossYearFlag: revisionResult.crossYearFlag
  };
}

// ======================================================
// END: buildReinstatementDDV
// ======================================================

// ── Step 8: Validate Reinstatement Post-Processing ───────────
// ======================================================
// Function : validateReinstatementPostProcessing
// Purpose  : Runs the post-processing checks (cost restoration, A/D, gain/loss reversal) within a tolerance of 0.02.
// ======================================================

function validateReinstatementPostProcessing(input, restoredResult, gainLossResult, ddv, revisionResult) {
  var checks = [];
  var TOLERANCE = 0.02;

  // Check 1: Cost restoration — cost ending = original cost
  var costCheck = Math.abs(ddv.costEndingBalance - input.originalCost) <= TOLERANCE;
  checks.push({
    checkName: 'cost_restored',
    passed: costCheck,
    expected: input.originalCost,
    actual: ddv.costEndingBalance,
    discrepancy: costCheck ? null : ddv.costEndingBalance - input.originalCost
  });

  // Check 2: A/D restoration — base A/D matches original A/D at disposal
  var adBaseCheck = Math.abs(ddv.adReinstated - input.originalADAtDisposal) <= TOLERANCE;
  checks.push({
    checkName: 'ad_restored',
    passed: adBaseCheck,
    expected: input.originalADAtDisposal,
    actual: ddv.adReinstated,
    discrepancy: adBaseCheck ? null : ddv.adReinstated - input.originalADAtDisposal
  });

  // Check 3: Gain/loss reversal — reversal = -(original gain/loss)
  var expectedReversal = -(input.originalGainLoss || 0);
  var glCheck = Math.abs(ddv.gainLossReversal - expectedReversal) <= TOLERANCE;
  checks.push({
    checkName: 'gain_loss_reversed',
    passed: glCheck,
    expected: expectedReversal,
    actual: ddv.gainLossReversal,
    discrepancy: glCheck ? null : ddv.gainLossReversal - expectedReversal
  });

  // Check 4: NBV = Cost - A/D
  var expectedNBV = ddv.costEndingBalance - ddv.deprEndingAccum;
  var nbvCheck = Math.abs(ddv.netBookValue - expectedNBV) <= TOLERANCE;
  checks.push({
    checkName: 'nbv_equals_cost_minus_ad',
    passed: nbvCheck,
    expected: expectedNBV,
    actual: ddv.netBookValue,
    discrepancy: nbvCheck ? null : ddv.netBookValue - expectedNBV
  });

  // Check 5: Cross-year flag for Tax approval
  if (revisionResult.crossYearFlag) {
    checks.push({
      checkName: 'cross_year_tax_approval',
      passed: true,
      expected: 'Flagged for Tax approval',
      actual: 'Flagged for Tax approval',
      discrepancy: null
    });
  }

  return checks;
}

// ======================================================
// END: validateReinstatementPostProcessing
// ======================================================

// ── Master Function: calculateReinstatement ──────────────────
// ======================================================
// Function : calculateReinstatement
// Purpose  : Performs a calculation for 'calculateReinstatement'
// ======================================================

function calculateReinstatement(input) {
  var result = { activePath: [], steps: {}, error: null };
  try {
    // Step 1: Validate
    var validation = validateReinstatementInput(input);
    result.steps.step1 = validation;
    result.activePath.push('step1');
    if (!validation.valid) { result.error = { step: 'step1', error: 'Validation failed' }; return result; }

    // Step 2: Determine Timing
    var timingResult = determineReinstatementTiming(input);
    result.steps.step2 = timingResult;
    result.activePath.push('step2');

    // Step 3: Restore Cost and A/D
    var restoredResult = restoreCostAndAD(input, timingResult);
    result.steps.step3 = restoredResult;
    result.activePath.push('step3');

    // Step 4: Reverse Gain/Loss
    var gainLossResult = reverseGainLoss(input, timingResult);
    result.steps.step4 = gainLossResult;
    result.activePath.push('step4');

    // Step 5: Calculate Resumed Depreciation
    var resumedDeprResult = calculateResumedDepreciation(input, timingResult, restoredResult);
    result.steps.step5 = resumedDeprResult;
    result.activePath.push('step5');

    // Step 6: Calculate Revision (backdated only)
    var revisionResult = calculateReinstatementRevision(input, timingResult, restoredResult, resumedDeprResult);
    result.steps.step6 = revisionResult;
    if (timingResult.timing !== 'current') { result.activePath.push('step6'); }

    // Step 6B: YTD Total
    result.activePath.push('step6b');

    // Step 7: Build DDV
    var ddv = buildReinstatementDDV(input, timingResult, restoredResult, gainLossResult, resumedDeprResult, revisionResult);
    result.steps.step7 = ddv;
    result.activePath.push('step7');

    // Step 8: Post-Processing Validation
    var postChecks = validateReinstatementPostProcessing(input, restoredResult, gainLossResult, ddv, revisionResult);
    result.steps.step8 = postChecks;
    result.activePath.push('step8');

  } catch (e) {
    result.error = { step: 'unknown', error: e.message || String(e) };
  }
  return result;
}

// ======================================================
// END: calculateReinstatement
// ======================================================

// ── Flowchart Definition Builder ─────────────────────────────
// ======================================================
// Function : buildReinstatementFlowchartDefinition
// Purpose  : Builds the Mermaid flowchart text, marking which steps ran, were skipped or errored.
// ======================================================

function buildReinstatementFlowchartDefinition(activePath, result) {
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
  lines.push('  step2{"Step 2: Timing?"}');
  lines.push('  step3["Step 3: Restore Cost/AD"]');
  lines.push('  step4["Step 4: Reverse Gain/Loss"]');
  lines.push('  step5["Step 5: Resumed Depreciation"]');
  lines.push('  step6["Step 6: Revision"]');
  lines.push('  step6b["Step 6B: YTD Total Depr"]');
  lines.push('  step7["Step 7: Build DDV"]');
  lines.push('  step8(["Step 8: Post-Processing"])');
  lines.push('  step1 --> step2');
  lines.push('  step2 -->|Current| step3');
  lines.push('  step2 -->|Backdated| step3');
  lines.push('  step3 --> step4');
  lines.push('  step4 --> step5');
  lines.push('  step5 -->|Current| step6b');
  lines.push('  step5 -->|Backdated| step6');
  lines.push('  step6 --> step6b');
  lines.push('  step6b --> step7');
  lines.push('  step7 --> step8');

  var s = result ? result.steps : null;
  if (s) {
    if (activeSet['step1'] && s.step1) { lines.push('  note1>"' + (s.step1.valid ? '✓ All inputs valid' : '✗ ' + s.step1.errors.length + ' error(s)') + '"]'); lines.push('  step1 -.- note1'); }
    if (activeSet['step2'] && s.step2) {
      var tLbl = s.step2.timing === 'current' ? 'Current Period' : (s.step2.timing === 'backdated-same-year' ? 'Same-Year' : 'Prior-Year') + ' (' + s.step2.backdatedMonths + ' mo)';
      lines.push('  note2>"reinstatementDate vs accountingPeriod\\n→ ' + tLbl + '\\nMonths disposed: ' + s.step2.monthsDisposed + '"]'); lines.push('  step2 -.- note2');
    }
    if (activeSet['step3'] && s.step3) { lines.push('  note3>"' + s.step3.formula + '\\n' + s.step3.formulaValues + '"]'); lines.push('  step3 -.- note3'); }
    if (activeSet['step4'] && s.step4) { lines.push('  note4>"' + s.step4.formula + '\\n' + s.step4.formulaValues + '"]'); lines.push('  step4 -.- note4'); }
    if (activeSet['step5'] && s.step5) { lines.push('  note5>"' + s.step5.formula + '\\n' + s.step5.formulaValues + '"]'); lines.push('  step5 -.- note5'); }
    if (activeSet['step6'] && s.step6 && s.step6.totalRevision !== 0) { lines.push('  note6>"' + s.step6.formula + '\\n' + s.step6.formulaValues + '"]'); lines.push('  step6 -.- note6'); }
    if (activeSet['step6b'] && s.step7) { lines.push('  note6b>"YTD: A/D $' + fmtN(s.step7.deprEndingAccum) + ' | NBV $' + fmtN(s.step7.netBookValue) + '\\nDepr In Period: $' + fmtN(s.step7.deprInPeriod) + '"]'); lines.push('  step6b -.- note6b'); }
    if (activeSet['step7'] && s.step7) { lines.push('  note7>"Cost $' + fmtN(s.step7.costEndingBalance) + ' | A/D $' + fmtN(s.step7.deprEndingAccum) + '\\nNBV $' + fmtN(s.step7.netBookValue) + ' | G/L Reversal $' + fmtN(s.step7.gainLossReversal) + '"]'); lines.push('  step7 -.- note7'); }
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
// END: buildReinstatementFlowchartDefinition
// ======================================================

// Test cases moved to Postgres (table engine_test_cases). Run them with: npm run test:engine


// ---- appended for Node/CommonJS use ----
module.exports = { calculateReinstatement: calculateReinstatement };

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : reinstatements.cjs
// ======================================================
