// ======================================================
// File Name : useAssetClasses.js
// Purpose   : Every "Asset Class" / "Asset Type" dropdown in the app
//             reads its options from the asset_classes table in Postgres
//             through here, so Configuration → Asset Classes is the
//             single source. Fetched once per page load and shared.
//               useAssetClasses()    -> ordered list of names (of the table
//                                       selected on Configuration -> Asset
//                                       Classes: Default or Customize)
//               useAssetClassRows()  -> full rows (name, propertyType,
//                                       method, ratePct, convention, life, bonusPct)
// ======================================================

import { useEffect, useMemo, useState } from 'react';
import { configApi } from '../api/config.api';

// ======================================================
// START: Hook Functions
// ======================================================

// Which table feeds the dropdowns: 'default' (Default Table) or 'custom'
// (Customize Table). Chosen with the Table dropdown on Configuration ->
// Asset Classes and remembered in this browser.
const TABLE_KEY = 'assetClassTable';
const TABLE_EVENT = 'assetClassTableChange';

// ======================================================
// Function : getActiveAssetClassTable
// Purpose  : Returns which asset-class table feeds the dropdowns: 'default' or 'custom'.
// ======================================================
export function getActiveAssetClassTable() {
    try {
        return localStorage.getItem(TABLE_KEY) === 'custom' ? 'custom' : 'default';
    } catch {
        return 'default';
    }
}

// ======================================================
// Function : setActiveAssetClassTable
// Purpose  : Saves the chosen table in localStorage and notifies every mounted hook.
// ======================================================
export function setActiveAssetClassTable(kind) {
    try { localStorage.setItem(TABLE_KEY, kind); } catch { /* storage unavailable - still switch for this session */ }
    window.dispatchEvent(new CustomEvent(TABLE_EVENT, { detail: kind }));
}

const cache = { default: null, custom: null };
const inflight = { default: null, custom: null };

// ======================================================
// Function : fetchOnce
// Purpose  : Fetches one asset-class table from the API and rejects when the list is empty.
// ======================================================
function fetchOnce(kind) {
    const check = (rows) => {
        if (!Array.isArray(rows) || rows.length === 0) throw new Error('no asset classes returned');
        return rows;
    };
    if (kind === 'custom') {
        // Customize Table = the custom rows first, then the whole default table after them.
        return Promise.all([configApi.getCustomAssetClasses(), configApi.getAssetClasses()])
            .then(([custom, base]) => check([...custom.map((r) => ({ ...r, name: r.assetType || r.name })), ...check(base)]));
    }
    return configApi.getAssetClasses().then(check);
}

// ======================================================
// Function : load
// Purpose  : Loads a table with caching and retries so one failed attempt never leaves the dropdowns blank.
// ======================================================
// Retries a few times (the server can still be creating/seeding the table
// on the very first request) and never caches a failure or an empty list,
// so a bad first attempt can't leave every dropdown blank until a reload.
function load(kind) {
    if (cache[kind]) return Promise.resolve(cache[kind]);
    if (!inflight[kind]) {
        inflight[kind] = (async () => {
            for (let attempt = 0; attempt < 4; attempt++) {
                try {
                    cache[kind] = await fetchOnce(kind);
                    return cache[kind];
                } catch {
                    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
                }
            }
            return [];
        })().finally(() => { inflight[kind] = null; });
    }
    return inflight[kind];
}

// ======================================================
// Function : invalidateCustomAssetClasses
// Purpose  : Clears the cached custom table so the next read refetches it after an edit.
// ======================================================
/** Drop the cached Customize Table rows (call after an edit) so dropdowns pick up the change. */
export function invalidateCustomAssetClasses() {
    // The custom table embeds the default rows, so both caches must go
    // (a default row can now be deleted too).
    cache.custom = null;
    cache.default = null;
    historyCache = null;
    window.dispatchEvent(new CustomEvent(TABLE_EVENT, { detail: getActiveAssetClassTable() }));
}

// ======================================================
// Function : useAssetClassRows
// Purpose  : Hook returning the full rows of the currently selected asset-class table.
// ======================================================
/** Rows of the currently selected table, in table order ([] until loaded).
 *  Same shape either way: { name, propertyType, method, ratePct, convention, life, bonusPct }. */
