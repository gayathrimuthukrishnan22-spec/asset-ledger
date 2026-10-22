// ======================================================
// File Name : additions.cjs
// Purpose   : Depreciation calc-engine module: additions
// ======================================================

// ---- prepended: same RATE_TABLES engine the browser calculators load via <script> ----
const RATE_TABLES = require("./rate-tables.cjs");


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// ============================================================
// Additions Visual Calculator — Calculation Engine
// Each step is a separate function for easy editing.
// Master function: calculateAddition(input)
// ============================================================

// ── Step 1: Validate Inputs ──────────────────────────────────
// ======================================================
// Function : validateAdditionInput
// Purpose  : Step 1: checks the required Addition inputs and returns the list of errors.
// ======================================================

function validateAdditionInput(input) {
  var errors = [];
  if (input.cost === undefined || input.cost === null) {
    errors.push({ field: 'cost', rule: 'cost required', message: 'Asset cost is required' });
  }
  if (!input.pisd) {
    errors.push({ field: 'pisd', rule: 'pisd required', message: 'Placed-in-service date is required' });
  }
  if (!input.accountingPeriodDate) {
    errors.push({ field: 'accountingPeriodDate', rule: 'accountingPeriodDate required', message: 'Accounting period date is required' });
  }
  if (input.pisd && input.accountingPeriodDate) {
    var pisd = new Date(input.pisd);
    var apd = new Date(input.accountingPeriodDate);
    if (pisd > apd) {
      errors.push({ field: 'pisd', rule: 'pisd <= accountingPeriodDate', message: 'PISD cannot be after the accounting period date' });
    }
  }
  if (!input.lifeMonths || input.lifeMonths <= 0) {
    errors.push({ field: 'lifeMonths', rule: 'lifeMonths > 0', message: 'Life in months must be greater than zero' });
  }
  if (input.bonusPercent === undefined || input.bonusPercent === null || input.bonusPercent < 0 || input.bonusPercent > 100) {
    errors.push({ field: 'bonusPercent', rule: '0 <= bonusPercent <= 100', message: 'Bonus percentage must be between 0 and 100' });
  }
  return { valid: errors.length === 0, errors: errors };
}

// ======================================================
// END: validateAdditionInput
// ======================================================

// ── Step 2: Determine Addition Timing ────────────────────────
// ======================================================
// Function : determineAdditionTiming
// Purpose  : Step 2: decides whether the Addition is current-period or backdated from the in-service and accounting period dates.
// ======================================================

function determineAdditionTiming(input) {
  var pisdParts = input.pisd.split('-');
  var pisdYear = parseInt(pisdParts[0], 10);
  var pisdMonth = parseInt(pisdParts[1], 10);

  var apdParts = input.accountingPeriodDate.split('-');
  var apdYear = parseInt(apdParts[0], 10);
  var apdMonth = parseInt(apdParts[1], 10);

  if (pisdYear === apdYear && pisdMonth === apdMonth) {
    return { timing: 'current', backdatedMonths: 0 };
  }

  // Backdated: PISD is before the current accounting period
  var backdatedMonths = (apdYear - pisdYear) * 12 + (apdMonth - pisdMonth);
  var backdatedYears = (apdYear > pisdYear);

  return {
    timing: backdatedYears ? 'backdated-prior-year' : 'backdated-same-year',
    backdatedMonths: backdatedMonths
  };
}

// ======================================================
// END: determineAdditionTiming
// ======================================================

// ── Step 3: Determine Property Type & Method ─────────────────
// ======================================================
// Function : determinePropertyType
// Purpose  : Step 3: resolves property type, method, convention and rate from the asset type and life.
// ======================================================

