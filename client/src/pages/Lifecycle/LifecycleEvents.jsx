// ======================================================
// File Name : LifecycleEvents.jsx
// Purpose   : Page-level component for LifecycleEvents — the "Select
//             Event Type" picker now has a 7th card, Master Data Set,
//             alongside the six real event types. Picking one of the six
//             keeps the original single-asset flow (fill the field form,
//             Calculate Preview, Confirm & Post). Picking Master Data
//             Set swaps in the bulk flow (was its own /lifecycle/
//             master-data-set page, folded in here): build a set of
//             assets from the register, choose a mode, then download a
//             CSV pre-filled with that set, fill it in, and upload it
//             back to post through POST /api/lifecycle/bulk-post.
// ======================================================

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { lifecycleApi } from '../../api/lifecycle.api';
import { assetsApi } from '../../api/assets.api';
import { AppLayout } from '../../layout/AppLayout';
import { Pill } from '../../components/ui/ui';
import { Button } from '../../components/ui/Button';
import { Input, Select } from '../../components/ui/Input';
import { Loader } from '../../components/common/Loader';
import { EmptyState } from '../../components/common/EmptyState';
import { ErrorMessage } from '../../components/common/ErrorMessage';
import { formatCurrency } from '../../utils/formatCurrency';
import { useAssets } from '../../hooks/useAssets';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { useAuth } from '../../hooks/useAuth';
import { useAssetClasses } from '../../hooks/useAssetClasses';
import { FIELD_SCHEMAS, FIELD_DEFAULTS, reinstatementFieldsFromAsset } from '../../data/lifecycleFormSchemas';
import { useFormOptions } from '../../hooks/useFormOptions';
import { EVENT_FORM_COMPONENTS } from './eventForms';
import {
    parseCsv,
    downloadCsv,
    rowsToLifecycleRows,
    rowsToBulkPostRows,
    findUnmatchedSelectValues,
    findUnmatchedSelectValuesUnified,
    resolveEventId,
    EVENT_LABELS,
    buildTemplateCsvWithAssets,
    buildUnifiedTemplateCsvForAsset
} from '../../utils/csv';


// ======================================================
// START: Page Component
// ======================================================

// The 7th "card" in the picker — not a real lifecycle event type (it isn't
// in the server's /lifecycle/event-types list, so it's never sent as an
// eventType), just a UI switch that swaps the single-asset form below for
// the bulk-set-of-assets flow.
const MASTER_DATA_SET_CARD = { id: 'master-data-set', label: 'Master Data Set', description: 'Bulk-post via CSV to a set of assets', icon: '☑', color: 'gray' };

// ======================================================
// Function : LifecycleEvents
// Purpose  : React component that renders the 'LifecycleEvents' UI
// ======================================================

