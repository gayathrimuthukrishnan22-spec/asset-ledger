// ======================================================
// File Name : transfers.cjs
// Purpose   : Depreciation calc-engine module: transfers
// ======================================================

// ---- prepended: same RATE_TABLES engine the browser calculators load via <script> ----
const RATE_TABLES = require("./rate-tables.cjs");


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// ============================================================
// Transfers Visual Calculator — Calculation Engine
// Each step is a separate function for easy editing.
// Master function: calculateTransfer(input)
// Ref: TRD Section 5.3.3
// ============================================================

// ── Step 1: Validate Inputs ──────────────────────────────────
// ======================================================
// Function : validateTransferInput
// Purpose  : Step 1: checks the required Transfer inputs (total cost > 0, cost transferred, dates) and returns the errors.
// ======================================================

function validateTransferInput(input) {
  var errors = [];
  if (!input.totalCost || input.totalCost <= 0) {
    errors.push({ field: 'totalCost', rule: 'totalCost > 0', message: 'Total asset cost must be greater than zero' });
  }
  if (!input.costTransferred || input.costTransferred <= 0) {
    errors.push({ field: 'costTransferred', rule: 'costTransferred > 0', message: 'Cost transferred must be greater than zero' });
  }
  if (input.costTransferred && input.totalCost && input.costTransferred > input.totalCost) {
    errors.push({ field: 'costTransferred', rule: 'costTransferred <= totalCost', message: 'Cost transferred cannot exceed total asset cost' });
  }
  if (!input.pisd) {
    errors.push({ field: 'pisd', rule: 'pisd required', message: 'Placed-in-service date is required' });
  }
  if (!input.transferDate) {
    errors.push({ field: 'transferDate', rule: 'transferDate required', message: 'Transfer date is required' });
  }
  if (!input.accountingPeriodDate) {
    errors.push({ field: 'accountingPeriodDate', rule: 'accountingPeriodDate required', message: 'Accounting period date is required' });
  }
  if (input.totalAD === undefined || input.totalAD === null || input.totalAD < 0) {
    errors.push({ field: 'totalAD', rule: 'totalAD >= 0', message: 'Total accumulated depreciation must be zero or positive' });
  }
  if (!input.sourceCompany) {
    errors.push({ field: 'sourceCompany', rule: 'sourceCompany required', message: 'Source company is required' });
  }
  if (!input.destCompany && !input.destLocation) {
    errors.push({ field: 'destCompany', rule: 'destination required', message: 'Destination company or location is required' });
  }
  return { valid: errors.length === 0, errors: errors };
}

// ======================================================
// END: validateTransferInput
// ======================================================

// ── Step 2: Determine Transfer Type ──────────────────────────
// ======================================================
// Function : determineTransferType
// Purpose  : Step 2: classifies the Transfer as full or partial and computes the transfer ratio.
// ======================================================

function determineTransferType(input) {
  var isFullTransfer = (input.costTransferred === input.totalCost);
  var transferRatio = input.costTransferred / input.totalCost;
  return {
    type: isFullTransfer ? 'full' : 'partial',
    costTransferred: input.costTransferred,
    totalCost: input.totalCost,
    transferRatio: transferRatio,
    remainingCost: input.totalCost - input.costTransferred,
    formula: 'transferRatio = costTransferred / totalCost',
    formulaValues: '$' + input.costTransferred.toFixed(2) + ' / $' + input.totalCost.toFixed(2) + ' = ' + (transferRatio * 100).toFixed(2) + '%'
  };
}

// ======================================================
// END: determineTransferType
// ======================================================

// ── Step 3: Determine Transfer Scope ─────────────────────────
// ======================================================
// Function : determineTransferScope
// Purpose  : Step 3: classifies the Transfer as inter-company or intra-company.
// ======================================================

function determineTransferScope(input) {
  var isInterCompany = (input.sourceCompany !== input.destCompany);
  return {
    scope: isInterCompany ? 'inter-company' : 'intra-company',
    sourceCompany: input.sourceCompany,
    destCompany: input.destCompany || input.sourceCompany,
    sourceLocation: input.sourceLocation || '',
    destLocation: input.destLocation || '',
    description: isInterCompany
      ? 'Different company codes → different tax entity'
      : 'Same company → cost center/location/project change only'
  };
}

