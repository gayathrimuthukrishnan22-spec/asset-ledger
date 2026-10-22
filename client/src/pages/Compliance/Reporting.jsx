// ======================================================
// File Name : Reporting.jsx
// Purpose   : Page-level component for Reporting
// ======================================================

import { useEffect, useMemo, useState } from 'react';
import { reportsApi } from '../../api/reports.api';
import { assetsApi } from '../../api/assets.api';
import { useAuth } from '../../hooks/useAuth';
import { AppLayout } from '../../layout/AppLayout';
import { Pill } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Input, Select } from '../../components/ui/Input';
import { Modal } from '../../components/ui/Modal';
import { MultiSelect } from '../../components/ui/MultiSelect';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorMessage } from '../../components/common/ErrorMessage';
import { formatDate } from '../../utils/formatDate';
import { companyName } from '../../utils/companies';
import { downloadCsv } from '../../utils/csv';
import { getDefaultBook, getBookNames } from '../../hooks/useBooks';
import { useAutoSelectAll } from '../../hooks/useAutoSelectAll';

// ======================================================
// START: Page Component
// ======================================================

const ICO = {
    'depreciation-detail': 'ico-blue',
    'roll-forward': 'ico-teal',
    'form-4562': 'ico-purple'
};
const ICON = {
    'depreciation-detail': '▤',
    'roll-forward': '↻',
    'form-4562': '⊞'
};
const STATUS_TONE = { Ready: 'green', Draft: 'amber', Processing: 'blue' };

// Every maintained book (same list every Book dropdown in the app uses).
// A generated report contains the rows of EACH book ticked here, each
// row tagged with its Book — figures come from that book's own rules.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const FREQUENCY_OPTIONS = ['Daily', 'Monthly', 'Quarterly', 'Half-Yearly'];
// Focus Period's Year select. The past end is a fixed anchor year (30
// years before this was built) — a literal number, not derived from
// "today" — so it never moves and never drops a year that was already
// in the list. The future end is CURRENT_YEAR + 30, recomputed live, so
// as real time moves forward new upcoming years keep getting appended
// automatically without anything at the start ever being removed.
const CURRENT_YEAR = new Date().getFullYear();
const MIN_YEAR = 1996; // = 2026 - 30, fixed at build time
const YEAR_OPTIONS = Array.from({ length: CURRENT_YEAR + 30 - MIN_YEAR + 1 }, (_, i) => MIN_YEAR + i);

const CSV_COLUMNS = [
    { header: 'Book', get: (a) => a.book ?? getDefaultBook() },
    { header: 'Asset Number', get: (a) => a.assetNumber },
    { header: 'Description', get: (a) => a.description },
    { header: 'Asset Class', get: (a) => a.assetClass },
    { header: 'Company', get: (a) => a.company },
    { header: 'Cost', get: (a) => a.cost },
    { header: 'Accum. Depreciation', get: (a) => a.accumDepreciation },
    { header: 'NBV', get: (a) => a.nbv },
    { header: 'Method', get: (a) => a.method },
    { header: 'Status', get: (a) => a.status }
];

// ======================================================
// Function : csvCell
// Purpose  : Quotes a CSV cell only when it needs it (contains a comma,
//            quote, or newline), doubling any embedded quotes — same
//            escaping rule utils/csv.js's parser expects on the way in.
// ======================================================