export function LifecycleEvents() {
    useFormOptions();
    const assetClassNames = useAssetClasses();
    const { user, hasEdit } = useAuth();
    const canPost = hasEdit('lifecycle');
    const [searchParams] = useSearchParams();
    const typeFromUrl = searchParams.get('type');
    const assetFromUrl = searchParams.get('asset');

    const [eventTypes, setEventTypes] = useState([]);
    const [selected, setSelected] = useState(typeFromUrl);
    const [assetNumber, setAssetNumber] = useState(assetFromUrl ?? '');
    // True only when we land here with a type already picked (Post Event
    // dropdown on Asset Detail) — that flow collapses the type picker
    // into a one-line summary since the choice is already made. Coming in
    // via the sidebar (no type in the URL) keeps the cards on screen even
    // after picking one, so switching event types is a single click.
    const [cardsCollapsed, setCardsCollapsed] = useState(!!typeFromUrl);
    // One bucket of field values per card, so switching cards never loses
    // what you typed into the other one.
    const [formDataByType, setFormDataByType] = useState(() => ({ ...FIELD_DEFAULTS }));
    const [preview, setPreview] = useState(null);
    const [loading, setLoading] = useState(false);
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [posting, setPosting] = useState(false);
    const [posted, setPosted] = useState(false);
    const [postError, setPostError] = useState('');
    // Asset Number the register already has (checked as you type). One asset
    // number can only ever have ONE Addition, so once the number in the box
    // belongs to an existing asset, the Addition card is greyed out and the
    // Addition form refuses to calculate/post. Stored as the number itself
    // (not a boolean) so a stale result never applies to a different number.
    const [existingAssetNumber, setExistingAssetNumber] = useState('');

    // ---- Master Data Set (7th card) state ------------------------------
    // Kept separate from the single-asset state above (different names)
    // since the two flows are otherwise independent — only the "Select
    // Event Type" picker and this page shell are shared.
    const [mdsAssetClass, setMdsAssetClass] = useState('All Classes');
    const [mdsCompany, setMdsCompany] = useState('All Companies');
    const [mdsStatus, setMdsStatus] = useState('All Statuses');
    const [mdsQuery, setMdsQuery] = useState('');
    const [assetSet, setAssetSet] = useState(() => new Map()); // assetNumber -> asset row
    const [mdsMode, setMdsMode] = useState('many'); // 'many' | 'one'
    const [mdsOneAsset, setMdsOneAsset] = useState(null); // single asset row, 'one' mode only

    const { items: mdsItems, total: mdsTotal, loading: mdsLoading, error: mdsError, reload: mdsReload } = useAssets({
        assetClass: mdsAssetClass === 'All Classes' ? undefined : mdsAssetClass,
        company: mdsCompany === 'All Companies' ? undefined : mdsCompany,
        status: mdsStatus === 'All Statuses' ? undefined : mdsStatus,
        q: mdsQuery || undefined
    });

    const assetSetList = useMemo(() => Array.from(assetSet.values()), [assetSet]);

    function toggleSetAsset(asset) {
        setAssetSet((prev) => {
            const next = new Map(prev);
            if (next.has(asset.assetNumber)) next.delete(asset.assetNumber);
            else next.set(asset.assetNumber, asset);
            return next;
        });
    }

    function toggleAllVisibleSetAssets() {
        setAssetSet((prev) => {
            const next = new Map(prev);
            const allVisibleSelected = mdsItems.length > 0 && mdsItems.every((a) => next.has(a.assetNumber));
            mdsItems.forEach((a) => {
                if (allVisibleSelected) next.delete(a.assetNumber);
                else next.set(a.assetNumber, a);
            });
            return next;
        });
    }

    function clearAssetSet() {
        setAssetSet(new Map());
    }

    useEffect(() => {
        lifecycleApi.getEventTypes().then(setEventTypes);
    }, []);

    // /lifecycle is a single Route, so navigating between "/lifecycle"
    // (sidebar, no params) and "/lifecycle?type=...&asset=..." (Post
    // Event dropdown) re-renders this same component instead of
    // remounting it — the useState initializers above only run once, on
    // the very first mount. Keep the selection/asset in sync with the
    // URL on every navigation so both entry points behave correctly
    // every time, not just on first load.
    useEffect(() => {
        setSelected(typeFromUrl);
        setAssetNumber(assetFromUrl ?? '');
        setCardsCollapsed(!!typeFromUrl);
        setPreview(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [typeFromUrl, assetFromUrl]);

    // Debounced lookup: does the Asset Register already have this number?
    // A lookup error (not found / offline) just means "not known to exist" —
    // the server still enforces the rule authoritatively when posting.
    useEffect(() => {
        const n = assetNumber.trim();
        if (!n) { setExistingAssetNumber(''); return; }
        let cancelled = false;
        const t = setTimeout(() => {
            assetsApi.getByNumber(encodeURIComponent(n))
                .then(() => { if (!cancelled) setExistingAssetNumber(n); })
                .catch(() => { if (!cancelled) setExistingAssetNumber(''); });
        }, 300);
        return () => { cancelled = true; clearTimeout(t); };
    }, [assetNumber]);

    // "Post Event → Reinstatement" on Asset Detail lands here with the real
    // asset's own number in the URL, but until now only that number was
    // carried over — every other field (original cost, PISD, life,
    // original disposal date, A/D at disposal, gain/loss, convention,
    // bonus %) still had to be typed in by hand, which is exactly how a
    // reinstatement can quietly end up describing a different asset than
    // the one that was actually retired. Fetch that same asset's record and
    // prefill the whole card from it — same data, not just the number.
    useEffect(() => {
        if (typeFromUrl !== 'reinstatement' || !assetFromUrl) return;
        let cancelled = false;
        assetsApi.getByNumber(assetFromUrl)
            .then(({ asset }) => {
                if (cancelled) return;
                const fields = reinstatementFieldsFromAsset(asset);
                if (!fields) return;
                const today = new Date().toISOString().slice(0, 10);
                setFormDataByType((prev) => ({
                    ...prev,
                    reinstatement: {
                        ...fields,
                        // Transaction-specific, not part of the original asset —
                        // default to today, user can still change them.
                        reinstatementDate: today,
                        accountingPeriodDate: today
                    }
                }));
            })
            .catch(() => {
                // Lookup failed (e.g. asset not found) — leave the card blank
                // like before rather than blocking the page.
            });
        return () => { cancelled = true; };
    }, [typeFromUrl, assetFromUrl]);

    // The 6 real event types plus the Master Data Set card — what the
    // picker renders and what selectedEvent resolves against.
    const allCards = useMemo(() => [...eventTypes, MASTER_DATA_SET_CARD], [eventTypes]);
    const selectedEvent = allCards.find((e) => e.id === selected);
    const formData = formDataByType[selected] ?? {};
    const isMasterDataSet = selected === 'master-data-set';
    const assetExists = !!assetNumber.trim() && existingAssetNumber === assetNumber.trim();
    const additionBlockMessage = assetExists
        ? `Asset ${assetNumber.trim()} already exists — an asset number can only have one Addition. Use Adjustment, Transfer, Retirement, etc. for this asset instead.`
        : '';
    // Each of the six real event types has its own file under ./eventForms
    // (Addition.jsx, Adjustment.jsx, ...) — this just looks up which one
    // to render for the currently selected card.
    const SelectedEventForm = EVENT_FORM_COMPONENTS[selected];

    function selectCard(id) {
        setSelected(id);
        setPreview(null);
    }

    function setField(key, value) {
        setFormDataByType((prev) => ({
            ...prev,
            [selected]: { ...prev[selected], [key]: value }
        }));
    }

    // Replaces the whole field-value bucket for the active card at once.
    function setFormData(values) {
        setFormDataByType((prev) => ({ ...prev, [selected]: values }));
    }

    async function calculatePreview() {
        setLoading(true);
        setPosted(false);
        try {
            const result = await lifecycleApi.preview({
                eventType: selectedEvent?.label ?? 'Addition',
                assetNumber,
                fields: formData
            });
            setPreview(result);
        } finally {
            setLoading(false);
        }
    }

    // "Confirm & Post" — writes one immutable row to the Postgres
    // asset_transactions ledger. The right-side table keeps showing the
    // same calculation (preview), now marked Posted.
    async function postTransaction() {
        setPosting(true);
        setPostError('');
        try {
            await lifecycleApi.post({
                eventType: selectedEvent?.label ?? 'Addition',
                assetNumber,
                fields: formData,
                preview,
                postedBy: user?.name
            });
            setPosted(true);
            setConfirmOpen(false);
        } catch (err) {
            // e.g. "Asset 123 already has an Addition posted — an asset
            // number can only have one Addition." Keep the modal open and
            // show it instead of failing silently.
            setPostError(err.message || 'Failed to post transaction.');
        } finally {
            setPosting(false);
        }
    }

    const crumb = `Home / Lifecycle Events${selectedEvent ? ` / ${selectedEvent.label}` : ''}`;

    return (<AppLayout active="lifecycle" title="Lifecycle Events" crumb={crumb}>
      <div className="page-header">
        <div>
          <h1>Post Lifecycle Event</h1>
          <p>Process a transaction against an asset and preview its depreciation impact — or pick Master Data Set to bulk-post via CSV to a set of assets.</p>
        </div>
      </div>

      <div className="card card-pad mb-4">
        {cardsCollapsed ? (<div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 style={{ fontSize: 14, margin: 0 }}>Event Type:</h3>
              <span style={{ fontWeight: 700 }}>{selectedEvent?.label ?? 'Addition'}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => { setSelected(null); setCardsCollapsed(false); setPreview(null); }}>
              Change
            </Button>
          </div>) : (<>
            <h3 style={{ fontSize: 14, marginBottom: 14 }}>Select Event Type</h3>
            <div className="event-picker">
              {allCards.map((e) => {
                  // Addition is not available for a number that already exists.
                  const disabled = e.id === 'addition' && assetExists;
                  return (<div key={e.id} className={`event-card ${selected === e.id ? 'sel' : ''}${disabled ? ' event-card-disabled' : ''}`} aria-disabled={disabled} onClick={() => { if (!disabled) selectCard(e.id); }}>
                  <div className={`ei ico-${disabled ? 'gray' : e.color}`}>{e.icon}</div>
                  <h4>{e.label}</h4>
                  <p>{disabled ? `Asset ${assetNumber.trim()} already exists — can't be added again` : e.description}</p>
                </div>);
              })}
            </div>
          </>)}
      </div>

      {isMasterDataSet && (<MasterDataSetSection
            canPost={canPost}
            eventTypes={eventTypes}
            assetClass={mdsAssetClass} setAssetClass={setMdsAssetClass}
            company={mdsCompany} setCompany={setMdsCompany}
            status={mdsStatus} setStatus={setMdsStatus}
            q={mdsQuery} setQ={setMdsQuery}
            items={mdsItems} total={mdsTotal} loading={mdsLoading} error={mdsError} reload={mdsReload}
            assetSet={assetSet} toggleAsset={toggleSetAsset} toggleAllVisible={toggleAllVisibleSetAssets} clearSet={clearAssetSet}
            assetSetList={assetSetList}
            mode={mdsMode} setMode={setMdsMode}
            oneAsset={mdsOneAsset} setOneAsset={setMdsOneAsset}
          />)}

      {selected && !isMasterDataSet && SelectedEventForm && (<SelectedEventForm
            eventLabel={selectedEvent?.label}
            assetNumber={assetNumber}
            setAssetNumber={setAssetNumber}
            formData={formData}
            setField={setField}
            setFormData={setFormData}
            setPreview={setPreview}
            loading={loading}
            calculatePreview={calculatePreview}
            preview={preview}
            posted={posted}
            setPosted={setPosted}
            confirmOpen={confirmOpen}
            setConfirmOpen={setConfirmOpen}
            postTransaction={postTransaction}
            posting={posting}
            postError={postError}
            blockMessage={selected === 'addition' ? additionBlockMessage : ''}
            canPost={canPost}
          />)}
    </AppLayout>);
}

// ======================================================
// Function : MasterDataSetSection
// Purpose  : Everything the 7th card ("Master Data Set") renders below
//            the shared event-type picker — folded in from the former
//            standalone /lifecycle/master-data-set page. Mode is chosen
//            first (Step 1), since it decides what the rest of the flow
//            even needs: "Same Transaction → All Assets" still needs a
//            set of assets built from the register (Step 2, "Build the
//            Set") before the CSV panel; "Multiple Transactions → One
//            Asset" only ever needs a single asset, so it skips the set
//            builder entirely and goes straight to picking that one
//            asset and its transactions (Step 2, "Asset & Transactions").
//            All props come from LifecycleEvents' mds* state.
// ======================================================

function MasterDataSetSection({
    canPost, eventTypes, assetClass, setAssetClass, company, setCompany, status, setStatus, q, setQ,
    items, total, loading, error, reload, assetSet, toggleAsset, toggleAllVisible, clearSet, assetSetList,
    mode, setMode, oneAsset, setOneAsset
}) {
    // assetClassNames lives in LifecycleEvents' scope, so this component must load it itself
    // (using it without this threw "assetClassNames is not defined" -> blank white page).
    const assetClassNames = useAssetClasses();
    const pg = usePagination(items);
    return (<>
      <div className="card card-pad mb-4">
        <h3 style={{ fontSize: 14, marginBottom: 14 }}>1. Choose Mode</h3>
        <div className="mode-picker" role="radiogroup" aria-label="Master Data Set mode">
          <div role="radio" aria-checked={mode === 'many'} tabIndex={0}
               className={`mode-card ${mode === 'many' ? 'sel' : ''}`}
               onClick={() => setMode('many')}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('many'); } }}>
            <span className="mode-radio" aria-hidden="true"/>
            <div>
              <h4>Same Transaction → All Assets</h4>
              <p>Build a set of assets, pick one event type, download a CSV pre-filled with all selected assets, fill in the field values, and post it.</p>
            </div>
          </div>
          <div role="radio" aria-checked={mode === 'one'} tabIndex={0}
               className={`mode-card ${mode === 'one' ? 'sel' : ''}`}
               onClick={() => setMode('one')}
               onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setMode('one'); } }}>
            <span className="mode-radio" aria-hidden="true"/>
            <div>
              <h4>Multiple Transactions → One Asset</h4>
              <p>Pick one asset, download a CSV pre-filled with that asset, set each row’s event type and fields, and post it.</p>
            </div>
          </div>
        </div>
      </div>

      {mode === 'many' && (<>
          <div className="card card-pad mb-4">
            <h3 style={{ fontSize: 14, marginBottom: 14 }}>2. Build the Set</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: '0 16px' }}>
              <Input label="Search" placeholder="Asset # or description…" value={q} onChange={(e) => setQ(e.target.value)}/>
              <Select label="Asset Class" value={assetClass} onChange={setAssetClass} options={['All Classes', ...assetClassNames]}/>
              <Select label="Company" value={company} onChange={setCompany} options={['All Companies', '5B', 'R9', '2D', 'GD']}/>
              <Select label="Status" value={status} onChange={setStatus} options={['All Statuses', 'Active', 'Retired', 'Transferred', 'Fully Depreciated']}/>
            </div>

            {error && <ErrorMessage message={error} onRetry={reload}/>}

            {!error && (<>
                <div className="flex items-center justify-between mt-2 mb-2">
                  <span className="text-sm text-muted">
                    Showing {items.length} of {total.toLocaleString()} · <strong>{assetSet.size}</strong> in set
                  </span>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={toggleAllVisible} disabled={loading || items.length === 0}>
                      {items.length > 0 && items.every((a) => assetSet.has(a.assetNumber)) ? 'Unselect Visible' : 'Select Visible'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={clearSet} disabled={assetSet.size === 0}>
                      Clear Set
                    </Button>
                  </div>
                </div>

                {loading && <Loader label="Loading assets…"/>}

                {!loading && items.length === 0 && (<EmptyState title="No assets match these filters" description="Try widening the Asset Class, Company, or Status filter."/>)}

                {!loading && items.length > 0 && (<div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
                    <table className="table">
                      <thead>
                        <tr>
                          <th style={{ width: 32 }}></th>
                          <th>Asset #</th>
                          <th>Description</th>
                          <th>Class</th>
                          <th>Co.</th>
                          <th className="num">NBV</th>
                          <th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pg.pageItems.map((a) => (<tr key={a.assetNumber} onClick={() => toggleAsset(a)} style={{ cursor: 'pointer' }}>
                            <td><input type="checkbox" checked={assetSet.has(a.assetNumber)} onChange={() => toggleAsset(a)} onClick={(e) => e.stopPropagation()}/></td>
                            <td className="mono">{a.assetNumber}</td>
                            <td>{a.description}</td>
                            <td>{a.assetClass}</td>
                            <td>{a.company}</td>
                            <td className="num">{formatCurrency(a.nbv, { compact: Math.abs(a.nbv) >= 1e6 })}</td>
                            <td>{a.status}</td>
                          </tr>))}
                      </tbody>
                    </table>
                  </div>)}
                {!loading && items.length > 0 && <Pagination {...pg.pager}/>}
              </>)}
          </div>

          {assetSet.size > 0 && <ManyAssetsPanel canPost={canPost} assets={assetSetList} eventTypes={eventTypes}/>}
        </>)}

      {mode === 'one' && (<OneAssetPanel
            canPost={canPost}
            assetClass={assetClass} setAssetClass={setAssetClass}
            company={company} setCompany={setCompany}
            status={status} setStatus={setStatus}
            q={q} setQ={setQ}
            items={items} total={total} loading={loading} error={error} reload={reload}
            selectedAsset={oneAsset} setSelectedAsset={setOneAsset}
          />)}
    </>);
}