// ======================================================
// END: determineTransferScope
// ======================================================

// ── Step 4: Determine Timing ─────────────────────────────────
// ======================================================
// Function : determineTransferTiming
// Purpose  : Step 4: decides whether the Transfer is current-period or backdated.
// ======================================================

function determineTransferTiming(input) {
  var tfParts = input.transferDate.split('-');
  var tfYear = parseInt(tfParts[0], 10);
  var tfMonth = parseInt(tfParts[1], 10);

  var apdParts = input.accountingPeriodDate.split('-');
  var apdYear = parseInt(apdParts[0], 10);
  var apdMonth = parseInt(apdParts[1], 10);

  if (tfYear === apdYear && tfMonth === apdMonth) {
    return { timing: 'current', backdatedMonths: 0, transferMonth: tfMonth, transferYear: tfYear, accountingMonth: apdMonth, accountingYear: apdYear };
  }
  var backdatedMonths = (apdYear - tfYear) * 12 + (apdMonth - tfMonth);
  var isPriorYear = (tfYear < apdYear);
  return {
    timing: isPriorYear ? 'backdated-prior-year' : 'backdated-same-year',
    backdatedMonths: backdatedMonths,
    transferMonth: tfMonth,
    transferYear: tfYear,
    accountingMonth: apdMonth,
    accountingYear: apdYear
  };
}

// ======================================================
// END: determineTransferTiming
// ======================================================

// ── Step 5: Calculate Transfer Ratio & A/D Allocation ────────
// ======================================================
// Function : calculateTransferADAllocation
// Purpose  : Performs a calculation for 'calculateTransferADAllocation'
// ======================================================

function calculateTransferADAllocation(input, transferType) {
  var ratio = transferType.transferRatio;
  var bonusAD = input.bonusAD || 0;
  var regularAD = input.totalAD - bonusAD;

  // Proportional allocation per TRD 5.3.3.2
  var bonusADTransferred = bonusAD * ratio;
  var regularADTransferred = regularAD * ratio;
  var totalADTransferred = bonusADTransferred + regularADTransferred;

  // Remaining at source
  var remainingBonusAD = bonusAD - bonusADTransferred;
  var remainingRegularAD = regularAD - regularADTransferred;
  var remainingTotalAD = remainingBonusAD + remainingRegularAD;

  return {
    transferRatio: ratio,
    bonusAD: bonusAD,
    regularAD: regularAD,
    bonusADTransferred: bonusADTransferred,
    regularADTransferred: regularADTransferred,
    totalADTransferred: totalADTransferred,
    remainingBonusAD: remainingBonusAD,
    remainingRegularAD: remainingRegularAD,
    remainingTotalAD: remainingTotalAD,
    formula: 'bonusAD_tf = bonusAD × ratio; regularAD_tf = (totalAD - bonusAD) × ratio',
    formulaValues: 'Bonus: $' + bonusADTransferred.toFixed(2) + ' | Regular: $' + regularADTransferred.toFixed(2) + ' | Total A/D Transferred: $' + totalADTransferred.toFixed(2)
  };
}

// ======================================================
// END: calculateTransferADAllocation
// ======================================================

// ── Step 6: Calculate Source Company Impact ──────────────────
// ======================================================
// Function : calculateSourceImpact
// Purpose  : Performs a calculation for 'calculateSourceImpact'
// ======================================================

