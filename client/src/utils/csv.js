// ======================================================
// File Name : csv.js
// Purpose   : Minimal CSV parse/build helpers for Bulk Import
// ======================================================

import { FIELD_SCHEMAS } from '../data/lifecycleFormSchemas';

// ======================================================
// START: Utility Functions
// ======================================================

// Label <-> id map for the six Lifecycle Event types. The CSV's
// "eventType" column holds the label (e.g. "Addition") — same string
// /api/lifecycle/bulk-post expects — but coercing a row's field values
// (number/checkbox/select) needs the matching FIELD_SCHEMAS entry, which
// is keyed by id. Kept local to this file rather than importing the
// EVENT_TYPES arrays from the pages, since only id+label are needed here.
export const EVENT_ID_BY_LABEL = {
    addition: 'addition',
    adjustment: 'adjustment',
    transfer: 'transfer',
    retirement: 'retirement',
    reinstatement: 'reinstatement',
    reclassification: 'reclassification'
};
export const EVENT_LABELS = ['Addition', 'Adjustment', 'Transfer', 'Retirement', 'Reinstatement', 'Reclassification'];

// ======================================================
// Function : resolveEventId
// Purpose  : Matches a CSV row's free-typed "eventType" cell (any case/
//            spacing) to one of the six FIELD_SCHEMAS ids. Returns null
//            if nothing matches, so callers can flag the row instead of
//            silently guessing.
// ======================================================

export function resolveEventId(rawEventType) {
    const val = String(rawEventType ?? '').trim().toLowerCase();
    if (!val) return null;
    const label = EVENT_LABELS.find((l) => l.toLowerCase() === val);
    if (label) return EVENT_ID_BY_LABEL[label.toLowerCase()];
    // tolerate typing the id itself ("addition") or a prefix ("adj")
    const byId = EVENT_LABELS.find((l) => l.toLowerCase().startsWith(val));
    return byId ? EVENT_ID_BY_LABEL[byId.toLowerCase()] : null;
}

// ======================================================
// Function : eventLabelForId
// Purpose  : id -> canonical label the API expects (e.g. 'addition' ->
//            'Addition').
// ======================================================

export function eventLabelForId(id) {
    return EVENT_LABELS.find((l) => l.toLowerCase() === id) ?? id;
}

// ======================================================
// Function : parseCsv
// Purpose  : Parses CSV text into an array of header-keyed objects.
//            Handles quoted fields (so values containing commas are
//            safe), but assumes one record per line like every export
//            from Excel/Sheets already produces.
// ======================================================

export function parseCsv(text, expectedHeaders = null) {
    const lines = text.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return { headers: [], rows: [] };

    const parseLine = (line) => {
        const cells = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            const ch = line[i];
            if (inQuotes) {
                if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
                else if (ch === '"') { inQuotes = false; }
                else { cur += ch; }
            } else if (ch === '"') {
                inQuotes = true;
            } else if (ch === ',') {
                cells.push(cur);
                cur = '';
            } else {
                cur += ch;
            }
        }
        cells.push(cur);
        return cells.map((c) => c.trim());
    };

    const firstLineCells = parseLine(lines[0]);
    // A real header row's first cell should read "assetNumber" (case-insensitive).
    // If it doesn't — e.g. the person deleted the header row before filling in
    // data, or pasted straight from a sheet without one — line 1 is actually
    // data, not a header. Fall back to the caller-supplied expected column
    // order instead of eating that first row as a bogus header.
    const looksLikeHeader = firstLineCells[0]?.trim().toLowerCase() === 'assetnumber';

    let headers;
    let dataLines;
    if (looksLikeHeader) {
        headers = firstLineCells;
        dataLines = lines.slice(1);
    } else if (expectedHeaders) {
        headers = expectedHeaders;
        dataLines = lines; // no header consumed — every line is data
    } else {
        headers = firstLineCells;
        dataLines = lines.slice(1);
    }

    const rows = dataLines.map((line) => {
        const cells = parseLine(line);
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cells[i] ?? ''; });
        return obj;
    });
    return { headers, rows, headerWasMissing: !looksLikeHeader && !!expectedHeaders };
}

// ======================================================
// Function : buildTemplateCsv
// Purpose  : Builds a downloadable CSV template — header row of
//            "assetNumber" + every field key for the given event's
//            schema — so a filled-in row maps 1:1 onto that event's
//            FIELD_SCHEMAS entry.
// ======================================================

export function buildTemplateCsv(schema) {
    const headers = ['assetNumber', ...schema.map((f) => f.key)];
    return headers.join(',') + '\n';
}

// ======================================================
// Function : buildTemplateCsvWithAssets
// Purpose  : Same shape as buildTemplateCsv (assetNumber + one event's
//            field keys), but pre-fills one row per given asset number
//            with that column already filled in — used by Master Data
//            Set's "Same Transaction -> Many Assets" mode so the person
//            only has to type the field values, not the asset numbers.
// ======================================================