// ======================================================
// Function : MdsEventTypePicker
// Purpose  : Small grid of event-type cards for the Master Data Set
//            "Same Transaction -> Many Assets" mode — matches the look
//            of the main picker above, but only the 6 real event types
//            (no Master Data Set card here).
// ======================================================

function MdsEventTypePicker({ eventTypes, selectedId, onSelect }) {
    return (<div className="event-picker">
      {eventTypes.map((e) => (<div key={e.id} className={`event-card ${selectedId === e.id ? 'sel' : ''}`} onClick={() => onSelect(e.id)}>
          <div className={`ei ico-${e.color}`}>{e.icon}</div>
          <h4>{e.label}</h4>
          <p>{e.description}</p>
        </div>))}
    </div>);
}

// ======================================================
// Function : ResultsSummary
// Purpose  : Shared "posted / failed" summary + per-row error list, shown
//            after either Master Data Set mode's bulk-post call comes
//            back.
// ======================================================

function ResultsSummary({ results }) {
    if (!results) return null;
    const posted = results.filter((r) => r.status === 'posted').length;
    const failed = results.length - posted;
    return (<div className="mt-3">
      <Pill tone={failed > 0 ? 'amber' : 'green'}>{posted} posted{failed > 0 ? `, ${failed} failed` : ''}</Pill>
      {failed > 0 && (<ul className="text-sm text-muted mt-2">
          {results.filter((r) => r.status !== 'posted').map((r, i) => (<li key={i}>{r.assetNumber} — {r.eventType}: {r.error}</li>))}
        </ul>)}
    </div>);
}