function calculateSourceImpact(input, transferType, adAllocation, timingResult) {
  var remainingCost = transferType.remainingCost;
  var remainingAD = adAllocation.remainingTotalAD;
  var remainingNBV = remainingCost - remainingAD;

  // Depreciation proration: source recognizes depr through transfer date
  var monthlyDepr = input.monthlyDeprRate || 0;
  var tfMonth = timingResult.transferMonth;
  var sourceDeprMonths = tfMonth; // months from Jan through transfer month
  var sourceDeprExpense = monthlyDepr * sourceDeprMonths;

  // For full transfer, source has nothing remaining
  if (transferType.type === 'full') {
    remainingCost = 0;
    remainingAD = 0;
    remainingNBV = 0;
    sourceDeprExpense = monthlyDepr * tfMonth;
  }

  return {
    costTransferredOut: input.costTransferred,
    adTransferredOut: adAllocation.totalADTransferred,
    remainingCost: remainingCost,
    remainingAD: remainingAD,
    remainingNBV: remainingNBV,
    sourceDeprMonths: sourceDeprMonths,
    sourceDeprExpense: sourceDeprExpense,
    formula: 'remainingCost = totalCost - costTransferred; sourceDepr = monthlyRate × monthsThruTransfer',
    formulaValues: 'Remaining: Cost $' + remainingCost.toFixed(2) + ' | A/D $' + remainingAD.toFixed(2) + ' | NBV $' + remainingNBV.toFixed(2)
  };
}

// ======================================================
// END: calculateSourceImpact
// ======================================================

// ── Step 7: Calculate Destination Company Impact ─────────────
// ======================================================
// Function : calculateDestinationImpact
// Purpose  : Performs a calculation for 'calculateDestinationImpact'
// ======================================================

function calculateDestinationImpact(input, transferType, adAllocation, timingResult) {
  var costReceived = input.costTransferred;
  var adReceived = adAllocation.totalADTransferred;
  var nbvReceived = costReceived - adReceived;

  // Destination recognizes depr from transfer date through period end
  var monthlyDepr = input.monthlyDeprRate || 0;
  var tfMonth = timingResult.transferMonth;
  var apdMonth = timingResult.accountingMonth;
  var destDeprMonths = apdMonth - tfMonth;
  if (destDeprMonths < 0) destDeprMonths = 0;
  var destDeprExpense = monthlyDepr * transferType.transferRatio * destDeprMonths;

  // Bonus exception: bonus is NOT prorated on transfer
  // Destination inherits bonus A/D as historical — no new bonus generated
  var bonusNote = 'Bonus A/D inherited as historical (no new bonus at destination)';

  return {
    costReceived: costReceived,
    adReceived: adReceived,
    nbvReceived: nbvReceived,
    bonusADReceived: adAllocation.bonusADTransferred,
    regularADReceived: adAllocation.regularADTransferred,
    destDeprMonths: destDeprMonths,
    destDeprExpense: destDeprExpense,
    preservedPISD: input.pisd,
    preservedMethod: input.method || 'MACRS',
    preservedLife: input.lifeMonths,
    preservedConvention: input.convention || 'HY',
    bonusNote: bonusNote,
    formula: 'destDepr = monthlyRate × transferRatio × monthsFromTransfer; Bonus NOT prorated',
    formulaValues: 'Received: Cost $' + costReceived.toFixed(2) + ' | A/D $' + adReceived.toFixed(2) + ' | Depr $' + destDeprExpense.toFixed(2) + ' (' + destDeprMonths + ' mo)'
  };
}

// ======================================================
// END: calculateDestinationImpact
// ======================================================

// ── Step 8: Calculate Revision Absorbed (Backdated Only) ─────
// ======================================================
// Function : calculateTransferRevision
// Purpose  : Performs a calculation for 'calculateTransferRevision'
// ======================================================