export function buildTemplateCsvWithAssets(schema, assetNumbers) {
    const headers = ['assetNumber', ...schema.map((f) => f.key)];
    const lines = [headers.join(',')];
    assetNumbers.forEach((an) => {
        lines.push([an, ...schema.map(() => '')].join(','));
    });
    return lines.join('\n') + '\n';
}

// ======================================================
// Function : buildUnifiedTemplateCsvForAsset
// Purpose  : Same shape as buildUnifiedTemplateCsv (assetNumber,
//            eventType, union of every event's field keys), but
//            pre-fills the assetNumber column across `rowCount` blank
//            rows for ONE asset — used by Master Data Set's "Multiple
//            Transactions -> One Asset" mode so the person only has to
//            set eventType + that row's fields per transaction.
// ======================================================

export function buildUnifiedTemplateCsvForAsset(assetNumber, rowCount = 5) {
    const seen = new Set();
    const unionKeys = [];
    Object.values(FIELD_SCHEMAS).forEach((schema) => {
        schema.forEach((f) => {
            if (!seen.has(f.key)) {
                seen.add(f.key);
                unionKeys.push(f.key);
            }
        });
    });
    const headers = ['assetNumber', 'eventType', ...unionKeys];
    const lines = [headers.join(',')];
    for (let i = 0; i < rowCount; i++) {
        lines.push([assetNumber, '', ...unionKeys.map(() => '')].join(','));
    }
    return lines.join('\n') + '\n';
}

// ======================================================
// Function : getUnifiedHeaders
// Purpose  : Column list of the unified (mixed-event) CSV: assetNumber,
//            eventType, then the union of every event type's field keys.
// ======================================================

export function getUnifiedHeaders() {
    const seen = new Set();
    const unionKeys = [];
    Object.values(FIELD_SCHEMAS).forEach((schema) => {
        schema.forEach((f) => {
            if (!seen.has(f.key)) {
                seen.add(f.key);
                unionKeys.push(f.key);
            }
        });
    });
    return ['assetNumber', 'eventType', ...unionKeys];
}

// ======================================================
// Function : buildUnifiedTemplateCsv
// Purpose  : Header-only template for the Bulk Import "Master Data Set"
//            card — any asset numbers, any event type per row.
// ======================================================

export function buildUnifiedTemplateCsv() {
    return getUnifiedHeaders().join(',') + '\n';
}

// ======================================================
// Function : downloadCsv
// Purpose  : Triggers a browser download of CSV text as a file.
// ======================================================