function determinePropertyType(input) {
  var lifeYears = input.lifeMonths / 12;
  var assetType = input.assetType || '';
  var propertyType, method, convention, rate;

  // Asset type config comes from the database (asset_type_config table), passed in by the
  // caller as input.assetConfig = { '<code>': { type, method, conv, rate }, ... }.
  var ASSET_CONFIG = input.assetConfig || {};

  var cfg = ASSET_CONFIG[assetType];

  if (cfg) {
    // Use config from asset type
    propertyType = cfg.type;
    method = cfg.method;
    convention = input.convention || cfg.conv; // Allow user override
    rate = cfg.rate;
  } else {
    // Fallback: derive from life months and input method
    if (lifeYears >= 27.5) {
      propertyType = (lifeYears >= 39) ? 'Non-Residential Real' : 'Residential Rental';
      method = input.method || 'MACRS Straight-Line';
      convention = input.convention || 'Mid-Month';
      rate = 1;
    } else {
      propertyType = 'Personal Property';
      method = input.method || 'MACRS';
      convention = input.convention || 'HY';
      rate = (method === 'MACRS ADS' || method === 'MACRS Straight-Line' || method === 'SL') ? 1 : (method === 'MACRS 150DB' ? 1.5 : 2);
    }
  }

  return {
    propertyType: propertyType,
    method: method,
    convention: convention,
    rate: rate,
    lifeYears: lifeYears
  };
}

// ======================================================
// END: determinePropertyType
// ======================================================

// ── Step 4: Calculate Bonus Depreciation (AFYD) ──────────────
// ======================================================
// Function : calculateBonusDepreciation
// Purpose  : Performs a calculation for 'calculateBonusDepreciation'
// ======================================================

function calculateBonusDepreciation(input, propertyInfo) {
  var bonusPercent = input.bonusPercent / 100;
  var afyd = input.cost * bonusPercent;
  var depreciableBasis = input.cost - afyd; // remaining basis after bonus

  return {
    bonusPercent: input.bonusPercent,
    afyd: afyd,
    depreciableBasis: depreciableBasis,
    isFullBonus: (input.bonusPercent === 100)
  };
}

// ======================================================
// END: calculateBonusDepreciation
// ======================================================

// ── Step 5: Calculate Regular Depreciation ───────────────────
// ======================================================
// Function : calculateRegularDepreciation
// Purpose  : Performs a calculation for 'calculateRegularDepreciation'
// ======================================================

function calculateRegularDepreciation(input, propertyInfo, bonusResult, timingResult) {
  if (bonusResult.isFullBonus) {
    // 100% bonus — no regular depreciation needed
    return {
      annualRate: 0,
      monthlyRate: 0,
      firstYearDepr: 0,
      currentPeriodDepr: 0,
      ytdRegularDepr: 0,
      deprEndingAccum: 0,
      conventionMultiplier: 0,
      formula: 'No regular depr (100% bonus)'
    };
  }

  var cost = input.cost;
  var basis = bonusResult.depreciableBasis;
  var lifeYears = propertyInfo.lifeYears;
  var convention = propertyInfo.convention;
  var method = propertyInfo.method;

  var pisdParts = input.pisd.split('-');
  var pisdYear = parseInt(pisdParts[0], 10);
  var pisdMonth = parseInt(pisdParts[1], 10);
  var quarter = input.quarter || Math.ceil(pisdMonth / 3);

  var apdParts = input.accountingPeriodDate.split('-');
  var apdYear = parseInt(apdParts[0], 10);
  var apdMonth = parseInt(apdParts[1], 10);

  // Use RATE_TABLES for exact IRS percentages
  var deprYear1 = pisdYear; // calendar year of PISD
  var currentCalendarYear = apdYear;

  // Year 1 rate from table
  var year1Rate = RATE_TABLES.lookupRate({
    method: method,
    lifeYears: lifeYears,
    convention: convention,
    year: 1,
    quarter: quarter,
    monthPIS: pisdMonth
  });
  var firstYearDepr = basis * (year1Rate / 100);

  // Year 2 rate from table
  var year2Rate = RATE_TABLES.lookupRate({
    method: method,
    lifeYears: lifeYears,
    convention: convention,
    year: 2,
    quarter: quarter,
    monthPIS: pisdMonth
  });
  var year2Depr = basis * (year2Rate / 100);
  var year2MonthlyRate = year2Depr / 12;

  // Cumulative depreciation through accounting period using RATE_TABLES
  var cumulativeDepr = RATE_TABLES.getCumulativeDepr({
    cost: cost,
    bonusPercent: input.bonusPercent,
    lifeYears: lifeYears,
    method: method,
    convention: convention,
    pisdMonth: pisdMonth,
    pisdYear: pisdYear,
    targetYear: apdYear,
    targetMonth: apdMonth
  });

  // Current period monthly depreciation
  var deprYearNum = apdYear - pisdYear + 1;
  var currentYearRate = RATE_TABLES.lookupRate({
    method: method,
    lifeYears: lifeYears,
    convention: convention,
    year: deprYearNum,
    quarter: quarter,
    monthPIS: pisdMonth
  });
  var currentYearDepr = basis * (currentYearRate / 100);
  var currentPeriodDepr;

  if (convention === 'Mid-Month' && deprYearNum === 1 && apdMonth === pisdMonth) {
    // PIS month with Mid-Month convention: half month only
    var year1Months = 12 - pisdMonth + 0.5;
    currentPeriodDepr = currentYearDepr / year1Months * 0.5;
  } else if (convention === 'Mid-Month' && deprYearNum === 1) {
    // Year 1 but after PIS month: full monthly rate within Year 1
    var year1Months = 12 - pisdMonth + 0.5;
    currentPeriodDepr = currentYearDepr / year1Months;
  } else {
    // All other cases: divide annual by 12
    currentPeriodDepr = currentYearDepr / 12;
  }

  // YTD regular depreciation
  var ytdRegularDepr = cumulativeDepr;

  return {
    annualRate: year1Rate,
    currentYearRate: currentYearRate,
    year1Rate: year1Rate,
    year2Rate: year2Rate,
    deprYearNum: deprYearNum,
    monthlyRate: currentPeriodDepr,
    firstYearDepr: firstYearDepr,
    currentPeriodDepr: currentPeriodDepr,
    ytdRegularDepr: ytdRegularDepr,
    deprEndingAccum: cumulativeDepr,
    conventionMultiplier: year1Rate / (100 / lifeYears),
    fullYearDepr: currentYearDepr,
    year2MonthlyRate: year2MonthlyRate,
    formula: 'RATE_TABLES lookup: ' + method + ' ' + lifeYears + 'yr ' + convention + ' Year ' + deprYearNum + ' = ' + currentYearRate + '%'
  };
}