function calculateTransferRevision(input, transferType, adAllocation, sourceImpact, destImpact, timingResult) {
  if (timingResult.timing === 'current') {
    return {
      sourceRevision: { fedRevisionAbsorbed: 0, bonusRevisionAbsorbed: 0, pyFedRevision: 0, pyBonusRevision: 0 },
      destRevision: { fedRevisionAbsorbed: 0, bonusRevisionAbsorbed: 0, pyFedRevision: 0, pyBonusRevision: 0 },
      totalSourceRevision: 0,
      totalDestRevision: 0,
      formula: 'No revision (current period transfer)',
      formulaValues: '$0.00'
    };
  }

  var monthlyDepr = input.monthlyDeprRate || 0;
  var ratio = transferType.transferRatio;
  var backdatedMonths = timingResult.backdatedMonths - 1; // M-1: exclude current processing month
  if (backdatedMonths < 0) backdatedMonths = 0;

  // Source: NEGATIVE revision — reversing over-recognized depr on transferred cost
  // The source was depreciating cost that should have already been at destination
  var sourceOverRecognized = monthlyDepr * ratio * backdatedMonths;
  var sourceFedRevision = -sourceOverRecognized;
  var sourceBonusRevision = 0; // bonus stays with PISD company, no revision needed

  // Destination: POSITIVE revision — recognizing missed depr on received cost
  var destMissedDepr = monthlyDepr * ratio * backdatedMonths;
  var destFedRevision = destMissedDepr;
  var destBonusRevision = 0; // bonus not prorated on transfer

  // Prior-year split
  var sourcePyFed = 0, destPyFed = 0;
  if (timingResult.timing === 'backdated-prior-year') {
    var monthsInPY = 12 - timingResult.transferMonth;
    var monthsInCY = timingResult.accountingMonth - 1; // M-1
    if (monthsInCY < 0) monthsInCY = 0;
    sourcePyFed = -(monthlyDepr * ratio * monthsInPY);
    sourceFedRevision = -(monthlyDepr * ratio * monthsInCY);
    destPyFed = monthlyDepr * ratio * monthsInPY;
    destFedRevision = monthlyDepr * ratio * monthsInCY;
  }

  return {
    sourceRevision: { fedRevisionAbsorbed: sourceFedRevision, bonusRevisionAbsorbed: sourceBonusRevision, pyFedRevision: sourcePyFed, pyBonusRevision: 0 },
    destRevision: { fedRevisionAbsorbed: destFedRevision, bonusRevisionAbsorbed: destBonusRevision, pyFedRevision: destPyFed, pyBonusRevision: 0 },
    totalSourceRevision: sourceFedRevision + sourceBonusRevision + sourcePyFed,
    totalDestRevision: destFedRevision + destBonusRevision + destPyFed,
    backdatedMonths: backdatedMonths,
    formula: 'source: -(monthlyDepr × ratio × months); dest: +(monthlyDepr × ratio × months)',
    formulaValues: 'Source: $' + (sourceFedRevision + sourcePyFed).toFixed(2) + ' | Dest: +$' + (destFedRevision + destPyFed).toFixed(2),
    sourceFormula: 'sourceRev = -(monthlyDepr × ratio × backdatedMonths)',
    sourceCalc: '-($' + monthlyDepr.toFixed(2) + ' × ' + (ratio * 100).toFixed(2) + '% × ' + backdatedMonths + ' mo) = $' + (sourceFedRevision + sourcePyFed).toFixed(2),
    destFormula: 'destRev = +(monthlyDepr × ratio × backdatedMonths)',
    destCalc: '+($' + monthlyDepr.toFixed(2) + ' × ' + (ratio * 100).toFixed(2) + '% × ' + backdatedMonths + ' mo) = $' + (destFedRevision + destPyFed).toFixed(2)
  };
}

// ======================================================
// END: calculateTransferRevision
// ======================================================

// ── Step 9: Build DDV Output ─────────────────────────────────
// ======================================================
// Function : buildTransferDDV
// Purpose  : Builds the Depreciation Detail View for both the source and the destination asset.
// ======================================================

