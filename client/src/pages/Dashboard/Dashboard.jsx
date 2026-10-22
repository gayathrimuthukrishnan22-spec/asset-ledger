// ======================================================
// File Name : Dashboard.jsx
// Purpose   : Page-level component for Dashboard
// ======================================================

import { useEffect, useRef, useState } from 'react';
import { assetsApi } from '../../api/assets.api';
import { AppLayout } from '../../layout/AppLayout';
import { BarsChart, Donut, StatCard } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { Loader } from '../../components/common/Loader';
import { EmptyState } from '../../components/common/EmptyState';
import { formatCurrency } from '../../utils/formatCurrency';
import { BookSelect } from '../../components/ui/BookSelect';
import { getDefaultBook } from '../../hooks/useBooks';

// ======================================================
// START: Page Component
// ======================================================

// ======================================================
// Function : Dashboard
// Purpose  : React component that renders the 'Dashboard' UI
// ======================================================

const CURRENT_YEAR = new Date().getFullYear();
// Dropdown spans 5 fiscal years back and 5 forward from today. Past years
// pull real posted depreciation; future years pull that same asset's own
// forward schedule rows (the projections Forecasting already shows) — so
// every option is a real calculation, not a placeholder.
const FY_OPTIONS = Array.from({ length: 11 }, (_, i) => CURRENT_YEAR - 5 + i);

