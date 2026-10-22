// ======================================================
// File Name : AssetDetail.jsx
// Purpose   : Page-level component for AssetDetail
// ======================================================

import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { assetsApi } from '../../api/assets.api';
import { AppLayout } from '../../layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { Loader } from '../../components/common/Loader';
import { ErrorMessage } from '../../components/common/ErrorMessage';
import { AssetCard } from '../../components/asset/AssetCard';
import { AssetTransactionsPanel } from '../../components/asset/AssetTransactionsPanel';
import { AuditTrailPanel } from '../../components/asset/AuditTrailPanel';
import { PostEventMenu } from '../../components/asset/PostEventMenu';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDate } from '../../utils/formatDate';
import { useAuth } from '../../context/AuthContext';
import { BookSelect } from '../../components/ui/BookSelect';
import { getDefaultBook, getBookNames } from '../../hooks/useBooks';

// ======================================================
// START: Page Component
// ======================================================

const TABS = ['Overview', 'Depreciation Schedule', 'Transactions', 'Documents', 'Audit Trail'];

// ======================================================
// Function : round2
// Purpose  : Rounds a number to 2 decimal places.
// ======================================================
function round2(n) {
    return Math.round(n * 100) / 100;
}
// ======================================================
// Function : AssetDetail
// Purpose  : React component that renders the 'AssetDetail' UI
// ======================================================

