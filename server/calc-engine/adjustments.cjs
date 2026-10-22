// ======================================================
// File Name : adjustments.cjs
// Purpose   : Depreciation calc-engine module: adjustments
// ======================================================

// ---- prepended: same RATE_TABLES engine the browser calculators load via <script> ----
const RATE_TABLES = require("./rate-tables.cjs");


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// ============================================================
// Cost Adjustments Visual Calculator — Calculation Engine
// Each step is a separate function for easy editing.
// Master function: calculateAdjustment(input)
// Ref: TRD Section 5.3.4
// ============================================================

// ── Step 1: Validate Inputs ──────────────────────────────────
// ======================================================
// Function : validateAdjustmentInput
// Purpose  : Step 1: checks the required Adjustment inputs (non-zero amount, dates, cost) and returns the errors.
// ======================================================

function validateAdjustmentInput(input) {
  var errors = [];
  if (input.adjustmentAmount === undefined || input.adjustmentAmount === null || input.adjustmentAmount === 0) {
    errors.push({ field: 'adjustmentAmount', rule: 'adjustmentAmount != 0', message: 'Adjustment amount must be non-zero' });
  }
  if (input.originalCost === undefined || input.originalCost === null) {
    errors.push({ field: 'originalCost', rule: 'originalCost required', message: 'Original asset cost is required' });
  }
  if (!input.pisd) {
    errors.push({ field: 'pisd', rule: 'pisd required', message: 'Placed-in-service date is required' });
  }
  if (!input.effectiveDate) {
    errors.push({ field: 'effectiveDate', rule: 'effectiveDate required', message: 'Effective date is required' });
  }
  if (!input.accountingPeriodDate) {
    errors.push({ field: 'accountingPeriodDate', rule: 'accountingPeriodDate required', message: 'Accounting period date is required' });
  }
  if (input.effectiveDate && input.pisd) {
    if (new Date(input.effectiveDate) < new Date(input.pisd)) {
      errors.push({ field: 'effectiveDate', rule: 'effectiveDate >= pisd', message: 'Effective date cannot be before PISD' });
    }
  }
  if (!input.lifeMonths || input.lifeMonths <= 0) {
    errors.push({ field: 'lifeMonths', rule: 'lifeMonths > 0', message: 'Life in months must be greater than zero' });
  }
  if (input.bonusPercent === undefined || input.bonusPercent === null || input.bonusPercent < 0 || input.bonusPercent > 100) {
    errors.push({ field: 'bonusPercent', rule: '0 <= bonusPercent <= 100', message: 'Bonus percentage must be between 0 and 100' });
  }
  // Negative adjustment cannot exceed original cost (only when originalCost > 0)
  if (input.originalCost > 0 && input.adjustmentAmount < 0 && Math.abs(input.adjustmentAmount) > input.originalCost) {
    errors.push({ field: 'adjustmentAmount', rule: '|negAdj| <= originalCost', message: 'Negative adjustment cannot exceed original asset cost' });
  }
  return { valid: errors.length === 0, errors: errors };
}

// ======================================================
// END: validateAdjustmentInput
// ======================================================

// ── Step 2: Determine Adjustment Type ────────────────────────
// ======================================================
// Function : determineAdjustmentType
// Purpose  : Step 2: classifies the Adjustment as positive or negative and computes the adjusted cost.
// ======================================================

function determineAdjustmentType(input) {
  var adjustedCost = input.originalCost + input.adjustmentAmount;
  return {
    type: input.adjustmentAmount > 0 ? 'positive' : 'negative',
    adjustmentAmount: input.adjustmentAmount,
    originalCost: input.originalCost,
    adjustedCost: adjustedCost,
    formula: 'adjustedCost = originalCost + adjustmentAmount',
    formulaValues: '$' + input.originalCost.toFixed(2) + ' + $' + input.adjustmentAmount.toFixed(2) + ' = $' + adjustedCost.toFixed(2)
  };
}

// ======================================================
// END: determineAdjustmentType
// ======================================================