// ======================================================
// END: calculateRegularDepreciation
// ======================================================

// ── Step 6: Calculate Revision Absorbed (Backdated Only) ─────
// ======================================================
// Function : calculateAdditionRevision
// Purpose  : Performs a calculation for 'calculateAdditionRevision'
// ======================================================

function calculateAdditionRevision(input, propertyInfo, bonusResult, regularResult, timingResult) {
  if (timingResult.timing === 'current') {
    return {
      missedRegularDepr: 0,
      missedBonusDepr: 0,
      fedRevisionAbsorbed: 0,
      bonusRevisionAbsorbed: 0,
      totalRevisionAbsorbed: 0,
      yearBreakdown: [],
      formula: 'No revision (current period addition)'
    };
  }

  // Missed bonus depreciation (all of it, since it should have been taken at PISD)
  var missedBonusDepr = bonusResult.afyd;

  // Missed regular depreciation — build year-by-year breakdown
  var missedRegularDepr = 0;
  var yearBreakdown = [];

  if (bonusResult.isFullBonus) {
    missedRegularDepr = 0;
  } else {
    var pisdParts = input.pisd.split('-');
    var pisdYear = parseInt(pisdParts[0], 10);
    var pisdMonth = parseInt(pisdParts[1], 10);
    var quarter = input.quarter || Math.ceil(pisdMonth / 3);
    var apdParts = input.accountingPeriodDate.split('-');
    var apdYear = parseInt(apdParts[0], 10);
    var apdMonth = parseInt(apdParts[1], 10);

    // Target: through prior month (M-1)
    var targetMonth = apdMonth - 1;
    var targetYear = apdYear;
    if (targetMonth <= 0) { targetMonth = 12; targetYear--; }

    var basis = bonusResult.depreciableBasis;

    // Build year-by-year breakdown
    for (var yr = pisdYear; yr <= targetYear; yr++) {
      var deprYearNum = yr - pisdYear + 1;
      var rate = RATE_TABLES.lookupRate({
        method: propertyInfo.method,
        lifeYears: propertyInfo.lifeYears,
        convention: propertyInfo.convention,
        year: deprYearNum,
        quarter: quarter,
        monthPIS: pisdMonth
      });
      var fullYearDepr = basis * (rate / 100);
      var monthlyDepr = fullYearDepr / 12;

      if (yr === pisdYear && yr === targetYear) {
        // Same year: months from PISD month through target month
        var months = targetMonth - pisdMonth + 1;
        if (propertyInfo.convention === 'Mid-Month') {
          // First month gets half, rest get full
          months = targetMonth - pisdMonth; // full months after PISD month
          var amount = fullYearDepr * (months > 0 ? 1 : 0); // Use full year 1 rate which already accounts for mid-month
          // Actually for mid-month, year 1 rate already includes the convention
          amount = basis * (rate / 100);
          if (targetMonth < 12) {
            // Prorate: year rate covers full year, we need months through target
            amount = monthlyDepr * (targetMonth - pisdMonth + 0.5);
          }
        }
        // Use RATE_TABLES cumulative for accuracy
        var yearAmount = RATE_TABLES.getCumulativeDepr({
          cost: input.cost, bonusPercent: input.bonusPercent,
          lifeYears: propertyInfo.lifeYears, method: propertyInfo.method,
          convention: propertyInfo.convention, pisdMonth: pisdMonth,
          pisdYear: pisdYear, targetYear: yr, targetMonth: targetMonth
        });
        yearBreakdown.push({
          year: yr, deprYearNum: deprYearNum, rate: rate,
          fullYearDepr: fullYearDepr, months: targetMonth - pisdMonth + 1,
          amount: yearAmount,
          label: 'Year ' + deprYearNum + ' (' + yr + '): $' + basis.toFixed(2) + ' × ' + rate.toFixed(4) + '% (partial)'
        });
        missedRegularDepr = yearAmount;
      } else if (yr === pisdYear) {
        // First year (partial): use Year 1 rate which already accounts for convention
        var year1Amount = basis * (rate / 100);
        yearBreakdown.push({
          year: yr, deprYearNum: deprYearNum, rate: rate,
          fullYearDepr: fullYearDepr, months: 12 - pisdMonth + 1,
          amount: year1Amount,
          label: 'Year ' + deprYearNum + ' (' + yr + '): $' + basis.toFixed(2) + ' × ' + rate.toFixed(4) + '%'
        });
        missedRegularDepr += year1Amount;
      } else if (yr === targetYear) {
        // Last year (partial): prorate by months through target
        var lastYearMonths = targetMonth;
        var lastYearAmount = monthlyDepr * lastYearMonths;
        yearBreakdown.push({
          year: yr, deprYearNum: deprYearNum, rate: rate,
          fullYearDepr: fullYearDepr, months: lastYearMonths,
          amount: lastYearAmount,
          label: 'Year ' + deprYearNum + ' (' + yr + '): $' + fullYearDepr.toFixed(2) + ' × ' + lastYearMonths + '/12'
        });
        missedRegularDepr += lastYearAmount;
      } else {
        // Full intermediate year
        yearBreakdown.push({
          year: yr, deprYearNum: deprYearNum, rate: rate,
          fullYearDepr: fullYearDepr, months: 12,
          amount: fullYearDepr,
          label: 'Year ' + deprYearNum + ' (' + yr + '): $' + basis.toFixed(2) + ' × ' + rate.toFixed(4) + '%'
        });
        missedRegularDepr += fullYearDepr;
      }
    }

    // Use RATE_TABLES for final accuracy (override sum with exact cumulative)
    var exactCumulative = RATE_TABLES.getCumulativeDepr({
      cost: input.cost, bonusPercent: input.bonusPercent,
      lifeYears: propertyInfo.lifeYears, method: propertyInfo.method,
      convention: propertyInfo.convention, pisdMonth: pisdMonth,
      pisdYear: pisdYear, targetYear: targetYear, targetMonth: targetMonth
    });
    missedRegularDepr = exactCumulative;
  }

  var fedRevisionAbsorbed = missedRegularDepr;
  var bonusRevisionAbsorbed = missedBonusDepr;
  var totalRevisionAbsorbed = fedRevisionAbsorbed + bonusRevisionAbsorbed;

  // Build calc string from year breakdown
  var missedRegularCalc = '';
  if (yearBreakdown.length > 0) {
    var parts = [];
    for (var i = 0; i < yearBreakdown.length; i++) {
      parts.push(yearBreakdown[i].label + ' = $' + yearBreakdown[i].amount.toFixed(2));
    }
    missedRegularCalc = parts.join(' + ');
  } else {
    missedRegularCalc = '$0.00';
  }

  return {
    missedRegularDepr: missedRegularDepr,
    missedRegularFormula: yearBreakdown.length > 1 ? 'MissedRegular = Year 1 depr + Year 2 months (through M-1)' : 'MissedRegular = CumulativeDepr(PISD through M-1)',
    missedRegularCalc: missedRegularCalc,
    yearBreakdown: yearBreakdown,
    missedBonusDepr: missedBonusDepr,
    missedBonusFormula: 'MissedBonus = Cost × BonusPercent',
    missedBonusCalc: '$' + input.cost.toFixed(2) + ' × ' + input.bonusPercent + '% = $' + missedBonusDepr.toFixed(2),
    fedRevisionAbsorbed: fedRevisionAbsorbed,
    bonusRevisionAbsorbed: bonusRevisionAbsorbed,
    totalRevisionAbsorbed: totalRevisionAbsorbed,
    totalFormula: 'Total = fed_revision + bonus_revision',
    totalCalc: '$' + fedRevisionAbsorbed.toFixed(2) + ' + $' + bonusRevisionAbsorbed.toFixed(2) + ' = $' + totalRevisionAbsorbed.toFixed(2),
    backdatedMonths: timingResult.backdatedMonths,
    formula: 'missedRegular ($' + missedRegularDepr.toFixed(2) + ') + missedBonus ($' + missedBonusDepr.toFixed(2) + ')'
  };
}