export function useAssetClassRows() {
    const [kind, setKind] = useState(getActiveAssetClassTable);
    const [rows, setRows] = useState(() => cache[getActiveAssetClassTable()] ?? []);
    useEffect(() => {
        const onChange = (e) => setKind(e.detail === 'custom' ? 'custom' : 'default');
        window.addEventListener(TABLE_EVENT, onChange);
        return () => window.removeEventListener(TABLE_EVENT, onChange);
    }, []);
    useEffect(() => {
        let alive = true;
        setRows(cache[kind] ?? []);
        load(kind).then((r) => { if (alive) setRows(r); });
        return () => { alive = false; };
    }, [kind]);
    return rows;
}

// ======================================================
// Function : useAssetClasses
// Purpose  : Hook returning the ordered, de-duplicated asset-class names for dropdowns.
// ======================================================
/** Ordered list of asset class names from the selected table ([] until loaded). */
export function useAssetClasses() {
    const rows = useAssetClassRows();
    // Names are the value stored on an asset; dedupe defensively.
    return useMemo(() => Array.from(new Set(rows.map((r) => r.name))), [rows]);
}

// ======================================================
// Function : useAssetClassHistory
// Purpose  : Hook returning every saved version of edited asset class rows (oldest first), so the
//            Addition form can use the values that were valid on an asset's placed-in-service date.
// ======================================================
let historyCache = null;
let historyInflight = null;
function loadHistory() {
    if (historyCache) return Promise.resolve(historyCache);
    if (!historyInflight) {
        historyInflight = configApi.getAllClassHistory()
            .then((rows) => { historyCache = Array.isArray(rows) ? rows : []; return historyCache; })
            .catch(() => [])
            .finally(() => { historyInflight = null; });
    }
    return historyInflight;
}
export function useAssetClassHistory() {
    const [history, setHistory] = useState(() => historyCache ?? []);
    const [tick, setTick] = useState(0);
    useEffect(() => {
        const onChange = () => setTick((t) => t + 1);
        window.addEventListener(TABLE_EVENT, onChange);
        return () => window.removeEventListener(TABLE_EVENT, onChange);
    }, []);
    useEffect(() => {
        let alive = true;
        loadHistory().then((r) => { if (alive) setHistory(r); });
        return () => { alive = false; };
    }, [tick]);
    return history;
}

// ======================================================
// Function : classKeyOf
// Purpose  : Key a row is stored under in the history ("c:<id>" custom rule, "d:<id>" default row).
// ======================================================
export function classKeyOf(row) {
    return row && row.book !== undefined ? `c:${row.id}` : `d:${row.id}`;
}

// ======================================================
// Function : resolveClassVersion
// Purpose  : The values of a class row that applied on a placed-in-service date: the latest saved
//            version effective on/before that date (older than all of them -> the original). Returns the
//            row itself when it was never edited or no date is known yet.
// ======================================================
export function resolveClassVersion(row, history, pis) {
    if (!row || !/^\d{4}-\d{2}-\d{2}$/.test(pis || '')) return row;
    const key = classKeyOf(row);
    const versions = (history || []).filter((v) => v.classKey === key);
    if (!versions.length) return row;
    let pick = versions[0];
    for (const v of versions) if (v.effectiveFrom <= pis) pick = v;
    return pick;
}

// ======================================================
// Function : lifeToMonths
// Purpose  : Converts text like "7 years 0 months" into a month count (null when it cannot be parsed).
// ======================================================
/** "7 years 0 months" -> 84 (months). Returns null if it can't be parsed. */
export function lifeToMonths(life) {
    const m = /(\d+)\s*years?\s*(\d+)\s*months?/i.exec(life || '');
    return m ? Number(m[1]) * 12 + Number(m[2]) : null;
}

// ======================================================
// Function : conventionToOption
// Purpose  : Maps a DB convention code to the option label used by the Lifecycle form's Convention dropdown.
// ======================================================
/** DB convention code ("AHY - Apply Mid-Quarter test (use HY)") -> the
 *  option label used by the Lifecycle form's Convention dropdown. */
export function conventionToOption(convention) {
    const code = String(convention || '').split(' - ')[0].trim().toUpperCase();
    if (code === 'AHY' || code === 'HY') return 'HY (Half-Year)';
    if (code === 'MM') return 'Mid-Month';
    if (code === 'FM') return 'Full-Month';
    return null; // N/A etc. — leave whatever is already selected
}

// ======================================================
// END: Hook Functions
// ======================================================

// ======================================================
// END OF FILE : useAssetClasses.js
// ======================================================