// ── Step 3: Determine Timing ─────────────────────────────────
// ======================================================
// Function : determineAdjustmentTiming
// Purpose  : Step 3: decides whether the Adjustment is current-period or backdated.
// ======================================================

function determineAdjustmentTiming(input) {
  var effParts = input.effectiveDate.split('-');
  var effYear = parseInt(effParts[0], 10);
  var effMonth = parseInt(effParts[1], 10);

  var apdParts = input.accountingPeriodDate.split('-');
  var apdYear = parseInt(apdParts[0], 10);
  var apdMonth = parseInt(apdParts[1], 10);

  if (effYear === apdYear && effMonth === apdMonth) {
    return { timing: 'current', backdatedMonths: 0 };
  }

  var backdatedMonths = (apdYear - effYear) * 12 + (apdMonth - effMonth);
  var isPriorYear = (effYear < apdYear);

  return {
    timing: isPriorYear ? 'backdated-prior-year' : 'backdated-same-year',
    backdatedMonths: backdatedMonths,
    effectiveYear: effYear,
    effectiveMonth: effMonth,
    accountingYear: apdYear,
    accountingMonth: apdMonth
  };
}

// ======================================================
// END: determineAdjustmentTiming
// ======================================================

// ── Step 4: Calculate Bonus on Adjustment ────────────────────
// ======================================================
// Function : calculateAdjustmentBonus
// Purpose  : Performs a calculation for 'calculateAdjustmentBonus'
// ======================================================

function calculateAdjustmentBonus(input, adjType) {
  var bonusFraction = input.bonusPercent / 100;
  var bonusOnAdjustment = input.adjustmentAmount * bonusFraction;
  var remainingAdjBasis = input.adjustmentAmount - bonusOnAdjustment;

  return {
    bonusPercent: input.bonusPercent,
    bonusOnAdjustment: bonusOnAdjustment,
    remainingAdjBasis: remainingAdjBasis,
    isFullBonus: (input.bonusPercent === 100),
    formula: 'bonusOnAdj = adjustmentAmount × bonusPercent',
    formulaValues: '$' + input.adjustmentAmount.toFixed(2) + ' × ' + input.bonusPercent + '% = $' + bonusOnAdjustment.toFixed(2)
  };
}

// ======================================================
// END: calculateAdjustmentBonus
// ======================================================

// ── Step 5: Calculate Regular Depreciation Impact ────────────
// ======================================================
// Function : calculateAdjustmentRegularDepr
// Purpose  : Performs a calculation for 'calculateAdjustmentRegularDepr'
// ======================================================