function csvCell(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// ======================================================
// END: csvCell
// ======================================================

// ======================================================
// Function : slugify
// Purpose  : Turns a free-typed report name into a safe CSV filename.
// ======================================================

function slugify(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'report';
}

// ======================================================
// END: slugify
// ======================================================

// ======================================================
// Function : buildCsvText
// Purpose  : Renders a set of asset rows (CSV_COLUMNS) into CSV text,
//            shared by the Custom Report and Scheduled Report cards.
// ======================================================

function buildCsvText(rows) {
    const lines = [
        CSV_COLUMNS.map((c) => csvCell(c.header)).join(','),
        ...rows.map((a) => CSV_COLUMNS.map((c) => csvCell(c.get(a))).join(','))
    ];
    return lines.join('\n') + '\n';
}

// ======================================================
// END: buildCsvText
// ======================================================

// ======================================================
// Function : filterAssets
// Purpose  : Narrows an asset list to the chosen companies and asset
//            types (Frequency on the Scheduled card only labels the run).
// ======================================================

function filterAssets(allAssets, companies, assetTypes) {
    const companySet = new Set(companies);
    const assetTypeSet = new Set(assetTypes);
    return allAssets.filter((a) => companySet.has(a.company) && assetTypeSet.has(a.assetClass));
}

// ======================================================
// Function : collectBookRows
// Purpose  : The rows of a report: for every ticked book, that book's
//            view of the assets (its own accumulated depreciation, NBV
//            and method) narrowed to the chosen companies / asset types.
//            Books are fetched in parallel; each row carries its `book`.
// ======================================================

async function collectBookRows(books, companies, assetTypes) {
    const perBook = await Promise.all(books.map((b) => assetsApi.list({ book: b })));
    return perBook.flatMap((res, i) => filterAssets((res.items ?? []).map((a) => ({ ...a, book: a.book ?? books[i] })), companies, assetTypes));
}

// ======================================================
// END: filterAssets
// ======================================================

// ======================================================
// Function : toIsoDate
// Purpose  : Local Y-M-D (no UTC shift) so formatDate() displays the
//            intended calendar day regardless of viewer timezone.
// ======================================================

function toIsoDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// ======================================================
// END: toIsoDate
// ======================================================

// ======================================================
// Function : NewReportCard
// Purpose  : "+ Custom Report" modal — report name, focus period (start/
//            end month), and Book/Company/Asset Type multi-selects (each
//            with a Select All toggle). On submit, filters the already-
//            loaded asset list by the chosen companies/asset types,
//            downloads the result as CSV, and records the run so it
//            shows up in "Recently Generated Reports".
// ======================================================

function NewReportCard({ open, onClose, allAssets, onGenerated, initialName }) {
    const { user } = useAuth();
    const [name, setName] = useState('');
    const [periodStart, setPeriodStart] = useState('Jan');
    const [periodEnd, setPeriodEnd] = useState('Dec');
    const [periodYear, setPeriodYear] = useState(CURRENT_YEAR);
    const [books, setBooks] = useState([getDefaultBook()]);
    const [companies, setCompanies] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [error, setError] = useState(null);
    const [generating, setGenerating] = useState(false);

    // Clicking a catalog tile (e.g. "Depreciation Detail") opens this same
    // modal with Report Name pre-filled to that tile's name, instead of a
    // separate flow per report type — the person can still edit it before
    // generating.
    useEffect(() => {
        if (open) setName(initialName ?? '');
    }, [open, initialName]);

    const companyOptions = useMemo(() => {
        const codes = [...new Set(allAssets.map((a) => a.company).filter(Boolean))].sort();
        return codes.map((code) => ({ value: code, label: companyName(code) }));
    }, [allAssets]);

    const assetTypeOptions = useMemo(() => {
        const types = [...new Set(allAssets.map((a) => a.assetClass).filter(Boolean))].sort();
        return types.map((t) => ({ value: t, label: t }));
    }, [allAssets]);

    useAutoSelectAll(companyOptions, companies, setCompanies);
    useAutoSelectAll(assetTypeOptions, assetTypes, setAssetTypes);

    function reset() {
        setName('');
        setPeriodStart('Jan');
        setPeriodEnd('Dec');
        setPeriodYear(CURRENT_YEAR);
        setBooks([getDefaultBook()]);
        setCompanies(companyOptions.map((o) => o.value));
        setAssetTypes(assetTypeOptions.map((o) => o.value));
        setError(null);
    }

    function handleClose() {
        reset();
        onClose();
    }

    async function handleGenerate() {
        setError(null);
        if (!name.trim()) {
            setError('Report name is required.');
            return;
        }
        if (books.length === 0) {
            setError('Pick at least one book.');
            return;
        }
        if (companies.length === 0) {
            setError('Pick at least one company.');
            return;
        }
        if (assetTypes.length === 0) {
            setError('Pick at least one asset type.');
            return;
        }

        const period = periodStart === periodEnd ? `${periodStart} ${periodYear}` : `${periodStart}–${periodEnd} ${periodYear}`;
        const bookLabel = books.length === getBookNames().length ? 'All Books' : books.join(', ');

        setGenerating(true);
        try {
            const rows = await collectBookRows(books, companies, assetTypes);
            const csvText = buildCsvText(rows);
            downloadCsv(`${slugify(name)}.csv`, csvText);
            const created = await reportsApi.generateReport({
                name: name.trim(),
                book: bookLabel,
                period,
                generatedBy: user?.name ?? 'System',
                format: 'CSV',
                csvContent: csvText
            });
            onGenerated(created);
            handleClose();
        } catch (err) {
            setError(err.message || 'Failed to save the report run.');
        } finally {
            setGenerating(false);
        }
    }

    return (<Modal open={open} title="New Custom Report" onClose={handleClose} footer={<div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={handleClose} disabled={generating}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate} disabled={generating}>{generating ? 'Generating…' : 'Generate Report'}</Button>
        </div>}>
      <Input label="Report Name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Depreciation Detail — Q1"/>

      <div className="form-row">
        <label>Focus Period</label>
        <div className="grid grid-3" style={{ gap: 10 }}>
          <select value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}>
            {MONTHS.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <select value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}>
            {MONTHS.map((m) => (<option key={m} value={m}>{m}</option>))}
          </select>
          <select value={periodYear} onChange={(e) => setPeriodYear(Number(e.target.value))}>
            {YEAR_OPTIONS.map((y) => (<option key={y} value={y}>{y}</option>))}
          </select>
        </div>
        <div className="hint">Start defaults to Jan, end defaults to Dec — covers the full year unless narrowed.</div>
      </div>

      <MultiSelect label="Book" options={getBookNames().map((b) => ({ value: b, label: b }))} selected={books} onChange={setBooks}/>
      <MultiSelect label="Company" options={companyOptions} selected={companies} onChange={setCompanies}/>
      <MultiSelect label="Asset Type" options={assetTypeOptions} selected={assetTypes} onChange={setAssetTypes}/>

      {error && <ErrorMessage message={error}/>}
    </Modal>);
}

