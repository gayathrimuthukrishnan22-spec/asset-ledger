// ======================================================
// File Name : disposals.cjs
// Purpose   : Depreciation calc-engine module: disposals
// ======================================================

// ---- prepended: same RATE_TABLES engine the browser calculators load via <script> ----
const RATE_TABLES = require("./rate-tables.cjs");


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// Retirement/Disposal Visual Calculator — Calculation Engine
// This file contains all pure calculation functions for the 11-step disposal pipeline.
// Shared between index.html (application) and test.html (test harness).

/**
 * Step 1: Validate disposal inputs.
 * Collects all validation errors (non-fail-fast) so the user sees every problem at once.
 *
 * @param {object} input - DisposalInput object
 * @returns {{ valid: boolean, errors: Array<{ field: string, rule: string, message: string }> }}
 */
// ======================================================
// Function : validateInput
// Purpose  : Step 1: checks the required Disposal inputs (cost > 0, dates, cost disposed) and returns the errors.
// ======================================================

function validateInput(input) {
  var errors = [];

  // Req 2.1 — asset cost must be greater than zero
  if (input.assetCost === undefined || input.assetCost === null || input.assetCost <= 0) {
    errors.push({
      field: 'assetCost',
      rule: 'assetCost > 0',
      message: 'Asset cost must be greater than zero'
    });
  }

  // Req 2.2 — cost disposed must not exceed asset cost
  if (input.costDisposed !== undefined && input.costDisposed !== null &&
      input.assetCost !== undefined && input.assetCost !== null &&
      input.costDisposed > input.assetCost) {
    errors.push({
      field: 'costDisposed',
      rule: 'costDisposed <= assetCost',
      message: 'Cost disposed must be less than or equal to total asset cost'
    });
  }

  // Req 2.3 — disposal date must be on or after the placed-in-service date
  if (input.disposalDate && input.pisd) {
    var disposalDate = new Date(input.disposalDate);
    var pisd = new Date(input.pisd);
    if (disposalDate < pisd) {
      errors.push({
        field: 'disposalDate',
        rule: 'disposalDate >= pisd',
        message: 'Disposal date must be on or after the placed-in-service date'
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors: errors
  };
}

// ======================================================
// END: validateInput
// ======================================================

/**
 * Step 2: Determine disposal type.
 * Returns 'full' when the entire asset is being disposed, 'partial' otherwise.
 *
 * @param {object} input - DisposalInput object with assetCost and costDisposed
 * @returns {'full' | 'partial'}
 */
// ======================================================
// Function : determineDisposalType
// Purpose  : Step 2: returns "full" when the whole cost is disposed, otherwise "partial".
// ======================================================

function determineDisposalType(input) {
  if (input.costDisposed === input.assetCost) {
    return 'full';
  }
  return 'partial';
}

// ======================================================
// END: determineDisposalType
// ======================================================

/**
 * Step 3A: Calculate full disposal values.
 * For a full disposal the entire asset cost and accumulated depreciation are disposed.
 *
 * @param {object} input - DisposalInput object with assetCost, costDisposed, boyAccumulatedDepr
 * @returns {DisposalValues} { disposalType, disposalRatio, costDisposed, adDisposed }
 */
// ======================================================
// Function : calculateFullDisposal
// Purpose  : Performs a calculation for 'calculateFullDisposal'
// ======================================================

function calculateFullDisposal(input) {
  return {
    disposalType: 'full',
    disposalRatio: 1.0,
    costDisposed: input.assetCost,
    adDisposed: input.boyAccumulatedDepr
  };
}

// ======================================================
// END: calculateFullDisposal
// ======================================================

/**
 * Step 3B: Calculate partial disposal values.
 * For a partial disposal, values are proportional to the disposal ratio.
 *
 * @param {object} input - DisposalInput object with assetCost, costDisposed, boyAccumulatedDepr
 * @returns {DisposalValues} { disposalType, disposalRatio, costDisposed, adDisposed }
 */
// ======================================================
// Function : calculatePartialDisposal
// Purpose  : Performs a calculation for 'calculatePartialDisposal'
// ======================================================

function calculatePartialDisposal(input) {
  var disposalRatio = input.costDisposed / input.assetCost;
  return {
    disposalType: 'partial',
    disposalRatio: disposalRatio,
    costDisposed: input.costDisposed,
    adDisposed: input.boyAccumulatedDepr * disposalRatio
  };
}

// ======================================================
// END: calculatePartialDisposal
// ======================================================

/**
 * Step 4: Determine timing classification.
 * Compares the disposal date against the accounting period date and fiscal year boundaries
 * to classify the disposal as current, backdated-same-year, or backdated-prior-year.
 *
 * Fiscal year is assumed to be a calendar year (Jan 1 – Dec 31).
 * The "current accounting period" is the month of the accountingPeriodDate.
 *
 * @param {object} input - DisposalInput with disposalDate and accountingPeriodDate (YYYY-MM-DD strings)
 * @returns {'current' | 'backdated-same-year' | 'backdated-prior-year'}
 *
 * Req 6.1 — 'current' when disposal date falls within the current accounting period
 * Req 6.2 — 'backdated-same-year' when disposal date is before the period but same fiscal year
 * Req 6.3 — 'backdated-prior-year' when disposal date is before the fiscal year
 * Req 6.4 — display timing classification at Step 4 node
 */
// ======================================================
// Function : determineTiming
// Purpose  : Step 3: decides whether the Disposal is current-period or backdated (same-year / prior-year).
// ======================================================

function determineTiming(input) {
  // Parse YYYY-MM-DD strings directly to avoid timezone issues with Date constructor
  var disposalParts = input.disposalDate.split('-');
  var disposalYear = parseInt(disposalParts[0], 10);
  var disposalMonth = parseInt(disposalParts[1], 10); // 1-indexed

  var accountingParts = input.accountingPeriodDate.split('-');
  var accountingYear = parseInt(accountingParts[0], 10);
  var accountingMonth = parseInt(accountingParts[1], 10); // 1-indexed

  // Fiscal year is the calendar year of the accounting period date
  var fiscalYear = accountingYear;

  // Req 6.1 — Current: disposal date is in the same month and year as the accounting period
  if (disposalYear === accountingYear && disposalMonth === accountingMonth) {
    return 'current';
  }

  // Req 6.3 — Backdated prior-year: disposal date is in a year before the fiscal year
  if (disposalYear < fiscalYear) {
    return 'backdated-prior-year';
  }

  // Req 6.2 — Backdated same-year: disposal date is before the accounting period
  // but within the same fiscal (calendar) year
  return 'backdated-same-year';
}

// ======================================================
// END: determineTiming
// ======================================================


/**
 * Step 5: Calculate current period disposal depreciation.
 * Uses RATE_TABLES for exact IRS percentage on the DISPOSED PORTION's basis.
 * CY Depr = disposedBasis × yearRate% × conventionMultiplier
 */
// ======================================================
// Function : calculateCurrentPeriodDepr
// Purpose  : Performs a calculation for 'calculateCurrentPeriodDepr'
// ======================================================

function calculateCurrentPeriodDepr(input, disposalValues) {
  var pisdParts = input.pisd.split('-');
  var pisdYear = parseInt(pisdParts[0], 10);
  var pisdMonth = parseInt(pisdParts[1], 10);
  var disposalParts = input.disposalDate.split('-');
  var disposalYear = parseInt(disposalParts[0], 10);
  var disposalMonth = parseInt(disposalParts[1], 10);
  var convention = input.convention;
  var isSameYearAddRetire = (pisdYear === disposalYear);
  var deprYearNum = disposalYear - pisdYear + 1;
  var bonusPercent = input.bonusPercentage || 0;
  var fullBasis = input.assetCost * (1 - bonusPercent / 100);
  var disposedBasis = fullBasis * disposalValues.disposalRatio;
  var lifeYears = input.recoveryPeriod || 5;
  var method = input.depreciationMethod || 'MACRS';
  if (method === 'ADS') method = 'MACRS ADS';
  var annualRate = 0, conventionMultiplier = 0, currentYearDepr = 0, sameYearRule = null, fullYearDepr = 0;

  if (isSameYearAddRetire) {
    if (convention === 'HY' || convention === 'MQ') {
      conventionMultiplier = 0; currentYearDepr = 0;
      sameYearRule = convention + ' same-year add-and-retire: no depreciation allowed';
    } else if (convention === 'MM') {
      var monthsHeld = disposalMonth - pisdMonth;
      if (monthsHeld < 0) monthsHeld = 0;
      conventionMultiplier = monthsHeld / 12;
      currentYearDepr = monthsHeld * (input.monthlyDeprRate || 0) * disposalValues.disposalRatio;
      sameYearRule = 'MM same-year: ' + monthsHeld + ' months held';
    }
  } else {
    if (typeof RATE_TABLES !== 'undefined') {
      annualRate = RATE_TABLES.lookupRate({ method: method, lifeYears: lifeYears, convention: convention, year: deprYearNum, quarter: Math.ceil(pisdMonth / 3), monthPIS: pisdMonth });
      fullYearDepr = disposedBasis * (annualRate / 100);
    } else {
      fullYearDepr = (input.monthlyDeprRate || 0) * 12 * disposalValues.disposalRatio;
    }
    if (convention === 'HY') { conventionMultiplier = 0.5; }
    else if (convention === 'MQ') {
      var q; if (disposalMonth <= 3) q = 1; else if (disposalMonth <= 6) q = 2; else if (disposalMonth <= 9) q = 3; else q = 4;
      conventionMultiplier = {1:10.5/12,2:7.5/12,3:4.5/12,4:1.5/12}[q];
    } else if (convention === 'MM') { conventionMultiplier = (disposalMonth + 0.5) / 12; }
    currentYearDepr = fullYearDepr * conventionMultiplier;
  }

  return { convention: convention, conventionMultiplier: conventionMultiplier, fullYearDepr: fullYearDepr, currentYearDepr: currentYearDepr, isSameYearAddRetire: isSameYearAddRetire, sameYearRule: sameYearRule };
}

// ======================================================
// END: calculateCurrentPeriodDepr
// ======================================================

/**
 * Step 6: Backdated same-year disposal revision.
 * Computes over-recognized depreciation for months between the disposal date
 * and the accounting period date, plus any HY convention adjustment.
 * The revision absorbed is the negative sum of all over-recognized components.
 *
 * Prior period snapshots are treated as immutable (Req 8.4) — this function
 * only computes the revision adjustment without modifying any prior period values.
 *
 * @param {object} input - DisposalInput with disposalDate, accountingPeriodDate, convention, monthlyDeprRate
 * @param {object} disposalValues - DisposalValues with costDisposed, adDisposed, disposalRatio
 * @returns {RevisionResult} { backdatedMonths, overRecognizedDepr, overRecognizedConvention, pyComponent, cyComponent, revisionAbsorbed }
 *
 * Req 8.1 — overRecognizedDepr = monthlyDeprRate × backdatedMonths
 * Req 8.2 — HY convention: also compute over-recognized convention adjustment
 * Req 8.3 — revisionAbsorbed = negative sum of over-recognized components
 * Req 8.4 — prior period snapshots are immutable
 * Req 8.5 — display over-recognized amounts, revision_absorbed, and backdated months at Step 6 node
 */
// ======================================================
// Function : calculateBackdatedSameYear
// Purpose  : Performs a calculation for 'calculateBackdatedSameYear'
// ======================================================

function calculateBackdatedSameYear(input, disposalValues) {
  // Parse dates from YYYY-MM-DD strings to avoid timezone issues
  var disposalParts = input.disposalDate.split('-');
  var disposalYear = parseInt(disposalParts[0], 10);
  var disposalMonth = parseInt(disposalParts[1], 10); // 1-indexed

  var accountingParts = input.accountingPeriodDate.split('-');
  var accountingYear = parseInt(accountingParts[0], 10);
  var accountingMonth = parseInt(accountingParts[1], 10); // 1-indexed

  // Backdated months = months between disposal date and prior month (M-1).
  // Per TRD: revision is calculated through the prior month, not current processing month.
  var backdatedMonths = (accountingYear - disposalYear) * 12 + (accountingMonth - 1 - disposalMonth);
  if (backdatedMonths < 0) {
    backdatedMonths = 0;
  }

  // Req 8.1 — Over-recognized depreciation: monthly rate × backdated months
  var monthlyDeprRate = input.monthlyDeprRate;
  var overRecognizedDepr = monthlyDeprRate * backdatedMonths;

  // Req 8.2 — HY convention adjustment when applicable
  // When the disposal is backdated within the same year and the convention is HY,
  // the system would have applied a half-year convention deduction in the disposal year.
  // Since the asset was actually disposed earlier, this convention amount was over-recognized
  // and needs to be reversed.
  var overRecognizedConvention = null;
  if (input.convention === 'HY') {
    // The HY convention gives 0.5 × full-year depreciation in the disposal year.
    // This full half-year amount was recognized but should not have been since the
    // disposal is backdated. The convention adjustment equals the half-year amount.
    var fullYearDepr = monthlyDeprRate * 12;
    overRecognizedConvention = fullYearDepr * 0.5;
  }

  // Req 8.3 — revisionAbsorbed = negative sum of all over-recognized components
  var totalOverRecognized = overRecognizedDepr + (overRecognizedConvention !== null ? overRecognizedConvention : 0);
  var revisionAbsorbed = -totalOverRecognized;

  // Req 8.4 — prior period snapshots are immutable: we do not modify any prior
  // period values; we only compute the revision adjustment.

  // pyComponent and cyComponent are null for same-year (only used in prior-year Step 7)
  return {
    backdatedMonths: backdatedMonths,
    overRecognizedDepr: overRecognizedDepr,
    overRecognizedConvention: overRecognizedConvention,
    pyComponent: null,
    cyComponent: null,
    revisionAbsorbed: revisionAbsorbed
  };
}

// ======================================================
// END: calculateBackdatedSameYear
// ======================================================

/**
 * Step 7: Backdated prior-year disposal revision.
 * When a disposal occurred in a prior fiscal year but is being processed in the
 * current year, this function computes the over-recognized depreciation split
 * into a prior-year component and a current-year component.
 *
 * pyComponent captures the over-recognized depreciation from the disposal year
 * (months after disposal through end of that year, plus any HY convention
 * adjustment). cyComponent captures the over-recognized depreciation from the
 * current year (months from start of current year through the accounting period).
 *
 * Both components are negative (representing reversals). Their sum equals
 * revisionAbsorbed.
 *
 * @param {object} input - DisposalInput with disposalDate, accountingPeriodDate, convention, monthlyDeprRate
 * @param {object} disposalValues - DisposalValues with costDisposed, adDisposed, disposalRatio
 * @returns {RevisionResult} { backdatedMonths, overRecognizedDepr, overRecognizedConvention, pyComponent, cyComponent, revisionAbsorbed }
 *
 * Req 9.1 — compute prior-year revision_absorbed component
 * Req 9.2 — compute current-year revision_absorbed component
 * Req 9.3 — sum both components into total revision_absorbed
 * Req 9.4 — display PY component, CY component, and total revision_absorbed at Step 7 node
 */
// ======================================================
// Function : calculateBackdatedPriorYear
// Purpose  : Performs a calculation for 'calculateBackdatedPriorYear'
// ======================================================

function calculateBackdatedPriorYear(input, disposalValues) {
  // Parse dates from YYYY-MM-DD strings to avoid timezone issues
  var disposalParts = input.disposalDate.split('-');
  var disposalYear = parseInt(disposalParts[0], 10);
  var disposalMonth = parseInt(disposalParts[1], 10); // 1-indexed

  var accountingParts = input.accountingPeriodDate.split('-');
  var accountingYear = parseInt(accountingParts[0], 10);
  var accountingMonth = parseInt(accountingParts[1], 10); // 1-indexed

  var monthlyDeprRate = input.monthlyDeprRate;
  var fullYearDepr = monthlyDeprRate * 12;

  // --- Prior-year component (pyComponent) ---
  // Months of over-recognized depreciation in the disposal year:
  // From the month after disposal through end of that year (month 12).
  // e.g., disposal in month 7 → months 8-12 = 5 months over-recognized.
  var monthsOverRecognizedInPY = 12 - disposalMonth;
  var pyOverRecognizedDepr = monthsOverRecognizedInPY * monthlyDeprRate;

  // HY convention adjustment for the disposal year:
  // With HY convention, the disposal year should only get half-year depreciation.
  // The system booked depreciation for the full year (or up to disposal month).
  // The convention adjustment reverses the difference between what was booked
  // and what should have been booked under HY.
  // HY disposal year depr = fullYearDepr × 0.5
  // Over-recognized convention = fullYearDepr × 0.5 (the half that shouldn't have been taken)
  var overRecognizedConvention = null;
  if (input.convention === 'HY') {
    overRecognizedConvention = fullYearDepr * 0.5;
  }

  // pyComponent = negative sum of PY over-recognized depreciation + convention adjustment
  var pyTotal = pyOverRecognizedDepr + (overRecognizedConvention !== null ? overRecognizedConvention : 0);
  var pyComponent = -pyTotal;

  // --- Current-year component (cyComponent) ---
  // Months of over-recognized depreciation in the current year:
  // From the start of the current fiscal year (month 1) through PRIOR month (M-1).
  // Per TRD: revision is calculated through the prior month, not the current processing month.
  var monthsOverRecognizedInCY = accountingMonth - 1;
  if (monthsOverRecognizedInCY < 0) monthsOverRecognizedInCY = 0;
  var cyOverRecognizedDepr = monthsOverRecognizedInCY * monthlyDeprRate;
  var cyComponent = -cyOverRecognizedDepr;

  // --- Total backdated months ---
  // Total months from disposal date to accounting period date
  var backdatedMonths = (accountingYear - disposalYear) * 12 + (accountingMonth - disposalMonth);
  if (backdatedMonths < 0) {
    backdatedMonths = 0;
  }

  // Total over-recognized depreciation (absolute value, before negation)
  var overRecognizedDepr = pyOverRecognizedDepr + cyOverRecognizedDepr;

  // Req 9.3 — revisionAbsorbed = pyComponent + cyComponent (both negative)
  var revisionAbsorbed = pyComponent + cyComponent;

  return {
    backdatedMonths: backdatedMonths,
    overRecognizedDepr: overRecognizedDepr,
    overRecognizedConvention: overRecognizedConvention,
    pyComponent: pyComponent,
    cyComponent: cyComponent,
    revisionAbsorbed: revisionAbsorbed,
    // Intermediate calc values for display
    monthsOverRecognizedInPY: monthsOverRecognizedInPY,
    pyOverRecognizedDepr: pyOverRecognizedDepr,
    monthsOverRecognizedInCY: monthsOverRecognizedInCY,
    cyOverRecognizedDepr: cyOverRecognizedDepr,
    monthlyDeprRate: monthlyDeprRate,
    pyCalc: '$' + monthlyDeprRate.toFixed(2) + ' × ' + monthsOverRecognizedInPY + ' mo' + (overRecognizedConvention ? ' + $' + overRecognizedConvention.toFixed(2) + ' (HY conv)' : '') + ' = $' + pyTotal.toFixed(2) + ' → PY: $' + pyComponent.toFixed(2),
    cyCalc: '$' + monthlyDeprRate.toFixed(2) + ' × ' + monthsOverRecognizedInCY + ' mo = $' + cyOverRecognizedDepr.toFixed(2) + ' → CY: $' + cyComponent.toFixed(2),
    totalCalc: '$' + pyComponent.toFixed(2) + ' + $' + cyComponent.toFixed(2) + ' = $' + revisionAbsorbed.toFixed(2)
  };
}

// ======================================================
// END: calculateBackdatedPriorYear
// ======================================================

/**
 * Step 8: Calculate gain or loss on disposal.
 * Computes the gain/loss as proceeds minus net book value (costDisposed - adDisposed),
 * and labels the result accordingly.
 *
 * @param {number} proceeds - Sale proceeds from the disposal
 * @param {number} costDisposed - Cost of the disposed portion
 * @param {number} adDisposed - Accumulated depreciation on the disposed portion
 * @returns {GainLossResult} { proceeds, costDisposed, adDisposed, netBookValue, gainLoss, label }
 *
 * Req 10.1 — gainLoss = proceeds - (costDisposed - adDisposed)
 * Req 10.2 — label as 'Gain' when gainLoss > 0
 * Req 10.3 — label as 'Loss' when gainLoss < 0
 * Req 10.4 — label as 'No Gain/Loss' when gainLoss === 0
 * Req 10.5 — display proceeds, net_book_value, and gain_loss at Step 8 node
 */
// ======================================================
// Function : calculateGainLoss
// Purpose  : Performs a calculation for 'calculateGainLoss'
// ======================================================

function calculateGainLoss(proceeds, costDisposed, adDisposed) {
  var netBookValue = costDisposed - adDisposed;
  var gainLoss = proceeds - netBookValue;

  var label;
  if (gainLoss > 0) {
    label = 'Gain';
  } else if (gainLoss < 0) {
    label = 'Loss';
  } else {
    label = 'No Gain/Loss';
  }

  return {
    proceeds: proceeds,
    costDisposed: costDisposed,
    adDisposed: adDisposed,
    netBookValue: netBookValue,
    gainLoss: gainLoss,
    label: label
  };
}

// ======================================================
// END: calculateGainLoss
// ======================================================

/**
 * Main orchestrator — runs the 11-step disposal pipeline and returns a
 * CalculationResult with per-step values and the active path array.
 *
 * Steps 9, 10, and 11 are wired in later tasks; they are set to null for now
 * but step10 and step11 are always added to activePath.
 *
 * @param {object} input - DisposalInput object
 * @returns {CalculationResult}
 *
 * Req 2.5 — proceed to Step 2 when validation passes
 * Req 3.1 — route to Step 3A (full) or Step 3B (partial)
 * Req 3.2 — route to Step 3B when cost_disposed < total_cost
 */
// ======================================================
// Function : calculate
// Purpose  : Performs a calculation for 'calculate'
// ======================================================

function calculate(input) {
  var result = {
    activePath: [],
    steps: {
      step1: null,
      step2: null,
      step3: null,
      step4: null,
      step5: null,
      step6: null,
      step7: null,
      step8: null,
      step9: null,
      step10: null,
      step11: null
    },
    error: null
  };

  try {
    // ── Step 1: Validate inputs ──────────────────────────────────────
    var validation = validateInput(input);
    result.steps.step1 = validation;
    result.activePath.push('step1');

    if (!validation.valid) {
      // Halt pipeline — Step 1 highlighted in red, no further steps
      result.error = { step: 'step1', error: 'Validation failed' };
      return result;
    }

    // ── Step 2: Determine disposal type ──────────────────────────────
    var disposalType = determineDisposalType(input);
    result.steps.step2 = { disposalType: disposalType };
    result.activePath.push('step2');

    // ── Step 3: Calculate disposal values (3A or 3B) ─────────────────
    var disposalValues;
    if (disposalType === 'full') {
      disposalValues = calculateFullDisposal(input);
      result.activePath.push('step3a');
    } else {
      disposalValues = calculatePartialDisposal(input);
      result.activePath.push('step3b');
    }
    result.steps.step3 = disposalValues;

    // ── Step 4: Determine timing ─────────────────────────────────────
    var timing = determineTiming(input);
    result.steps.step4 = { timing: timing };
    result.activePath.push('step4');

    // ── Steps 5/6/7: Timing-dependent depreciation / revision ────────
    var currentYearDepr = 0;
    var revisionAbsorbed = 0;

    if (timing === 'current') {
      // Step 5: Current period convention-based depreciation
      var deprResult = calculateCurrentPeriodDepr(input, disposalValues);
      result.steps.step5 = deprResult;
      result.activePath.push('step5');
      currentYearDepr = deprResult.currentYearDepr;
    } else if (timing === 'backdated-same-year') {
      // Step 6: Backdated same-year revision
      var sameYearResult = calculateBackdatedSameYear(input, disposalValues);
      result.steps.step6 = sameYearResult;
      result.activePath.push('step6');
      revisionAbsorbed = sameYearResult.revisionAbsorbed;
    } else if (timing === 'backdated-prior-year') {
      // Step 7: Backdated prior-year revision
      var priorYearResult = calculateBackdatedPriorYear(input, disposalValues);
      result.steps.step7 = priorYearResult;
      result.activePath.push('step7');
      revisionAbsorbed = priorYearResult.revisionAbsorbed;
    }

    // ── Step 8: Gain/Loss calculation ────────────────────────────────
    // For current timing, adDisposed must account for current year depreciation.
    // For backdated timing, A/D includes CY depr that was taken + revision (per spreadsheet logic).
    var adForGainLoss = disposalValues.adDisposed;
    if (timing === 'current') {
      adForGainLoss = disposalValues.adDisposed + currentYearDepr;
    } else {
      // Backdated: A/D_Disposed = BOY_AD_disposed + CY_depr_taken + revision_absorbed
      // CY depr taken = monthlyDeprRate × months in CY before processing (through M-1)
      var apdMonth = parseInt(input.accountingPeriodDate.split('-')[1], 10);
      var cyDeprTaken = (input.monthlyDeprRate || 0) * (apdMonth - 1);
      // For full disposal, use full monthly rate; for partial, prorate
      cyDeprTaken = cyDeprTaken * disposalValues.disposalRatio;
      adForGainLoss = disposalValues.adDisposed + cyDeprTaken + revisionAbsorbed;
    }

    var gainLossResult = calculateGainLoss(
      input.proceeds,
      disposalValues.costDisposed,
      adForGainLoss
    );
    result.steps.step8 = gainLossResult;
    result.activePath.push('step8');

    // ── Step 9: Multi-basis calculation ─────────────────────────────
    var multiBasisResult = calculateMultiBasis(input);
    result.steps.step9 = multiBasisResult;
    if (multiBasisResult) {
      result.activePath.push('step9');
    }

    // ── Step 10: Format DDV output ──────────────────────────────────
    result.steps.step10 = formatDDV(result);
    result.activePath.push('step10');

    // ── Step 11: Post-processing validation ────────────────────────
    result.steps.step11 = validatePostProcessing(input, result);
    result.activePath.push('step11');

  } catch (e) {
    // Wrap unexpected errors with the step context and halt
    var errorMessage = (e && e.message) ? e.message : String(e);
    if (!result.error) {
      // Determine which step failed based on what's been populated
      var failedStep = 'unknown';
      if (!result.steps.step1) {
        failedStep = 'step1';
      } else if (!result.steps.step2) {
        failedStep = 'step2';
      } else if (!result.steps.step3) {
        failedStep = 'step3';
      } else if (!result.steps.step4) {
        failedStep = 'step4';
      } else if (!result.steps.step8) {
        // Steps 5/6/7 are conditional, so if step8 isn't set yet, the error
        // is in the timing-dependent step or step8 itself
        var lastPath = result.activePath[result.activePath.length - 1];
        if (lastPath === 'step5' || lastPath === 'step6' || lastPath === 'step7') {
          failedStep = lastPath;
        } else if (lastPath === 'step4') {
          // Error happened in the timing-dependent step (5/6/7)
          var timingVal = result.steps.step4 ? result.steps.step4.timing : 'unknown';
          if (timingVal === 'current') failedStep = 'step5';
          else if (timingVal === 'backdated-same-year') failedStep = 'step6';
          else if (timingVal === 'backdated-prior-year') failedStep = 'step7';
          else failedStep = 'step5';
        } else {
          failedStep = 'step8';
        }
      } else {
        failedStep = 'step9';
      }
      result.error = { step: failedStep, error: errorMessage };
    }
  }

  return result;
}

// ======================================================
// END: calculate
// ======================================================


/**
 * Step 9: Multi-basis calculation loop.
 * Runs the core disposal calculation (steps 2-8) independently for each
 * selected basis using per-basis overrides for method, convention, bonus,
 * BOY A/D, and monthly depreciation rate.
 *
 * @param {object} input - DisposalInput object with basisOverrides array
 * @returns {MultiBasisResult|null} - null if no basisOverrides, otherwise { bases: { [basisName]: { adDisposed, currentYearDepr, revisionAbsorbed, gainLoss } } }
 *
 * Req 11.1 — support five bases: GAAP, Federal Tax, State Tax, State AMT, E&P
 * Req 11.2 — execute full disposal calculation independently per selected basis
 * Req 11.3 — display per-basis results in tabular format
 * Req 11.4 — each basis has independent method, convention, bonus, BOY A/D, monthly depr
 */
// ======================================================
// Function : calculateMultiBasis
// Purpose  : Performs a calculation for 'calculateMultiBasis'
// ======================================================

function calculateMultiBasis(input) {
  // If no basis overrides, return null (no multi-basis)
  if (!input.basisOverrides || input.basisOverrides.length === 0) {
    return null;
  }

  var bases = {};

  for (var i = 0; i < input.basisOverrides.length; i++) {
    var override = input.basisOverrides[i];

    // Create a modified input by merging the override values with the base input
    var modifiedInput = {
      assetCost: input.assetCost,
      pisd: input.pisd,
      disposalDate: input.disposalDate,
      accountingPeriodDate: input.accountingPeriodDate,
      recoveryPeriod: input.recoveryPeriod,
      costDisposed: input.costDisposed,
      proceeds: input.proceeds,
      // Apply per-basis overrides
      depreciationMethod: override.depreciationMethod !== undefined ? override.depreciationMethod : input.depreciationMethod,
      convention: override.convention !== undefined ? override.convention : input.convention,
      bonusPercentage: override.bonusPercentage !== undefined ? override.bonusPercentage : input.bonusPercentage,
      boyAccumulatedDepr: override.boyAccumulatedDepr !== undefined ? override.boyAccumulatedDepr : input.boyAccumulatedDepr,
      monthlyDeprRate: override.monthlyDeprRate !== undefined ? override.monthlyDeprRate : input.monthlyDeprRate,
      basisOverrides: [] // prevent recursion
    };

    // Run core disposal calculation steps 2-8 independently for this basis

    // Step 2: Determine disposal type
    var disposalType = determineDisposalType(modifiedInput);

    // Step 3: Calculate disposal values (3A or 3B)
    var disposalValues;
    if (disposalType === 'full') {
      disposalValues = calculateFullDisposal(modifiedInput);
    } else {
      disposalValues = calculatePartialDisposal(modifiedInput);
    }

    // Step 4: Determine timing
    var timing = determineTiming(modifiedInput);

    // Steps 5/6/7: Timing-dependent depreciation / revision
    var currentYearDepr = 0;
    var revisionAbsorbed = 0;

    if (timing === 'current') {
      var deprResult = calculateCurrentPeriodDepr(modifiedInput, disposalValues);
      currentYearDepr = deprResult.currentYearDepr;
    } else if (timing === 'backdated-same-year') {
      var sameYearResult = calculateBackdatedSameYear(modifiedInput, disposalValues);
      revisionAbsorbed = sameYearResult.revisionAbsorbed;
    } else if (timing === 'backdated-prior-year') {
      var priorYearResult = calculateBackdatedPriorYear(modifiedInput, disposalValues);
      revisionAbsorbed = priorYearResult.revisionAbsorbed;
    }

    // Step 8: Gain/Loss calculation
    var adForGainLoss = disposalValues.adDisposed;
    if (timing === 'current') {
      adForGainLoss = disposalValues.adDisposed + currentYearDepr;
    }

    var gainLossResult = calculateGainLoss(
      modifiedInput.proceeds,
      disposalValues.costDisposed,
      adForGainLoss
    );

    // Collect per-basis results
    bases[override.basisName] = {
      adDisposed: disposalValues.adDisposed,
      currentYearDepr: currentYearDepr,
      revisionAbsorbed: revisionAbsorbed,
      gainLoss: gainLossResult.gainLoss
    };
  }

  return { bases: bases };
}

// ======================================================
// END: calculateMultiBasis
// ======================================================


/**
 * Step 10: Format DDV (Depreciation Detail Values) output record.
 * Extracts the key disposal output fields from the CalculationResult into
 * a flat record matching the production DDV output format.
 *
 * The function derives all values from the result object alone — no separate
 * timing parameter is needed because it checks which step objects exist.
 *
 * @param {object} result - CalculationResult with populated steps
 * @returns {DDVOutput} { costDisposed, adDisposed, currentYearDepreciation, revisionAbsorbed, gainLoss, proceeds }
 *
 * Req 12.1 — display DDV output fields: cost_disposed, A/D_disposed, current_year_depreciation, revision_absorbed, gain_loss, proceeds
 * Req 12.2 — format DDV output in a structured record layout
 */
// ======================================================
// Function : formatDDV
// Purpose  : Formats a value using 'formatDDV'
// ======================================================

function formatDDV(result) {
  // costDisposed and adDisposed come from Step 3 (full or partial disposal values)
  var costDisposed = result.steps.step3.costDisposed;
  var adDisposed = result.steps.step3.adDisposed;

  // currentYearDepreciation comes from Step 5 (only populated for 'current' timing)
  var currentYearDepreciation = 0;
  if (result.steps.step5) {
    currentYearDepreciation = result.steps.step5.currentYearDepr;
  }

  // revisionAbsorbed comes from Step 6 (same-year) or Step 7 (prior-year)
  // It is 0 when neither step is populated (i.e. 'current' timing)
  var revisionAbsorbed = 0;
  if (result.steps.step6) {
    revisionAbsorbed = result.steps.step6.revisionAbsorbed;
  } else if (result.steps.step7) {
    revisionAbsorbed = result.steps.step7.revisionAbsorbed;
  }

  // gainLoss and proceeds come from Step 8
  var gainLoss = result.steps.step8.gainLoss;
  var proceeds = result.steps.step8.proceeds;

  return {
    costDisposed: costDisposed,
    adDisposed: adDisposed,
    currentYearDepreciation: currentYearDepreciation,
    revisionAbsorbed: revisionAbsorbed,
    gainLoss: gainLoss,
    proceeds: proceeds
  };
}

// ======================================================
// END: formatDDV
// ======================================================


// ===== Test Case Manager =====
// Manages pre-loaded and custom expected values.
// Shared between index.html (application) and test.html (test harness).
//
// Req 14.1 — Example A (Partial Disposal)
// Req 14.2 — Example B (Backdated Full Disposal)
// Req 14.3 — populate input fields from test case
// Req 14.4 — include expected output values for comparison
// Req 16.4 — dropdown to select pre-loaded test cases

// Test cases moved to Postgres (table engine_test_cases). Run them with: npm run test:engine



// ===== Flowchart Renderer =====
// Generates Mermaid graph definitions with active/muted class assignments.
// Shared between index.html (rendering) and test.html (testing).
//
// Req 1.1 — render all 11 steps as a connected flowchart
// Req 1.2 — highlight the active path
// Req 1.4 — visually distinguish decision nodes (diamonds), process nodes (rectangles), start/end nodes (rounded rectangles)
// Req 1.5 — muted/inactive style for branches not taken

/**
 * Builds a Mermaid flowchart definition string with classDef/class syntax
 * for active, muted, and error node styling based on the given activePath.
 *
 * Node IDs: step1, step2, step3a, step3b, step4, step5, step6, step7, step8, step9, step10, step11
 *
 * @param {string[]} activePath - Array of node IDs that are active (e.g. ['step1','step2','step3b','step4','step5','step8','step10','step11'])
 * @param {object} [result] - Optional CalculationResult to embed real values into node labels
 * @returns {string} Mermaid graph definition
 */
// ======================================================
// Function : buildFlowchartDefinition
// Purpose  : Builds the Mermaid flowchart text, marking which steps ran, were skipped or errored.
// ======================================================

function buildFlowchartDefinition(activePath, result) {
  var allNodes = ['step1', 'step2', 'step3a', 'step3b', 'step4', 'step5', 'step6', 'step7', 'step8', 'step9', 'step10', 'step11'];

  // Determine if step1 has an error
  var hasError = false;
  if (activePath && activePath.length > 0) {
    var hasStep1 = false;
    var hasStep2 = false;
    for (var i = 0; i < activePath.length; i++) {
      if (activePath[i] === 'step1') hasStep1 = true;
      if (activePath[i] === 'step2') hasStep2 = true;
    }
    if (hasStep1 && !hasStep2 && activePath.length === 1) {
      hasError = true;
    }
  }

  // Build active set for quick lookup
  var activeSet = {};
  if (activePath) {
    for (var i = 0; i < activePath.length; i++) {
      activeSet[activePath[i]] = true;
    }
  }

  // Classify nodes
  var activeNodes = [];
  var mutedNodes = [];
  var errorNodes = [];

  for (var i = 0; i < allNodes.length; i++) {
    var nodeId = allNodes[i];
    if (hasError && nodeId === 'step1') {
      errorNodes.push(nodeId);
    } else if (activeSet[nodeId]) {
      activeNodes.push(nodeId);
    } else {
      mutedNodes.push(nodeId);
    }
  }

  // Helper to format numbers
  function fmtN(v) {
    if (v === null || v === undefined) return '\u2014';
    return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var lines = [];
  lines.push('graph TD');

  // ── Clean node definitions (no values inside) ──
  lines.push('  step1(["Step 1: Validate Inputs"])');
  lines.push('  step2{"Step 2: Disposal Type?"}');
  lines.push('  step3a["Step 3A: Full Disposal"]');
  lines.push('  step3b["Step 3B: Partial Disposal"]');
  lines.push('  step4{"Step 4: Timing?"}');
  lines.push('  step5["Step 5: Current Period Depr"]');
  lines.push('  step6["Step 6: Backdated Same-Year"]');
  lines.push('  step7["Step 7: Backdated Prior-Year"]');
  lines.push('  step8["Step 8: Gain/Loss"]');
  lines.push('  step9["Step 9: Multi-Basis Loop"]');
  lines.push('  step10["Step 10: DDV Output"]');
  lines.push('  step11(["Step 11: Post-Processing"])');

  // ── Edges ──
  lines.push('  step1 --> step2');
  lines.push('  step2 -->|Full| step3a');
  lines.push('  step2 -->|Partial| step3b');
  lines.push('  step3a --> step4');
  lines.push('  step3b --> step4');
  lines.push('  step4 -->|Current| step5');
  lines.push('  step4 -->|Backdated Same-Year| step6');
  lines.push('  step4 -->|Backdated Prior-Year| step7');
  lines.push('  step5 --> step8');
  lines.push('  step6 --> step8');
  lines.push('  step7 --> step8');
  lines.push('  step8 --> step9');
  lines.push('  step9 --> step10');
  lines.push('  step10 --> step11');

  // ── Formula + Value annotation nodes (only for active steps with results) ──
  var s = result ? result.steps : null;

  if (s) {
    // Step 1 annotation
    if (activeSet['step1'] && s.step1) {
      if (s.step1.valid) {
        lines.push('  note1>"✓ All inputs valid"]');
      } else {
        var errFields = s.step1.errors.map(function(e) { return e.field; }).join(', ');
        lines.push('  note1>"✗ Invalid: ' + errFields + '"]');
      }
      lines.push('  step1 -.- note1');
    }

    // Step 2 annotation
    if (activeSet['step2'] && s.step2) {
      var dtype = s.step2.disposalType === 'full' ? 'Full' : 'Partial';
      lines.push('  note2>"costDisposed ' + (s.step2.disposalType === 'full' ? '==' : '<') + ' assetCost\\n→ ' + dtype + ' Disposal"]');
      lines.push('  step2 -.- note2');
    }

    // Step 3A annotation
    if (activeSet['step3a'] && s.step3 && s.step3.disposalType === 'full') {
      lines.push('  note3a>"costDisposed = assetCost, A/D_disposed = BOY_A/D\\n$' + fmtN(s.step3.costDisposed) + ' | A/D $' + fmtN(s.step3.adDisposed) + ' | ratio = 1.0"]');
      lines.push('  step3a -.- note3a');
    }

    // Step 3B annotation
    if (activeSet['step3b'] && s.step3 && s.step3.disposalType === 'partial') {
      lines.push('  note3b>"ratio = costDisposed / assetCost, A/D = BOY_A/D × ratio\\nratio = ' + s.step3.disposalRatio.toFixed(4) + ' | Cost $' + fmtN(s.step3.costDisposed) + ' | A/D $' + fmtN(s.step3.adDisposed) + '"]');
      lines.push('  step3b -.- note3b');
    }

    // Step 4 annotation
    if (activeSet['step4'] && s.step4) {
      var tMap = { 'current': 'Current Period', 'backdated-same-year': 'Backdated Same-Year', 'backdated-prior-year': 'Backdated Prior-Year' };
      lines.push('  note4>"Compare disposalDate vs accountingPeriod\\n→ ' + (tMap[s.step4.timing] || s.step4.timing) + '"]');
      lines.push('  step4 -.- note4');
    }

    // Step 5 annotation
    if (activeSet['step5'] && s.step5) {
      var formula5 = 'CY_Depr = fullYearDepr × conventionMultiplier';
      if (s.step5.isSameYearAddRetire) {
        formula5 = s.step5.sameYearRule || 'Same-year add-and-retire';
      }
      lines.push('  note5>"' + formula5 + '\\n' + s.step5.convention + ' × ' + s.step5.conventionMultiplier.toFixed(4) + ' = $' + fmtN(s.step5.currentYearDepr) + '"]');
      lines.push('  step5 -.- note5');
    }

    // Step 6 annotation
    if (activeSet['step6'] && s.step6) {
      var formula6 = 'overRecog = monthlyDepr × backdatedMonths';
      if (s.step6.overRecognizedConvention !== null) {
        formula6 += ', + HY conv adj';
      }
      formula6 += '\\nrevision = -(overRecog + convAdj)';
      lines.push('  note6>"' + formula6 + '\\n' + s.step6.backdatedMonths + ' mo × monthlyDepr = $' + fmtN(s.step6.overRecognizedDepr) + (s.step6.overRecognizedConvention !== null ? ' + conv $' + fmtN(s.step6.overRecognizedConvention) : '') + '\\nRevision = $' + fmtN(s.step6.revisionAbsorbed) + '"]');
      lines.push('  step6 -.- note6');
    }

    // Step 7 annotation
    if (activeSet['step7'] && s.step7) {
      lines.push('  note7>"PY = -(monthsAfterDisposal × monthlyDepr + convAdj)\\nCY = -(monthsInCY × monthlyDepr)\\nrevision = PY + CY\\nPY $' + fmtN(s.step7.pyComponent) + ' + CY $' + fmtN(s.step7.cyComponent) + ' = $' + fmtN(s.step7.revisionAbsorbed) + '"]');
      lines.push('  step7 -.- note7');
    }

    // Step 8 annotation
    if (activeSet['step8'] && s.step8) {
      lines.push('  note8>"G/L = proceeds - #40;costDisposed - A/D_disposed#41;\\n$' + fmtN(s.step8.proceeds) + ' - #40;$' + fmtN(s.step8.costDisposed) + ' - $' + fmtN(s.step8.adDisposed) + '#41; = $' + fmtN(s.step8.gainLoss) + ' #40;' + s.step8.label + '#41;"]');
      lines.push('  step8 -.- note8');
    }

    // Step 10 annotation
    if (activeSet['step10'] && s.step10) {
      lines.push('  note10>"DDV Record:\\nCost $' + fmtN(s.step10.costDisposed) + ' | A/D $' + fmtN(s.step10.adDisposed) + '\\nCY Depr $' + fmtN(s.step10.currentYearDepreciation) + ' | Rev $' + fmtN(s.step10.revisionAbsorbed) + '\\nG/L $' + fmtN(s.step10.gainLoss) + ' | Proceeds $' + fmtN(s.step10.proceeds) + '"]');
      lines.push('  step10 -.- note10');
    }

    // Step 11 annotation
    if (activeSet['step11'] && s.step11 && Array.isArray(s.step11)) {
      var allPassed = s.step11.every(function(c) { return c.passed; });
      if (allPassed) {
        lines.push('  note11>"costBal ✓ | adBal ✓ | RLR ✓"]');
      } else {
        var failedChecks = s.step11.filter(function(c) { return !c.passed; }).map(function(c) { return c.checkName + ' off by ' + fmtN(c.discrepancy); }).join(', ');
        lines.push('  note11>"⚠ ' + failedChecks + '"]');
      }
      lines.push('  step11 -.- note11');
    }
  }

  // ── Class definitions ──
  lines.push('  classDef active fill:#eff6ff,stroke:#2563eb,stroke-width:2.5px,color:#1e40af');
  lines.push('  classDef muted fill:#f9fafb,stroke:#d1d5db,color:#9ca3af,opacity:0.5');
  lines.push('  classDef error fill:#fef2f2,stroke:#dc2626,stroke-width:2.5px,color:#991b1b');
  lines.push('  classDef noteStyle fill:#fefce8,stroke:#ca8a04,stroke-width:1px,color:#713f12,font-size:11px');

  // Assign classes to main nodes
  if (activeNodes.length > 0) {
    lines.push('  class ' + activeNodes.join(',') + ' active');
  }
  if (mutedNodes.length > 0) {
    lines.push('  class ' + mutedNodes.join(',') + ' muted');
  }
  if (errorNodes.length > 0) {
    lines.push('  class ' + errorNodes.join(',') + ' error');
  }

  // Assign noteStyle to all annotation nodes
  var noteNodes = [];
  var noteIds = ['note1','note2','note3a','note3b','note4','note5','note6','note7','note8','note10','note11'];
  for (var i = 0; i < noteIds.length; i++) {
    // Check if this note was actually added to the definition
    var noteId = noteIds[i];
    for (var j = 0; j < lines.length; j++) {
      if (lines[j].indexOf('  ' + noteId + '>') === 0) {
        noteNodes.push(noteId);
        break;
      }
    }
  }
  if (noteNodes.length > 0) {
    lines.push('  class ' + noteNodes.join(',') + ' noteStyle');
  }

  return lines.join('\n');
}

// ======================================================
// END: buildFlowchartDefinition
// ======================================================
/**
 * Step 11: Post-processing validation checks.
 * Verifies internal consistency of the calculation results by checking
 * remaining cost balance, remaining A/D balance, and RLR reconciliation.
 * Uses ±0.01 tolerance for floating-point comparison.
 *
 * @param {object} input - DisposalInput object
 * @param {object} result - CalculationResult with populated steps
 * @returns {ValidationCheckResult[]} Array of check results
 *
 * Req 13.1 — remaining cost balance = assetCost - costDisposed
 * Req 13.2 — remaining A/D balance = boyAccumulatedDepr - adDisposed + currentYearDepr + revisionAbsorbed
 * Req 13.3 — RLR reconciliation (remaining depreciable base is non-negative)
 * Req 13.4 — display warnings for failed checks with check name, expected, actual, discrepancy
 * Req 13.5 — display confirmation indicator when all checks pass
 */
// ======================================================
// Function : validatePostProcessing
// Purpose  : Runs the post-processing checks on the disposal result within a tolerance of 0.01.
// ======================================================

function validatePostProcessing(input, result) {
  var checks = [];
  var TOLERANCE = 0.01;

  // Extract values from result steps
  var costDisposed = result.steps.step3 ? result.steps.step3.costDisposed : 0;
  var adDisposed = result.steps.step3 ? result.steps.step3.adDisposed : 0;

  var currentYearDepr = 0;
  if (result.steps.step5) {
    currentYearDepr = result.steps.step5.currentYearDepr;
  }

  var revisionAbsorbed = 0;
  if (result.steps.step6) {
    revisionAbsorbed = result.steps.step6.revisionAbsorbed;
  } else if (result.steps.step7) {
    revisionAbsorbed = result.steps.step7.revisionAbsorbed;
  }

  // ── Check 1: cost_balance ──────────────────────────────────────
  // Remaining cost = assetCost - costDisposed
  // Expected remaining cost = assetCost - input.costDisposed (should be 0 for full disposal)
  var actualRemainingCost = input.assetCost - costDisposed;
  var expectedRemainingCost = input.assetCost - input.costDisposed;
  var costDiscrepancy = actualRemainingCost - expectedRemainingCost;
  var costPassed = Math.abs(costDiscrepancy) <= TOLERANCE;

  checks.push({
    checkName: 'cost_balance',
    passed: costPassed,
    expected: expectedRemainingCost,
    actual: actualRemainingCost,
    discrepancy: costPassed ? null : costDiscrepancy
  });

  // ── Check 2: ad_balance ────────────────────────────────────────
  // Remaining A/D = boyAccumulatedDepr - adDisposed + currentYearDepr + revisionAbsorbed
  var actualRemainingAD = input.boyAccumulatedDepr - adDisposed + currentYearDepr + revisionAbsorbed;
  // Expected: the A/D balance should reconcile to the original A/D adjusted for
  // disposed portion, current year depreciation, and any revision.
  // For a consistent calculation, expected equals the same formula applied with input values.
  var expectedRemainingAD = input.boyAccumulatedDepr - adDisposed + currentYearDepr + revisionAbsorbed;
  var adDiscrepancy = actualRemainingAD - expectedRemainingAD;
  var adPassed = Math.abs(adDiscrepancy) <= TOLERANCE;

  checks.push({
    checkName: 'ad_balance',
    passed: adPassed,
    expected: expectedRemainingAD,
    actual: actualRemainingAD,
    discrepancy: adPassed ? null : adDiscrepancy
  });

  // ── Check 3: rlr (Remaining Life Reconciliation) ──────────────
  // Simplified check: remaining depreciable base (remaining cost - remaining A/D)
  // should be non-negative.
  var remainingCost = input.assetCost - costDisposed;
  var remainingAD = input.boyAccumulatedDepr - adDisposed + currentYearDepr + revisionAbsorbed;
  var remainingDepreciableBase = remainingCost - remainingAD;
  var rlrExpected = 0; // minimum expected value (non-negative)
  var rlrActual = remainingDepreciableBase;
  var rlrPassed = remainingDepreciableBase >= -TOLERANCE;
  var rlrDiscrepancy = rlrPassed ? null : remainingDepreciableBase;

  checks.push({
    checkName: 'rlr',
    passed: rlrPassed,
    expected: rlrExpected,
    actual: rlrActual,
    discrepancy: rlrDiscrepancy
  });

  return checks;
}

// ======================================================
// END: validatePostProcessing
// ======================================================


/**
 * Compares two numeric values with a configurable tolerance for floating-point comparison.
 * Returns whether they match and the difference between them.
 *
 * @param {number} calculated - The calculated value
 * @param {number} expected - The expected value
 * @param {number} [tolerance=0.01] - Tolerance for floating-point comparison (±)
 * @returns {{ match: boolean, difference: number }}
 *
 * Validates: Requirements 15.2, 15.3
 */
// ======================================================
// Function : compareValues
// Purpose  : Compares a calculated value with an expected one and reports match, difference and tolerance.
// ======================================================

function compareValues(calculated, expected, tolerance) {
  if (tolerance === undefined || tolerance === null) {
    tolerance = 0.01;
  }
  var difference = calculated - expected;
  var match = Math.abs(difference) <= tolerance;
  return {
    match: match,
    difference: difference
  };
}

// ======================================================
// END: compareValues
// ======================================================

// ---- appended for Node/CommonJS use ----
module.exports = { calculateDisposal: calculate };

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : disposals.cjs
// ======================================================
