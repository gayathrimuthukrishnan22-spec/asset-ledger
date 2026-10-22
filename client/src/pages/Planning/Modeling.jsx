// ======================================================
// File Name : Modeling.jsx
// Purpose   : Page-level component for Modeling
// ======================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { reportsApi } from '../../api/reports.api';
import { assetsApi } from '../../api/assets.api';
import { AppLayout } from '../../layout/AppLayout';
import { BarsChart } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { Select } from '../../components/ui/Input';
import { MultiSelect } from '../../components/ui/MultiSelect';
import { useAssetClasses } from '../../hooks/useAssetClasses';
import { companyName } from '../../utils/companies';
import { formatCurrency } from '../../utils/formatCurrency';
import { useAutoSelectAll } from '../../hooks/useAutoSelectAll';
import { BookSelect } from '../../components/ui/BookSelect';
import { getDefaultBook } from '../../hooks/useBooks';

// ======================================================
// START: Page Component
// ======================================================

const TONE_PILL = { 0: 'blue', 1: 'purple', 2: 'amber' };
// ======================================================
// Function : Modeling
// Purpose  : React component that renders the 'Modeling' UI
// ======================================================

const PROJECTION_YEARS = 4;

export function Modeling() {
    const [basis, setBasis] = useState(0); // real value comes from the DB via /modeling/scenarios
    const [scenarios, setScenarios] = useState([]);
    const [results, setResults] = useState([]);

    // Book / Company / Asset Type filter bar — scopes the asset basis the
    // scenarios are compared against down to whatever slice of the real
    // book the person picks. Each is a checkbox multi-select (with a
    // Select All row) rather than a single dropdown, so any combination
    // of books/companies/asset types can be picked at once. Book only
    // ever has real data for "Federal Tax" in this prototype (same as
    // Reporting's Book filter), so it's offered for consistency but
    // doesn't change the numbers. Company and Asset Type are read from
    // the real asset list, not a hardcoded guess, so the picker never
    // drifts from what's actually on the book.
    // One book at a time — the assets (their method / recovery / schedules) and
    // both result tables below are computed from that book. Picking another
    // book reloads the assets and re-runs the comparison straight away.
    const [book, setBook] = useState(getDefaultBook());
    const [companies, setCompanies] = useState([]);
    const assetClassNames = useAssetClasses();
    const ASSET_TYPE_OPTIONS = useMemo(() => assetClassNames.map((c) => ({ value: c, label: c })), [assetClassNames]);
    const [assetTypes, setAssetTypes] = useState([]);
    // Once the DB list arrives, start with everything selected ("All Types").
    useEffect(() => { setAssetTypes(assetClassNames); }, [assetClassNames]);
    const [allAssets, setAllAssets] = useState([]);

    // Scenario B's bonus chain: bonus-1 and bonus-2 each give the value a
    // "chance to increase" on top of that year's own actual amount, and the
    // resulting final amount rolls forward to become next year's actual
    // amount. The base % (40 / 60 by default) applies to every projected
    // year; a per-year override in the table below carries forward as the
    // new default from that year on, until the next override.
    const [bonusBase, setBonusBase] = useState(40);
    const bonusPctByYear = useMemo(() => Array(PROJECTION_YEARS).fill(bonusBase), [bonusBase]);
    // pendingRerun: set once a NEW book's assets have arrived, so the
    // comparison below re-runs with that book's data (not the old one's).
    const [pendingRerun, setPendingRerun] = useState(false);
    const bookLoadedOnce = useRef(false);
    useEffect(() => {
        let alive = true;
        assetsApi.list({ book }).then((res) => {
            if (!alive) return;
            setAllAssets(res.items ?? []);
            if (bookLoadedOnce.current) setPendingRerun(true);
            bookLoadedOnce.current = true;
        }).catch((err) => console.error('Failed to load assets for modeling:', err));
        return () => { alive = false; };
    }, [book]);
    const companyOptions = useMemo(() => {
        const codes = [...new Set(allAssets.map((a) => a.company).filter(Boolean))].sort();
        return codes.map((code) => ({ value: code, label: companyName(code) }));
    }, [allAssets]);
    useAutoSelectAll(companyOptions, companies, setCompanies);

    // A checkbox group only actually narrows the results once fewer than
    // every known option is checked — all-checked (or, briefly before the
    // options load, zero-checked) means "don't filter on this at all".
    const companyIsFiltering = companyOptions.length > 0 && companies.length > 0 && companies.length < companyOptions.length;
    const assetTypeIsFiltering = assetTypes.length > 0 && assetTypes.length < ASSET_TYPE_OPTIONS.length;

    // The filtered basis is the summed cost of whatever assets match the
    // Company/Asset Type picked, so the scenarios below are genuinely
    // comparing "what would this slice of the book look like" — not just
    // decorative filters. Falls back to the server's default $1.0M
    // illustrative basis when nothing is filtered down (both pickers on
    // "All") or when a filter combination matches zero real assets.
    const filteredAssets = useMemo(() => allAssets.filter((a) => (!companyIsFiltering || companies.includes(a.company)) &&
        (!assetTypeIsFiltering || assetTypes.includes(a.assetClass))), [allAssets, companies, companyIsFiltering, assetTypes, assetTypeIsFiltering]);
    const isFiltering = companyIsFiltering || assetTypeIsFiltering;
    const filteredBasis = filteredAssets.reduce((sum, a) => sum + (a.cost ?? 0), 0);
    const effectiveBasis = isFiltering && filteredBasis > 0 ? filteredBasis : basis;

    // Scenario A ("Current") is supposed to be the real, already-elected
    // treatment for whatever slice of the book is filtered above — not
    // the generic MACRS ADS / 5-year placeholder every filter combo used
    // to show. Once Company + Asset Type narrow down to real assets, pull
    // A's Method/Bonus/Recovery straight off the first matching asset's
    // own tax fact pattern so the "exact" calculation is the real one.
    // recoveryPeriod is a free-text field ("5 years", "9 years"...), so
    // only override it when it actually parses; otherwise keep the
    // placeholder recovery rather than feed NaN into the projection math.
    const currentElection = useMemo(() => {
        if (!isFiltering || filteredAssets.length === 0)
            return null;
        const a = filteredAssets[0];
        const parsedYears = parseInt(a.taxFactPattern?.recoveryPeriod ?? '', 10);
        return {
            method: a.method,
            bonusPct: a.taxFactPattern?.bonusPct ?? 0,
            recoveryPeriodYears: Number.isFinite(parsedYears) && parsedYears > 0 ? parsedYears : null
        };
    }, [isFiltering, filteredAssets]);

    // A resolves to the real election above (or the placeholder when
    // nothing's filtered). B and C are both genuine, independent what-if
    // scenarios — each with its own Method/Bonus %/Recovery — so both stay
    // fully editable rather than C being derived from A + B.
    const resolvedA = useMemo(() => {
        const base = scenarios[0];
        if (!base)
            return null;
        return currentElection
            ? { ...base, method: currentElection.method, bonusPct: currentElection.bonusPct, recoveryPeriodYears: currentElection.recoveryPeriodYears ?? base.recoveryPeriodYears }
            : base;
    }, [scenarios, currentElection]);
    const effectiveScenarios = useMemo(() => scenarios.map((s, i) => (i === 0 ? resolvedA ?? s : s)), [scenarios, resolvedA]);

    useEffect(() => {
        reportsApi.getModelingScenarios().then((res) => {
            setBasis(res.basis);
            setScenarios(res.scenarios);
        });
    }, []);
    // When a Company / Asset Type slice is picked, Baseline (A) is taken
    // from those assets' own depreciation schedules for every projected
    // year (baselineFromSchedules on the server already walks each asset's
    // real forward schedule year by year, so A "chains" on its own actual
    // data with no extra client-side math needed). B and C are each their
    // own independent what-if scenario — every year of each comes straight
    // from calculateScenarioProjection for that scenario's own
    // Method/Bonus %/Recovery, with no dependency on the other columns.
    const baselineAssetKey = isFiltering ? filteredAssets.map((a) => a.assetNumber).join(',') : '';

    // Results (bar chart + side-by-side table) no longer recompute live on
    // every edit — they only refresh when Submit is clicked below, and they
    // refresh in order: A first, then B, then C, so each column visibly
    // fills in in sequence rather than all three flipping at once.
    const [isSubmitting, setIsSubmitting] = useState(false);
    const didInitialLoad = useRef(false);
    async function runComparison() {
        if (effectiveScenarios.length === 0)
            return;
        const baselineAssetNumbers = baselineAssetKey ? baselineAssetKey.split(',') : [];
        setIsSubmitting(true);
        setResults([]);
        for (let upTo = 1; upTo <= effectiveScenarios.length; upTo++) {
            const scenariosSoFar = effectiveScenarios.slice(0, upTo);
            const res = await reportsApi.compareModelingScenarios(effectiveBasis, scenariosSoFar, baselineAssetNumbers, 2026, bonusPctByYear, book);
            setResults(res.results);
        }
        setIsSubmitting(false);
    }
    // First load still needs *something* in the chart/table before anyone
    // has touched Submit, so run the comparison once as soon as the initial
    // scenarios/assets have arrived.
    useEffect(() => {
        if (didInitialLoad.current || effectiveScenarios.length === 0)
            return;
        didInitialLoad.current = true;
        runComparison();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveScenarios]);
    // A different book's assets just landed — run the comparison again on them.
    useEffect(() => {
        if (!pendingRerun || isSubmitting)
            return;
        setPendingRerun(false);
        runComparison();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pendingRerun, allAssets]);
    function updateScenario(i, patch) {
        setScenarios((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
    }
    function handleSubmit() {
        runComparison();
    }
    const yearIdxs = Array.from({ length: results[0]?.yearlyDeduction.length ?? 0 }, (_, i) => i);
    const yearPg = usePagination(yearIdxs);

    return (<AppLayout active="modeling" title="Modeling" crumb="Home / Planning / Modeling">
      <div className="page-header">
        <div>
          <h1>Scenario Modeling</h1>
          <p>Compare depreciation outcomes across tax elections and methods before committing</p>
        </div>
        <Button variant="primary">+ New Scenario</Button>
      </div>

      <div className="card card-pad mb-4">
        <div className="grid grid-2">
          <MultiSelect label="Company" options={companyOptions} selected={companies} onChange={setCompanies} allLabel="All Companies"/>
          <MultiSelect label="Asset Type" options={ASSET_TYPE_OPTIONS} selected={assetTypes} onChange={setAssetTypes} allLabel="All Types"/>
        </div>
        <p className="text-sm text-muted" style={{ marginBottom: 0 }}>
          {isFiltering
            ? (filteredAssets.length > 0
                ? `${filteredAssets.length} asset${filteredAssets.length === 1 ? '' : 's'} matched · basis ${formatCurrency(filteredBasis, { compact: true })}`
                : `No assets match this filter — scenarios below use the default ${formatCurrency(basis, { compact: true })} illustrative basis`)
            : `Showing all companies and asset types · basis ${formatCurrency(basis, { compact: true })}`}
        </p>
        <div className="flex justify-end mt-4">
          <Button variant="primary" onClick={handleSubmit} disabled={isSubmitting}>
            {isSubmitting ? 'Submitting…' : 'Submit'}
          </Button>
        </div>
      </div>

      <div className="grid grid-3 mb-4">
        {effectiveScenarios.map((s, i) => {
            const isEditable = i === 1 || i === 2;
            return (<div className="card card-pad" key={s.label}>
            <div className="flex justify-between items-center mb-4">
              <h3 style={{ fontSize: 14 }}>{s.label}</h3>
              <span className={`pill pill-${TONE_PILL[i] ?? 'gray'}`}>{i === 0 ? 'Current' : 'What-if'}</span>
            </div>
            {isEditable ? (
                i === 1 ? (
                // B (What-if — Bonus) rolls forward each year: each year =
                // a × Bonus%, and that amount becomes next year's "a" —
                // 2026's result rolls into 2027, and so on. Method/Recovery
                // stay pickable like before.
                <>
                  <Select label="Method" value={s.method} onChange={(v) => updateScenario(i, { method: v })} options={['MACRS ADS', 'MACRS 200% DB', 'Straight-Line']}/>
                  <div className="form-row">
                    <Select label="Bonus %" value={String(bonusBase)} onChange={(v) => setBonusBase(Number(v))} options={['0', '40', '60', '100']}/>
                    <div className="hint">≈ {formatCurrency(effectiveBasis * (bonusBase / 100), { compact: true })} on {formatCurrency(effectiveBasis, { compact: true })} basis</div>
                  </div>
                  <Select label="Recovery" value={String(s.recoveryPeriodYears)} onChange={(v) => updateScenario(i, { recoveryPeriodYears: Number(v) })} options={['5', '7', '15', '39']}/>
                </>
                ) : (
                // C is its own independent what-if scenario — own Method,
                // own flat Bonus %, own Recovery.
                <>
                  <Select label="Method" value={s.method} onChange={(v) => updateScenario(i, { method: v })} options={['MACRS ADS', 'MACRS 200% DB', 'Straight-Line']}/>
                  <div className="form-row">
                    <Select label="Bonus %" value={String(s.bonusPct)} onChange={(v) => updateScenario(i, { bonusPct: Number(v) })} options={['0', '40', '60', '100']}/>
                    <div className="hint">≈ {formatCurrency(effectiveBasis * (s.bonusPct / 100), { compact: true })} on {formatCurrency(effectiveBasis, { compact: true })} basis</div>
                  </div>
                  <Select label="Recovery" value={String(s.recoveryPeriodYears)} onChange={(v) => updateScenario(i, { recoveryPeriodYears: Number(v) })} options={['5', '7', '15', '39']}/>
                </>
                )
            ) : (
                // A is the real, already-elected treatment, so it's shown
                // as a fixed value rather than a dropdown.
                <>
                  <div className="form-row">
                    <label>Method</label>
                    <div className="readonly-field">{s.method}</div>
                  </div>
                  <div className="form-row">
                    <label>Bonus %</label>
                    <div className="readonly-field">{s.bonusPct}%</div>
                  </div>
                  <div className="form-row" style={{ marginBottom: 0 }}>
                    <label>Recovery</label>
                    <div className="readonly-field">{s.recoveryPeriodYears} yr</div>
                    {currentElection && <div className="hint">From {filteredAssets[0]?.assetNumber}'s actual tax fact pattern, projected year by year</div>}
                  </div>
                </>
            )}
            {/* Scenario A is read-only (real elected treatment), so it has no Submit — only B and C do. */}
            {isEditable && (<div className="flex justify-end mt-4">
              <Button variant="primary" size="sm" onClick={handleSubmit} disabled={isSubmitting}>
                {isSubmitting ? 'Submitting…' : 'Submit'}
              </Button>
            </div>)}
          </div>);
        })}
      </div>

      <div className="card mb-4">
        <div className="card-head">
          <h3>First-Year Deduction Comparison ({book})</h3>
          <div className="card-head-controls">
            <BookSelect value={book} onChange={setBook} disabled={isSubmitting}/>
            <span className="text-sm text-muted">Asset basis {formatCurrency(effectiveBasis, { compact: true })}</span>
          </div>
        </div>
        <div className="card-pad">
          <BarsChart height={220} data={results.map((r, i) => ({
            month: String.fromCharCode(65 + i),
            value: r.yearlyDeduction[0] ?? 0,
            valueLabel: formatCurrency(r.yearlyDeduction[0] ?? 0, { compact: true })
        }))}/>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Side-by-Side Projection ({book})</h3>
          <BookSelect value={book} onChange={setBook} disabled={isSubmitting}/>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Year</th>
                {results.map((r, i) => (<th className="num" key={r.label}>
                    {String.fromCharCode(65 + i)} — {r.label.split('—')[1]?.trim() ?? r.label}
                  </th>))}
              </tr>
            </thead>
            <tbody>
              {yearPg.pageItems.map((yearIdx) => (<tr key={yearIdx}>
                  <td>{2026 + yearIdx}</td>
                  {results.map((r) => (<td className="num" key={r.label}>
                      {formatCurrency(r.yearlyDeduction[yearIdx] ?? 0, { compact: true })}
                    </td>))}
                </tr>))}
              <tr style={{ fontWeight: 700 }}>
                <td>Cumulative (Yr1–{results[0]?.yearlyDeduction.length ?? 4})</td>
                {results.map((r) => (<td className="num" key={r.label}>
                    {formatCurrency(r.cumulative, { compact: true })}
                  </td>))}
              </tr>
            </tbody>
          </table>
        </div>
        <Pagination {...yearPg.pager}/>
      </div>

    </AppLayout>);
}

// ======================================================
// END: Modeling
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : Modeling.jsx
// ======================================================