function calculateAdjustmentRegularDepr(input, adjType, bonusResult, timingResult) {
  if (bonusResult.isFullBonus) {
    return {
      monthlyImpact: 0,
      annualImpact: 0,
      currentPeriodImpact: 0,
      conventionMultiplier: 0,
      formula: 'No regular depr impact (100% bonus on adjustment)',
      formulaValues: '$0.00'
    };
  }

  var remainingBasis = bonusResult.remainingAdjBasis;
  var lifeYears = input.lifeMonths / 12;
  var convention = input.convention || 'HY';
  var method = input.method || 'MACRS';
  if (method === 'ADS') method = 'MACRS ADS';

  // Use RATE_TABLES for exact rate lookup
  var pisdMonth = parseInt(input.pisd.split('-')[1], 10);
  var pisdYear = parseInt(input.pisd.split('-')[0], 10);
  var effYear = parseInt(input.effectiveDate.split('-')[0], 10);
  var deprYearNum = effYear - pisdYear + 1;

  var annualRate;
  if (typeof RATE_TABLES !== 'undefined') {
    annualRate = RATE_TABLES.lookupRate({
      method: method, lifeYears: lifeYears, convention: convention,
      year: deprYearNum, quarter: Math.ceil(pisdMonth / 3), monthPIS: pisdMonth
    });
  } else {
    annualRate = (method === 'MACRS Straight-Line' || method === 'SL') ? (100 / lifeYears) : (200 / lifeYears);
  }

  var annualImpact = remainingBasis * (annualRate / 100);
  var monthlyImpact;
  var apdMonth = parseInt(input.accountingPeriodDate.split('-')[1], 10);

  if (convention === 'Mid-Month' && deprYearNum === 1 && apdMonth === pisdMonth) {
    // PIS month with Mid-Month convention: half month only
    var year1Months = 12 - pisdMonth + 0.5;
    monthlyImpact = annualImpact / year1Months * 0.5;
  } else if (convention === 'Mid-Month' && deprYearNum === 1) {
    // Year 1 but after PIS month: full monthly rate within Year 1
    var year1Months = 12 - pisdMonth + 0.5;
    monthlyImpact = annualImpact / year1Months;
  } else if ((convention === 'HY' || convention === 'Half-Year' || convention === 'MQ') && deprYearNum === 1) {
    // HY/MQ Year 1: divide by months remaining in year from PISD month
    // (matches addition calculator's getCumulativeDepr logic)
    var totalMonthsInYear = 12 - pisdMonth + 1;
    monthlyImpact = annualImpact / totalMonthsInYear;
  } else {
    // All other cases (Year 2+): divide annual by 12
    monthlyImpact = annualImpact / 12;
  }
  var currentPeriodImpact = monthlyImpact;

  // When adjustment is in same period as a backdated addition,
  // it should cover the same number of months as the addition (from PISD through APD)
  var monthsCovered = 1;
  if (input.samePeriodsAsAddition && deprYearNum === 1) {
    if (convention === 'Mid-Month') {
      monthsCovered = apdMonth - pisdMonth + 0.5;
      if (monthsCovered < 0.5) monthsCovered = 0.5;
    } else if (convention === 'HY' || convention === 'Half-Year' || convention === 'MQ') {
      monthsCovered = apdMonth - pisdMonth + 1;
      if (monthsCovered < 1) monthsCovered = 1;
    }
    currentPeriodImpact = monthlyImpact * monthsCovered;
  }

  return {
    monthlyImpact: monthlyImpact,
    annualImpact: annualImpact,
    currentPeriodImpact: currentPeriodImpact,
    conventionMultiplier: annualRate / (100 / lifeYears),
    rate: annualRate,
    formula: 'RATE_TABLES: ' + method + ' ' + lifeYears + 'yr ' + convention + ' Year ' + deprYearNum + ' = ' + annualRate + '%',
    formulaValues: '$' + remainingBasis.toFixed(2) + ' × ' + annualRate.toFixed(2) + '% / ' + ((convention === 'Mid-Month' && deprYearNum === 1) ? (12 - pisdMonth + 0.5) : ((convention === 'HY' || convention === 'Half-Year' || convention === 'MQ') && deprYearNum === 1) ? (12 - pisdMonth + 1) : 12) + ' = $' + monthlyImpact.toFixed(2) + '/mo'
  };
}

// ======================================================
// END: calculateAdjustmentRegularDepr
// ======================================================

// ── Step 6: Calculate Revision Absorbed (Backdated Only) ─────
// ======================================================
// Function : calculateAdjustmentRevision
// Purpose  : Performs a calculation for 'calculateAdjustmentRevision'
// ======================================================