export function AssetDetail() {
    const { assetNumber = '845862189' } = useParams();
    const { hasEdit } = useAuth();
    const canPostEvents = hasEdit('lifecycle');
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('Overview');
    // Which book's view of this asset every table below shows. Opens on the
    // book the Asset Register was on (?book=), else Federal Tax.
    const [searchParams] = useSearchParams();
    const [book, setBook] = useState(() => {
        const fromUrl = searchParams.get('book');
        return fromUrl && getBookNames().includes(fromUrl) ? fromUrl : getDefaultBook();
    });
    const [bookLoading, setBookLoading] = useState(false);
    // Latest book/asset, so a months request that finishes after a switch can be ignored.
    const scopeRef = useRef('');
    const [reloadToken, setReloadToken] = useState(0);
    // Depreciation Schedule (Federal Tax) — clicking a Year row expands it
    // into that year's 12 months, each with its own calculated
    // depreciation amount. Only one year open at a time; months are
    // fetched on first expand and cached per year so re-clicking the same
    // year doesn't re-fetch.
    const [expandedYear, setExpandedYear] = useState(null);
    const [monthlyByYear, setMonthlyByYear] = useState({});
    const [monthlyLoading, setMonthlyLoading] = useState(false);
    const schedulePg = usePagination(data?.depreciationSchedule ?? []);
    const [monthlyError, setMonthlyError] = useState(null);

    function load() {
        setData(null);
        setError(null);
        setReloadToken((t) => t + 1);
    }

    // Loads the asset as the chosen book sees it. Changing only the book
    // keeps the old numbers on screen (dimmed) until the new ones arrive
    // instead of blanking the page; a stale answer for a book the person
    // already switched away from is dropped.
    useEffect(() => {
        let alive = true;
        setBookLoading(true);
        setError(null);
        assetsApi.getByNumber(assetNumber, book)
            .then((res) => { if (alive) setData(res); })
            .catch((err) => { if (alive) setError(err.message ?? 'Failed to load asset'); })
            .finally(() => { if (alive) setBookLoading(false); });
        return () => { alive = false; };
    }, [assetNumber, book, reloadToken]);

    // A fresh asset or a different book means a fresh set of months — don't
    // carry the previous expanded row or cached months over.
    useEffect(() => {
        scopeRef.current = `${assetNumber}|${book}`;
        setExpandedYear(null);
        setMonthlyByYear({});
        setMonthlyError(null);
    }, [assetNumber, book]);

    // Navigating to another asset starts from a clean slate.
    useEffect(() => {
        setData(null);
    }, [assetNumber]);

    function toggleYear(row) {
        const year = Number(row.year.match(/\d{4}/)?.[0]);
        if (!year) return;
        if (expandedYear === year) {
            setExpandedYear(null);
            return;
        }
        setExpandedYear(year);
        setMonthlyError(null);
        if (!monthlyByYear[year]) {
            setMonthlyLoading(true);
            const scope = `${assetNumber}|${book}`;
            assetsApi.getAssetMonthlyDepreciation(assetNumber, year, book)
                .then((res) => { if (scopeRef.current === scope) setMonthlyByYear((prev) => ({ ...prev, [year]: res.months })); })
                .catch((err) => { if (scopeRef.current === scope) setMonthlyError(err.message || 'Failed to load monthly detail'); })
                .finally(() => setMonthlyLoading(false));
        }
    }

    if (error) {
        return (<AppLayout active="detail" title="Asset Detail" crumb={`Home / Asset Register / ${assetNumber}`}>
        <ErrorMessage message={error} onRetry={load}/>
      </AppLayout>);
    }
    if (!data) {
        return (<AppLayout active="detail" title="Asset Detail" crumb={`Home / Asset Register / ${assetNumber}`}>
        <Loader label="Loading asset…"/>
      </AppLayout>);
    }
    const { asset, timeline, depreciationSchedule } = data;
    const pctDepreciated = asset.cost !== 0 ? Math.round((asset.accumDepreciation / asset.cost) * 1000) / 10 : 0;
    return (<AppLayout active="detail" title="Asset Detail" crumb={`Home / Asset Register / ${asset.assetNumber}`}>
      <div className="page-header">
        <div>
          <h1>
            {asset.assetNumber} — {asset.description}
          </h1>
          <p>
            Company {asset.company}
            {asset.costCenter ? ` · Cost Center ${asset.costCenter}` : ''}
            {asset.location ? ` · Location ${asset.location}` : ''}
            {asset.project ? ` · Project ${asset.project}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" to="/assets">
            ← Back
          </Button>
          {canPostEvents && <PostEventMenu assetNumber={asset.assetNumber} assetStatus={asset.status}/>}
          <Button variant="primary" to="/modeling">
            Model Scenario
          </Button>
        </div>
      </div>

      <div className="mb-4" style={{ maxWidth: 360 }}>
        <AssetCard asset={asset}/>
      </div>

      <div className="grid grid-4 mb-4" style={bookLoading ? { opacity: 0.6 } : undefined}>
        <div className="card card-pad stat">
          <span className="label">Gross Cost</span>
          <div className="value" style={{ fontSize: 22 }}>
            {formatCurrency(asset.cost)}
          </div>
        </div>
        <div className="card card-pad stat">
          <span className="label">Accum. Depreciation</span>
          <div className="value" style={{ fontSize: 22 }}>
            {formatCurrency(asset.accumDepreciation)}
          </div>
        </div>
        <div className="card card-pad stat">
          <span className="label">Net Book Value</span>
          <div className="value" style={{ fontSize: 22 }}>
            {formatCurrency(asset.nbv)}
          </div>
        </div>
        <div className="card card-pad stat">
          <span className="label">% Depreciated</span>
          <div className="value" style={{ fontSize: 22 }}>
            {pctDepreciated}%
          </div>
          <div className="bar mt-2">
            <span style={{ width: `${Math.min(Math.abs(pctDepreciated), 100)}%` }}/>
          </div>
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (<div key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t}
          </div>))}
      </div>

      {tab === 'Overview' && (<div className="grid grid-2">
          <div className="card">
            <div className="card-head">
              <h3>{book === getDefaultBook() ? 'Tax Fact Pattern' : 'Book Fact Pattern'}</h3>
              <BookSelect value={book} onChange={setBook} disabled={bookLoading}/>
            </div>
            <div className="card-pad">
              {asset.taxFactPattern ? (<table className="table" style={{ fontSize: 13 }}>
                  <tbody>
                    <tr>
                      <td className="text-muted">Placed In Service</td>
                      <td className="text-right">{formatDate(asset.taxFactPattern.placedInService)}</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Recovery Period</td>
                      <td className="text-right">{asset.taxFactPattern.recoveryPeriod}</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Method</td>
                      <td className="text-right">{asset.taxFactPattern.method}</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Convention</td>
                      <td className="text-right">{asset.taxFactPattern.convention}</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Bonus %</td>
                      <td className="text-right">{asset.taxFactPattern.bonusPct}%</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Annual Rate</td>
                      <td className="text-right">{asset.taxFactPattern.annualRate.toFixed(2)}%</td>
                    </tr>
                    <tr>
                      <td className="text-muted">Property Type</td>
                      <td className="text-right">{asset.taxFactPattern.propertyType}</td>
                    </tr>
                  </tbody>
                </table>) : (<p className="text-muted text-sm">No detailed fact pattern on file for this asset.</p>)}
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Lifecycle Timeline</h3>
              <Button variant="ghost" size="sm" to="/lifecycle">
                Manage →
              </Button>
            </div>
            <div className="card-pad">
              <div className="timeline">
                {timeline.length === 0 && <p className="text-muted text-sm">No lifecycle events recorded.</p>}
                {timeline.map((t) => (<div key={`${t.date}-${t.title}`} className={`tl-item ${t.done ? 'done' : ''}`}>
                    <div className="tl-date">{t.date}</div>
                    <div className="tl-title">{t.title}</div>
                    <div className="tl-desc">{t.description}</div>
                  </div>))}
              </div>
            </div>
          </div>
        </div>)}

      {(tab === 'Overview' || tab === 'Depreciation Schedule') && (<div className="card mt-4">
          <div className="card-head">
            <h3>Depreciation Schedule ({book})</h3>
            <div className="card-head-controls">
              <BookSelect value={book} onChange={setBook} disabled={bookLoading}/>
              <span className="text-sm text-muted">Projected through life · click a year for the monthly breakdown</span>
            </div>
          </div>
          {book !== getDefaultBook() && asset.ruleSource === 'federal-mirror' && (<p className="book-note">
              No {book}-specific rule for asset class {asset.assetClass || '—'}, so these figures mirror Federal Tax. Add one in Configuration → Asset Classes → Customize Table.
            </p>)}
          {book !== getDefaultBook() && asset.ruleSource === 'book-rule' && (<p className="book-note">
              Calculated from the {asset.ruleName} rule in Configuration → Asset Classes.
            </p>)}
          {depreciationSchedule.length === 0 ? (<div className="card-pad">
              <p className="text-muted text-sm">No projected schedule available for this asset yet.</p>
            </div>) : (<div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Year</th>
                    <th className="num">Opening NBV</th>
                    <th className="num">Rate</th>
                    <th className="num">Depreciation</th>
                    <th className="num">Accum. Depr</th>
                    <th className="num">Closing NBV</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulePg.pageItems.map((row) => {
                    const year = Number(row.year.match(/\d{4}/)?.[0]);
                    const isOpen = expandedYear === year;
                    return (<Fragment key={row.year}>
                      <tr onClick={() => toggleYear(row)} style={{ cursor: 'pointer' }}>
                        <td><span style={{ display: 'inline-block', width: 14 }}>{isOpen ? '▾' : '▸'}</span>{row.year}</td>
                        <td className="num" data-label="Opening NBV">{formatCurrency(row.openingNbv, { compact: true })}</td>
                        <td className="num" data-label="Rate">{row.rate.toFixed(2)}%</td>
                        <td className="num" data-label="Depreciation">{formatCurrency(row.depreciation, { compact: true })}</td>
                        <td className="num" data-label="Accum. Depr">{formatCurrency(row.accumDepreciation, { compact: true })}</td>
                        <td className="num" data-label="Closing NBV">{formatCurrency(row.closingNbv, { compact: true })}</td>
                      </tr>
                      {isOpen && (<tr>
                          <td colSpan={6} style={{ background: 'var(--surface-2, #f8fafc)', padding: 0 }}>
                            <div className="card-pad" style={{ paddingTop: 12, paddingBottom: 12 }}>
                              {monthlyLoading && !monthlyByYear[year] ? (<Loader label="Loading months…"/>) : monthlyError ? (
                                <ErrorMessage message={monthlyError} onRetry={() => toggleYear(row)}/>
                              ) : (<div className="table-wrap" style={{ maxHeight: 'none', overflowY: 'visible' }}>
                                  <table className="table" style={{ fontSize: 12 }}>
                                    <tbody>
                                      {(() => {
                                        let runningNbv = row.openingNbv;
                                        let runningAccum = round2(row.accumDepreciation - row.depreciation);
                                        // Months before the placed-in-service month: the asset isn't on the
                                        // books yet, so Opening / Closing NBV (and everything else) are 0.
                                        // placedInService can arrive as "2026-03-15" or as a full JS date
                                        // string ("Sun Mar 15 2026 …"), so try ISO first, then Date parsing.
                                        const pisRaw = String(asset.taxFactPattern?.placedInService ?? '');
                                        const pisIso = /^(\d{4})-(\d{2})/.exec(pisRaw);
                                        const pisDate = pisIso ? null : new Date(pisRaw);
                                        const pisIndex = pisIso
                                            ? Number(pisIso[1]) * 12 + (Number(pisIso[2]) - 1)
                                            : (pisDate && !Number.isNaN(pisDate.getTime()) ? pisDate.getFullYear() * 12 + pisDate.getMonth() : null);
                                        const MONTH_NAMES = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
                                        return (monthlyByYear[year] ?? []).map((m) => {
                                          const monthIdx = MONTH_NAMES.indexOf(String(m.month).slice(0, 3).toLowerCase());
                                          const notYetInService = pisIndex !== null && monthIdx >= 0 && year * 12 + monthIdx < pisIndex;
                                          if (notYetInService) {
                                            return (<tr key={m.month}>
                                              <td>{m.month}</td>
                                              <td className="num" data-label="Opening NBV">{formatCurrency(0, { compact: true })}</td>
                                              <td className="num" data-label="Rate">—</td>
                                              <td className="num" data-label="Depreciation">{formatCurrency(0, { compact: true })}</td>
                                              <td className="num" data-label="Accum. Depr">{formatCurrency(0, { compact: true })}</td>
                                              <td className="num" data-label="Closing NBV">{formatCurrency(0, { compact: true })}</td>
                                            </tr>);
                                          }
                                          const opening = runningNbv;
                                          const closing = round2(opening - m.value);
                                          runningNbv = closing;
                                          runningAccum = round2(runningAccum + m.value);
                                          return (<tr key={m.month}>
                                            <td>{m.month}{m.projected ? ' *' : ''}</td>
                                            <td className="num" data-label="Opening NBV">{formatCurrency(opening, { compact: true })}</td>
                                            <td className="num" data-label="Rate">{row.rate.toFixed(2)}%</td>
                                            <td className="num" data-label="Depreciation">{formatCurrency(m.value, { compact: true })}</td>
                                            <td className="num" data-label="Accum. Depr">{formatCurrency(runningAccum, { compact: true })}</td>
                                            <td className="num" data-label="Closing NBV">{formatCurrency(closing, { compact: true })}</td>
                                          </tr>);
                                        });
                                      })()}
                                    </tbody>
                                  </table>
                                  {(monthlyByYear[year] ?? []).some((m) => m.projected) && (<p className="text-sm text-muted mt-1" style={{ marginBottom: 0 }}>* projected — this month hasn't happened yet, calculated from this asset's own forward schedule.</p>)}
                                </div>)}
                            </div>
                          </td>
                        </tr>)}
                    </Fragment>);
                  })}
                </tbody>
              </table>
              <Pagination {...schedulePg.pager}/>
            </div>)}
        </div>)}

      {tab === 'Transactions' && (<div className="card">
          <div className="card-head">
            <h3>Posted Transactions</h3>
            <span className="text-sm text-muted">From Postgres · click a row for the full calculation</span>
          </div>
          <AssetTransactionsPanel assetNumber={asset.assetNumber}/>
        </div>)}

      {tab === 'Audit Trail' && (<div className="card">
          <div className="card-head">
            <h3>Audit Trail</h3>
            <span className="text-sm text-muted">Who changed what, and when · from Postgres</span>
          </div>
          <div className="card-pad">
            <AuditTrailPanel assetNumber={asset.assetNumber}/>
          </div>
        </div>)}

      {tab === 'Documents' && (<div className="card card-pad">
          <p className="text-muted text-sm">Documents isn't wired up in this scaffold yet — no file storage is connected.</p>
        </div>)}
    </AppLayout>);
}


// ======================================================
// END: AssetDetail
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : AssetDetail.jsx
// ======================================================