// ======================================================
// END: calculateAdditionRevision
// ======================================================

// ── Step 6B: Calculate YTD Total Depreciation ────────────────
// ======================================================
// Function : calculateYTDTotal
// Purpose  : Performs a calculation for 'calculateYTDTotal'
// ======================================================

function calculateYTDTotal(input, bonusResult, regularResult, revisionResult, timingResult) {
  // Current period regular depreciation (the month being processed)
  var currentPeriodRegDepr = regularResult.currentPeriodDepr;

  // Fed regular depr expense = current period + revision (regular catch-up)
  var fedRegDeprExp = currentPeriodRegDepr + revisionResult.fedRevisionAbsorbed;

  // YTD bonus = AFYD (full bonus recognized in Year 1)
  var ytdBonus = bonusResult.afyd;

  // Bonus revision (for backdated: the missed bonus catch-up)
  var bonusRevision = revisionResult.bonusRevisionAbsorbed;

  // Total depreciation impact in current period
  var totalDeprImpact = fedRegDeprExp + bonusRevision;

  // Depr_EndingAccum = bonus + cumulative regular depr
  var deprEndingAccum = ytdBonus + regularResult.ytdRegularDepr;

  return {
    currentPeriodRegDepr: currentPeriodRegDepr,
    fedRegDeprExp: fedRegDeprExp,
    ytdBonus: ytdBonus,
    bonusRevision: bonusRevision,
    totalDeprImpact: totalDeprImpact,
    deprEndingAccum: deprEndingAccum,
    formula: 'fed_reg_depr_exp = currentPeriodDepr + fed_revision_absorbed',
    formulaValues: '$' + currentPeriodRegDepr.toFixed(2) + ' + $' + revisionResult.fedRevisionAbsorbed.toFixed(2) + ' = $' + fedRegDeprExp.toFixed(2) + ' | ytd_bonus = $' + ytdBonus.toFixed(2) + ' | Total = $' + totalDeprImpact.toFixed(2)
  };
}