function calculateAdjustmentRevision(input, adjType, bonusResult, regularResult, timingResult) {
  if (timingResult.timing === 'current') {
    return {
      fedRevisionAbsorbed: 0,
      bonusRevisionAbsorbed: 0,
      pyRevisionAbsorbed: 0,
      pyBonusRevisionAbsorbed: 0,
      totalRevisionAbsorbed: 0,
      formula: 'No revision (current period adjustment)',
      formulaValues: '$0.00'
    };
  }

  // Bonus revision: full bonus on adjustment is caught up
  var bonusRevisionAbsorbed = bonusResult.bonusOnAdjustment;

  // Regular depr revision: incremental monthly rate × backdated months (through M-1)
  var backdatedMonths = timingResult.backdatedMonths - 1; // M-1: exclude current processing month
  if (backdatedMonths < 0) backdatedMonths = 0;
  var fedRevisionAbsorbed = regularResult.monthlyImpact * backdatedMonths;

  var pyRevisionAbsorbed = 0;
  var pyBonusRevisionAbsorbed = 0;

  if (timingResult.timing === 'backdated-prior-year') {
    // Split into PY and CY components
    // PY: from effective date through Dec 31 of prior year
    var monthsInPriorYear = 12 - timingResult.effectiveMonth;
    var monthsInCurrentYear = timingResult.accountingMonth;

    pyRevisionAbsorbed = regularResult.monthlyImpact * monthsInPriorYear;
    pyBonusRevisionAbsorbed = bonusRevisionAbsorbed; // bonus is always PY since it's recognized at PISD
    fedRevisionAbsorbed = regularResult.monthlyImpact * monthsInCurrentYear;
    bonusRevisionAbsorbed = 0; // bonus goes to PY
  }

  var totalRevisionAbsorbed = fedRevisionAbsorbed + bonusRevisionAbsorbed + pyRevisionAbsorbed + pyBonusRevisionAbsorbed;

  // Build display strings using the actual months used in each calculation
  var fedDisplayMonths = backdatedMonths;
  var pyDisplayMonths = 0;
  if (timingResult.timing === 'backdated-prior-year') {
    fedDisplayMonths = timingResult.accountingMonth;
    pyDisplayMonths = 12 - timingResult.effectiveMonth;
  }

  return {
    fedRevisionAbsorbed: fedRevisionAbsorbed,
    bonusRevisionAbsorbed: bonusRevisionAbsorbed,
    pyRevisionAbsorbed: pyRevisionAbsorbed,
    pyBonusRevisionAbsorbed: pyBonusRevisionAbsorbed,
    totalRevisionAbsorbed: totalRevisionAbsorbed,
    backdatedMonths: backdatedMonths,
    formula: 'revision = (adjCost - origCost) × monthlyRate × backdatedMonths',
    formulaValues: '$' + regularResult.monthlyImpact.toFixed(2) + '/mo × ' + fedDisplayMonths + ' mo = $' + fedRevisionAbsorbed.toFixed(2) + ' (fed) + $' + bonusRevisionAbsorbed.toFixed(2) + ' (bonus)',
    fedFormula: 'fed_revision = monthlyImpact × ' + (timingResult.timing === 'backdated-prior-year' ? 'monthsInCurrentYear' : 'backdatedMonths(M-1)'),
    fedCalc: '$' + regularResult.monthlyImpact.toFixed(2) + ' × ' + fedDisplayMonths + ' mo = $' + fedRevisionAbsorbed.toFixed(2),
    bonusFormula: 'bonus_revision = bonusOnAdjustment (full catch-up)',
    bonusCalc: '$' + bonusResult.bonusOnAdjustment.toFixed(2),
    pyFormula: 'py_revision = monthlyImpact × monthsInPriorYear',
    pyCalc: '$' + regularResult.monthlyImpact.toFixed(2) + ' × ' + pyDisplayMonths + ' mo = $' + pyRevisionAbsorbed.toFixed(2),
    totalFormula: 'total = fed + bonus + py_regular + py_bonus',
    totalCalc: '$' + fedRevisionAbsorbed.toFixed(2) + ' + $' + bonusRevisionAbsorbed.toFixed(2) + ' + $' + pyRevisionAbsorbed.toFixed(2) + ' + $' + pyBonusRevisionAbsorbed.toFixed(2) + ' = $' + totalRevisionAbsorbed.toFixed(2)
  };
}

// ======================================================
// END: calculateAdjustmentRevision
// ======================================================

// ── Step 7: Build DDV Output ─────────────────────────────────
// ======================================================
// Function : buildAdjustmentDDV
// Purpose  : Builds the Depreciation Detail View for the Adjustment (adjusted cost, adjustment balance, depreciation).
// ======================================================

