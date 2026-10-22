// ======================================================
// File Name : BulkImport.jsx
// Purpose   : Page-level component for BulkImport — six cards, one per
//             Lifecycle Event type, each letting you download a CSV
//             template for that event, upload a filled-in CSV, and
//             bulk-post every row in one go. Existing Lifecycle Events
//             page/flow is untouched — this is a new, separate page.
// ======================================================

import { useState } from 'react';
import { lifecycleApi } from '../../api/lifecycle.api';
import { AppLayout } from '../../layout/AppLayout';
import { Pill } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { FIELD_SCHEMAS } from '../../data/lifecycleFormSchemas';
import { useFormOptions } from '../../hooks/useFormOptions';
import {
    parseCsv,
    buildTemplateCsv,
    downloadCsv,
    rowsToLifecycleRows,
    findUnmatchedSelectValues,
    getUnifiedHeaders,
    buildUnifiedTemplateCsv,
    rowsToBulkPostRows,
    findUnmatchedSelectValuesUnified,
    resolveEventId,
    EVENT_LABELS
} from '../../utils/csv';
import { useAuth } from '../../hooks/useAuth';

// ======================================================
// START: Page Component
// ======================================================

// Same six event types the Lifecycle Events page offers — kept local
// here (rather than fetched) so the six cards render immediately.
// Matches server/src/routes/lifecycle.ts EVENT_TYPES exactly (id + label
// are what the API expects).
const EVENT_TYPES = [
    { id: 'addition', label: 'Addition', description: 'Capitalize new assets into service', icon: '＋', color: 'green' },
    { id: 'adjustment', label: 'Adjustment', description: 'Change cost basis of existing assets', icon: '✎', color: 'blue' },
    { id: 'transfer', label: 'Transfer', description: 'Move assets between org units', icon: '⇄', color: 'teal' },
    { id: 'retirement', label: 'Retirement', description: 'Dispose or write off assets', icon: '⊗', color: 'red' },
    { id: 'reinstatement', label: 'Reinstatement', description: 'Restore previously retired assets', icon: '↺', color: 'purple' },
    { id: 'reclassification', label: 'Reclassification', description: 'Change method, life, or convention', icon: '⇅', color: 'amber' }
];

// ======================================================
// Function : BulkImport
// Purpose  : React component that renders the 'BulkImport' UI
// ======================================================

export function BulkImport() {
    useFormOptions();
    const { user, hasEdit } = useAuth();
    const canImport = hasEdit('bulk-import');
    return (<AppLayout active="bulk-import" title="Bulk Import" crumb="Home / Lifecycle Events / Bulk Import">
      <div className="page-header">
        <div>
          <h1>Bulk Import Lifecycle Events</h1>
          <p>Upload a CSV per event type to post many transactions at once — or use Master Data Set to mix any assets and any event types in one CSV.</p>
        </div>
        <Button variant="ghost" to="/lifecycle/service-api">Test Service API →</Button>
      </div>

      <div className="grid grid-2">
        {EVENT_TYPES.map((evt) => (<EventImportCard key={evt.id} evt={evt} user={user}/>))}
        <MasterDataSetImportCard user={user}/>
      </div>
    </AppLayout>);
}

// ======================================================
// Function : findDuplicateAssetNumbers
// Purpose  : Asset numbers that appear on more than one CSV row.
// ======================================================

function findDuplicateAssetNumbers(rows) {
    const seen = new Set();
    const dups = new Set();
    for (const r of rows) {
        const n = (r.assetNumber ?? '').trim();
        if (!n)
            continue;
        if (seen.has(n))
            dups.add(n);
        seen.add(n);
    }
    return [...dups];
}

// ======================================================
// Function : EventImportCard
// Purpose  : Self-contained card for one event type — template
//            download, file upload, parsed-row preview, and the
//            "Import All" action + per-row results for that card only.
// ======================================================

