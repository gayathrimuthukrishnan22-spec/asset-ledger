// ======================================================
// File Name : LifecycleTransactionsTable.jsx
// Purpose   : Reusable UI component: renders a list of posted lifecycle
//             transactions (from the Postgres asset_transactions
//             ledger) as a table. Clicking a row expands it in place to
//             show the full calculation exactly as it looked at the
//             moment it was posted — badge, summary rows, formula note,
//             and the step-by-step sections breakdown.
//
//             Used by:
//               - AssetTransactionsPanel (Asset Detail → Transactions tab,
//                 one asset, showAssetColumn=false)
//               - Asset Register page ("Posted Lifecycle Events" table,
//                 every asset, showAssetColumn=true)
// ======================================================

import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { Pill } from '../ui/ui';
import { Pagination, usePagination } from '../ui/Pagination';
import { EmptyState } from '../common/EmptyState';
import { formatDateTime } from '../../utils/formatDate';

// ======================================================
// START: Component Functions
// ======================================================

// ======================================================
// Function : LifecycleTransactionsTable
// Purpose  : React component that renders a click-to-expand table of
//            posted lifecycle transactions
// ======================================================

export function LifecycleTransactionsTable({ items, showAssetColumn = false, emptyTitle = 'No transactions posted yet', emptyDescription = 'Events posted from the Lifecycle page will show up here, pulled from the Postgres ledger.' }) {
    const [expandedId, setExpandedId] = useState(null);
    const pg = usePagination(items ?? []);

    if (!items || items.length === 0) {
        return <EmptyState title={emptyTitle} description={emptyDescription}/>;
    }

    return (<>
    <div className="table-responsive table-wrap">
      <table className="table">
        <thead>
          <tr>
            {showAssetColumn && <th>Asset #</th>}
            <th>Event</th>
            <th>Posted</th>
            <th>Posted By</th>
            <th>Result</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {pg.pageItems.map((tx) => {
            const isOpen = expandedId === tx.transactionId;
            return (<Fragment key={tx.transactionId}>
                <tr onClick={() => setExpandedId(isOpen ? null : tx.transactionId)} style={{ cursor: 'pointer' }}>
                  {showAssetColumn && (<td className="mono">
                      <Link to={`/assets/${tx.assetNumber}`} onClick={(e) => e.stopPropagation()}>
                        {tx.assetNumber}
                      </Link>
                    </td>)}
                  <td>{tx.eventType}</td>
                  <td>{formatDateTime(tx.postedAt)}</td>
                  <td>{tx.postedBy}</td>
                  <td>
                    <Pill tone={tx.preview.badgeTone}>{tx.preview.badgeText}</Pill>
                  </td>
                  <td className="text-right text-muted">{isOpen ? '▲ Hide' : '▼ View calculation'}</td>
                </tr>

                {isOpen && (<tr>
                    <td colSpan={showAssetColumn ? 6 : 5}>
                      <div className="card card-pad" style={{ background: 'var(--bg-subtle, #f8f9fb)' }}>
                        <h4 className="mb-2">
                          {tx.eventType} — {tx.assetNumber}
                        </h4>

                        <table className="table" style={{ fontSize: 13, marginBottom: 12 }}>
                          <tbody>
                            {tx.preview.rows.map((row) => (<tr key={row.label}>
                                <td className="text-muted">{row.label}</td>
                                <td className={`text-right ${row.emphasize ? 'font-bold' : ''}`}>{row.value}</td>
                              </tr>))}
                          </tbody>
                        </table>

                        {tx.preview.formulaNote && <p className="text-sm text-muted mb-2">{tx.preview.formulaNote}</p>}

                        {tx.preview.sections?.map((section) => (<div key={section.title} className="mb-2">
                            <strong>{section.title}</strong>
                            <table className="table" style={{ fontSize: 13 }}>
                              <tbody>
                                {section.rows.map((row, i) => (<tr key={i}>
                                    <td className="text-muted">{row.label}</td>
                                    <td className={`text-right ${row.emphasize ? 'font-bold' : ''}`}>{row.value}</td>
                                  </tr>))}
                              </tbody>
                            </table>
                          </div>))}

                        <details style={{ marginTop: 8 }}>
                          <summary className="text-sm text-muted" style={{ cursor: 'pointer' }}>
                            Raw submitted fields
                          </summary>
                          <pre style={{ fontSize: 12, whiteSpace: 'pre-wrap' }}>{JSON.stringify(tx.fields, null, 2)}</pre>
                        </details>
                      </div>
                    </td>
                  </tr>)}
              </Fragment>);
          })}
        </tbody>
      </table>
    </div>
    <Pagination {...pg.pager}/>
    </>);
}

// ======================================================
// END: LifecycleTransactionsTable
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : LifecycleTransactionsTable.jsx
// ======================================================