function buildAdjustmentDDV(input, adjType, bonusResult, regularResult, revisionResult, timingResult) {
  var costEndingBalance = adjType.adjustedCost;
  var adjustmentAuto = input.adjustmentAmount;
  var endingAdjBalance = input.priorAdjustmentBalance + input.adjustmentAmount;
  var totalAdjustments = endingAdjBalance;

  // Depreciation impact
  var deprFromBonus = bonusResult.bonusOnAdjustment;
  var deprFromRegular = regularResult.currentPeriodImpact;
  var totalDeprImpact = deprFromBonus + deprFromRegular;

  // Accumulated depreciation on adjusted cost
  var existingAccumDepr = input.existingAccumDepr || 0;
  var isFullyDepreciated = existingAccumDepr > 0 && existingAccumDepr >= input.originalCost - 0.01;

  // For 100% bonus assets: entire adjustment is bonus, no regular depr or revision needed
  if (bonusResult.isFullBonus) {
    totalDeprImpact = deprFromBonus; // Only bonus contributes
    deprFromRegular = 0;
  } else if (isFullyDepreciated) {
    // For fully-depreciated non-bonus assets, regular depr is zero — revision absorbs everything
    totalDeprImpact = 0;
    deprFromRegular = 0;
    deprFromBonus = 0;
  }

  var newAccumDepr;
  if (input.samePeriodsAsAddition && !bonusResult.isFullBonus && !isFullyDepreciated) {
    // For same-period-as-addition: totalDeprImpact already covers all months (including revision months)
    // Revision is a label for the catch-up portion — don't add it separately
    newAccumDepr = existingAccumDepr + totalDeprImpact;
  } else {
    newAccumDepr = existingAccumDepr + totalDeprImpact + revisionResult.fedRevisionAbsorbed + revisionResult.bonusRevisionAbsorbed;
  }

  var netBookValue = costEndingBalance - newAccumDepr;

  // deprInPeriod: for 100% bonus assets = 0 (all depr is AFYD, not regular)
  // for fully-depreciated non-bonus assets = revision (catch-up)
  // otherwise = regular depreciation impact
  var deprInPeriod;
  if (bonusResult.isFullBonus) {
    deprInPeriod = 0;
  } else if (isFullyDepreciated) {
    deprInPeriod = revisionResult.fedRevisionAbsorbed + revisionResult.bonusRevisionAbsorbed;
  } else {
    deprInPeriod = deprFromRegular;
  }

  return {
    // Cost fields
    costEndingBalance: costEndingBalance,
    costAcquisitions: input.originalCost,
    // Adjustment tracking
    factPatternAdjustmentAuto: adjustmentAuto,
    factPatternBeginningAdjBalance: input.priorAdjustmentBalance,
    factPatternEndingAdjBalance: endingAdjBalance,
    factPatternTotalAdjustments: totalAdjustments,
    // Depreciation
    deprEndingAccum: newAccumDepr,
    deprInPeriod: deprInPeriod,
    deprNetBookValue: netBookValue,
    // Bonus
    factPatternAFYD: costEndingBalance * (input.bonusPercent / 100),
    cumulativeBonusPercent: input.bonusPercent,
    deprNetAFYD: costEndingBalance * (input.bonusPercent / 100),
    // Revision
    fedRevisionAbsorbed: revisionResult.fedRevisionAbsorbed,
    bonusRevisionAbsorbed: revisionResult.bonusRevisionAbsorbed,
    pyRevisionAbsorbed: revisionResult.pyRevisionAbsorbed,
    pyBonusRevisionAbsorbed: revisionResult.pyBonusRevisionAbsorbed,
    revisionTreatment: timingResult.timing === 'current' ? 'N/A' : 'Immediate',
    // YTD
    ytdDeprExpense: deprFromRegular + revisionResult.fedRevisionAbsorbed,
    totalDeprExpense: newAccumDepr
  };
}

// ======================================================
// END: buildAdjustmentDDV
// ======================================================

// ── Step 8: Post-Processing Validation ───────────────────────
// ======================================================
// Function : validateAdjustmentPostProcessing
// Purpose  : Runs the post-processing checks (cost = original + adjustment, NBV balance) on the DDV.
// ======================================================

