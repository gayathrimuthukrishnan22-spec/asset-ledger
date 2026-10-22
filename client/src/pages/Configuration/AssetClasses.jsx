// ======================================================
// File Name : AssetClasses.jsx
// Purpose   : Page-level component for the IRS Publication 946
//             Appendix B, Table B-1 asset class reference
// ======================================================

import { useBooks } from '../../hooks/useBooks';
import { useAuth } from '../../hooks/useAuth';
import { Modal } from '../../components/ui/Modal';
import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { configApi } from '../../api/config.api';
import { downloadCsv } from '../../utils/csv';
import { getActiveAssetClassTable, invalidateCustomAssetClasses, setActiveAssetClassTable } from '../../hooks/useAssetClasses';

// ======================================================
// START: Page Component
// ======================================================

// Book shown for the default-table rows inside the Customize Table.
const DEFAULT_ROW_BOOK = 'GAAP';

// ======================================================
// Function : exportAssetClassesCsv
// Purpose  : Builds the asset-class CSV (same 7 columns for the default
//            and the custom table) and downloads it via the shared
//            downloadCsv helper.
// ======================================================

function exportAssetClassesCsv(rows, filename, withBook = false) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Property Type', 'Method', 'Rate %', 'Convention', 'Life', 'Bonus %'];
    if (withBook) header.unshift('Book');
    const lines = [header.join(',')];
    rows.forEach((r) => {
        const cells = [r.name, r.propertyType, r.method, r.ratePct, r.convention, r.life, r.bonusPct ?? ''];
        if (withBook) cells.unshift(r.book ?? DEFAULT_ROW_BOOK);
        lines.push(cells.map(q).join(','));
    });
    downloadCsv(filename, lines.join('\n'));
}


// ======================================================
// Customize Table helpers
// ======================================================


// ======================================================
// Function : ClassNameLink / ClassHistoryModal
// Purpose  : Clicking a class name opens its FACT TABLE: every saved version
//            (stored permanently in the database, never edited or deleted)
//            with who/when/what changed and the date it took effect.
//            Assets placed in service before an edit keep the older values.
// ======================================================

const FIELD_LABELS = { name: 'Name', book: 'Book', propertyType: 'Property Type', method: 'Method', ratePct: 'Rate %', convention: 'Convention', life: 'Life', bonusPct: 'Bonus %' };
const BASELINE_DATE = '1900-01-01';
const showVal = (v) => (v === '' || v === undefined || v === null ? '—' : v);

// The class name only - never the book (custom rules carry the book in their own column).
const classLabel = (row) => (row.book !== undefined && row.assetType ? row.assetType : row.name);

function ClassNameLink({ row, scope, onOpen }) {
    return (<button type="button" className="mono" title="Click to open the Fact Table"
      style={{ background: 'none', border: 0, padding: 0, cursor: 'pointer', color: 'inherit', textDecoration: 'none', font: 'inherit', textAlign: 'left', whiteSpace: 'nowrap' }}
      onClick={() => onOpen({ scope, id: row.id, name: classLabel(row), row })}>{classLabel(row)}</button>);
}