// ======================================================
// END: calculateYTDTotal
// ======================================================

// ── Step 7: Build DDV Output ─────────────────────────────────
// ======================================================
// Function : buildAdditionDDV
// Purpose  : Builds the Depreciation Detail View (cost, accumulated depreciation, NBV) for the Addition.
// ======================================================

function buildAdditionDDV(input, propertyInfo, bonusResult, regularResult, revisionResult, timingResult) {
  var costEndingBalance = input.cost;
  var deprEndingAccum = bonusResult.afyd + regularResult.ytdRegularDepr;
  var netBookValue = costEndingBalance - deprEndingAccum;

  return {
    costAcquisitions: input.cost,
    costBeginningBalance: 0,
    costEndingBalance: costEndingBalance,
    deprBeginningAccum: 0,
    deprEndingAccum: deprEndingAccum,
    deprInPeriod: regularResult.ytdRegularDepr,
    deprNetBookValue: netBookValue,
    factPatternCost: input.cost,
    factPatternMethod: propertyInfo.method,
    factPatternLife: propertyInfo.lifeYears + ' yr 0 mo',
    factPatternRate: propertyInfo.rate,
    factPatternConvention: propertyInfo.convention,
    factPatternAFYD: bonusResult.afyd,
    cumulativeBonusPercent: input.bonusPercent,
    deprNetAFYD: bonusResult.afyd,
    ytdDeprExpense: regularResult.ytdRegularDepr,
    ytdNetAFYD: bonusResult.afyd,
    totalDeprExpense: deprEndingAccum,
    revisionAbsorbed: revisionResult.fedRevisionAbsorbed,
    bonusRevisionAbsorbed: revisionResult.bonusRevisionAbsorbed,
    revisionTreatment: timingResult.timing === 'current' ? 'N/A' : 'Immediate',
    propertyType: propertyInfo.propertyType
  };
}