function validateAdjustmentPostProcessing(input, adjType, ddv) {
  var checks = [];
  var TOLERANCE = 0.01;

  // Check 1: Cost ending balance = original + adjustment
  var expectedCost = input.originalCost + input.adjustmentAmount;
  var costCheck = Math.abs(ddv.costEndingBalance - expectedCost) <= TOLERANCE;
  checks.push({
    checkName: 'cost_balance',
    passed: costCheck,
    expected: expectedCost,
    actual: ddv.costEndingBalance,
    discrepancy: costCheck ? null : ddv.costEndingBalance - expectedCost
  });

  // Check 2: Adjustment tracking = sum of adjustments
  var adjTrackCheck = Math.abs(ddv.factPatternEndingAdjBalance - (input.priorAdjustmentBalance + input.adjustmentAmount)) <= TOLERANCE;
  checks.push({
    checkName: 'adjustment_tracking',
    passed: adjTrackCheck,
    expected: input.priorAdjustmentBalance + input.adjustmentAmount,
    actual: ddv.factPatternEndingAdjBalance,
    discrepancy: adjTrackCheck ? null : ddv.factPatternEndingAdjBalance - (input.priorAdjustmentBalance + input.adjustmentAmount)
  });

  // Check 3: NBV = Cost - Accum Depr
  var expectedNBV = ddv.costEndingBalance - ddv.deprEndingAccum;
  var nbvCheck = Math.abs(ddv.deprNetBookValue - expectedNBV) <= TOLERANCE;
  checks.push({
    checkName: 'nbv_balance',
    passed: nbvCheck,
    expected: expectedNBV,
    actual: ddv.deprNetBookValue,
    discrepancy: nbvCheck ? null : ddv.deprNetBookValue - expectedNBV
  });

  return checks;
}

// ======================================================
// END: validateAdjustmentPostProcessing
// ======================================================

// ── Master Function: calculateAdjustment ─────────────────────
// ======================================================
// Function : calculateAdjustment
// Purpose  : Performs a calculation for 'calculateAdjustment'
// ======================================================