function buildTransferDDV(input, transferType, scope, adAllocation, sourceImpact, destImpact, revisionResult, timingResult) {
  return {
    source: {
      costTransferOut: input.costTransferred,
      adTransferOut: adAllocation.totalADTransferred,
      costEndingBalance: sourceImpact.remainingCost,
      deprEndingAccum: sourceImpact.remainingAD,
      deprInPeriod: sourceImpact.sourceDeprExpense,
      netBookValue: sourceImpact.remainingNBV,
      fedRevisionAbsorbed: revisionResult.sourceRevision.fedRevisionAbsorbed,
      bonusRevisionAbsorbed: revisionResult.sourceRevision.bonusRevisionAbsorbed,
      pyFedRevision: revisionResult.sourceRevision.pyFedRevision,
      revisionTreatment: timingResult.timing === 'current' ? 'N/A' : 'Immediate'
    },
    destination: {
      costTransferIn: input.costTransferred,
      adTransferIn: adAllocation.totalADTransferred,
      costEndingBalance: input.costTransferred,
      deprEndingAccum: adAllocation.totalADTransferred + destImpact.destDeprExpense,
      deprInPeriod: destImpact.destDeprExpense,
      netBookValue: input.costTransferred - (adAllocation.totalADTransferred + destImpact.destDeprExpense),
      fedRevisionAbsorbed: revisionResult.destRevision.fedRevisionAbsorbed,
      bonusRevisionAbsorbed: revisionResult.destRevision.bonusRevisionAbsorbed,
      pyFedRevision: revisionResult.destRevision.pyFedRevision,
      revisionTreatment: timingResult.timing === 'current' ? 'N/A' : 'Immediate',
      preservedPISD: input.pisd,
      preservedMethod: destImpact.preservedMethod,
      preservedLife: destImpact.preservedLife,
      preservedConvention: destImpact.preservedConvention
    }
  };
}

// ======================================================
// END: buildTransferDDV
// ======================================================

// ── Step 10: Post-Processing Validation ──────────────────────
// ======================================================
// Function : validateTransferPostProcessing
// Purpose  : Runs the post-processing checks (source + destination cost = original cost, A/D split) within a tolerance of 0.02.
// ======================================================

function validateTransferPostProcessing(input, transferType, adAllocation, ddv) {
  var checks = [];
  var TOLERANCE = 0.02;

  // Check 1: Source cost + Dest cost = Original Total Cost
  var totalCostCheck = Math.abs((ddv.source.costEndingBalance + ddv.destination.costEndingBalance) - input.totalCost) <= TOLERANCE;
  checks.push({
    checkName: 'cost_conservation',
    passed: totalCostCheck,
    expected: input.totalCost,
    actual: ddv.source.costEndingBalance + ddv.destination.costEndingBalance,
    discrepancy: totalCostCheck ? null : (ddv.source.costEndingBalance + ddv.destination.costEndingBalance) - input.totalCost
  });

  // Check 2: Transfer-out does not exceed total cost
  var tfOutCheck = input.costTransferred <= input.totalCost;
  checks.push({
    checkName: 'transfer_out_limit',
    passed: tfOutCheck,
    expected: input.totalCost,
    actual: input.costTransferred,
    discrepancy: tfOutCheck ? null : input.costTransferred - input.totalCost
  });

  // Check 3: A/D conservation (source remaining + dest received = original total)
  var adConserved = Math.abs((adAllocation.remainingTotalAD + adAllocation.totalADTransferred) - input.totalAD) <= TOLERANCE;
  checks.push({
    checkName: 'ad_conservation',
    passed: adConserved,
    expected: input.totalAD,
    actual: adAllocation.remainingTotalAD + adAllocation.totalADTransferred,
    discrepancy: adConserved ? null : (adAllocation.remainingTotalAD + adAllocation.totalADTransferred) - input.totalAD
  });

  // Check 4: Bonus A/D not re-generated at destination
  var bonusCheck = (ddv.destination.bonusRevisionAbsorbed === 0);
  checks.push({
    checkName: 'bonus_not_regenerated',
    passed: bonusCheck,
    expected: 0,
    actual: ddv.destination.bonusRevisionAbsorbed,
    discrepancy: bonusCheck ? null : ddv.destination.bonusRevisionAbsorbed
  });

  return checks;
}

// ======================================================
// END: validateTransferPostProcessing
// ======================================================

// ── Master Function: calculateTransfer ───────────────────────
// ======================================================
// Function : calculateTransfer
// Purpose  : Performs a calculation for 'calculateTransfer'
// ======================================================