function EventImportCard({ evt, user }) {
    const schema = FIELD_SCHEMAS[evt.id] ?? [];
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState([]); // parsed CSV rows (raw, header-keyed)
    const [parseError, setParseError] = useState('');
    const [dropdownWarnings, setDropdownWarnings] = useState([]);
    const [importing, setImporting] = useState(false);
    const [results, setResults] = useState(null); // { posted, failed, items }

    function downloadTemplate() {
        downloadCsv(`${evt.id}-template.csv`, buildTemplateCsv(schema));
    }

    function onFileChange(e) {
        const file = e.target.files?.[0];
        setResults(null);
        setParseError('');
        setRows([]);
        setDropdownWarnings([]);
        if (!file) return;
        setFileName(file.name);
        file.text().then((text) => {
            try {
                const expectedHeaders = ['assetNumber', ...schema.map((f) => f.key)];
                const { rows: parsed, headerWasMissing } = parseCsv(text, expectedHeaders);
                if (parsed.length === 0) { setParseError('No data rows found in this file.'); return; }
                const missingAsset = parsed.filter((r) => !r.assetNumber?.trim()).length;
                // One Addition per asset number, strictly — flag repeats inside
                // the file up front (the server also rejects them, and any
                // number that already exists, row by row).
                const dupAdditions = evt.id === 'addition' ? findDuplicateAssetNumbers(parsed) : [];
                if (missingAsset > 0) { setParseError(`${missingAsset} row(s) are missing an Asset Number.`); }
                else if (dupAdditions.length > 0) {
                    setParseError(`Only one Addition is allowed per asset number, but these repeat in this file: ${dupAdditions.slice(0, 8).join(', ')}${dupAdditions.length > 8 ? '…' : ''}. Only the first row of each will post; the rest will be rejected.`);
                }
                else if (headerWasMissing) {
                    setParseError(`Heads up: this file had no header row, so columns were matched by position (assetNumber, ${schema.map((f) => f.key).join(', ')}). Double-check the preview below before importing.`);
                }
                setDropdownWarnings(findUnmatchedSelectValues(parsed, schema));
                setRows(parsed);
            } catch {
                setParseError('Could not read this file as CSV.');
            }
        });
    }

    async function importAll() {
        setImporting(true);
        setResults(null);
        try {
            const lifecycleRows = rowsToLifecycleRows(rows, schema);
            const res = await lifecycleApi.bulkImport({ eventType: evt.label, rows: lifecycleRows, postedBy: user?.name });
            const posted = res.results.filter((r) => r.status === 'posted').length;
            const failed = res.results.length - posted;
            setResults({ posted, failed, items: res.results });
        } catch (err) {
            setParseError(err.message || 'Bulk import failed.');
        } finally {
            setImporting(false);
        }
    }

    function reset() {
        setFileName('');
        setRows([]);
        setParseError('');
        setDropdownWarnings([]);
        setResults(null);
    }

    return (<div className="card card-pad">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={`ei ico-${evt.color}`}>{evt.icon}</div>
          <div>
            <h3 style={{ fontSize: 14, margin: 0 }}>{evt.label}</h3>
            <p className="text-muted text-sm" style={{ margin: 0 }}>{evt.description}</p>
          </div>
        </div>
        {results && <Pill tone={results.failed > 0 ? 'amber' : 'green'}>{results.posted} posted{results.failed > 0 ? `, ${results.failed} failed` : ''}</Pill>}
      </div>

      <div className="flex gap-2 mt-2 mb-2">
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download CSV Template</Button>
        {(fileName || rows.length > 0 || results) && (<Button variant="ghost" size="sm" onClick={reset}>Reset</Button>)}
      </div>

      <div className="form-row">
        <label htmlFor={`file-${evt.id}`}>Upload filled-in CSV</label>
        <input id={`file-${evt.id}`} type="file" accept=".csv,text/csv" onChange={onFileChange}/>
        {fileName && <div className="hint">{fileName}</div>}
      </div>

      {parseError && <p className="text-sm" style={{ color: 'var(--danger, #dc2626)' }}>{parseError}</p>}

      {dropdownWarnings.length > 0 && !results && (<div className="mt-1">
          <p className="text-sm" style={{ color: 'var(--warning, #b45309)', fontWeight: 700 }}>These values don't match any dropdown option — check spelling against the form:</p>
          <ul className="text-sm text-muted">
            {dropdownWarnings.slice(0, 6).map((w, i) => (<li key={i}>Row {w.row} ({w.assetNumber || 'no asset #'}) — {w.field}: "{w.value}"</li>))}
          </ul>
          {dropdownWarnings.length > 6 && <p className="text-sm text-muted">…and {dropdownWarnings.length - 6} more.</p>}
        </div>)}

      {rows.length > 0 && !results && (<>
          <p className="text-sm text-muted mt-2">{rows.length} row(s) ready to import.</p>
          <div style={{ maxHeight: 160, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead>
                <tr>{Object.keys(rows[0]).map((h) => (<th key={h}>{h}</th>))}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => (<tr key={i}>{Object.keys(rows[0]).map((h) => (<td key={h}>{r[h]}</td>))}</tr>))}
              </tbody>
            </table>
          </div>
          {rows.length > 5 && <p className="text-sm text-muted">…and {rows.length - 5} more.</p>}
          <Button variant="primary" size="sm" className="mt-2" onClick={importAll} disabled={!canImport || importing} title={!canImport ? 'You have view-only access to Bulk Import' : undefined}>
            {importing ? 'Importing…' : `Import All (${rows.length})`}
          </Button>
        </>)}

      {results && results.failed > 0 && (<div className="mt-2">
          <p className="text-sm" style={{ fontWeight: 700 }}>Failed rows:</p>
          <ul className="text-sm text-muted">
            {results.items.filter((r) => r.status !== 'posted').map((r, i) => (<li key={i}>{r.assetNumber || '(no asset #)'}: {r.error}</li>))}
          </ul>
        </div>)}
    </div>);
}


