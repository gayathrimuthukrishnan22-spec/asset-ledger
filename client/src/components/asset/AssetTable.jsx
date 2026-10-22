// ======================================================
// File Name : AssetTable.jsx
// Purpose   : Reusable UI component: AssetTable
// ======================================================

import { formatCurrency } from '../../utils/formatCurrency';
import { Pill } from '../ui/ui';
import { Table } from '../ui/Table';

// ======================================================
// START: Component Functions
// ======================================================

const STATUS_TONE = {
    Active: 'green',
    'Fully Depreciated': 'purple',
    Retired: 'red',
    'Under Review': 'amber'
};
/** Asset Register table — a Table<Asset> preconfigured with the standard asset columns. */
// ======================================================
// Function : AssetTable
// Purpose  : React component that renders the 'AssetTable' UI
// ======================================================

export function AssetTable({ assets, onSelect, selection }) {
    const columns = [
        { header: 'Asset #', render: (a) => <span className="mono">{a.assetNumber}</span> },
        { header: 'Description', render: (a) => a.description },
        { header: 'Class', render: (a) => a.assetClass },
        { header: 'Co.', render: (a) => a.company },
        { header: 'Cost', numeric: true, render: (a) => formatCurrency(a.cost, { compact: Math.abs(a.cost) >= 1e6 }) },
        { header: 'Accum. Depr', numeric: true, render: (a) => formatCurrency(a.accumDepreciation, { compact: Math.abs(a.accumDepreciation) >= 1e6 }) },
        { header: 'NBV', numeric: true, render: (a) => formatCurrency(a.nbv, { compact: Math.abs(a.nbv) >= 1e6 }) },
        { header: 'Method', render: (a) => a.method },
        { header: 'Status', render: (a) => <Pill tone={STATUS_TONE[a.status] ?? 'gray'}>{a.status}</Pill> }
    ];
    return <Table columns={columns} rows={assets} rowKey={(a) => a.assetNumber} onRowClick={onSelect} selection={selection} paginate={false}/>;
}

// ======================================================
// END: AssetTable
// ======================================================

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : AssetTable.jsx
// ======================================================
