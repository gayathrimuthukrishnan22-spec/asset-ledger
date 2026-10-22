// ======================================================
// File Name : AuditTrailPanel.jsx
// Purpose   : Asset Detail → "Audit Trail" tab. Answers "who changed
//             what, and when" for this asset by reading the SAME
//             Postgres asset_transactions ledger the "Transactions"
//             tab uses — every "Confirm & Post" already records
//             postedBy + postedAt + the event + its result, so this is
//             that same data, laid out as a chronological change log
//             instead of a click-to-expand table.
// ======================================================

import { useEffect, useState } from 'react';
import { lifecycleApi } from '../../api/lifecycle.api';
import { Pill } from '../ui/ui';
import { Loader } from '../common/Loader';
import { ErrorMessage } from '../common/ErrorMessage';
import { EmptyState } from '../common/EmptyState';
import { formatCurrency } from '../../utils/formatCurrency';
import { formatDateTime } from '../../utils/formatDate';

// ======================================================
// Function : toNumber
// Purpose  : Posted fields can be numbers (form) or strings (CSV import,
//            maybe with commas) — normalise to a finite number or null.
// ======================================================

function toNumber(v) {
    if (v === '' || v == null)
        return null;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[$,\s]/g, ''));
    return Number.isFinite(n) ? n : null;
}

// ======================================================
// Function : rowValue
// Purpose  : Look up one summary row of the posted preview by its label.
// ======================================================

function rowValue(tx, label) {
    return tx.preview?.rows?.find((r) => r.label === label)?.value;
}

// ======================================================
// Function : getHeadlineAmount
// Purpose  : The ONE dollar figure that says what this event did, per event
//            type, read from what was actually submitted/posted. The panel
//            used to print the first 3 preview rows for every event —
//            which for an Addition are Property Type / Method / Life (no
//            amount at all) and for others an unrelated intermediate
//            number, so the "amount" on the trail was wrong or missing.
// ======================================================

function getHeadlineAmount(tx) {
    const f = tx.fields ?? {};
    switch (tx.eventType) {
        case 'Addition':
            return { label: 'Cost', amount: toNumber(f.cost) };
        case 'Adjustment':
            return { label: 'Adjustment', amount: toNumber(f.adjustmentAmount), signed: true };
        case 'Transfer':
            return { label: 'Cost Transferred', amount: toNumber(f.costTransferred) };
        case 'Retirement':
            return { label: 'Cost Disposed', amount: toNumber(f.costDisposed) };
        case 'Reinstatement':
            return { label: 'Restored Cost', amount: toNumber(rowValue(tx, 'Restored Cost')) };
        case 'Reclassification':
            return { label: 'Revision (New − Old)', amount: toNumber(rowValue(tx, 'Revision (New − Old)')), signed: true };
        default:
            return { label: 'Amount', amount: null };
    }
}

// Result rows worth showing under the headline, when the event has them.
const RESULT_ROW_LABELS = ['Ending Accum. Depreciation', 'Ending Net Book Value', 'Proceeds', 'NBV Received at Destination'];


// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : AuditTrailPanel
// Purpose  : React component that renders the 'AuditTrailPanel' UI
// ======================================================

export function AuditTrailPanel({ assetNumber }) {
    const [items, setItems] = useState(null);
    const [error, setError] = useState(null);

    function load() {
        setItems(null);
        setError(null);
        lifecycleApi
            .getTransactions(assetNumber)
            .then((data) => setItems(data.items))
            .catch((err) => setError(err.message));
    }

    useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [assetNumber]);

    if (error) {
        return <ErrorMessage message={error} onRetry={load} />;
    }
    if (!items) {
        return <Loader label="Loading audit trail…" />;
    }
    if (items.length === 0) {
        return (<EmptyState
        title="No changes recorded yet"
        description="Every lifecycle event posted for this asset (who posted it, when, and what changed) will show up here."
      />);
    }

    return (<div className="timeline">
      {items.map((tx) => {
          const headline = getHeadlineAmount(tx);
          const changedFields = Object.keys(tx.fields ?? {}).filter((k) => tx.fields[k] !== '' && tx.fields[k] != null);
          return (<div className="tl-item done" key={tx.transactionId}>
              <div className="tl-date">{formatDateTime(tx.postedAt)}</div>
              <div className="tl-title">
                {tx.postedBy || 'system'} posted a <strong>{tx.eventType}</strong>{' '}
                <Pill tone={tx.preview.badgeTone}>{tx.preview.badgeText}</Pill>
              </div>
              <div className="tl-desc">
                {[
                    headline.amount != null && `${headline.label}: ${headline.signed && headline.amount > 0 ? '+' : ''}${formatCurrency(headline.amount)}`,
                    ...tx.preview.rows.filter((r) => RESULT_ROW_LABELS.includes(r.label)).map((r) => `${r.label}: ${r.value}`)
                ].filter(Boolean).join(' · ')}
                {changedFields.length > 0 && (<>
                    <br />
                    <span className="text-muted">Fields changed: {changedFields.join(', ')}</span>
                  </>)}
              </div>
            </div>);
      })}
    </div>);
}

// ======================================================
// END: AuditTrailPanel
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : AuditTrailPanel.jsx
// ======================================================