// ======================================================
// END: buildAdditionDDV
// ======================================================

// ── Step 8: Post-Processing Validation ───────────────────────
// ======================================================
// Function : validateAdditionPostProcessing
// Purpose  : Runs the post-processing checks (cost balance, NBV = cost - accum. depr.) on the DDV.
// ======================================================

function validateAdditionPostProcessing(input, ddv) {
  var checks = [];
  var TOLERANCE = 0.01;

  // Check 1: Cost ending balance = cost acquisitions
  var costCheck = Math.abs(ddv.costEndingBalance - ddv.costAcquisitions) <= TOLERANCE;
  checks.push({
    checkName: 'cost_balance',
    passed: costCheck,
    expected: ddv.costAcquisitions,
    actual: ddv.costEndingBalance,
    discrepancy: costCheck ? null : ddv.costEndingBalance - ddv.costAcquisitions
  });

  // Check 2: NBV = Cost - Accum Depr
  var expectedNBV = ddv.costEndingBalance - ddv.deprEndingAccum;
  var nbvCheck = Math.abs(ddv.deprNetBookValue - expectedNBV) <= TOLERANCE;
  checks.push({
    checkName: 'nbv_balance',
    passed: nbvCheck,
    expected: expectedNBV,
    actual: ddv.deprNetBookValue,
    discrepancy: nbvCheck ? null : ddv.deprNetBookValue - expectedNBV
  });

  // Check 3: If 100% bonus, NBV should be 0
  if (input.bonusPercent === 100) {
    var fullBonusCheck = Math.abs(ddv.deprNetBookValue) <= TOLERANCE;
    checks.push({
      checkName: 'full_bonus_nbv_zero',
      passed: fullBonusCheck,
      expected: 0,
      actual: ddv.deprNetBookValue,
      discrepancy: fullBonusCheck ? null : ddv.deprNetBookValue
    });
  }

  return checks;
}

// ======================================================
// END: validateAdditionPostProcessing
// ======================================================

// ── Master Function: calculateAddition ───────────────────────
// ======================================================
// Function : calculateAddition
// Purpose  : Performs a calculation for 'calculateAddition'
// ======================================================

