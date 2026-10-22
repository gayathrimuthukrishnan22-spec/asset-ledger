// ======================================================
// File Name : AssetCard.jsx
// Purpose   : Reusable UI component: AssetCard
// ======================================================

import { formatCurrency } from '../../utils/formatCurrency';
import { Pill } from '../ui/ui';

// ======================================================
// START: Component Functions
// ======================================================

const STATUS_TONE = {
    Active: 'green',
    'Fully Depreciated': 'purple',
    Retired: 'red',
    'Under Review': 'amber'
};
/** Compact summary card for a single asset (used at the top of Asset Detail, and anywhere a quick preview is useful). */
// ======================================================
// Function : AssetCard
// Purpose  : React component that renders the 'AssetCard' UI
// ======================================================

export function AssetCard({ asset }) {
    return (<div className="card card-pad">
      <div className="flex items-center justify-between mb-2">
        <span className="mono text-sm text-muted">{asset.assetNumber}</span>
        <Pill tone={STATUS_TONE[asset.status] ?? 'gray'}>{asset.status}</Pill>
      </div>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{asset.description}</div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted">{asset.assetClass} · {asset.company}</span>
        <span style={{ fontWeight: 600 }}>{formatCurrency(asset.nbv, { compact: true })} NBV</span>
      </div>
    </div>);
}

// ======================================================
// END: AssetCard
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : AssetCard.jsx
// ======================================================