// ======================================================
// END: NewReportCard
// ======================================================

// ======================================================
// Function : ScheduledReportCard
// Purpose  : "Scheduled" catalog tile's modal — Report Frequency
//            (Daily/Monthly/Quarterly/Half-Yearly) plus the same Book/
//            Company/Asset Type multi-selects as the Custom Report
//            card. Focus Period is fixed, not picked: start is always
//            Jan 1 of the current year, end is always the last day of
//            the previous month (i.e. "everything completed so far this
//            year"), recomputed fresh each time the card opens.
// ======================================================

function ScheduledReportCard({ open, onClose, allAssets, onGenerated }) {
    const { user } = useAuth();
    const [frequency, setFrequency] = useState('Monthly');
    const [books, setBooks] = useState([getDefaultBook()]);
    const [companies, setCompanies] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [error, setError] = useState(null);
    const [generating, setGenerating] = useState(false);

    const companyOptions = useMemo(() => {
        const codes = [...new Set(allAssets.map((a) => a.company).filter(Boolean))].sort();
        return codes.map((code) => ({ value: code, label: companyName(code) }));
    }, [allAssets]);

    const assetTypeOptions = useMemo(() => {
        const types = [...new Set(allAssets.map((a) => a.assetClass).filter(Boolean))].sort();
        return types.map((t) => ({ value: t, label: t }));
    }, [allAssets]);

    useAutoSelectAll(companyOptions, companies, setCompanies);
    useAutoSelectAll(assetTypeOptions, assetTypes, setAssetTypes);

    // Recomputed on every render the modal is open (cheap, and keeps the
    // range correct if it's left open across a real month/year rollover)
    // rather than once on mount.
    const { startIso, endIso, hasCompleteMonth } = useMemo(() => {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1); // Jan 1, current year
        const end = new Date(now.getFullYear(), now.getMonth(), 0); // last day of previous month
        return { startIso: toIsoDate(start), endIso: toIsoDate(end), hasCompleteMonth: end >= start };
    }, [open]);

    function reset() {
        setFrequency('Monthly');
        setBooks([getDefaultBook()]);
        setCompanies(companyOptions.map((o) => o.value));
        setAssetTypes(assetTypeOptions.map((o) => o.value));
        setError(null);
    }

    function handleClose() {
        reset();
        onClose();
    }

    async function handleGenerate() {
        setError(null);
        if (!hasCompleteMonth) {
            setError('No completed month yet this year — check back after month-end.');
            return;
        }
        if (books.length === 0) {
            setError('Pick at least one book.');
            return;
        }
        if (companies.length === 0) {
            setError('Pick at least one company.');
            return;
        }
        if (assetTypes.length === 0) {
            setError('Pick at least one asset type.');
            return;
        }

        const bookLabel = books.length === getBookNames().length ? 'All Books' : books.join(', ');
        const period = `${formatDate(startIso)} – ${formatDate(endIso)}`;
        const name = `Scheduled — ${frequency}`;

        setGenerating(true);
        try {
            const rows = await collectBookRows(books, companies, assetTypes);
            const csvText = buildCsvText(rows);
            downloadCsv(`${slugify(name)}-${startIso}-to-${endIso}.csv`, csvText);
            const created = await reportsApi.generateReport({
                name: `${name} (${period})`,
                book: bookLabel,
                period,
                generatedBy: user?.name ?? 'System',
                format: 'CSV',
                csvContent: csvText
            });
            onGenerated(created);
            handleClose();
        } catch (err) {
            setError(err.message || 'Failed to save the report run.');
        } finally {
            setGenerating(false);
        }
    }

    return (<Modal open={open} title="Scheduled Report" onClose={handleClose} footer={<div className="flex gap-2" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={handleClose} disabled={generating}>Cancel</Button>
          <Button variant="primary" onClick={handleGenerate} disabled={generating || !hasCompleteMonth}>{generating ? 'Generating…' : 'Generate Report'}</Button>
        </div>}>
      <Select label="Report Frequency" value={frequency} onChange={setFrequency} options={FREQUENCY_OPTIONS}/>

      <div className="form-row">
        <label>Focus Period</label>
        <div className="readonly-field">{hasCompleteMonth ? `${formatDate(startIso)} – ${formatDate(endIso)}` : 'No completed month yet this year'}</div>
        <div className="hint">Always the start of this year through the end of last month — updates automatically as months close.</div>
      </div>

      <MultiSelect label="Book" options={getBookNames().map((b) => ({ value: b, label: b }))} selected={books} onChange={setBooks}/>
      <MultiSelect label="Company" options={companyOptions} selected={companies} onChange={setCompanies}/>
      <MultiSelect label="Asset Type" options={assetTypeOptions} selected={assetTypes} onChange={setAssetTypes}/>

      {error && <ErrorMessage message={error}/>}
    </Modal>);
}