export function Dashboard() {
    const [summary, setSummary] = useState(null);
    // Which book every card on this page is showing. Changing it reloads
    // the KPI cards, the Monthly Depreciation chart and Assets by Class
    // with that book's numbers (Federal Tax is what the page always showed).
    const [book, setBook] = useState(getDefaultBook());
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [fy, setFy] = useState(CURRENT_YEAR);
    // Two six-month halves instead of showing/scrolling through all 12
    // months at once — H1 = Jan–Jun, H2 = Jul–Dec. Defaults to whichever
    // half contains today's month when viewing the current year.
    const [half, setHalf] = useState(new Date().getMonth() < 6 ? 'H1' : 'H2');
    const [monthlyDepreciation, setMonthlyDepreciation] = useState(null);
    const [monthlyLoading, setMonthlyLoading] = useState(true);
    const [monthlyError, setMonthlyError] = useState(null);
    // Was hardcoded to "April period" — now reflects whatever month/year
    // it actually is when the dashboard renders, so the header line
    // stays true instead of silently going stale after April.
    const periodLabel = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });
    // A slow answer for a book the person has already switched away from
    // must not overwrite the newer one — `alive` drops it.
    useEffect(() => {
        let alive = true;
        setSummaryLoading(true);
        assetsApi.getDashboardSummary(book)
            .then((res) => { if (alive) setSummary(res); })
            .catch((err) => console.error('Failed to load dashboard summary:', err))
            .finally(() => { if (alive) setSummaryLoading(false); });
        return () => { alive = false; };
    }, [book]);
    // Re-fetch the Monthly Depreciation Expense chart whenever the FY
    // dropdown changes — each year's 12 months are calculated live from
    // the asset ledger, not pre-baked, so past and future years both work.
    // A failed request must still clear the loading flag — otherwise the
    // card is stuck on "Loading depreciation…" forever with no way out.
    // Only the newest request may write to the chart — switching book (or year)
    // quickly must not let a slow, older answer overwrite the newer one.
    const monthlySeq = useRef(0);
    const loadMonthlyDepreciation = (year, forBook = book) => {
        const seq = ++monthlySeq.current;
        setMonthlyLoading(true);
        setMonthlyError(null);
        assetsApi.getMonthlyDepreciation(year, forBook)
            .then((res) => {
                if (seq === monthlySeq.current) setMonthlyDepreciation(res.months);
            })
            .catch((err) => {
                if (seq !== monthlySeq.current) return;
                console.error('Failed to load monthly depreciation:', err);
                setMonthlyError(err.message || 'Failed to load depreciation data');
            })
            .finally(() => { if (seq === monthlySeq.current) setMonthlyLoading(false); });
    };
    useEffect(() => {
        loadMonthlyDepreciation(fy, book);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fy, book]);
    // Auto-refresh the dashboard when a new month begins so the chart opens the new month
    useEffect(() => {
      const now = new Date();
      const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const msUntilNextMonth = nextMonth.getTime() - now.getTime();
      const t = setTimeout(() => {
        assetsApi.getDashboardSummary(book).then(setSummary).catch((err) => console.error('Failed to load dashboard summary:', err));
        loadMonthlyDepreciation(fy, book);
      }, msUntilNextMonth + 1000);
      return () => clearTimeout(t);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [fy, book]);
    return (<AppLayout active="dashboard" title="Dashboard" crumb="Home / Dashboard">
      <div className="page-header">
        <div>
          <h1>Portfolio Dashboard</h1>
          <p>Fixed asset overview for {periodLabel} · {book} book</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" disabled title="Export is coming soon">
            Export
          </Button>
          <Button variant="primary" to="/lifecycle">
            + New Transaction
          </Button>
        </div>
      </div>

      {!summary && <Loader label="Loading dashboard…"/>}

      {summary && (<>
          <div className="grid grid-4 mb-4" style={summaryLoading ? { opacity: 0.6 } : undefined}>
            <StatCard label="Total Assets" value={summary.totalAssets.toLocaleString()} icon="▦" icoClass="ico-blue" delta={`▲ ${summary.addedThisPeriod} added this period`} deltaDirection="up"/>
            <StatCard label="Gross Cost" value={formatCurrency(summary.grossCost, { compact: true })} icon="$" icoClass="ico-teal" delta={`▲ ${summary.grossCostYtdDeltaPct}% YTD`} deltaDirection="up"/>
            <StatCard label="Net Book Value" value={formatCurrency(summary.netBookValue, { compact: true })} icon="◈" icoClass="ico-purple" delta={`▼ ${Math.abs(summary.depreciationDeltaPct)}% depreciation`} deltaDirection="down"/>
            <StatCard label="YTD Depreciation" value={formatCurrency(summary.ytdDepreciation, { compact: true })} icon="▼" icoClass="ico-amber" delta="On schedule" deltaDirection="up"/>
          </div>

          <div className="grid grid-2 mb-4">
            <div className="card">
              <div className="card-head">
                <h3>Monthly Depreciation Expense</h3>
                <div className="card-head-controls">
                  <BookSelect value={book} onChange={setBook} disabled={monthlyLoading}/>
                  <div className="half-toggle" role="group" aria-label="Half of the fiscal year">
                    <button
                      type="button"
                      className={`half-toggle-btn${half === 'H1' ? ' active' : ''}`}
                      onClick={() => setHalf('H1')}
                    >
                      Jan–Jun
                    </button>
                    <button
                      type="button"
                      className={`half-toggle-btn${half === 'H2' ? ' active' : ''}`}
                      onClick={() => setHalf('H2')}
                    >
                      Jul–Dec
                    </button>
                  </div>
                  <select
                    className="fy-select"
                    value={fy}
                    onChange={(e) => setFy(Number(e.target.value))}
                    aria-label="Fiscal year"
                  >
                    {FY_OPTIONS.map((y) => (
                      <option key={y} value={y}>
                        FY{y}{y === CURRENT_YEAR ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="card-pad">
                {monthlyLoading ? (
                  <Loader label="Loading depreciation…" />
                ) : monthlyError ? (
                  <EmptyState
                    title="Couldn't load depreciation data"
                    description={monthlyError}
                    action={<Button onClick={() => loadMonthlyDepreciation(fy)}>Retry</Button>}
                  />
                ) : !monthlyDepreciation ? (
                  <EmptyState title="No depreciation data" description={`No depreciation activity for FY${fy}.`} />
                ) : (() => {
                    const halfMonths = half === 'H1' ? monthlyDepreciation.slice(0, 6) : monthlyDepreciation.slice(6, 12);
                    return (<>
                      <BarsChart data={halfMonths} />
                      <p className="chart-note">
                        {half === 'H1' ? 'Jan–Jun' : 'Jul–Dec'} {fy}, {book} depreciation in dollars.
                        {halfMonths.some((m) => m.value > 0) && (() => {
                          const last = [...halfMonths].reverse().find((m) => m.value > 0);
                          return ` Latest month ${last.valueLabel ?? ''} across ${last.assetCount ?? 0} depreciating assets.`;
                        })()}
                      </p>
                    </>);
                  })()}
              </div>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>Assets by Class</h3>
                <div className="card-head-controls">
                  <BookSelect value={book} onChange={setBook} disabled={summaryLoading}/>
                  <span className="link">By NBV</span>
                </div>
              </div>
              <div className="card-pad flex items-center gap-4" style={{ gap: 28, flexWrap: 'wrap', minWidth: 0 }}>
                <Donut segments={summary.assetsByClass.map((c) => ({ pct: c.pct, color: c.color }))}/>
                <div className="legend" style={{ flex: '1 1 160px', minWidth: 0 }}>
                  {summary.assetsByClass.map((c) => (<div className="li" key={c.label}>
                      <span className="dot" style={{ background: c.color }}/>
                      {c.label} · {c.pct}%
                    </div>))}
                </div>
              </div>
            </div>
          </div>
        </>)}
    </AppLayout>);
}

// ======================================================
// END: Dashboard
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : Dashboard.jsx
// ======================================================