function calculateAddition(input) {
  var result = {
    activePath: [],
    steps: {},
    error: null
  };

  try {
    // Step 1: Validate
    var validation = validateAdditionInput(input);
    result.steps.step1 = validation;
    result.activePath.push('step1');
    if (!validation.valid) {
      result.error = { step: 'step1', error: 'Validation failed' };
      return result;
    }

    // Step 2: Determine timing
    var timingResult = determineAdditionTiming(input);
    result.steps.step2 = timingResult;
    result.activePath.push('step2');

    // Step 3: Determine property type
    var propertyInfo = determinePropertyType(input);
    result.steps.step3 = propertyInfo;
    result.activePath.push('step3');

    // Step 4: Calculate bonus depreciation
    var bonusResult = calculateBonusDepreciation(input, propertyInfo);
    result.steps.step4 = bonusResult;
    result.activePath.push('step4');

    // Step 5: Calculate regular depreciation
    var regularResult = calculateRegularDepreciation(input, propertyInfo, bonusResult, timingResult);
    result.steps.step5 = regularResult;
    result.activePath.push('step5');

    // Step 6: Calculate revision absorbed (backdated only)
    var revisionResult = calculateAdditionRevision(input, propertyInfo, bonusResult, regularResult, timingResult);
    result.steps.step6 = revisionResult;
    if (timingResult.timing !== 'current') {
      result.activePath.push('step6');
    }

    // Step 6B: Calculate YTD Total Depreciation
    var ytdResult = calculateYTDTotal(input, bonusResult, regularResult, revisionResult, timingResult);
    result.steps.step6b = ytdResult;
    result.activePath.push('step6b');

    // Step 7: Build DDV output
    var ddv = buildAdditionDDV(input, propertyInfo, bonusResult, regularResult, revisionResult, timingResult);
    result.steps.step7 = ddv;
    result.activePath.push('step7');

    // Step 8: Post-processing validation
    var postChecks = validateAdditionPostProcessing(input, ddv);
    result.steps.step8 = postChecks;
    result.activePath.push('step8');

  } catch (e) {
    result.error = { step: 'unknown', error: e.message || String(e) };
  }

  return result;
}

// ======================================================
// END: calculateAddition
// ======================================================

// ── Flowchart Definition Builder ─────────────────────────────
// ======================================================
// Function : buildAdditionFlowchartDefinition
// Purpose  : Builds the Mermaid flowchart text, marking which steps ran, were skipped or errored.
// ======================================================