function calculateAdjustment(input) {
  var result = { activePath: [], steps: {}, error: null };

  try {
    // Step 1
    var validation = validateAdjustmentInput(input);
    result.steps.step1 = validation;
    result.activePath.push('step1');
    if (!validation.valid) { result.error = { step: 'step1', error: 'Validation failed' }; return result; }

    // Step 2
    var adjType = determineAdjustmentType(input);
    result.steps.step2 = adjType;
    result.activePath.push('step2');

    // Step 3
    var timingResult = determineAdjustmentTiming(input);
    result.steps.step3 = timingResult;
    result.activePath.push('step3');

    // Step 4
    var bonusResult = calculateAdjustmentBonus(input, adjType);
    result.steps.step4 = bonusResult;
    result.activePath.push('step4');

    // Step 5
    var regularResult = calculateAdjustmentRegularDepr(input, adjType, bonusResult, timingResult);
    result.steps.step5 = regularResult;
    result.activePath.push('step5');

    // Step 6
    var revisionResult = calculateAdjustmentRevision(input, adjType, bonusResult, regularResult, timingResult);

    // Same-period-as-addition: when adjustment is in the same period as a backdated addition,
    // compute revision for missed prior months (PISD through M-1)
    if (input.samePeriodsAsAddition && timingResult.timing === 'current' && !bonusResult.isFullBonus) {
      var pisdMonth = parseInt(input.pisd.split('-')[1], 10);
      var apdMonth = parseInt(input.accountingPeriodDate.split('-')[1], 10);
      var convention = input.convention || 'HY';
      // For Mid-Month: PISD month gets half month, subsequent months get full
      // missedMonths = (apdMonth - pisdMonth - 1) + 0.5 for Mid-Month
      // For HY/MQ: missedMonths = apdMonth - pisdMonth (full months)
      var missedMonths;
      if (convention === 'Mid-Month') {
        missedMonths = (apdMonth - pisdMonth - 1) + 0.5; // half month at PISD + full months through M-1
        if (missedMonths < 0) missedMonths = 0;
      } else {
        missedMonths = apdMonth - pisdMonth; // full months from PISD through M-1
      }
      if (missedMonths > 0) {
        var missedDepr = regularResult.monthlyImpact * missedMonths;
        var missedBonus = bonusResult.bonusOnAdjustment; // bonus is always caught up at PISD
        revisionResult = {
          fedRevisionAbsorbed: missedDepr,
          bonusRevisionAbsorbed: missedBonus,
          pyRevisionAbsorbed: 0,
          pyBonusRevisionAbsorbed: 0,
          totalRevisionAbsorbed: missedDepr + missedBonus,
          backdatedMonths: missedMonths,
          formula: 'Same-period-as-addition: revision for missed months from PISD',
          formulaValues: '$' + regularResult.monthlyImpact.toFixed(2) + '/mo × ' + missedMonths + ' months = $' + missedDepr.toFixed(2),
          fedFormula: 'fed_revision = monthlyImpact × missedMonths',
          fedCalc: '$' + missedDepr.toFixed(2),
          bonusFormula: 'bonus_revision = bonusOnAdjustment',
          bonusCalc: '$' + missedBonus.toFixed(2),
          pyFormula: 'N/A',
          pyCalc: '$0.00',
          totalFormula: 'total = fed + bonus',
          totalCalc: '$' + (missedDepr + missedBonus).toFixed(2)
        };
      }
    }

    // Fix #1: Fully-depreciated asset revision absorption
    // When existingAccumDepr >= originalCost, the asset's life has expired.
    // The entire adjustment's depreciation impact should be absorbed as revision.
    // Exception: 100% bonus assets are fully depreciated due to bonus, not life expiry —
    // their adjustments flow to bonus (AFYD), not revision.
    var existingAccumDepr = input.existingAccumDepr || 0;
    var isFullyDepreciated = existingAccumDepr > 0 && existingAccumDepr >= input.originalCost - 0.01;
    if (isFullyDepreciated && timingResult.timing === 'current' && !bonusResult.isFullBonus) {
      // Override: the full adjustment amount is revision (asset life expired, 100% catch-up)
      var fullRevision = Math.abs(input.adjustmentAmount);
      revisionResult = {
        fedRevisionAbsorbed: fullRevision,
        bonusRevisionAbsorbed: 0,
        pyRevisionAbsorbed: 0,
        pyBonusRevisionAbsorbed: 0,
        totalRevisionAbsorbed: fullRevision,
        backdatedMonths: 0,
        formula: 'Fully depreciated asset: entire adjustment absorbed as revision',
        formulaValues: '$' + fullRevision.toFixed(2) + ' (full catch-up, life expired)',
        fedFormula: 'fed_revision = |adjustmentAmount| (fully depreciated)',
        fedCalc: '$' + fullRevision.toFixed(2),
        bonusFormula: 'N/A',
        bonusCalc: '$0.00',
        pyFormula: 'N/A',
        pyCalc: '$0.00',
        totalFormula: 'total = full adjustment amount',
        totalCalc: '$' + fullRevision.toFixed(2)
      };
    }

    result.steps.step6 = revisionResult;
    if (timingResult.timing !== 'current' || isFullyDepreciated) { result.activePath.push('step6'); }

    // Step 6B: YTD Total
    result.activePath.push('step6b');

    // Step 7
    var ddv = buildAdjustmentDDV(input, adjType, bonusResult, regularResult, revisionResult, timingResult);
    result.steps.step7 = ddv;
    result.activePath.push('step7');

    // Step 8
    var postChecks = validateAdjustmentPostProcessing(input, adjType, ddv);
    result.steps.step8 = postChecks;
    result.activePath.push('step8');

  } catch (e) {
    result.error = { step: 'unknown', error: e.message || String(e) };
  }
  return result;
}

// ======================================================
// END: calculateAdjustment
// ======================================================