function calculateTransfer(input) {
  var result = { activePath: [], steps: {}, error: null };
  try {
    // Step 1
    var validation = validateTransferInput(input);
    result.steps.step1 = validation;
    result.activePath.push('step1');
    if (!validation.valid) { result.error = { step: 'step1', error: 'Validation failed' }; return result; }

    // Step 2
    var transferType = determineTransferType(input);
    result.steps.step2 = transferType;
    result.activePath.push('step2');

    // Step 3
    var scope = determineTransferScope(input);
    result.steps.step3 = scope;
    result.activePath.push('step3');

    // Step 4
    var timingResult = determineTransferTiming(input);
    result.steps.step4 = timingResult;
    result.activePath.push('step4');

    // Step 5
    var adAllocation = calculateTransferADAllocation(input, transferType);
    result.steps.step5 = adAllocation;
    result.activePath.push('step5');

    // Step 6
    var sourceImpact = calculateSourceImpact(input, transferType, adAllocation, timingResult);
    result.steps.step6 = sourceImpact;
    result.activePath.push('step6');

    // Step 7
    var destImpact = calculateDestinationImpact(input, transferType, adAllocation, timingResult);
    result.steps.step7 = destImpact;
    result.activePath.push('step7');

    // Step 8
    var revisionResult = calculateTransferRevision(input, transferType, adAllocation, sourceImpact, destImpact, timingResult);
    result.steps.step8 = revisionResult;
    if (timingResult.timing !== 'current') { result.activePath.push('step8'); }

    // Step 9
    var ddv = buildTransferDDV(input, transferType, scope, adAllocation, sourceImpact, destImpact, revisionResult, timingResult);
    result.steps.step9 = ddv;
    result.activePath.push('step9');

    // Step 10
    var postChecks = validateTransferPostProcessing(input, transferType, adAllocation, ddv);
    result.steps.step10 = postChecks;
    result.activePath.push('step10');

  } catch (e) {
    result.error = { step: 'unknown', error: e.message || String(e) };
  }
  return result;
}

// ======================================================
// END: calculateTransfer
// ======================================================

// ── Flowchart Definition Builder ─────────────────────────────
// ======================================================
// Function : buildTransferFlowchartDefinition
// Purpose  : Builds the Mermaid flowchart text, marking which steps ran, were skipped or errored.
// ======================================================

