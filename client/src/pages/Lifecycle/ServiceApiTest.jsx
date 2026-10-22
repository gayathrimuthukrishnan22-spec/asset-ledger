// ======================================================
// File Name : ServiceApiTest.jsx
// Purpose   : Test page for the machine-to-machine Service API
//             (POST /api/service/lifecycle/bulk-import). Lets you pick an
//             event type, upload the same CSV the Bulk Import page uses, and
//             send it WITH an x-api-key — exactly what an external system
//             (ERP) would do. Also has buttons to prove the auth (no key ->
//             401) and the row cap (501 rows -> 413). Rows posted from here
//             show "svc:<name>" in the Posted By column.
// ======================================================

import { useState } from 'react';
import { lifecycleApi } from '../../api/lifecycle.api';
import { AppLayout } from '../../layout/AppLayout';
import { Pill } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { FIELD_SCHEMAS } from '../../data/lifecycleFormSchemas';
import { useFormOptions } from '../../hooks/useFormOptions';
import { parseCsv, buildTemplateCsv, downloadCsv, rowsToLifecycleRows, EVENT_LABELS } from '../../utils/csv';

const EVENTS = EVENT_LABELS.map((label) => ({ label, id: label.toLowerCase() }));

export function ServiceApiTest() {
    useFormOptions();
    const [eventId, setEventId] = useState('addition');
    const [apiKey, setApiKey] = useState('');
    const [skipKey, setSkipKey] = useState(false);
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState([]);
    const [parseError, setParseError] = useState('');
    const [sending, setSending] = useState(false);
    const [response, setResponse] = useState(null); // { status, ok, body, sentRows }

    const evt = EVENTS.find((e) => e.id === eventId);
    const schema = FIELD_SCHEMAS[eventId] ?? [];

    function onFileChange(e) {
        const file = e.target.files?.[0];
        setResponse(null);
        setParseError('');
        setRows([]);
        if (!file) return;
        setFileName(file.name);
        file.text().then((text) => {
            try {
                const expectedHeaders = ['assetNumber', ...schema.map((f) => f.key)];
                const { rows: parsed } = parseCsv(text, expectedHeaders);
                if (parsed.length === 0) { setParseError('No data rows found in this file.'); return; }
                setRows(parsed);
            } catch {
                setParseError('Could not read this file as CSV.');
            }
        });
    }

    async function send(payloadRows) {
        setSending(true);
        setResponse(null);
        try {
            const res = await lifecycleApi.serviceBulkImport(skipKey ? '' : apiKey.trim(), { eventType: evt.label, rows: payloadRows });
            setResponse({ ...res, sentRows: payloadRows.length });
        } catch (err) {
            setResponse({ status: 0, ok: false, body: { error: `Could not reach the server: ${err.message}` }, sentRows: payloadRows.length });
        } finally {
            setSending(false);
        }
    }

    const sendCsv = () => send(rowsToLifecycleRows(rows, schema));
    // 501 dummy rows — the server rejects the whole request with 413 BEFORE
    // posting anything, so this is safe to click.
    const sendTooMany = () => send(Array.from({ length: 501 }, (_, i) => ({ assetNumber: `LIMIT-TEST-${i + 1}`, fields: {} })));

    const body = response?.body;
    const results = Array.isArray(body?.results) ? body.results : [];

    return (<AppLayout active="bulk-import" title="Service API Test" crumb="Home / Lifecycle Events / Bulk Import / Service API Test">
      <div className="page-header">
        <div>
          <h1>Service API Test</h1>
          <p>Sends a CSV through the machine-to-machine endpoint the way an external system would — with an API key. Posts here are real and permanent, so use test asset numbers.</p>
        </div>
        <Button variant="ghost" to="/lifecycle/bulk-import">← Back to Bulk Import</Button>
      </div>

      <div className="grid grid-2">
        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginTop: 0 }}>1. Request</h3>

          <div className="form-row">
            <label htmlFor="svc-key">API key (created with: npm run service-account -- create &lt;name&gt;)</label>
            <input id="svc-key" type="password" autoComplete="off" value={apiKey} disabled={skipKey} onChange={(e) => setApiKey(e.target.value)} placeholder="paste the full key, e.g. alk_..."/>
          </div>
          <div className="form-row">
            <label><input type="checkbox" checked={skipKey} onChange={(e) => setSkipKey(e.target.checked)}/> Send without API key (should come back 401)</label>
          </div>

          <div className="form-row">
            <label htmlFor="svc-event">Event type</label>
            <select id="svc-event" value={eventId} onChange={(e) => { setEventId(e.target.value); setRows([]); setFileName(''); setResponse(null); setParseError(''); }}>
              {EVENTS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>

          <div className="flex gap-2 mt-2 mb-2">
            <Button variant="ghost" size="sm" onClick={() => downloadCsv(`${eventId}-template.csv`, buildTemplateCsv(schema))}>Download CSV Template</Button>
          </div>

          <div className="form-row">
            <label htmlFor="svc-file">Upload filled-in CSV</label>
            <input id="svc-file" type="file" accept=".csv,text/csv" onChange={onFileChange}/>
            {fileName && <div className="hint">{fileName}{rows.length > 0 ? ` — ${rows.length} row(s) ready` : ''}</div>}
          </div>
          {parseError && <p className="text-sm" style={{ color: 'var(--danger, #dc2626)' }}>{parseError}</p>}

          <div className="flex gap-2 mt-2">
            <Button onClick={sendCsv} disabled={sending || rows.length === 0 || (!skipKey && !apiKey.trim())}>{sending ? 'Sending…' : `Send ${rows.length || ''} row(s) via Service API`}</Button>
            <Button variant="ghost" onClick={sendTooMany} disabled={sending || (!skipKey && !apiKey.trim())}>Test row limit (501 dummy rows)</Button>
          </div>
          <p className="text-sm text-muted" style={{ marginTop: 8 }}>The row-limit button posts nothing — the server refuses the whole request with 413.</p>
        </div>

        <div className="card card-pad">
          <h3 style={{ fontSize: 14, marginTop: 0 }}>2. Response</h3>
          {!response && <p className="text-muted text-sm">Nothing sent yet.</p>}
          {response && (<>
            <p style={{ margin: '0 0 8px' }}>
              <Pill tone={response.ok ? 'green' : 'red'}>HTTP {response.status || 'no response'}</Pill>{' '}
              {response.ok && body?.summary && <span className="text-sm">{body.summary.posted} posted, {body.summary.failed} failed (of {body.summary.total})</span>}
              {!response.ok && <span className="text-sm">{body?.error || 'Request failed'}</span>}
            </p>
            {results.length > 0 && (<div style={{ maxHeight: 320, overflow: 'auto' }}>
                <table className="table">
                  <thead><tr><th>Asset #</th><th>Status</th><th>Error</th></tr></thead>
                  <tbody>
                    {results.map((r, i) => (<tr key={i}>
                        <td className="mono">{r.assetNumber}</td>
                        <td><Pill tone={r.status === 'posted' ? 'green' : 'red'}>{r.status}</Pill></td>
                        <td className="text-sm">{r.error || ''}</td>
                      </tr>))}
                  </tbody>
                </table>
              </div>)}
            {response.ok && results.some((r) => r.status === 'posted') && (<p className="text-sm text-muted" style={{ marginTop: 8 }}>
                To confirm who posted it: open the asset (Asset Register → asset → Transactions tab) — Posted By should read <strong>svc:&lt;your key name&gt;</strong>.
              </p>)}
          </>)}
        </div>
      </div>
    </AppLayout>);
}

// ======================================================
// END OF FILE : ServiceApiTest.jsx
// ======================================================
