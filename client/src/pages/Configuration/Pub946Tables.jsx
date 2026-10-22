// ======================================================
// File Name : Pub946Tables.jsx
// Purpose   : Page-level component for the IRS Publication 946
//             MACRS percentage tables reference (Appendix A-1..A-24)
// ======================================================

import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '../../layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { configApi } from '../../api/config.api';
import { downloadCsv } from '../../utils/csv';

// ======================================================
// START: Page Component
// ======================================================

const CONVENTIONS = [
    { value: 'all', label: 'All' },
    { value: 'HY', label: 'Half-Year' },
    { value: 'MQ', label: 'Mid-Quarter' },
    { value: 'MM', label: 'Mid-Month' }
];

// ======================================================
// Function : exportTableCsv
// Purpose  : Exports the selected Pub 946 percentage table as a CSV file.
// ======================================================
function exportTableCsv(table) {
    const rows = [['Year', ...table.columns].join(',')];
    const maxRows = Math.max(...table.data.map((col) => col.length));
    for (let r = 0; r < maxRows; r++) {
        const row = [r + 1];
        table.data.forEach((col) => row.push(r < col.length && col[r] !== null ? col[r] : ''));
        rows.push(row.join(','));
    }
    downloadCsv(`${table.id.replace(/\s/g, '_')}.csv`, rows.join('\n'));
}

// ======================================================
// Function : Pub946Tables
// Purpose  : React component that renders the 'Pub 946' UI
// ======================================================

export function Pub946Tables() {
    // The tables come from the database (pub946_tables) - nothing is hard-coded in the client.
    const [tables, setTables] = useState([]);
    const [loadError, setLoadError] = useState('');
    useEffect(() => {
        let alive = true;
        configApi.getPub946Tables()
            .then((rows) => { if (alive) setTables(Array.isArray(rows) ? rows : []); })
            .catch((err) => { if (alive) setLoadError(err instanceof Error ? err.message : 'Could not load Pub 946 tables'); });
        return () => { alive = false; };
    }, []);
    const [convention, setConvention] = useState('all');
    const filteredTables = useMemo(() => tables.filter((t) => convention === 'all' || t.convention === convention), [tables, convention]);
    const [selectedId, setSelectedId] = useState('');
    const table = filteredTables.find((t) => t.id === selectedId) ?? filteredTables[0];

    const maxRows = table ? Math.max(...table.data.map((col) => col.length)) : 0;
    const totals = table ? table.data.map((col) => col.reduce((sum, v) => sum + (v !== null ? v : 0), 0)) : [];

    const yearRows = useMemo(() => Array.from({ length: maxRows }, (_, r) => r), [maxRows]);
    const yearPg = usePagination(yearRows);

    return (<AppLayout active="pub946" title="Pub 946 Tables" crumb="Home / Configuration / Pub 946 Tables">
      <div className="page-header">
        <div>
          <h1>IRS Publication 946 — MACRS Percentage Tables</h1>
          <p>Appendix A: complete depreciation rate tables (A-1 through A-24)</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-pad flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div className="pub946-rate-field">
            <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Rate Table</div>
            <select className="btn btn-ghost pub946-rate-select" value={table?.id} onChange={(e) => setSelectedId(e.target.value)}>
              {filteredTables.map((t) => (<option key={t.id} value={t.id}>{t.id} — {t.shortName}</option>))}
            </select>
          </div>
          <div>
            <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Convention</div>
            <select className="btn btn-ghost" value={convention} onChange={(e) => setConvention(e.target.value)}>
              {CONVENTIONS.map((c) => (<option key={c.value} value={c.value}>{c.label}</option>))}
            </select>
          </div>
          <Button variant="ghost" onClick={() => table && exportTableCsv(table)} style={{ marginLeft: 'auto' }}>
            Export CSV
          </Button>
        </div>
      </div>

      {loadError && (<p className="text-muted">{loadError}</p>)}
      {!loadError && tables.length === 0 && (<p className="text-muted">Loading…</p>)}

      {table && (<div className="card">
          <div className="card-head">
            <h3>{table.id}: {table.title}</h3>
          </div>
          <div className="card-pad" style={{ paddingTop: 0, paddingBottom: 4 }}>
            <p className="text-muted text-sm">{table.subtitle}</p>
          </div>
          <div className="table-wrap pub946-table-wrap">
            <table className="table pub946-table">
              <thead>
                <tr>
                  <th>Year</th>
                  {table.columns.map((col) => (<th key={col} className="num">{col}</th>))}
                </tr>
              </thead>
              <tbody>
                {yearPg.pageItems.map((r) => (<tr key={r}>
                    <td className="mono">{r + 1}</td>
                    {table.data.map((col, ci) => (<td key={ci} className="num">
                        {r < col.length && col[r] !== null ? `${col[r].toFixed(3)}%` : ''}
                      </td>))}
                  </tr>))}
                <tr className="pub946-total-row">
                  <td>Total</td>
                  {totals.map((sum, i) => (<td key={i} className="num">{sum.toFixed(3)}%</td>))}
                </tr>
              </tbody>
            </table>
          </div>
          <Pagination {...yearPg.pager}/>
        </div>)}

      <div className="card mt-4">
        <div className="card-pad text-muted" style={{ fontSize: 11.5, lineHeight: 1.6 }}>
          <strong>Source:</strong> IRS Publication 946 (2025) — How To Depreciate Property, Appendix A.<br/>
          These tables provide the annual depreciation percentage for each year of the recovery period based on the applicable depreciation method, recovery period, and convention.
        </div>
      </div>
    </AppLayout>);
}

// ======================================================
// END: Pub946Tables
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : Pub946Tables.jsx
// ======================================================