// ======================================================
// Function : ManyAssetsPanel
// Purpose  : Mode "Same Transaction -> Many Assets" — pick one event
//            type, download/fill/upload one CSV row per selected asset,
//            post it once per asset.
// ======================================================

function ManyAssetsPanel({ canPost, assets, eventTypes }) {
    const [eventId, setEventId] = useState('adjustment');
    const schema = FIELD_SCHEMAS[eventId] ?? [];
    const eventLabel = eventTypes.find((e) => e.id === eventId)?.label ?? 'Adjustment';

    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState([]); // parsed CSV rows (raw, header-keyed)
    const [parseError, setParseError] = useState('');
    const [dropdownWarnings, setDropdownWarnings] = useState([]);
    const [posting, setPosting] = useState(false);
    const [results, setResults] = useState(null);

    function resetCsvState() {
        setFileName('');
        setRows([]);
        setParseError('');
        setDropdownWarnings([]);
        setResults(null);
    }

    function selectEvent(id) {
        setEventId(id);
        resetCsvState();
    }

    function downloadTemplate() {
        downloadCsv(`${eventId}-master-data-set-template.csv`, buildTemplateCsvWithAssets(schema, assets.map((a) => a.assetNumber)));
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
                if (missingAsset > 0) { setParseError(`${missingAsset} row(s) are missing an Asset Number.`); }
                else if (headerWasMissing) {
                    setParseError(`Heads up: this file had no header row, so columns were matched by position (assetNumber, ${schema.map((f) => f.key).join(', ')}). Double-check the preview below before posting.`);
                }
                setDropdownWarnings(findUnmatchedSelectValues(parsed, schema));
                setRows(parsed);
            } catch {
                setParseError('Could not read this file as CSV.');
            }
        });
    }

    async function postAll() {
        if (rows.length === 0) return;
        setPosting(true);
        setResults(null);
        try {
            const lifecycleRows = rowsToLifecycleRows(rows, schema);
            const bulkRows = lifecycleRows.map((r) => ({ eventType: eventLabel, assetNumber: r.assetNumber, fields: r.fields }));
            const res = await lifecycleApi.bulkPost({ rows: bulkRows });
            setResults(res.results);
        } catch (err) {
            setParseError(err.message || 'Bulk post failed.');
        } finally {
            setPosting(false);
        }
    }

    return (<div className="card card-pad">
      <h3 style={{ fontSize: 14, marginBottom: 14 }}>3. Transaction Details — {eventLabel}</h3>
      <MdsEventTypePicker eventTypes={eventTypes} selectedId={eventId} onSelect={selectEvent}/>

      <div className="mt-4">
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Download the template — it's pre-filled with all {assets.length} selected asset number(s). Fill in the {eventLabel} field values for each row in a spreadsheet, then upload it back.
        </p>
        <div className="flex gap-2 mt-2 mb-2">
          <Button variant="ghost" size="sm" onClick={downloadTemplate}>Download CSV Template ({assets.length} asset(s))</Button>
          {(fileName || rows.length > 0 || results) && (<Button variant="ghost" size="sm" onClick={resetCsvState}>Reset</Button>)}
        </div>

        <div className="form-row">
          <label htmlFor="mds-many-file">Upload filled-in CSV</label>
          <input id="mds-many-file" type="file" accept=".csv,text/csv" onChange={onFileChange}/>
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
            <p className="text-sm text-muted mt-2">{rows.length} row(s) ready to post.</p>
            <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
              <table className="table" style={{ fontSize: 12 }}>
                <thead><tr>{Object.keys(rows[0]).map((h) => (<th key={h}>{h}</th>))}</tr></thead>
                <tbody>{rows.slice(0, 8).map((r, i) => (<tr key={i}>{Object.keys(rows[0]).map((h) => (<td key={h}>{r[h]}</td>))}</tr>))}</tbody>
              </table>
            </div>
            {rows.length > 8 && <p className="text-sm text-muted">…and {rows.length - 8} more.</p>}
          </>)}
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="primary" onClick={postAll} disabled={!canPost || posting || rows.length === 0} title={!canPost ? 'You have view-only access to Lifecycle Events' : undefined}>
          {posting ? 'Posting…' : `Post ${eventLabel} to ${rows.length || assets.length} Asset(s)`}
        </Button>
      </div>
      <ResultsSummary results={results}/>
    </div>);
}