function ClassHistoryModal({ target, onClose }) {
    const [versions, setVersions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        if (!target) return undefined;
        let alive = true;
        setLoading(true);
        setError('');
        setVersions([]);
        configApi.getClassHistory(target.scope, target.id)
            .then((v) => { if (alive) setVersions(Array.isArray(v) ? v : []); })
            .catch((e) => { if (alive) setError(`Could not load the Fact Table${e && e.message ? ` (${e.message})` : ''}.`); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [target]);
    const newestFirst = [...versions].reverse();
    return (<Modal open={!!target} title={`Fact Table — ${target?.name ?? ''}`} onClose={onClose} width={640}>
      {loading && <p className="text-muted">Loading…</p>}
      {error && <p style={{ color: 'var(--danger, #b91c1c)' }}>{error}</p>}
      {target?.row && (<div style={{ paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700 }}>Current values</div>
        <div className="text-sm" style={{ marginTop: 4 }}>
          {target.row.book ? `${target.row.book} · ` : ''}Rate % {showVal(target.row.ratePct)} · Bonus % {showVal(target.row.bonusPct)} · {showVal(target.row.method)} · {showVal(target.row.convention)} · {showVal(target.row.life)}
        </div>
      </div>)}
      {!loading && !error && versions.length === 0 && <p className="text-muted">No changes recorded yet. Every future update to this row is saved here permanently.</p>}
      {versions.length > 0 && <p className="hint" style={{ marginTop: 8 }}>Saved permanently in the database — entries are never changed or removed. Each change applies from its effective date; assets placed in service before that date keep the older values.</p>}
      {newestFirst.map((v, i) => {
        const original = v.effectiveFrom === BASELINE_DATE;
        return (<div key={v.id} style={{ borderTop: i ? '1px solid var(--border)' : 'none', padding: '10px 0' }}>
          <div style={{ fontWeight: 700 }}>
            {original ? 'Original values' : `Effective from ${v.effectiveFrom}`}
            {i === 0 && !original && <span className="text-muted" style={{ fontWeight: 400 }}> — current</span>}
          </div>
          {original && v.changedBy && v.changedBy !== 'Original' && <div className="text-sm text-muted">Added by {v.changedBy} on {v.changedAt ? new Date(v.changedAt).toLocaleString() : '—'}</div>}
          {!original && <div className="text-sm text-muted">Changed by {v.changedBy || 'Unknown'} on {v.changedAt ? new Date(v.changedAt).toLocaleString() : '—'}</div>}
          <div className="text-sm" style={{ marginTop: 4 }}>Rate % {showVal(v.ratePct)} · Bonus % {showVal(v.bonusPct)} · {showVal(v.method)} · {showVal(v.convention)} · {showVal(v.life)}</div>
          {!original && v.changes.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                {v.changes.map((c) => (<li key={c.field} className="text-sm"><b>{FIELD_LABELS[c.field] ?? c.field}:</b> {showVal(c.from)} → <b>{showVal(c.to)}</b></li>))}
              </ul>}
        </div>);
      })}
    </Modal>);
}

// ======================================================
// Function : unique
// Purpose  : Returns the list without empty values or duplicates.
// ======================================================
function unique(list) {
    return Array.from(new Set(list.filter(Boolean)));
}

// ======================================================
// Function : CustomTable
// Purpose  : "Customize Table" - same columns as the default table.
//            Rules the user adds come first (Book is its own column, Name
//            is just the asset type; Edit + Delete), followed by all
//            the default table rows (Delete only, same as the Default
//            Table). No starter rows are pre-loaded.
// ======================================================

function CustomTable({ defaultRows, query, onDeleteDefault }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState('');
    // Every maintained book is selectable on a rule (not just the 3 that had rows).
    const { names: bookNames } = useBooks();
    const { user } = useAuth();
    const [histTarget, setHistTarget] = useState(null);

    useEffect(() => {
        configApi.getCustomAssetClasses()
            .then((data) => setRows(data))
            .catch(() => setError('Could not load the customize table from the database.'))
            .finally(() => setLoading(false));
    }, []);

    const opts = useMemo(() => {
        const all = [...defaultRows, ...rows];
        return {
            books: unique([...bookNames, ...rows.map((r) => r.book)]),
            assetTypes: unique(defaultRows.map((r) => r.name)),
            propertyTypes: unique(all.map((r) => r.propertyType)),
            methods: unique(all.map((r) => r.method)),
            conventions: unique(all.map((r) => r.convention)),
        };
    }, [defaultRows, rows, bookNames]);

    // Customize Table = the editable custom rows first, then the default table rows after them.
    const match = (r) => {
        const q = query.trim().toLowerCase();
        return !q || [r.book ?? DEFAULT_ROW_BOOK, r.name, r.propertyType, r.method, r.convention].some((v) => String(v).toLowerCase().includes(q));
    };
    const filtered = useMemo(() => rows.filter(match), [query, rows]);
    // A default row that was edited here becomes a GAAP rule (top of the table),
    // so its original default line is not shown a second time.
    const overridden = useMemo(() => new Set(rows.filter((r) => r.book === DEFAULT_ROW_BOOK).map((r) => r.assetType)), [rows]);
    const filteredDefaults = useMemo(() => defaultRows.filter((r) => !overridden.has(r.name) && match(r)), [query, defaultRows, overridden]);
    const combined = useMemo(() => [
        ...filtered.map((row) => ({ custom: true, row })),
        ...filteredDefaults.map((row) => ({ custom: false, row })),
    ], [filtered, filteredDefaults]);
    const pg = usePagination(combined);

    const startEdit = (row) => {
        const m = /(\d+)\s*years?\s*(\d+)\s*months?/i.exec(row.life || '');
        setSaveError('');
        setEditingId(row.id);
        setDraft({ ...row, lifeYears: m ? m[1] : '0', lifeMonths: m ? m[2] : '0' });
    };
    // Edit on a default-table row: opens it in place with its current values.
    // Saving stores it as a GAAP rule for that asset type (the default table itself is untouched).
    const startEditDefault = (row, key) => {
        const m = /(\d+)\s*years?\s*(\d+)\s*months?/i.exec(row.life || '');
        setSaveError('');
        setEditingId(key);
        setDraft({
            book: bookNames.includes(DEFAULT_ROW_BOOK) ? DEFAULT_ROW_BOOK : (bookNames[0] ?? DEFAULT_ROW_BOOK),
            assetType: row.name,
            propertyType: row.propertyType,
            method: row.method,
            ratePct: String(row.ratePct ?? ''),
            convention: row.convention,
            bonusPct: String(row.bonusPct ?? ''),
            lifeYears: m ? m[1] : '0',
            lifeMonths: m ? m[2] : '0'
        });
    };
    // "+ Add Rule": a blank draft row at the top of the table. Saving it creates a
    // new rule for that Book + asset type (until a rule exists the book mirrors Federal Tax).
    const startAdd = () => {
        setSaveError('');
        setEditingId('new');
        setDraft({
            book: bookNames.find((b) => b !== 'Federal Tax') ?? bookNames[0] ?? 'GAAP',
            assetType: opts.assetTypes[0] ?? '',
            propertyType: opts.propertyTypes[0] ?? '',
            method: opts.methods[0] ?? '',
            ratePct: '100',
            convention: opts.conventions[0] ?? '',
            bonusPct: '',
            lifeYears: '5',
            lifeMonths: '0'
        });
    };
    const cancelEdit = () => { setEditingId(null); setDraft(null); setSaveError(''); };
    const removeRow = async (row) => {
        if (!window.confirm(`Delete the rule "${row.name}"? ${row.book} will go back to mirroring Federal Tax for that asset class.`)) return;
        setBusy(true);
        setSaveError('');
        try {
            await configApi.deleteCustomAssetClass(row.id);
            setRows((rs) => rs.filter((r) => r.id !== row.id));
            invalidateCustomAssetClasses();
        } catch (e) {
            setSaveError(e.message || 'Could not delete the row.');
        } finally { setBusy(false); }
    };
    // Delete a default-table row from the Customize Table. It is the same row
    // as in the Default Table, so it disappears from both.
    const removeDefaultRow = async (row) => {
        if (!window.confirm(`Delete "${row.name}" from the asset class list? It will also be removed from the Default Table.`)) return;
        setBusy(true);
        setSaveError('');
        try {
            await onDeleteDefault(row);
        } catch (e) {
            setSaveError(e.message || 'Could not delete the row.');
        } finally { setBusy(false); }
    };
    const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

    const save = async () => {
        const { id, name: _name, lifeYears, lifeMonths, ...rest } = draft;
        const payload = { ...rest, ratePct: String(rest.ratePct).trim(), life: `${Number(lifeYears) || 0} years ${Number(lifeMonths) || 0} months`, changedBy: user?.name ?? '' };
        setBusy(true);
        setSaveError('');
        try {
            if (editingId === 'new' || String(editingId).startsWith('default-')) {
                const created = await configApi.createCustomAssetClass(payload);
                setRows((rs) => [...rs, created]);
            } else {
                const updated = await configApi.updateCustomAssetClass(id, payload);
                setRows((rs) => rs.map((r) => (r.id === id ? updated : r)));
            }
            invalidateCustomAssetClasses();
            cancelEdit();
        } catch (e) {
            setSaveError(e.message || 'Could not save the row.');
        } finally { setBusy(false); }
    };

    const sel = (key, list) => (<select className="btn btn-ghost" value={draft[key]} onChange={(e) => set(key, e.target.value)}>
        {unique([...list, draft[key]]).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>);

    const editRow = (key) => (<tr key={key}>
                  <td>{sel('book', opts.books)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{sel('assetType', opts.assetTypes)}</td>
                  <td>{sel('propertyType', opts.propertyTypes)}</td>
                  <td>{sel('method', opts.methods)}</td>
                  <td className="num"><input className="btn btn-ghost" style={{ width: 70, textAlign: 'right' }} value={draft.ratePct} onChange={(e) => set('ratePct', e.target.value)}/></td>
                  <td>{sel('convention', opts.conventions)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input className="btn btn-ghost" type="number" min="0" style={{ width: 56 }} value={draft.lifeYears} onChange={(e) => set('lifeYears', e.target.value)}/> yrs{' '}
                    <input className="btn btn-ghost" type="number" min="0" max="11" style={{ width: 56 }} value={draft.lifeMonths} onChange={(e) => set('lifeMonths', e.target.value)}/> mo
                  </td>
                  <td className="num"><input className="btn btn-ghost" style={{ width: 70, textAlign: 'right' }} placeholder="—" value={draft.bonusPct ?? ''} onChange={(e) => set('bonusPct', e.target.value)}/></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>{' '}
                    <Button size="sm" variant="ghost" onClick={cancelEdit} disabled={busy}>Cancel</Button>
                  </td>
                </tr>);

    return (<div className="card">
      <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3>Customize Table</h3>
        <Button size="sm" onClick={startAdd} disabled={editingId !== null || busy}>+ Add Rule</Button>
        <Button variant="ghost" size="sm" onClick={() => exportAssetClassesCsv([...filtered, ...filteredDefaults], 'asset_classes_custom.csv', true)} style={{ marginLeft: 'auto' }}>Export CSV</Button>
      </div>
      {saveError && <div className="card-pad text-sm" style={{ color: 'var(--danger, #b91c1c)' }}>{saveError}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Name</th>
              <th>Property Type</th>
              <th>Method</th>
              <th className="num">Rate %</th>
              <th>Convention</th>
              <th>Life</th>
              <th className="num">Bonus %</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-muted">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={9} className="text-muted">{error}</td></tr>}
            {draft && (editingId === 'new' || String(editingId).startsWith('default-')) && editRow(editingId)}
            {pg.pageItems.filter((i) => i.custom).map(({ row }) => (editingId === row.id && draft
                ? editRow(row.id)
                : (<tr key={row.id}>
                  <td className="text-sm">{row.book}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><ClassNameLink row={row} scope="custom" onOpen={setHistTarget}/></td>
                  <td className="text-sm">{row.propertyType}</td>
                  <td className="text-sm">{row.method}</td>
                  <td className="num">{row.ratePct}</td>
                  <td className="text-sm">{row.convention}</td>
                  <td>{row.life}</td>
                  <td className="num">{row.bonusPct || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="ghost" onClick={() => startEdit(row)} disabled={editingId !== null || busy}>Edit</Button>{' '}<Button size="sm" variant="ghost" onClick={() => removeRow(row)} disabled={editingId !== null || busy}>Delete</Button></td>
                </tr>)))}
            {!loading && !error && pg.pageItems.filter((i) => !i.custom).map(({ row }, i) => {
              const key = `default-${row.id ?? row.name}-${i}`;
              // The row being edited is shown as the edit form at the top of the table.
              return (editingId === key && draft
                ? null
                : (<tr key={key}>
                  <td className="text-sm">{DEFAULT_ROW_BOOK}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><ClassNameLink row={row} scope="default" onOpen={setHistTarget}/></td>
                  <td className="text-sm">{row.propertyType}</td>
                  <td className="text-sm">{row.method}</td>
                  <td className="num">{row.ratePct}</td>
                  <td className="text-sm">{row.convention}</td>
                  <td>{row.life}</td>
                  <td className="num">{row.bonusPct || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="ghost" onClick={() => startEditDefault(row, key)} disabled={editingId !== null || busy}>Edit</Button>{' '}<Button size="sm" variant="ghost" onClick={() => removeDefaultRow(row)} disabled={editingId !== null || busy}>Delete</Button></td>
                </tr>));
            })}
          </tbody>
        </table>
      </div>
      <Pagination {...pg.pager}/>
      <ClassHistoryModal target={histTarget} onClose={() => setHistTarget(null)}/>
    </div>);
}

// ======================================================
// END: CustomTable
// ======================================================

// ======================================================
// Function : AssetClasses
// Purpose  : React component that renders the 'Asset Classes' UI
// ======================================================

export function AssetClasses() {
    const { user } = useAuth();
    const [histTarget, setHistTarget] = useState(null);
    const [tab, setTab] = useState(getActiveAssetClassTable);
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    useEffect(() => {
        configApi.getAssetClasses()
            .then((data) => setRows(data))
            .catch(() => setError('Could not load asset classes from the database.'))
            .finally(() => setLoading(false));
    }, []);
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return rows;
        return rows.filter((r) => r.name.toLowerCase().includes(q)
            || r.propertyType.toLowerCase().includes(q)
            || r.method.toLowerCase().includes(q)
            || r.convention.toLowerCase().includes(q));
    }, [query, rows]);

    const defaultPg = usePagination(filtered);

    // Edit one row of the Default Table in place (saves to the asset_classes table).
    const [editId, setEditId] = useState(null);
    const [editDraft, setEditDraft] = useState(null);
    const [editBusy, setEditBusy] = useState(false);
    const [editError, setEditError] = useState('');
    const defOpts = useMemo(() => ({
        propertyTypes: unique(rows.map((r) => r.propertyType)),
        methods: unique(rows.map((r) => r.method)),
        conventions: unique(rows.map((r) => r.convention)),
    }), [rows]);
    const startEditDefaultRow = (row) => {
        const m = /(\d+)\s*years?\s*(\d+)\s*months?/i.exec(row.life || '');
        setEditError('');
        setEditId(row.id);
        setEditDraft({ name: row.name, propertyType: row.propertyType, method: row.method, ratePct: String(row.ratePct ?? ''), convention: row.convention, bonusPct: String(row.bonusPct ?? ''), lifeYears: m ? m[1] : '0', lifeMonths: m ? m[2] : '0' });
    };
    const cancelEditDefaultRow = () => { setEditId(null); setEditDraft(null); setEditError(''); };
    const setEd = (k, v) => setEditDraft((d) => ({ ...d, [k]: v }));
    const saveDefaultRow = async () => {
        const { lifeYears, lifeMonths, ...rest } = editDraft;
        const payload = { ...rest, name: rest.name.trim(), ratePct: String(rest.ratePct).trim(), life: `${Number(lifeYears) || 0} years ${Number(lifeMonths) || 0} months`, changedBy: user?.name ?? '' };
        setEditBusy(true);
        setEditError('');
        try {
            const updated = await configApi.updateAssetClass(editId, payload);
            setRows((rs) => rs.map((r) => (r.id === editId ? updated : r)));
            invalidateCustomAssetClasses();
            cancelEditDefaultRow();
        } catch (e) {
            setEditError(e.message || 'Could not save the row.');
        } finally { setEditBusy(false); }
    };
    const edSel = (key, list) => (<select className="btn btn-ghost" value={editDraft[key]} onChange={(e) => setEd(key, e.target.value)}>
        {unique([...list, editDraft[key]]).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>);

    // Delete one row of the Default Table (used by both tables' Delete buttons).
    const [deletingId, setDeletingId] = useState(null);
    const [deleteError, setDeleteError] = useState('');
    const deleteDefaultRow = async (row) => {
        await configApi.deleteAssetClass(row.id);
        setRows((rs) => rs.filter((r) => r.id !== row.id));
        invalidateCustomAssetClasses();
    };
    const removeFromDefault = async (row) => {
        if (!window.confirm(`Delete "${row.name}" from the Default Table? It will also be removed from the Customize Table.`)) return;
        setDeletingId(row.id);
        setDeleteError('');
        try {
            await deleteDefaultRow(row);
        } catch (e) {
            setDeleteError(e.message || 'Could not delete the row.');
        } finally { setDeletingId(null); }
    };

    return (<AppLayout active="assetClasses" title="Asset Classes" crumb="Home / Configuration / Asset Classes">
      <div className="page-header">
        <div>
          <h1>Asset Classes</h1>
          <p>Name, property type, depreciation method, rate, convention, life, and bonus % for every asset type on the book</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-pad flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div style={{ minWidth: 200 }}>
            <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Table (used by Asset Type dropdowns)</div>
            <select
              className="btn btn-ghost"
              style={{ width: '100%', textAlign: 'left' }}
              value={tab}
              onChange={(e) => { setTab(e.target.value); setActiveAssetClassTable(e.target.value); setQuery(''); }}
            >
              <option value="default">Default Table</option>
              <option value="custom">Customize Table</option>
            </select>
          </div>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Search</div>
            <input
              className="btn btn-ghost"
              style={{ width: '100%', textAlign: 'left' }}
              placeholder="Search name, property type, method, or convention..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {tab === 'default' && (<Button variant="ghost" onClick={() => exportAssetClassesCsv(filtered, 'asset_classes.csv')} style={{ marginLeft: 'auto' }}>
            Export CSV
          </Button>)}
        </div>
      </div>

      {tab === 'custom' && <CustomTable defaultRows={rows} query={query} onDeleteDefault={deleteDefaultRow}/>}

      {tab === 'default' && <div className="card">
        <div className="card-head">
          <h3>Default Table</h3>
        </div>
        {(deleteError || editError) && <div className="card-pad text-sm" style={{ color: 'var(--danger, #b91c1c)' }}>{deleteError || editError}</div>}
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Property Type</th>
                <th>Method</th>
                <th className="num">Rate %</th>
                <th>Convention</th>
                <th>Life</th>
                <th className="num">Bonus %</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={8} className="text-muted">Loading…</td></tr>}
              {!loading && error && <tr><td colSpan={8} className="text-muted">{error}</td></tr>}
              {defaultPg.pageItems.map((row, i) => (editId === row.id && editDraft
                ? (<tr key={`${row.id}-edit`}>
                  <td><input className="btn btn-ghost mono" style={{ width: 170 }} value={editDraft.name} onChange={(e) => setEd('name', e.target.value)}/></td>
                  <td>{edSel('propertyType', defOpts.propertyTypes)}</td>
                  <td>{edSel('method', defOpts.methods)}</td>
                  <td className="num"><input className="btn btn-ghost" style={{ width: 70, textAlign: 'right' }} value={editDraft.ratePct} onChange={(e) => setEd('ratePct', e.target.value)}/></td>
                  <td>{edSel('convention', defOpts.conventions)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <input className="btn btn-ghost" type="number" min="0" style={{ width: 56 }} value={editDraft.lifeYears} onChange={(e) => setEd('lifeYears', e.target.value)}/> yrs{' '}
                    <input className="btn btn-ghost" type="number" min="0" max="11" style={{ width: 56 }} value={editDraft.lifeMonths} onChange={(e) => setEd('lifeMonths', e.target.value)}/> mo
                  </td>
                  <td className="num"><input className="btn btn-ghost" style={{ width: 70, textAlign: 'right' }} placeholder="—" value={editDraft.bonusPct ?? ''} onChange={(e) => setEd('bonusPct', e.target.value)}/></td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <Button size="sm" onClick={saveDefaultRow} disabled={editBusy}>{editBusy ? 'Saving…' : 'Save'}</Button>{' '}
                    <Button size="sm" variant="ghost" onClick={cancelEditDefaultRow} disabled={editBusy}>Cancel</Button>
                  </td>
                </tr>)
                : (<tr key={`${row.id ?? row.name}-${i}`}>
                  <td style={{ whiteSpace: 'nowrap' }}><ClassNameLink row={row} scope="default" onOpen={setHistTarget}/></td>
                  <td className="text-sm">{row.propertyType}</td>
                  <td className="text-sm">{row.method}</td>
                  <td className="num">{row.ratePct}</td>
                  <td className="text-sm">{row.convention}</td>
                  <td>{row.life}</td>
                  <td className="num">{row.bonusPct || '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}><Button size="sm" variant="ghost" onClick={() => startEditDefaultRow(row)} disabled={editId !== null || deletingId !== null}>Edit</Button>{' '}<Button size="sm" variant="ghost" onClick={() => removeFromDefault(row)} disabled={editId !== null || deletingId !== null}>{deletingId === row.id ? 'Deleting…' : 'Delete'}</Button></td>
                </tr>)))}
            </tbody>
          </table>
        </div>
        <Pagination {...defaultPg.pager}/>
      </div>}
      {tab === 'default' && <ClassHistoryModal target={histTarget} onClose={() => setHistTarget(null)}/>}
    </AppLayout>);
}

// ======================================================
// END: AssetClasses
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : AssetClasses.jsx
// ======================================================