function buildTransferFlowchartDefinition(activePath, result) {
  var allNodes = ['step1','step2','step3','step4','step5','step6','step7','step8','step9','step10'];
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
  lines.push('  step2{"Step 2: Transfer Type?"}');
  lines.push('  step3{"Step 3: Transfer Scope?"}');
  lines.push('  step4{"Step 4: Timing?"}');
  lines.push('  step5["Step 5: A/D Allocation"]');
  lines.push('  step6["Step 6: Source Impact"]');
  lines.push('  step7["Step 7: Destination Impact"]');
  lines.push('  step8["Step 8: Revision Absorbed"]');
  lines.push('  step9["Step 9: DDV Output"]');
  lines.push('  step10(["Step 10: Post-Processing"])');
  lines.push('  step1 --> step2');
  lines.push('  step2 -->|Full| step3');
  lines.push('  step2 -->|Partial| step3');
  lines.push('  step3 -->|Inter-Company| step4');
  lines.push('  step3 -->|Intra-Company| step4');
  lines.push('  step4 -->|Current| step5');
  lines.push('  step4 -->|Backdated| step5');
  lines.push('  step5 --> step6');
  lines.push('  step6 --> step7');
  lines.push('  step7 -->|Current| step9');
  lines.push('  step7 -->|Backdated| step8');
  lines.push('  step8 --> step9');
  lines.push('  step9 --> step10');

  var s = result ? result.steps : null;
  if (s) {
    if (activeSet['step1'] && s.step1) { lines.push('  note1>"' + (s.step1.valid ? '✓ All inputs valid' : '✗ ' + s.step1.errors.length + ' error(s)') + '"]'); lines.push('  step1 -.- note1'); }
    if (activeSet['step2'] && s.step2) { lines.push('  note2>"' + s.step2.formula + '\\n' + s.step2.formulaValues + '"]'); lines.push('  step2 -.- note2'); }
    if (activeSet['step3'] && s.step3) { lines.push('  note3>"' + s.step3.scope + '\\n' + s.step3.description + '"]'); lines.push('  step3 -.- note3'); }
    if (activeSet['step4'] && s.step4) {
      var tLbl = s.step4.timing === 'current' ? 'Current Period' : (s.step4.timing === 'backdated-same-year' ? 'Same-Year' : 'Prior-Year') + ' (' + s.step4.backdatedMonths + ' mo)';
      lines.push('  note4>"transferDate vs accountingPeriod\\n→ ' + tLbl + '"]'); lines.push('  step4 -.- note4');
    }
    if (activeSet['step5'] && s.step5) { lines.push('  note5>"' + s.step5.formula + '\\n' + s.step5.formulaValues + '"]'); lines.push('  step5 -.- note5'); }
    if (activeSet['step6'] && s.step6) { lines.push('  note6>"' + s.step6.formula + '\\n' + s.step6.formulaValues + '"]'); lines.push('  step6 -.- note6'); }
    if (activeSet['step7'] && s.step7) { lines.push('  note7>"' + s.step7.formula + '\\n' + s.step7.formulaValues + '"]'); lines.push('  step7 -.- note7'); }
    if (activeSet['step8'] && s.step8 && (s.step8.totalSourceRevision !== 0 || s.step8.totalDestRevision !== 0)) { lines.push('  note8>"' + s.step8.formula + '\\n' + s.step8.formulaValues + '"]'); lines.push('  step8 -.- note8'); }
    if (activeSet['step9'] && s.step9) { lines.push('  note9>"Source: Cost $' + fmtN(s.step9.source.costEndingBalance) + ' | A/D $' + fmtN(s.step9.source.deprEndingAccum) + '\\nDest: Cost $' + fmtN(s.step9.destination.costEndingBalance) + ' | A/D $' + fmtN(s.step9.destination.deprEndingAccum) + '"]'); lines.push('  step9 -.- note9'); }
    if (activeSet['step10'] && s.step10) { var allP = s.step10.every(function(c){return c.passed;}); lines.push('  note10>"' + (allP ? '✓ All checks passed' : '⚠ Validation warnings') + '"]'); lines.push('  step10 -.- note10'); }
  }

  lines.push('  classDef active fill:#eff6ff,stroke:#2563eb,stroke-width:2.5px,color:#1e40af');
  lines.push('  classDef muted fill:#f9fafb,stroke:#d1d5db,color:#9ca3af,opacity:0.5');
  lines.push('  classDef error fill:#fef2f2,stroke:#dc2626,stroke-width:2.5px,color:#991b1b');
  lines.push('  classDef noteStyle fill:#fefce8,stroke:#ca8a04,stroke-width:1px,color:#713f12,font-size:11px');
  if (activeNodes.length > 0) lines.push('  class ' + activeNodes.join(',') + ' active');
  if (mutedNodes.length > 0) lines.push('  class ' + mutedNodes.join(',') + ' muted');
  if (errorNodes.length > 0) lines.push('  class ' + errorNodes.join(',') + ' error');
  var noteIds = ['note1','note2','note3','note4','note5','note6','note7','note8','note9','note10'];
  var noteNodes = [];
  for (var i = 0; i < noteIds.length; i++) { for (var j = 0; j < lines.length; j++) { if (lines[j].indexOf('  ' + noteIds[i] + '>') === 0) { noteNodes.push(noteIds[i]); break; } } }
  if (noteNodes.length > 0) lines.push('  class ' + noteNodes.join(',') + ' noteStyle');
  return lines.join('\n');
}

// ======================================================
// END: buildTransferFlowchartDefinition
// ======================================================

// Test cases moved to Postgres (table engine_test_cases). Run them with: npm run test:engine


// ---- appended for Node/CommonJS use ----
module.exports = { calculateTransfer: calculateTransfer };

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : transfers.cjs
// ======================================================
