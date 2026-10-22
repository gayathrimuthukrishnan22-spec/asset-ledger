// ======================================================
// File Name : BonusDepreciation.jsx
// Purpose   : Page-level component for the Bonus Depreciation
//             (IRC §168(k)) rates & rules reference
// ======================================================

import { useEffect, useState } from 'react';
import { AppLayout } from '../../layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Table } from '../../components/ui/Table';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { useBonusRates } from '../../hooks/useBonusRates';
import { useBooks } from '../../hooks/useBooks';
import { configApi } from '../../api/config.api';

// ======================================================
// START: Page Component
// ======================================================

const TABS = [
    { id: 'timeline', label: 'Timeline View' },
    { id: 'rules', label: 'Eligibility Rules' },
    { id: 'limits', label: 'Vehicle Limits' }
];

// ======================================================
// Function : pctTone
// Purpose  : Returns the pill colour class for a bonus percentage (green 100+, amber 40+, red below).
// ======================================================
function pctTone(pct) {
    if (pct >= 100) return 'pill-green';
    if (pct >= 40) return 'pill-amber';
    return 'pill-red';
}

// ======================================================
// Function : downloadBonusCSV
// Purpose  : Exports the bonus depreciation table as a CSV file.
// ======================================================
function downloadBonusCSV(rates) {
    const rows = ['Year Placed in Service,Bonus %,Longer Production Period %,Legislative Authority,Notes'];
    rates.forEach((r) => {
        rows.push(`"${r.year}",${r.pct},${r.lpp},"${r.law}","${r.notes}"`);
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'bonus_depreciation_rates.csv';
    a.click();
}


// ======================================================
// Function : CustomBonusTable
// Purpose  : "Customize Table" - Book / Company / Asset Type (blank = "-" = all)
//            + Year placed in service -> Bonus %, with + Add Rule / Edit / Delete.
//            Starts empty; anything without a rule here follows the Default Table.
// ======================================================

const blankRule = () => ({ book: '', company: '', assetType: '', fromDate: '', toDate: '', yearLabel: '', pct: '', lpp: '', law: '', notes: '', highlight: false });
const dash = (v) => (v ? v : '-');

function CustomBonusTable() {
    const { names: bookNames } = useBooks();
    const [rows, setRows] = useState([]);
    const [companies, setCompanies] = useState([]);
    const [assetTypes, setAssetTypes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [editingId, setEditingId] = useState(null);
    const [draft, setDraft] = useState(null);
    const [busy, setBusy] = useState(false);
    const [saveError, setSaveError] = useState('');
    const pg = usePagination(rows);

    useEffect(() => {
        configApi.getCustomBonusRules()
            .then((data) => setRows(data))
            .catch(() => setError('Could not load the customize table from the database.'))
            .finally(() => setLoading(false));
        configApi.getCompanies().then((m) => setCompanies(Object.keys(m ?? {}))).catch(() => {});
        configApi.getAssetClasses().then((a) => setAssetTypes(Array.from(new Set(a.map((r) => r.name))))).catch(() => {});
    }, []);

    const set = (k, v) => setDraft((d) => ({ ...d, [k]: v }));

    // Paste rows copied from Excel: Book | Company | Asset Type | year | bonus %   ("-" = all)
    const [pasteOpen, setPasteOpen] = useState(false);
    const [pasteText, setPasteText] = useState('');
    const [pasteMsg, setPasteMsg] = useState('');
    const importPasted = async () => {
        setBusy(true); setPasteMsg('');
        const created = []; const failed = [];
        const lines = pasteText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
        for (let i = 0; i < lines.length; i += 1) {
            const cells = lines[i].split(lines[i].includes('\t') ? '\t' : ',').map((c) => c.trim());
            if (i === 0 && /^book$/i.test(cells[0])) continue; // header row
            const [book, company, assetType, year, pctRaw] = cells;
            const blank = (v) => (!v || v === '-' ? '' : v);
            try {
                created.push(await configApi.createCustomBonusRule({ book: blank(book), company: blank(company), assetType: blank(assetType), yearLabel: year ?? '', pct: (pctRaw ?? '').replace(/%/g, ''), lpp: '', law: '', notes: '', highlight: false }));
            } catch (e) { failed.push(`Row ${i + 1}: ${e.message || 'could not save'}`); }
        }
        if (created.length) setRows((rs) => [...created, ...rs]);
        setPasteMsg(`Added ${created.length} row${created.length === 1 ? '' : 's'}${failed.length ? `; ${failed.length} skipped — ${failed.join(' | ')}` : '.'}`);
        if (!failed.length) setPasteText('');
        setBusy(false);
    };
    const startAdd = () => { setSaveError(''); setEditingId('new'); setDraft(blankRule()); };
    const startEdit = (r) => { setSaveError(''); setEditingId(r.id); setDraft({ book: r.book, company: r.company, assetType: r.assetType, fromDate: r.fromDate, toDate: r.toDate, yearLabel: r.yearLabel, pct: String(r.pct), lpp: r.lpp === r.pct ? '' : String(r.lpp), law: r.law, notes: r.notes, highlight: r.highlight }); };
    const cancel = () => { setEditingId(null); setDraft(null); setSaveError(''); };

    const save = async () => {
        setBusy(true);
        setSaveError('');
        try {
            const body = { ...draft, yearLabel: draft.yearLabel.trim() };
            if (editingId === 'new') {
                const created = await configApi.createCustomBonusRule(body);
                setRows((rs) => [created, ...rs]);
            } else {
                const updated = await configApi.updateCustomBonusRule(editingId, body);
                setRows((rs) => rs.map((r) => (r.id === editingId ? updated : r)));
            }
            cancel();
        } catch (e) {
            setSaveError(e.message || 'Could not save the rule.');
        } finally { setBusy(false); }
    };

    const remove = async (r) => {
        if (!window.confirm(`Delete the “${r.yearLabel}” row (${r.pct}%)? It will go back to following the Default Table.`)) return;
        setBusy(true);
        setSaveError('');
        try {
            await configApi.deleteCustomBonusRule(r.id);
            setRows((rs) => rs.filter((x) => x.id !== r.id));
        } catch (e) {
            setSaveError(e.message || 'Could not delete the rule.');
        } finally { setBusy(false); }
    };

    const sel = (key, list) => (<select className="btn btn-ghost" style={{ width: '100%', minWidth: 96, maxWidth: 170 }} value={draft[key]} onChange={(e) => set(key, e.target.value)}>
        <option value="">- (All)</option>
        {Array.from(new Set([...list, draft[key]].filter(Boolean))).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>);

    const editRow = (key) => (<tr key={key}>
      <td>{sel('book', bookNames)}</td>
      <td>{sel('company', companies)}</td>
      <td>{sel('assetType', assetTypes)}</td>
      <td style={{ minWidth: 200 }}>
        <input className="btn btn-ghost" style={{ width: '100%' }} placeholder="2026 · 2027+ · Jan 2026 – Jun 2026" value={draft.yearLabel} onChange={(e) => set('yearLabel', e.target.value)}/>
      </td>
      <td className="num"><input className="btn btn-ghost" style={{ width: 70, textAlign: 'right' }} value={draft.pct} onChange={(e) => set('pct', e.target.value)}/></td>
      <td><input className="btn btn-ghost" style={{ width: 80 }} placeholder="same" value={draft.lpp} onChange={(e) => set('lpp', e.target.value)}/></td>
      <td><input className="btn btn-ghost" style={{ width: 150 }} value={draft.law} onChange={(e) => set('law', e.target.value)}/></td>
      <td><input className="btn btn-ghost" style={{ width: 220 }} value={draft.notes} onChange={(e) => set('notes', e.target.value)}/></td>
      <td style={{ whiteSpace: 'nowrap' }}>
        <Button size="sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>{' '}
        <Button size="sm" variant="ghost" onClick={cancel} disabled={busy}>Cancel</Button>
      </td>
    </tr>);

    return (<div className="card">
      <div className="card-head" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h3>Customize Table</h3>
        <Button size="sm" onClick={startAdd} disabled={editingId !== null || busy}>+ Add Rule</Button>
        <Button size="sm" variant="ghost" onClick={() => setPasteOpen((o) => !o)} disabled={busy}>Paste from Excel</Button>
      </div>
      {pasteOpen && (<div className="card-pad" style={{ paddingTop: 0 }}>
        <p className="text-muted text-sm">Copy the cells from Excel — columns <b>Book, Company, Asset Type, year, bonus %</b> (header row optional, “-” = all) — and paste below. Each row becomes a rule; the year can be 2026, 2027+ or 2026–2027.</p>
        <textarea className="btn btn-ghost" style={{ width: '100%', minHeight: 110, textAlign: 'left', fontFamily: 'monospace' }} value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder={'Book\tCompany\tAsset Type\tyear\tbonus %\nFederal\t-\t-\t2027\t60%'}/>
        <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Button size="sm" onClick={importPasted} disabled={busy || !pasteText.trim()}>{busy ? 'Adding…' : 'Add rows'}</Button>
          {pasteMsg && <span className="text-sm">{pasteMsg}</span>}
        </div>
      </div>)}
      <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 4 }}>
        <p className="text-muted text-sm">Same columns as the Default Table, plus Book, Company and Asset Type (“-” = all). Type a year like 2026, 2027+ or Jan 2026 – Jun 2026. Rows marked “Default” are copies of the Default Table and change nothing until you edit them. If several rows fit an asset, the one with more of Book / Company / Asset Type set wins; on a tie Book beats Company beats Asset Type.</p>
      </div>
      {saveError && <div className="card-pad text-sm" style={{ color: 'var(--danger, #b91c1c)' }}>{saveError}</div>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Company</th>
              <th>Asset Type</th>
              <th>Year Placed in Service</th>
              <th className="num">Bonus %</th>
              <th>Longer Production Period / Aircraft</th>
              <th>Legislative Authority</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="text-muted">Loading…</td></tr>}
            {!loading && error && <tr><td colSpan={9} className="text-muted">{error}</td></tr>}
            {!loading && !error && !rows.length && editingId !== 'new' && <tr><td colSpan={9} className="text-muted">No custom rules yet. Click “+ Add Rule” to add one.</td></tr>}
            {draft && editingId === 'new' && editRow('new')}
            {pg.pageItems.map((r) => (editingId === r.id && draft
              ? editRow(r.id)
              : (<tr key={r.id} style={r.highlight ? { background: '#f0fdf4' } : undefined}>
                <td className="text-sm">{dash(r.book)}</td>
                <td className="text-sm">{dash(r.company)}</td>
                <td className="text-sm" style={{ whiteSpace: 'nowrap' }}>{dash(r.assetType)}</td>
                <td>{r.yearLabel}</td>
                <td className="num"><span className={`pill ${pctTone(r.pct)}`}>{r.pct}%</span></td>
                <td>{r.lpp !== r.pct ? `${r.lpp}%` : '—'}</td>
                <td className="text-muted text-sm">{r.law}</td>
                <td className="text-muted text-sm">{r.notes}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {!r.active && <span className="pill" style={{ marginRight: 6 }} title="Untouched copy of the Default Table row. Edit it to override the default.">Default</span>}
                  <Button size="sm" variant="ghost" onClick={() => startEdit(r)} disabled={editingId !== null || busy}>Edit</Button>{' '}
                  <Button size="sm" variant="ghost" onClick={() => remove(r)} disabled={editingId !== null || busy}>Delete</Button>
                </td>
              </tr>)))}
          </tbody>
        </table>
      </div>
      <Pagination {...pg.pager}/>
    </div>);
}

// ======================================================
// END: CustomBonusTable
// ======================================================

// ======================================================
// Function : BonusDepreciation
// Purpose  : React component that renders the 'Bonus Depreciation' UI
// ======================================================

export function BonusDepreciation() {
    const [table, setTable] = useState('default');
    const [tab, setTab] = useState('timeline');
    const { rates, reference } = useBonusRates();
    const bonusPg = usePagination(rates);
    const QUALIFYING_RULES = reference.qualifyingRules;
    const EXCLUDED_PROPERTY = reference.excludedProperty;
    const VEHICLE_LIMITS = reference.vehicleLimits;

    const rulesColumns = [
        { header: 'Requirement', render: (r) => <strong>{r.requirement}</strong> },
        { header: 'Details', render: (r) => r.details }
    ];
    const excludedColumns = [
        { header: 'Excluded Property', render: (r) => r.property },
        { header: 'Reason', render: (r) => r.reason }
    ];
    const limitsColumns = [
        { header: 'Year Placed in Service', render: (r) => r.year },
        { header: 'Year 1 (with Bonus)', numeric: true, render: (r) => r.y1Bonus },
        { header: 'Year 1 (no Bonus)', numeric: true, render: (r) => r.y1NoBonus },
        { header: 'Year 2', numeric: true, render: (r) => r.y2 },
        { header: 'Year 3', numeric: true, render: (r) => r.y3 },
        { header: 'Year 4+', numeric: true, render: (r) => r.y4 }
    ];

    return (<AppLayout active="bonus" title="Bonus Depreciation" crumb="Home / Configuration / Bonus Depreciation">
      <div className="page-header">
        <div>
          <h1>Bonus Depreciation Rates — IRC §168(k)</h1>
          <p>Historical and current additional first-year depreciation percentages</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-pad">
          <div style={{ minWidth: 200, maxWidth: 280 }}>
            <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Table</div>
            <select className="btn btn-ghost" style={{ width: '100%', textAlign: 'left' }} value={table} onChange={(e) => setTable(e.target.value)}>
              <option value="default">Default Table</option>
              <option value="custom">Customize Table</option>
            </select>
          </div>
        </div>
      </div>

      {table === 'custom' && <CustomBonusTable/>}

      {table === 'default' && <div className="tabs">
        {TABS.map((t) => (<div key={t.id} className={`tab ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </div>))}
      </div>}

      {table === 'default' && tab === 'timeline' && (<>
          <div className="card mb-4">
            <div className="card-pad flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
              <div className="legend" style={{ flexDirection: 'row', gap: 20 }}>
                <div className="li"><span className="dot" style={{ background: 'var(--green)' }}/>100% (Full expensing)</div>
                <div className="li"><span className="dot" style={{ background: 'var(--amber)' }}/>Partial bonus (phase-out)</div>
                <div className="li"><span className="dot" style={{ background: 'var(--red)' }}/>No bonus / expired</div>
              </div>
              <Button variant="ghost" onClick={() => downloadBonusCSV(rates)} style={{ marginLeft: 'auto' }}>
                Export CSV
              </Button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <h3>Bonus Depreciation Percentage by Year Placed in Service</h3>
            </div>
            <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 4 }}>
              <p className="text-muted text-sm">
                IRC §168(k) additional first-year depreciation allowance. Applies to qualified property with recovery period of 20 years or less, computer software, water utility property, and qualified film/TV/live theatrical productions.
              </p>
            </div>
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>Year Placed in Service</th>
                    <th className="num">Bonus %</th>
                    <th>Longer Production Period / Aircraft</th>
                    <th>Legislative Authority</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {bonusPg.pageItems.map((row) => (<tr key={row.year} style={row.highlight ? { background: '#f0fdf4' } : undefined}>
                      <td>{row.year}</td>
                      <td className="num"><span className={`pill ${pctTone(row.pct)}`}>{row.pct}%</span></td>
                      <td>{row.lpp !== row.pct ? `${row.lpp}%` : '—'}</td>
                      <td className="text-muted text-sm">{row.law}</td>
                      <td className="text-muted text-sm">{row.notes}</td>
                    </tr>))}
                </tbody>
              </table>
            </div>
            <Pagination {...bonusPg.pager}/>
          </div>
        </>)}

      {table === 'default' && tab === 'rules' && (<>
          <div className="card mb-4">
            <div className="card-head"><h3>Qualifying Property Rules</h3></div>
            <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 4 }}>
              <p className="text-muted text-sm">Property must meet all of the following to qualify for bonus depreciation under §168(k).</p>
            </div>
            <Table columns={rulesColumns} rows={QUALIFYING_RULES} rowKey={(r) => r.requirement}/>
          </div>
          <div className="card">
            <div className="card-head"><h3>Property NOT Eligible for Bonus</h3></div>
            <Table columns={excludedColumns} rows={EXCLUDED_PROPERTY} rowKey={(r) => r.property}/>
          </div>
        </>)}

      {table === 'default' && tab === 'limits' && (<div className="card">
          <div className="card-head"><h3>Luxury Auto Depreciation Limits (Passenger Vehicles)</h3></div>
          <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 4 }}>
            <p className="text-muted text-sm">IRC §280F limits on depreciation for passenger automobiles. Amounts shown include bonus depreciation where applicable. Updated annually by IRS Revenue Procedures.</p>
          </div>
          <Table columns={limitsColumns} rows={VEHICLE_LIMITS} rowKey={(r) => r.year}/>
          <div className="card-pad" style={{ paddingTop: 4 }}>
            <p className="text-muted text-sm">
              Note: SUVs/trucks over 6,000 lbs GVWR are exempt from §280F limits but subject to §179 SUV limit ($30,500 for 2024). Vehicles over 6,000 lbs can take full bonus depreciation without the luxury auto cap.
            </p>
          </div>
        </div>)}

      <div className="card mt-4">
        <div className="card-pad text-muted" style={{ fontSize: 11.5, lineHeight: 1.7 }}>
          <strong>Sources:</strong><br/>
          • IRC §168(k) as amended by TCJA (P.L. 115-97, 2017), CARES Act (P.L. 116-136, 2020), and One Big Beautiful Bill Act (OBBBA, P.L. 119-94, 2025).<br/>
          • IRS Publication 946 (2025), Chapter 3 — Claiming the Special Depreciation Allowance.<br/>
          • IRS Notice 2026-11 — Interim Guidance on Additional First Year Depreciation Deduction under §168(k).<br/>
          • Revenue Procedure 2024-13 (luxury auto limits for 2024); Revenue Procedure 2025-16 (2025 limits).<br/><br/>
          <strong>Key OBBBA Change (2025):</strong> Bonus depreciation permanently restored to 100% for qualified property acquired after January 19, 2025. Property acquired before that date but placed in service in 2025 gets 40% (or 60% for longer production period property/aircraft).
        </div>
      </div>
    </AppLayout>);
}

// ======================================================
// END: BonusDepreciation
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : BonusDepreciation.jsx
// ======================================================