export function downloadCsv(filename, text) {
    const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

// ======================================================
// Function : coerceFieldValue
// Purpose  : Shared coercion for one CSV cell against its field's
//            schema definition — number/checkbox/select typing, same
//            tolerant matching either bulk flow relies on. Pulled out
//            so the per-event (rowsToLifecycleRows) and unified
//            multi-event (rowsToBulkPostRows) paths stay in sync.
// ======================================================

export function coerceFieldValue(def, rawValue) {
    const val = String(rawValue ?? '').trim();

    if (def.type === 'number') {
        // Tolerate "$", "%", and thousands-separator commas people
        // naturally type in a spreadsheet (e.g. "100%", "1,200,000").
        const cleaned = val.replace(/[$,%\s]/g, '');
        return cleaned === '' ? '' : Number(cleaned);
    }
    if (def.type === 'checkbox') {
        return /^(true|1|yes|y)$/i.test(val);
    }
    if (def.type === 'select' && Array.isArray(def.options)) {
        // Dropdown fields need the exact option string the calculator
        // matches on (e.g. "HY (Half-Year)", "Q1 (Jan–Mar)"). Accept a
        // case-insensitive match, a prefix match (e.g. "hy" ->
        // "HY (Half-Year)"), or — since people typing into a
        // spreadsheet naturally drop spaces/punctuation, e.g.
        // "Q1(jan-mar)" vs "Q1 (Jan–Mar)" — a match with spacing and
        // punctuation stripped from both sides, so the CSV doesn't
        // have to be typed character-for-character.
        const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
        const exact = def.options.find((o) => o.toLowerCase() === val.toLowerCase());
        const byPrefix = !exact && def.options.find((o) => o.toLowerCase().startsWith(val.toLowerCase()));
        const byNorm = !exact && !byPrefix && def.options.find((o) => norm(o).startsWith(norm(val)) && norm(val).length > 0);
        return exact || byPrefix || byNorm || val;
    }
    return val;
}

// ======================================================
// Function : rowsToLifecycleRows
// Purpose  : Converts parsed CSV rows into the { assetNumber, fields }
//            shape the /lifecycle/bulk-import endpoint expects, coercing
//            number/checkbox fields per the event's schema so the
//            calculator gets the same types the manual form would send.
// ======================================================

export function rowsToLifecycleRows(csvRows, schema) {
    const fieldByKey = Object.fromEntries(schema.map((f) => [f.key, f]));
    return csvRows.map((row) => {
        const fields = {};
        for (const [key, rawValue] of Object.entries(row)) {
            if (key === 'assetNumber') continue;
            const def = fieldByKey[key];
            if (!def) continue; // ignore unknown/extra columns
            fields[key] = coerceFieldValue(def, rawValue);
        }
        return { assetNumber: row.assetNumber ?? '', fields };
    });
}

// ======================================================
// Function : rowsToBulkPostRows
// Purpose  : Converts parsed unified-CSV rows into the
//            { assetNumber, eventType, fields } shape
//            /api/lifecycle/bulk-post expects. Each row resolves its OWN
//            schema from its "eventType" cell, then only the columns
//            that belong to that event's schema are coerced into
//            `fields` — the other union columns (which belong to other
//            event types) are ignored for that row, so leaving them
//            blank is expected and normal.
// ======================================================

export function rowsToBulkPostRows(csvRows) {
    return csvRows.map((row) => {
        const eventId = resolveEventId(row.eventType);
        const assetNumber = row.assetNumber ?? '';
        if (!eventId) {
            // Unrecognized/blank eventType — pass the raw value through so
            // the server's own "Missing/invalid Event Type" validation
            // (and the per-row failed result) surfaces it, same as any
            // other bad row.
            return { assetNumber, eventType: String(row.eventType ?? '').trim(), fields: {} };
        }
        const schema = FIELD_SCHEMAS[eventId] ?? [];
        const fieldByKey = Object.fromEntries(schema.map((f) => [f.key, f]));
        const fields = {};
        for (const [key, rawValue] of Object.entries(row)) {
            if (key === 'assetNumber' || key === 'eventType') continue;
            const def = fieldByKey[key];
            if (!def) continue; // column belongs to a different event type — ignore for this row
            if (String(rawValue ?? '').trim() === '') continue; // leave unset rather than posting ''
            fields[key] = coerceFieldValue(def, rawValue);
        }
        return { assetNumber, eventType: eventLabelForId(eventId), fields };
    });
}

// ======================================================
// Function : findUnmatchedSelectValues
// Purpose  : Scans parsed CSV rows for select-type fields (Asset Type,
//            Convention, Quarter, etc.) whose value couldn't be matched
//            to any dropdown option — these would silently produce a
//            wrong/failed calculation server-side, so the Bulk Import
//            card surfaces them as a warning *before* Import is clicked.
// ======================================================

export function findUnmatchedSelectValues(csvRows, schema) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const selectFields = schema.filter((f) => f.type === 'select' && Array.isArray(f.options));
    const problems = [];
    csvRows.forEach((row, i) => {
        selectFields.forEach((def) => {
            const val = String(row[def.key] ?? '').trim();
            if (!val) return;
            const matched = def.options.some((o) => o.toLowerCase() === val.toLowerCase()
                || o.toLowerCase().startsWith(val.toLowerCase())
                || (norm(o).startsWith(norm(val)) && norm(val).length > 0));
            if (!matched) problems.push({ row: i + 1, assetNumber: row.assetNumber, field: def.label, value: val });
        });
    });
    return problems;
}

// ======================================================
// Function : findUnmatchedSelectValuesUnified
// Purpose  : Same early-warning check as findUnmatchedSelectValues, but
//            for the unified CSV — each row is checked against ITS OWN
//            event type's dropdown fields (resolved from the row's
//            "eventType" cell) instead of one schema shared by the
//            whole file. Rows with an unrecognized eventType are skipped
//            here since that already gets its own error at post time.
// ======================================================

export function findUnmatchedSelectValuesUnified(csvRows) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const problems = [];
    csvRows.forEach((row, i) => {
        const eventId = resolveEventId(row.eventType);
        if (!eventId) return;
        const selectFields = (FIELD_SCHEMAS[eventId] ?? []).filter((f) => f.type === 'select' && Array.isArray(f.options));
        selectFields.forEach((def) => {
            const val = String(row[def.key] ?? '').trim();
            if (!val) return;
            const matched = def.options.some((o) => o.toLowerCase() === val.toLowerCase()
                || o.toLowerCase().startsWith(val.toLowerCase())
                || (norm(o).startsWith(norm(val)) && norm(val).length > 0));
            if (!matched) problems.push({ row: i + 1, assetNumber: row.assetNumber, eventType: row.eventType, field: def.label, value: val });
        });
    });
    return problems;
}

// ======================================================
// END: csv.js
// ======================================================

// ======================================================
// END: Utility Functions
// ======================================================

// ======================================================
// END OF FILE : csv.js
// ======================================================