// ======================================================
// END: ScheduledReportCard
// ======================================================

// ======================================================
// Function : Reporting
// Purpose  : React component that renders the 'Reporting' UI
// ======================================================

export function Reporting() {
    const [catalog, setCatalog] = useState([]);
    const [recent, setRecent] = useState([]);
    const [allAssets, setAllAssets] = useState([]);
    const [modalOpen, setModalOpen] = useState(false);
    const [presetName, setPresetName] = useState('');
    const [scheduledOpen, setScheduledOpen] = useState(false);
    const [bookFilter, setBookFilter] = useState('All Books');

    useEffect(() => {
        reportsApi.getCatalog().then(setCatalog);
        reportsApi.getRecent().then(setRecent);
        assetsApi.list({}).then((res) => setAllAssets(res.items ?? []));
    }, []);

    function openCustomReport(name) {
        setPresetName(name ?? '');
        setModalOpen(true);
    }

    function handleGenerated(created) {
        // Prepend the just-created row so it shows immediately without
        // waiting on the 5s admin cache TTL server-side.
        setRecent((prev) => [created, ...prev]);
    }

    // Download button on a "Ready" row: reports generated after this
    // feature shipped carry their own csvContent, downloaded as-is. Older
    // rows (generated before csvContent was stored) have none, so fall
    // back to the full current asset list — the closest honest
    // reconstruction available, since the original company/asset-type
    // filter for those runs was never persisted.
    function handleDownload(row) {
        const text = row.csvContent && row.csvContent.trim() ? row.csvContent : buildCsvText(allAssets);
        downloadCsv(`${slugify(row.name)}.csv`, text);
    }

    // A report matches a book when it was generated for that book, for a list
    // of books that includes it, or for "All Books".
    const visibleRecent = bookFilter === 'All Books'
        ? recent
        : recent.filter((r) => r.book === 'All Books' || String(r.book ?? '').split(', ').includes(bookFilter));

    const columns = [
        { header: 'Report', render: (r) => r.name },
        { header: 'Book', render: (r) => r.book },
        { header: 'Period', render: (r) => r.period },
        { header: 'Generated By', render: (r) => r.generatedBy },
        { header: 'Date', render: (r) => formatDate(r.date) },
        { header: 'Format', render: (r) => r.format },
        { header: 'Status', render: (r) => <Pill tone={STATUS_TONE[r.status] ?? 'gray'}>{r.status}</Pill> },
        {
            header: '',
            render: (r) => (r.status === 'Ready' ? (<button type="button" className="btn btn-ghost btn-sm" onClick={() => handleDownload(r)} title={`Download ${r.name}`}>
                ⬇ Download
              </button>) : null)
        }
    ];
    return (<AppLayout active="reporting" title="Reporting" crumb="Home / Reporting">
      <div className="page-header">
        <div>
          <h1>Reporting Center</h1>
          <p>Generate standard and custom fixed-asset reports for tax, book, and audit</p>
        </div>
        <Button variant="primary" onClick={() => openCustomReport('')}>+ Custom Report</Button>
      </div>

      <div className="grid grid-3 mb-4">
        {catalog.map((r) => {
          // Tax Form 4562 is display-only: clicking it does nothing (no modal).
          const inactive = r.key === 'form-4562';
          return (<div className={`report-card${inactive ? ' report-card-inactive' : ''}`} key={r.key} onClick={inactive ? undefined : () => openCustomReport(r.name)} style={inactive ? undefined : { cursor: 'pointer' }}>
            <div className={`ri ${ICO[r.key] ?? 'ico-blue'}`}>{ICON[r.key] ?? '▤'}</div>
            <div>
              <h4>{r.name}</h4>
              <p>{r.description}</p>
            </div>
          </div>);
        })}
        <div className="report-card" onClick={() => setScheduledOpen(true)}>
          <div className="ri ico-navy">⏱</div>
          <div>
            <h4>Scheduled</h4>
            <p>Recurring report by frequency, scoped from Jan 1 through last month-end</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Recently Generated Reports</h3>
          <select className="btn btn-ghost btn-sm" value={bookFilter} onChange={(e) => setBookFilter(e.target.value)}>
            <option>All Books</option>
            {getBookNames().map((b) => (<option key={b}>{b}</option>))}
          </select>
        </div>
        {visibleRecent.length === 0 ? (<EmptyState title="No reports generated yet" description="Reports you generate will show up here."/>) : (<Table columns={columns} rows={visibleRecent} rowKey={(r) => `${r.name}-${r.date}`}/>)}
      </div>

      <NewReportCard open={modalOpen} onClose={() => setModalOpen(false)} allAssets={allAssets} onGenerated={handleGenerated} initialName={presetName}/>
      <ScheduledReportCard open={scheduledOpen} onClose={() => setScheduledOpen(false)} allAssets={allAssets} onGenerated={handleGenerated}/>
    </AppLayout>);
}

// ======================================================
// END: Reporting
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : Reporting.jsx
// ======================================================