function buildAdditionFlowchartDefinition(activePath, result) {
  var allNodes = ['step1', 'step2', 'step3', 'step4', 'step5', 'step6', 'step6b', 'step7', 'step8'];

  var hasError = (activePath && activePath.length === 1 && activePath[0] === 'step1');
  var activeSet = {};
  if (activePath) {
    for (var i = 0; i < activePath.length; i++) activeSet[activePath[i]] = true;
  }

  var activeNodes = [], mutedNodes = [], errorNodes = [];
  for (var i = 0; i < allNodes.length; i++) {
    var n = allNodes[i];
    if (hasError && n === 'step1') errorNodes.push(n);
    else if (activeSet[n]) activeNodes.push(n);
    else mutedNodes.push(n);
  }

  function fmtN(v) {
    if (v === null || v === undefined) return '\u2014';
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var lines = [];
  lines.push('graph TD');

  // Clean node definitions
  lines.push('  step1(["Step 1: Validate Inputs"])');
  lines.push('  step2{"Step 2: Addition Timing?"}');
  lines.push('  step3["Step 3: Property Type & Method"]');
  lines.push('  step4["Step 4: Bonus Depreciation"]');
  lines.push('  step5["Step 5: Regular Depreciation"]');
  lines.push('  step6["Step 6: Revision Absorbed"]');
  lines.push('  step6b["Step 6B: YTD Total Depr"]');
  lines.push('  step7["Step 7: DDV Output"]');
  lines.push('  step8(["Step 8: Post-Processing"])');

  // Edges
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

  // Annotation nodes with formula + values
  var s = result ? result.steps : null;
  if (s) {
    if (activeSet['step1'] && s.step1) {
      var lbl = s.step1.valid ? '✓ All inputs valid' : '✗ ' + s.step1.errors.length + ' error(s)';
      lines.push('  note1>"' + lbl + '"]');
      lines.push('  step1 -.- note1');
    }
    if (activeSet['step2'] && s.step2) {
      var tLabel = s.step2.timing === 'current' ? 'Current Period' : 'Backdated (' + s.step2.backdatedMonths + ' months)';
      lines.push('  note2>"PISD vs AccountingPeriod\\n→ ' + tLabel + '"]');
      lines.push('  step2 -.- note2');
    }
    if (activeSet['step3'] && s.step3) {
      lines.push('  note3>"lifeMonths → propertyType\\n' + s.step3.propertyType + ' | ' + s.step3.method + ' | ' + s.step3.convention + '"]');
      lines.push('  step3 -.- note3');
    }
    if (activeSet['step4'] && s.step4) {
      lines.push('  note4>"AFYD = Cost × BonusPercent\\n$' + fmtN(s.step4.afyd) + ' = $' + fmtN(result.steps.step1 ? 0 : 0) + ' × ' + s.step4.bonusPercent + '%\\nRemaining basis: $' + fmtN(s.step4.depreciableBasis) + '"]');
      // Fix: use input cost
      lines.pop();
      var inputCost = s.step7 ? s.step7.factPatternCost : 0;
      lines.push('  note4>"AFYD = Cost × Bonus%\\n$' + fmtN(s.step4.afyd) + ' = $' + fmtN(inputCost) + ' × ' + s.step4.bonusPercent + '%\\nRemaining basis: $' + fmtN(s.step4.depreciableBasis) + '"]');
      lines.push('  step4 -.- note4');
    }
    if (activeSet['step5'] && s.step5) {
      lines.push('  note5>"' + s.step5.formula + '\\nMonthly: $' + fmtN(s.step5.monthlyRate) + ' | CY Depr: $' + fmtN(s.step5.currentPeriodDepr) + '"]');
      lines.push('  step5 -.- note5');
    }
    if (activeSet['step6'] && s.step6 && s.step6.totalRevisionAbsorbed > 0) {
      lines.push('  note6>"' + s.step6.formula + '\\nfed_revision: $' + fmtN(s.step6.fedRevisionAbsorbed) + '\\nbonus_revision: $' + fmtN(s.step6.bonusRevisionAbsorbed) + '\\nTotal: $' + fmtN(s.step6.totalRevisionAbsorbed) + '"]');
      lines.push('  step6 -.- note6');
    }
    if (activeSet['step6b'] && s.step6b) {
      lines.push('  note6b>"' + s.step6b.formula + '\\n' + s.step6b.formulaValues + '"]');
      lines.push('  step6b -.- note6b');
    }
    if (activeSet['step7'] && s.step7) {
      lines.push('  note7>"DDV Record:\\nCost $' + fmtN(s.step7.costEndingBalance) + ' | A/D $' + fmtN(s.step7.deprEndingAccum) + '\\nNBV $' + fmtN(s.step7.deprNetBookValue) + ' | AFYD $' + fmtN(s.step7.factPatternAFYD) + '"]');
      lines.push('  step7 -.- note7');
    }
    if (activeSet['step8'] && s.step8) {
      var allPassed = s.step8.every(function(c) { return c.passed; });
      lines.push('  note8>"' + (allPassed ? '✓ All checks passed' : '⚠ Validation warnings') + '"]');
      lines.push('  step8 -.- note8');
    }
  }

  // Class definitions
  lines.push('  classDef active fill:#eff6ff,stroke:#2563eb,stroke-width:2.5px,color:#1e40af');
  lines.push('  classDef muted fill:#f9fafb,stroke:#d1d5db,color:#9ca3af,opacity:0.5');
  lines.push('  classDef error fill:#fef2f2,stroke:#dc2626,stroke-width:2.5px,color:#991b1b');
  lines.push('  classDef noteStyle fill:#fefce8,stroke:#ca8a04,stroke-width:1px,color:#713f12,font-size:11px');

  if (activeNodes.length > 0) lines.push('  class ' + activeNodes.join(',') + ' active');
  if (mutedNodes.length > 0) lines.push('  class ' + mutedNodes.join(',') + ' muted');
  if (errorNodes.length > 0) lines.push('  class ' + errorNodes.join(',') + ' error');

  // Note styling
  var noteIds = ['note1','note2','note3','note4','note5','note6','note6b','note7','note8'];
  var noteNodes = [];
  for (var i = 0; i < noteIds.length; i++) {
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf('  ' + noteIds[i] + '>') === 0) { noteNodes.push(noteIds[i]); break; }
    }
  }
  if (noteNodes.length > 0) lines.push('  class ' + noteNodes.join(',') + ' noteStyle');

  return lines.join('\n');
}

// ======================================================
// END: buildAdditionFlowchartDefinition
// ======================================================

// Test cases moved to Postgres (table engine_test_cases). Run them with: npm run test:engine


// ---- appended for Node/CommonJS use ----
module.exports = { calculateAddition: calculateAddition };

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : additions.cjs
// ======================================================