// ======================================================
// Function : OneAssetPanel
// Purpose  : Mode "Multiple Transactions -> One Asset" — since this mode
//            only ever needs a single asset, it skips the "Build the
//            Set" register browser entirely: it does its own search
//            against the asset register and lets you click one row to
//            pick it (auto-picked when a search narrows to exactly one
//            match), then download/fill/upload one CSV with a row per
//            transaction and post them together.
// ======================================================

function OneAssetPanel({
    canPost, assetClass, setAssetClass, company, setCompany, status, setStatus, q, setQ,
    items, total, loading, error, reload, selectedAsset, setSelectedAsset
}) {
    const assetClassNames = useAssetClasses();
    const pg = usePagination(items);
    const assetNumber = selectedAsset?.assetNumber ?? '';
    const [fileName, setFileName] = useState('');
    const [rows, setRows] = useState([]); // parsed CSV rows (raw, header-keyed), blank rows dropped
    const [parseError, setParseError] = useState('');
    const [rowWarnings, setRowWarnings] = useState([]); // missing/unrecognized eventType
    const [dropdownWarnings, setDropdownWarnings] = useState([]);
    const [posting, setPosting] = useState(false);
    const [results, setResults] = useState(null);

    function resetCsvState() {
        setFileName('');
        setRows([]);
        setParseError('');
        setRowWarnings([]);
        setDropdownWarnings([]);
        setResults(null);
    }

    function selectAsset(asset) {
        setSelectedAsset(asset);
        resetCsvState();
    }

    // Search narrowed to exactly one match and nothing's picked yet —
    // pick it automatically rather than making the user click the only row.
    useEffect(() => {
        if (!selectedAsset && !loading && items.length === 1) {
            setSelectedAsset(items[0]);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [items, loading]);

    function downloadTemplate() {
        if (!assetNumber.trim()) return;
        downloadCsv(`${assetNumber}-master-data-set-template.csv`, buildUnifiedTemplateCsvForAsset(assetNumber));
    }

    function onFileChange(e) {
        const file = e.target.files?.[0];
        setResults(null);
        setParseError('');
        setRows([]);
        setRowWarnings([]);
        setDropdownWarnings([]);
        if (!file) return;
        setFileName(file.name);
        file.text().then((text) => {
            try {
                const templateHeaders = buildUnifiedTemplateCsvForAsset(assetNumber, 1).trim().split('\n')[0].split(',');
                const { rows: parsed, headerWasMissing } = parseCsv(text, templateHeaders);
                // Downloaded template ships a few blank rows to fill in — drop any
                // left untouched (no eventType typed in) rather than flagging them.
                const filled = parsed.filter((r) => r.eventType?.trim());
                if (filled.length === 0) { setParseError('No transactions found — set an eventType on at least one row.'); return; }

                const missingAsset = filled.filter((r) => !r.assetNumber?.trim()).length;
                const unresolved = filled.filter((r) => r.assetNumber?.trim() && !resolveEventId(r.eventType));

                if (missingAsset > 0) {
                    setParseError(`${missingAsset} row(s) are missing an Asset Number.`);
                } else if (headerWasMissing) {
                    setParseError('Heads up: this file had no header row, so columns were matched by position against the template. Double-check the preview below before posting.');
                }

                setRowWarnings(unresolved.map((r) => ({ assetNumber: r.assetNumber, value: r.eventType })));
                setDropdownWarnings(findUnmatchedSelectValuesUnified(filled));
                setRows(filled);
            } catch {
                setParseError('Could not read this file as CSV.');
            }
        });
    }

    async function postAll() {
        if (!assetNumber.trim() || rows.length === 0) return;
        setPosting(true);
        setResults(null);
        try {
            const bulkRows = rowsToBulkPostRows(rows);
            const res = await lifecycleApi.bulkPost({ rows: bulkRows });
            setResults(res.results);
        } catch (err) {
            setParseError(err.message || 'Bulk post failed.');
        } finally {
            setPosting(false);
        }
    }

    return (<div className="card card-pad">
      <h3 style={{ fontSize: 14, marginBottom: 14 }}>2. Asset &amp; Transactions</h3>

      {selectedAsset ? (<div className="flex items-center justify-between mb-4" style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 8 }}>
          <span className="text-sm">
            <span className="mono" style={{ fontWeight: 700 }}>{selectedAsset.assetNumber}</span> — {selectedAsset.description}
          </span>
          <Button variant="ghost" size="sm" onClick={() => selectAsset(null)}>Change Asset</Button>
        </div>) : (<div className="mb-4">
          <div className="form-grid" style={{ gridTemplateColumns: 'repeat(4,1fr)', gap: '0 16px' }}>
            <Input label="Search" placeholder="Asset # or description…" value={q} onChange={(e) => setQ(e.target.value)}/>
            <Select label="Asset Class" value={assetClass} onChange={setAssetClass} options={['All Classes', ...assetClassNames]}/>
            <Select label="Company" value={company} onChange={setCompany} options={['All Companies', '5B', 'R9', '2D', 'GD']}/>
            <Select label="Status" value={status} onChange={setStatus} options={['All Statuses', 'Active', 'Retired', 'Transferred', 'Fully Depreciated']}/>
          </div>

          {error && <ErrorMessage message={error} onRetry={reload}/>}

          {!error && (<>
              <p className="text-sm text-muted mt-2 mb-2">Showing {items.length} of {total.toLocaleString()} — click a row to pick that asset.</p>

              {loading && <Loader label="Loading assets…"/>}

              {!loading && items.length === 0 && (<EmptyState title="No assets match these filters" description="Try widening the Asset Class, Company, or Status filter."/>)}

              {!loading && items.length > 0 && (<div className="table-wrap" style={{ maxHeight: 320, overflow: 'auto' }}>
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Asset #</th>
                        <th>Description</th>
                        <th>Class</th>
                        <th>Co.</th>
                        <th className="num">NBV</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pg.pageItems.map((a) => (<tr key={a.assetNumber} onClick={() => selectAsset(a)} style={{ cursor: 'pointer' }}>
                          <td className="mono">{a.assetNumber}</td>
                          <td>{a.description}</td>
                          <td>{a.assetClass}</td>
                          <td>{a.company}</td>
                          <td className="num">{formatCurrency(a.nbv, { compact: Math.abs(a.nbv) >= 1e6 })}</td>
                          <td>{a.status}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>)}
              {!loading && items.length > 0 && <Pagination {...pg.pager}/>}
            </>)}
        </div>)}

      <div className="mt-4">
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Download the template — it's pre-filled with the asset number for {assetNumber || 'this asset'} on a few blank rows. Set each row's eventType (one of {EVENT_LABELS.join(', ')}) and fill in that event's fields; add more rows in the sheet for more transactions. Then upload it back.
        </p>
        <div className="flex gap-2 mt-2 mb-2">
          <Button variant="ghost" size="sm" onClick={downloadTemplate} disabled={!assetNumber.trim()}>Download CSV Template</Button>
          {(fileName || rows.length > 0 || results) && (<Button variant="ghost" size="sm" onClick={resetCsvState}>Reset</Button>)}
        </div>

        <div className="form-row">
          <label htmlFor="mds-one-file">Upload filled-in CSV</label>
          <input id="mds-one-file" type="file" accept=".csv,text/csv" onChange={onFileChange} disabled={!assetNumber.trim()}/>
          {fileName && <div className="hint">{fileName}</div>}
        </div>

        {!assetNumber.trim() && <span className="hint">Pick an asset first</span>}

        {parseError && <p className="text-sm" style={{ color: 'var(--danger, #dc2626)' }}>{parseError}</p>}

        {rowWarnings.length > 0 && !results && (<div className="mt-1">
            <p className="text-sm" style={{ color: 'var(--danger, #dc2626)', fontWeight: 700 }}>These rows have a missing or unrecognized eventType — fix before posting (must match one of {EVENT_LABELS.join(', ')}):</p>
            <ul className="text-sm text-muted">
              {rowWarnings.slice(0, 6).map((w, i) => (<li key={i}>{w.assetNumber || 'no asset #'} — eventType: "{w.value || ''}"</li>))}
            </ul>
          </div>)}

        {dropdownWarnings.length > 0 && !results && (<div className="mt-1">
            <p className="text-sm" style={{ color: 'var(--warning, #b45309)', fontWeight: 700 }}>These values don't match any dropdown option — check spelling against the form:</p>
            <ul className="text-sm text-muted">
              {dropdownWarnings.slice(0, 6).map((w, i) => (<li key={i}>Row {w.row} ({w.eventType}) — {w.field}: "{w.value}"</li>))}
            </ul>
          </div>)}

        {rows.length > 0 && !results && (<div className="mb-2">
            <p className="text-sm text-muted mt-2">{rows.length} transaction(s) ready to post for {assetNumber}:</p>
            <ul className="text-sm">
              {rows.map((r, i) => (<li key={i}>{r.eventType || '(unrecognized)'}</li>))}
            </ul>
          </div>)}
      </div>

      <div className="flex gap-2 mt-4">
        <Button variant="primary" onClick={postAll} disabled={!canPost || posting || rows.length === 0 || !assetNumber.trim() || rowWarnings.length > 0} title={!canPost ? 'You have view-only access to Lifecycle Events' : undefined}>
          {posting ? 'Posting…' : `Post ${rows.length} Transaction(s)`}
        </Button>
      </div>
      <ResultsSummary results={results}/>
    </div>);
}

// ======================================================
// END: LifecycleEvents
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : LifecycleEvents.jsx
// ======================================================