// ======================================================
// Function : MasterDataSetImportCard
// Purpose  : 7th card — ONE CSV for everything. Every row carries its own
//            assetNumber AND eventType, so a single file can mix any assets
//            with any transactions, e.g.
//                assetNumber,eventType,...
//                01,Addition,...
//                02,Retirement,...
//                02,Adjustment,...
//            "Import All" sends the whole file to /api/lifecycle/bulk-post
//            (same preview -> ledger -> register pipeline as every other
//            card) and every row's outcome comes back individually. The
//            server posts Additions first, so an asset added in this file
//            already exists for its other transactions.
// ======================================================

function MasterDataSetImportCard({ user }) {
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState([]); // filled rows, each tagged with its CSV line number
    const [parseError, setParseError] = useState('');
    const [rowProblems, setRowProblems] = useState([]); // blocking: missing asset # / bad eventType
    const [dupAdditions, setDupAdditions] = useState([]); // asset numbers with 2+ Addition rows
    const [dropdownWarnings, setDropdownWarnings] = useState([]);
    const [importing, setImporting] = useState(false);
    const [results, setResults] = useState(null); // { posted, failed, items }
    const previewPg = usePagination(rows);
    const resultsPg = usePagination(results?.items ?? []);

    function downloadTemplate() {
        downloadCsv('master-data-set-template.csv', buildUnifiedTemplateCsv());
    }

    function reset() {
        setFileName('');
        setRows([]);
        setParseError('');
        setRowProblems([]);
        setDupAdditions([]);
        setDropdownWarnings([]);
        setResults(null);
    }

    function onFileChange(e) {
        const file = e.target.files?.[0];
        setResults(null);
        setParseError('');
        setRows([]);
        setRowProblems([]);
        setDupAdditions([]);
        setDropdownWarnings([]);
        if (!file) return;
        setFileName(file.name);
        file.text().then((text) => {
            try {
                const { rows: parsed, headerWasMissing } = parseCsv(text, getUnifiedHeaders());
                // Line number in the file (header is line 1) so problems can be
                // pointed at exactly; rows with neither asset # nor eventType are blank.
                const filled = parsed
                    .map((r, idx) => ({ ...r, __line: idx + 2 }))
                    .filter((r) => r.assetNumber?.trim() || r.eventType?.trim());
                if (filled.length === 0) {
                    setParseError('No transactions found — every row needs an assetNumber and an eventType.');
                    return;
                }

                const problems = [];
                const additionCount = new Map();
                filled.forEach((r) => {
                    const an = r.assetNumber?.trim();
                    const rawEvent = String(r.eventType ?? '').trim();
                    const eventId = resolveEventId(rawEvent);
                    if (!an) problems.push({ line: r.__line, assetNumber: '', reason: 'Missing Asset Number' });
                    else if (!rawEvent) problems.push({ line: r.__line, assetNumber: an, reason: 'Missing eventType' });
                    else if (!eventId) problems.push({ line: r.__line, assetNumber: an, reason: `Unrecognized eventType "${rawEvent}"` });
                    if (an && eventId === 'addition') additionCount.set(an, (additionCount.get(an) ?? 0) + 1);
                });
                setRowProblems(problems);
                setDupAdditions([...additionCount.entries()].filter(([, n]) => n > 1).map(([an]) => an));

                if (headerWasMissing) {
                    setParseError('Heads up: this file had no header row, so columns were matched by position against the template. Double-check the preview below before importing.');
                }
                setDropdownWarnings(findUnmatchedSelectValuesUnified(filled).map((w) => ({ ...w, line: filled[w.row - 1]?.__line })));
                setRows(filled);
            } catch {
                setParseError('Could not read this file as CSV.');
            }
        });
    }

    async function importAll() {
        setImporting(true);
        setResults(null);
        setParseError('');
        try {
            const res = await lifecycleApi.bulkPost({ rows: rowsToBulkPostRows(rows), postedBy: user?.name });
            // The server returns outcomes in the same order as the rows sent.
            const items = res.results.map((r, i) => ({ ...r, line: rows[i]?.__line }));
            const posted = items.filter((r) => r.status === 'posted').length;
            setResults({ posted, failed: items.length - posted, items });
        } catch (err) {
            setParseError(err.message || 'Bulk import failed.');
        } finally {
            setImporting(false);
        }
    }

    const assetCount = new Set(rows.map((r) => r.assetNumber?.trim()).filter(Boolean)).size;
    const countsByEvent = EVENT_LABELS
        .map((label) => ({ label, n: rows.filter((r) => resolveEventId(r.eventType) === label.toLowerCase()).length }))
        .filter((c) => c.n > 0);

    return (<div className="card card-pad" style={{ gridColumn: '1 / -1' }}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="ei ico-gray">☑</div>
          <div>
            <h3 style={{ fontSize: 14, margin: 0 }}>Master Data Set</h3>
            <p className="text-muted text-sm" style={{ margin: 0 }}>One CSV for everything — any asset numbers, any event type on each row, all posted in one go</p>
          </div>
        </div>
        {results && <Pill tone={results.failed > 0 ? 'amber' : 'green'}>{results.posted} posted{results.failed > 0 ? `, ${results.failed} failed` : ''}</Pill>}
      </div>

      <div className="flex gap-2 mt-2 mb-2">
        <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download CSV Template</Button>
        {(fileName || rows.length > 0 || results) && (<Button variant="ghost" size="sm" onClick={reset}>Reset</Button>)}
      </div>

      <div className="form-row">
        <label htmlFor="file-master-data-set">Upload filled-in CSV</label>
        <input id="file-master-data-set" type="file" accept=".csv,text/csv" onChange={onFileChange}/>
        {fileName && <div className="hint">{fileName}</div>}
      </div>

      {parseError && <p className="text-sm" style={{ color: 'var(--danger, #dc2626)' }}>{parseError}</p>}

      {rowProblems.length > 0 && !results && (<div className="mt-1">
          <p className="text-sm" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>Fix these rows before importing:</p>
          <ul className="text-sm text-muted">
            {rowProblems.slice(0, 8).map((p, i) => (<li key={i}>Line {p.line} ({p.assetNumber || 'no asset #'}) — {p.reason}</li>))}
          </ul>
          {rowProblems.length > 8 && <p className="text-sm text-muted">…and {rowProblems.length - 8} more.</p>}
        </div>)}

      {dupAdditions.length > 0 && !results && (<p className="text-sm" style={{ color: 'var(--warning, #b45309)', fontWeight: 700 }}>
          Only one Addition is allowed per asset number, but these have more than one Addition row: {dupAdditions.slice(0, 8).join(', ')}{dupAdditions.length > 8 ? '…' : ''}. Only the first will post; the rest will be rejected.
        </p>)}

      {dropdownWarnings.length > 0 && !results && (<div className="mt-1">
          <p className="text-sm" style={{ color: 'var(--warning, #b45309)', fontWeight: 700 }}>These values don't match any dropdown option — check spelling against the form:</p>
          <ul className="text-sm text-muted">
            {dropdownWarnings.slice(0, 6).map((w, i) => (<li key={i}>Line {w.line} ({w.assetNumber || 'no asset #'}, {w.eventType}) — {w.field}: "{w.value}"</li>))}
          </ul>
          {dropdownWarnings.length > 6 && <p className="text-sm text-muted">…and {dropdownWarnings.length - 6} more.</p>}
        </div>)}

      {rows.length > 0 && !results && (<>
          <p className="text-sm text-muted mt-2">
            {rows.length} transaction(s) across {assetCount} asset(s) ready to import
            {countsByEvent.length > 0 && <> — {countsByEvent.map((c) => `${c.n} ${c.label}`).join(', ')}</>}.
          </p>
          <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table className="table" style={{ fontSize: 12 }}>
              <thead><tr><th>Line</th><th>Asset #</th><th>Event</th></tr></thead>
              <tbody>
                {previewPg.pageItems.map((r) => (<tr key={r.__line}>
                    <td>{r.__line}</td>
                    <td className="mono">{r.assetNumber}</td>
                    <td>{r.eventType}</td>
                  </tr>))}
              </tbody>
            </table>
          </div>
          <Pagination {...previewPg.pager}/>
          <Button variant="primary" size="sm" className="mt-2" onClick={importAll} disabled={!canImport || importing || rowProblems.length > 0} title={!canImport ? 'You have view-only access to Bulk Import' : undefined}>
            {importing ? 'Importing…' : `Import All (${rows.length})`}
          </Button>
        </>)}

      {results && (<div className="mt-2" style={{ maxHeight: 260, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          <table className="table" style={{ fontSize: 12 }}>
            <thead><tr><th>Line</th><th>Asset #</th><th>Event</th><th>Result</th></tr></thead>
            <tbody>
              {resultsPg.pageItems.map((r, i) => (<tr key={i}>
                  <td>{r.line}</td>
                  <td className="mono">{r.assetNumber || '(none)'}</td>
                  <td>{r.eventType}</td>
                  <td style={r.status === 'posted' ? undefined : { color: 'var(--danger, #dc2626)' }}>
                    {r.status === 'posted' ? 'Posted ✓' : `Failed — ${r.error}`}
                  </td>
                </tr>))}
            </tbody>
          </table>
          <Pagination {...resultsPg.pager}/>
        </div>)}
    </div>);
}

// ======================================================
// END: MasterDataSetImportCard
// ======================================================

// ======================================================
// END: BulkImport
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : BulkImport.jsx
// ======================================================
