// ======================================================
// File Name : rate-tables.cjs
// Purpose   : Depreciation calc-engine module: rate-tables
// ======================================================


// ======================================================
// START: Calculation Engine Functions
// ======================================================

// ============================================================
// Shared MACRS Rate Tables — IRS Publication 946
// Used by all calculator engines for exact depreciation lookup.
// Source: TRD Appendix 7.2 + Addition Examples spreadsheet
// ============================================================

var RATE_TABLES = (function() {

  // ── Table A-1: MACRS 200% DB, Half-Year Convention ─────────
  var tableA1 = {}; // loaded from Postgres (see load)

  // ── Table A-2: MACRS 200% DB, Mid-Quarter Q1 ───────────────
  var tableA2_Q1 = {}; // loaded from Postgres (see load)

  // ── Table A-3: MACRS 200% DB, Mid-Quarter Q2 ───────────────
  var tableA2_Q2 = {}; // loaded from Postgres (see load)

  // ── Table A-4: MACRS 200% DB, Mid-Quarter Q3 ───────────────
  var tableA2_Q3 = {}; // loaded from Postgres (see load)

  // ── Table A-5: MACRS 200% DB, Mid-Quarter Q4 ───────────────
  var tableA2_Q4 = {}; // loaded from Postgres (see load)

  // ── Table A-14: MACRS 150% DB, Half-Year (State AMT) ───────
  var table150DB_HY = {}; // loaded from Postgres (see load)

  // ── Table A-7a: Nonresidential Real 39-Year, Mid-Month ─────
  // Returns percentage for given year and month placed in service (1-12)
  // Year 1 rate depends on month PIS; Years 2-39 = 2.564%; Year 40 = remainder
  var tableA7a_year1 = {}; // loaded from Postgres (see load)
  var tableA7a_annual = 0; // loaded from Postgres (see load)

  // ── Table A-6: Residential Rental 27.5-Year, Mid-Month ─────
  var tableA6_year1 = {}; // loaded from Postgres (see load)
  var tableA6_annual = 0; // loaded from Postgres (see load)

  // ── ADS Straight-Line, Half-Year Convention ────────────────
  // ADS uses straight-line over ADS recovery period with HY convention
  // Year 1 = (1 / life) × 0.5; Years 2 to N-1 = 1/life; Year N = remainder
  // Rates rounded to 2 decimal places to match IRS Publication 946 / BNA table precision
  // ======================================================
  // Function : adsRate
  // Purpose  : Returns the ADS straight-line rate % for a year (half-year in the first and last year), rounded to 2 decimals.
  // ======================================================

  function adsRate(lifeYears, year) {
    if (year === 1) return Math.round((100 / lifeYears) * 0.5 * 100) / 100;
    if (year <= lifeYears) return Math.round((100 / lifeYears) * 100) / 100;
    if (year === lifeYears + 1) return Math.round((100 / lifeYears) * 0.5 * 100) / 100; // last half-year
    return 0;
  }

  // ======================================================
  // END: adsRate
  // ======================================================

  // ── Straight-Line, Half-Year Convention ────────────────────
  // ======================================================
  // Function : slHalfYearRate
  // Purpose  : Returns the straight-line half-year convention rate % for a year.
  // ======================================================

  function slHalfYearRate(lifeYears, year) {
    if (year === 1) return (100 / lifeYears) * 0.5;
    if (year <= lifeYears) return 100 / lifeYears;
    if (year === lifeYears + 1) return (100 / lifeYears) * 0.5;
    return 0;
  }

  // ======================================================
  // END: slHalfYearRate
  // ======================================================

  // ── Nonresidential Real Property 40-Year Mid-Month (ADS) ───
  var tableA13a_year1 = {}; // loaded from Postgres (see load)
  var tableA13a_annual = 0; // loaded from Postgres (see load)

  // ── ADS Specific Recovery Period Tables (SL, Half-Year) ────
  // These are formula-based: Year 1 = (1/life)/2, Years 2-N = 1/life, Year N+1 = (1/life)/2
  var adsLives = []; // loaded from Postgres (see load)

  // ── ADS 30-Year Residential SL Mid-Month ───────────────────
  var adsResidential30_year1 = {}; // loaded from Postgres (see load)
  var adsResidential30_annual = 0; // loaded from Postgres (see load)

  // ── ADS 40-Year Nonresidential SL Mid-Month ────────────────
  var adsNonresidential40_year1 = {}; // loaded from Postgres (see load)
  var adsNonresidential40_annual = 0; // loaded from Postgres (see load)

  // ── Straight-Line, Full-Month Convention ───────────────────
  // Full month of depreciation in the month placed in service
  // ======================================================
  // Function : slFullMonthRate
  // Purpose  : Returns the straight-line rate % for a number of full months in a year.
  // ======================================================

  function slFullMonthRate(lifeMonths, monthsInYear) {
    return (100 / lifeMonths) * monthsInYear;
  }

  // ======================================================
  // END: slFullMonthRate
  // ======================================================

  // Full-Month convention: Year 1 gets full months from PIS month through Dec
  // ======================================================
  // Function : fullMonthYear1Rate
  // Purpose  : Returns the Year 1 rate % under the Full-Month convention (full months from the placed-in-service month to December).
  // ======================================================

  function fullMonthYear1Rate(lifeYears, monthPIS) {
    var monthlyRate = 100 / (lifeYears * 12);
    var monthsInYear1 = 12 - monthPIS + 1; // includes PIS month
    return monthlyRate * monthsInYear1;
  }

  // ======================================================
  // END: fullMonthYear1Rate
  // ======================================================

  // ── Straight-Line (No Bonus) — Generic ─────────────────────
  // Simple straight-line with half-year convention (same as SL HY)
  // Year 1 = (1/life) × 50%, Years 2-N = 1/life, Year N+1 = remainder
  // Already handled by slHalfYearRate function

  // ── Database loader ────────────────────────────────────────
  // The percentage tables are NOT stored in this file any more. The server reads them from
  // Postgres (macrs_rate_by_year, macrs_mm_rate, macrs_ads_lives) at boot and hands them in here.
  // data = { byYear: { '<tableKey>': { '<life>': [pct, pct, ...] } },
  //          mm:     { '<tableKey>': { year1: { '1': pct, ... '12': pct }, annual: pct } },
  //          adsLives: [3, 5, ...] }
  var loaded = false;

  // ======================================================
  // Function : load
  // Purpose  : Fills every rate table from the data read out of the database.
  // ======================================================

  function load(data) {
    var by = (data && data.byYear) || {};
    var mm = (data && data.mm) || {};
    function need(tbl, key) {
      if (!tbl[key]) throw new Error('RATE_TABLES: table "' + key + '" is missing in the database - run db/rate-tables.sql');
      return tbl[key];
    }
    tableA1 = need(by, 'A1_HY_200DB');
    tableA2_Q1 = need(by, 'A2_MQ_Q1_200DB');
    tableA2_Q2 = need(by, 'A3_MQ_Q2_200DB');
    tableA2_Q3 = need(by, 'A4_MQ_Q3_200DB');
    tableA2_Q4 = need(by, 'A5_MQ_Q4_200DB');
    table150DB_HY = need(by, 'A14_150DB_HY');
    var a7a = need(mm, 'A7a_39yr_MM');             tableA7a_year1 = a7a.year1;             tableA7a_annual = a7a.annual;
    var a6 = need(mm, 'A6_27yr_MM');               tableA6_year1 = a6.year1;               tableA6_annual = a6.annual;
    var a13a = need(mm, 'A13a_40yr_MM');           tableA13a_year1 = a13a.year1;           tableA13a_annual = a13a.annual;
    var r30 = need(mm, 'ADS_30yr_Residential_MM'); adsResidential30_year1 = r30.year1;     adsResidential30_annual = r30.annual;
    var n40 = need(mm, 'ADS_40yr_Nonresidential_MM'); adsNonresidential40_year1 = n40.year1; adsNonresidential40_annual = n40.annual;
    adsLives = (data && data.adsLives) || [];
    loaded = true;
  }

  // ======================================================
  // END: load
  // ======================================================

  // Fail loudly instead of silently falling back to straight-line when the tables were never loaded.
  function assertLoaded() {
    if (!loaded) throw new Error('RATE_TABLES not loaded from the database - call initRateTables() at server boot (run db/rate-tables.sql first)');
  }

  // ── Lookup Function ────────────────────────────────────────
  // Returns the annual depreciation percentage for a given year
  // based on method, life, convention, and placement details.
  // ======================================================
  // Function : lookupRate
  // Purpose  : Returns the annual depreciation % for a year based on method, life, convention and placed-in-service details.
  // ======================================================

  function lookupRate(params) {
    assertLoaded();
    var method = params.method;         // 'MACRS', 'MACRS ADS', 'SL', 'MACRS 150DB'
    var lifeYears = params.lifeYears;   // e.g., 5, 7, 39
    var convention = params.convention; // 'HY', 'MQ', 'Mid-Month', 'Full-Month'
    var year = params.year;             // depreciation year (1-based)
    var quarter = params.quarter || 1;  // quarter placed in service (for MQ)
    var monthPIS = params.monthPIS || 1; // month placed in service (for Mid-Month)

    // MACRS 200% DB with Half-Year
    if ((method === 'MACRS' || method === 'MACRS 200DB') && convention === 'HY') {
      if (tableA1[lifeYears] && year <= tableA1[lifeYears].length) {
        return tableA1[lifeYears][year - 1];
      }
    }

    // MACRS 200% DB with Mid-Quarter
    if ((method === 'MACRS' || method === 'MACRS 200DB') && convention === 'MQ') {
      var mqTable;
      if (quarter === 1) mqTable = tableA2_Q1;
      else if (quarter === 2) mqTable = tableA2_Q2;
      else if (quarter === 3) mqTable = tableA2_Q3;
      else mqTable = tableA2_Q4;
      if (mqTable[lifeYears] && year <= mqTable[lifeYears].length) {
        return mqTable[lifeYears][year - 1];
      }
    }

    // MACRS 150% DB with Half-Year (State AMT)
    if (method === 'MACRS 150DB' && convention === 'HY') {
      if (table150DB_HY[lifeYears] && year <= table150DB_HY[lifeYears].length) {
        return table150DB_HY[lifeYears][year - 1];
      }
    }

    // Nonresidential Real Property 39-Year Mid-Month (Table A-7a)
    if (method === 'MACRS Straight-Line' && convention === 'Mid-Month' && lifeYears === 39) {
      if (year === 1) return tableA7a_year1[monthPIS] || 0;
      if (year >= 2 && year <= 39) return tableA7a_annual;
      if (year === 40) {
        // Remainder to reach 100%
        var taken = (tableA7a_year1[monthPIS] || 0) + tableA7a_annual * 38;
        return Math.max(0, 100 - taken);
      }
      return 0;
    }

    // Residential Rental 27.5-Year Mid-Month (Table A-6)
    if (method === 'MACRS Straight-Line' && convention === 'Mid-Month' && (lifeYears === 27 || lifeYears === 28)) {
      if (year === 1) return tableA6_year1[monthPIS] || 0;
      if (year >= 2 && year <= 27) return tableA6_annual;
      if (year === 28) {
        var taken6 = (tableA6_year1[monthPIS] || 0) + tableA6_annual * 26;
        return Math.max(0, 100 - taken6);
      }
      return 0;
    }

    // ADS Straight-Line Half-Year
    if (method === 'MACRS ADS' && (convention === 'HY' || convention === 'Half-Year')) {
      return adsRate(lifeYears, year);
    }

    // Nonresidential Real Property 40-Year Mid-Month (ADS Table A-13a)
    if (method === 'MACRS ADS' && convention === 'Mid-Month' && lifeYears === 40) {
      if (year === 1) return tableA13a_year1[monthPIS] || 0;
      if (year >= 2 && year <= 40) return tableA13a_annual;
      if (year === 41) {
        var taken40 = (tableA13a_year1[monthPIS] || 0) + tableA13a_annual * 39;
        return Math.max(0, 100 - taken40);
      }
      return 0;
    }

    // ADS 30-Year Residential SL Mid-Month
    if (method === 'MACRS ADS' && convention === 'Mid-Month' && lifeYears === 30) {
      if (year === 1) return adsResidential30_year1[monthPIS] || 0;
      if (year >= 2 && year <= 30) return adsResidential30_annual;
      if (year === 31) {
        var taken30 = (adsResidential30_year1[monthPIS] || 0) + adsResidential30_annual * 29;
        return Math.max(0, 100 - taken30);
      }
      return 0;
    }

    // Straight-Line with Full-Month Convention
    if (convention === 'Full-Month' || convention === 'FM') {
      if (year === 1) return fullMonthYear1Rate(lifeYears, monthPIS);
      var annualRate = 100 / lifeYears;
      if (year >= 2 && year <= lifeYears) return annualRate;
      if (year === lifeYears + 1) {
        // Last year: remainder (months not covered in year 1)
        var monthsInYear1 = 12 - monthPIS + 1;
        var monthlyR = 100 / (lifeYears * 12);
        return monthlyR * (12 - monthsInYear1);
      }
      return 0;
    }

    // Generic Straight-Line Half-Year
    if (method === 'SL' && convention === 'HY') {
      return slHalfYearRate(lifeYears, year);
    }

    // Fallback: straight-line
    if (lifeYears > 0) {
      return 100 / lifeYears;
    }
    return 0;
  }

  // ======================================================
  // END: lookupRate
  // ======================================================

  // ── Monthly Rate from Annual Table ─────────────────────────
  // Given cost, method, life, convention, PISD, and target date,
  // returns the monthly depreciation amount for that period.
  // ======================================================
  // Function : getMonthlyDepr
  // Purpose  : Retrieves data related to 'getMonthlyDepr'
  // ======================================================

  function getMonthlyDepr(params) {
    var cost = params.cost;
    var bonusPercent = params.bonusPercent || 0;
    var basis = cost * (1 - bonusPercent / 100); // depreciable basis after bonus
    var lifeYears = params.lifeYears;
    var method = params.method;
    var convention = params.convention;
    var pisdMonth = params.pisdMonth || 1;
    var pisdYear = params.pisdYear;
    var targetYear = params.targetYear;
    var targetMonth = params.targetMonth;

    // Determine which depreciation year we're in
    var deprYear = targetYear - pisdYear + 1;
    if (deprYear < 1) return 0;

    // Get the annual rate for this depreciation year
    var annualRate = lookupRate({
      method: method,
      lifeYears: lifeYears,
      convention: convention,
      year: deprYear,
      quarter: Math.ceil(pisdMonth / 3),
      monthPIS: pisdMonth
    });

    // Annual depreciation amount
    var annualDepr = basis * (annualRate / 100);

    // Monthly = annual / 12
    return annualDepr / 12;
  }

  // ======================================================
  // END: getMonthlyDepr
  // ======================================================

  // ── Cumulative Depreciation Through a Date ─────────────────
  // Calculates total regular depreciation from PISD through target date
  // ======================================================
  // Function : getCumulativeDepr
  // Purpose  : Retrieves data related to 'getCumulativeDepr'
  // ======================================================

  function getCumulativeDepr(params) {
    assertLoaded();
    var cost = params.cost;
    var bonusPercent = params.bonusPercent || 0;
    var basis = cost * (1 - bonusPercent / 100);
    var lifeYears = params.lifeYears;
    var method = params.method;
    var convention = params.convention;
    var pisdMonth = params.pisdMonth || 1;
    var pisdYear = params.pisdYear;
    var targetYear = params.targetYear;
    var targetMonth = params.targetMonth;

    var totalDepr = 0;
    var maxDeprYear = lifeYears + 1; // +1 for half-year last year

    for (var dy = 1; dy <= maxDeprYear; dy++) {
      var calendarYear = pisdYear + dy - 1;
      if (calendarYear > targetYear) break;

      var annualRate = lookupRate({
        method: method,
        lifeYears: lifeYears,
        convention: convention,
        year: dy,
        quarter: Math.ceil(pisdMonth / 3),
        monthPIS: pisdMonth
      });

      var annualDepr = basis * (annualRate / 100);

      if (calendarYear === targetYear) {
        // Partial year — count months through target month
        if (calendarYear === pisdYear) {
          // PIS year: count from PISD month through target month
          // Mid-Month convention: half month in PIS month
          if (convention === 'Mid-Month') {
            var monthsFromPISD = targetMonth - pisdMonth + 0.5; // half month in PIS month + full months after
            if (monthsFromPISD < 0.5) monthsFromPISD = 0.5;
            // Year 1 annual rate covers (12 - pisdMonth + 0.5) months worth
            var year1Months = 12 - pisdMonth + 0.5;
            totalDepr += annualDepr * (monthsFromPISD / year1Months);
          } else {
            // HY/MQ: Year 1 rate already has convention. If target is same year as PISD,
            // prorate by months from PISD through target vs full year
            var monthsFromStart = targetMonth - pisdMonth + 1;
            if (monthsFromStart <= 0) monthsFromStart = 1;
            var totalMonthsInYear = 12 - pisdMonth + 1;
            totalDepr += annualDepr * (monthsFromStart / totalMonthsInYear);
          }
        } else {
          // Not PIS year — prorate full year by months through target
          var monthsInThisYear = targetMonth;
          totalDepr += annualDepr * (monthsInThisYear / 12);
        }
      } else {
        totalDepr += annualDepr;
      }
    }

    // Cap at basis (handle negative costs correctly)
    if (basis >= 0) {
      if (totalDepr > basis) totalDepr = basis;
    } else {
      if (totalDepr < basis) totalDepr = basis;
    }
    return totalDepr;
  }

  // ======================================================
  // END: getCumulativeDepr
  // ======================================================

  // ── Public API ─────────────────────────────────────────────
  return {
    load: load,
    isLoaded: function() { return loaded; },
    lookupRate: lookupRate,
    getMonthlyDepr: getMonthlyDepr,
    getCumulativeDepr: getCumulativeDepr,
    // Expose raw tables for display/debugging
    get tables() { return {
      'A1_HY_200DB': tableA1,
      'A2_MQ_Q1_200DB': tableA2_Q1,
      'A3_MQ_Q2_200DB': tableA2_Q2,
      'A4_MQ_Q3_200DB': tableA2_Q3,
      'A5_MQ_Q4_200DB': tableA2_Q4,
      'A14_150DB_HY': table150DB_HY,
      'A7a_39yr_MM': { year1: tableA7a_year1, annual: tableA7a_annual },
      'A6_27yr_MM': { year1: tableA6_year1, annual: tableA6_annual },
      'A13a_40yr_MM': { year1: tableA13a_year1, annual: tableA13a_annual },
      'ADS_30yr_Residential_MM': { year1: adsResidential30_year1, annual: adsResidential30_annual },
      'ADS_40yr_Nonresidential_MM': { year1: adsNonresidential40_year1, annual: adsNonresidential40_annual },
      'ADS_HY_lives': adsLives
    }; }
  };
})();

// ---- appended for Node/CommonJS use (server-side reuse of the browser calculator) ----
module.exports = RATE_TABLES;

// ======================================================
// END: Calculation Engine Functions
// ======================================================

// ======================================================
// END OF FILE : rate-tables.cjs
// ======================================================