// ── Flowchart Definition Builder ─────────────────────────────
// ======================================================
// Function : buildAdjustmentFlowchartDefinition
// Purpose  : Builds the Mermaid flowchart text, marking which steps ran, were skipped or errored.
// ======================================================

function buildAdjustmentFlowchartDefinition(activePath, result) {
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
  lines.push('  step2{"Step 2: Adjustment Type?"}');
  lines.push('  step3{"Step 3: Timing?"}');
  lines.push('  step4["Step 4: Bonus on Adjustment"]');
  lines.push('  step5["Step 5: Regular Depr Impact"]');
  lines.push('  step6["Step 6: Revision Absorbed"]');
  lines.push('  step6b["Step 6B: YTD Total Depr"]');
  lines.push('  step7["Step 7: DDV Output"]');
  lines.push('  step8(["Step 8: Post-Processing"])');
  lines.push('  step1 --> step2');
  lines.push('  step2 -->|Positive| step3');
  lines.push('  step2 -->|Negative| step3');
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
    if (activeSet['step1'] && s.step1) {
      lines.push('  note1>"' + (s.step1.valid ? '✓ All inputs valid' : '✗ ' + s.step1.errors.length + ' error(s)') + '"]');
      lines.push('  step1 -.- note1');
    }
    if (activeSet['step2'] && s.step2) {
      lines.push('  note2>"' + s.step2.formula + '\\n' + s.step2.formulaValues + '"]');
      lines.push('  step2 -.- note2');
    }
    if (activeSet['step3'] && s.step3) {
      var tLbl = s.step3.timing === 'current' ? 'Current Period' : (s.step3.timing === 'backdated-same-year' ? 'Backdated Same-Year' : 'Backdated Prior-Year') + ' (' + s.step3.backdatedMonths + ' mo)';
      lines.push('  note3>"effectiveDate vs accountingPeriod\\n→ ' + tLbl + '"]');
      lines.push('  step3 -.- note3');
    }
    if (activeSet['step4'] && s.step4) {
      lines.push('  note4>"' + s.step4.formula + '\\n' + s.step4.formulaValues + '"]');
      lines.push('  step4 -.- note4');
    }
    if (activeSet['step5'] && s.step5) {
      lines.push('  note5>"' + s.step5.formula + '\\n' + s.step5.formulaValues + '"]');
      lines.push('  step5 -.- note5');
    }
    if (activeSet['step6'] && s.step6 && s.step6.totalRevisionAbsorbed !== 0) {
      lines.push('  note6>"' + s.step6.formula + '\\n' + s.step6.formulaValues + '"]');
      lines.push('  step6 -.- note6');
    }
    if (activeSet['step6b'] && s.step7) {
      lines.push('  note6b>"YTD = deprInPeriod + fed_revision + bonus_revision\\nYTD $' + fmtN(s.step7.ytdDeprExpense) + ' | Total $' + fmtN(s.step7.totalDeprExpense) + '"]');
      lines.push('  step6b -.- note6b');
    }
    if (activeSet['step7'] && s.step7) {
      lines.push('  note7>"DDV Record:\\nCost $' + fmtN(s.step7.costEndingBalance) + ' | Adj $' + fmtN(s.step7.factPatternAdjustmentAuto) + '\\nA/D $' + fmtN(s.step7.deprEndingAccum) + ' | NBV $' + fmtN(s.step7.deprNetBookValue) + '"]');
      lines.push('  step7 -.- note7');
    }
    if (activeSet['step8'] && s.step8) {
      var allP = s.step8.every(function(c) { return c.passed; });
      lines.push('  note8>"' + (allP ? '✓ All checks passed' : '⚠ Validation warnings') + '"]');
      lines.push('  step8 -.- note8');
    }
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
// END: buildAdjustmentFlowchartDefinition
// ======================================================

// Test cases moved to Postgres (table engine_test_cases). Run them with: npm run test:engine


// ---- appended for Node/CommonJS use ----
module.exports = { calculateAdjustment: calculateAdjustment };

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : adjustments.cjs
// ======================================================
