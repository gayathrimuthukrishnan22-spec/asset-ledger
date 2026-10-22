// ======================================================
// File Name : Pagination.jsx
// Purpose   : Shared client-side pagination for every table.
//               const pg = usePagination(rows);      // rows -> pg.pageItems
//               ...render pg.pageItems in the table...
//               <Pagination {...pg.pager}/>          // Page x of y, rows per page, Prev / Next
//             The bar hides itself when everything fits on the smallest
//             page size, so tiny tables stay clean. The page resets to 1
//             whenever the rows change length (filter/search) or the
//             page size changes.
// ======================================================

import { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';

// ======================================================
// START: Component Functions
// ======================================================

const PAGE_SIZES = [10, 25, 50, 100];

// ======================================================
// Function : usePagination
// Purpose  : Hook that slices a list into pages and returns the current page items plus the pager props.
// ======================================================
export function usePagination(items, initialSize = 10) {
    const [pageSize, setPageSize] = useState(initialSize);
    const [page, setPage] = useState(1);
    const total = items.length;
    useEffect(() => { setPage(1); }, [total, pageSize]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);
    const start = (currentPage - 1) * pageSize;
    const pageItems = useMemo(() => items.slice(start, start + pageSize), [items, start, pageSize]);
    return {
        pageItems,
        pager: { total, page: currentPage, totalPages, pageSize, setPage, setPageSize }
    };
}

// ======================================================
// Function : Pagination
// Purpose  : Page x of y bar with rows-per-page select and Prev / Next buttons; hidden when everything fits on one page.
// ======================================================
export function Pagination({ total, page, totalPages, pageSize, setPage, setPageSize }) {
    if (total <= PAGE_SIZES[0]) return null;
    return (<div className="card-pad flex items-center justify-between" style={{ flexWrap: 'wrap', gap: 8 }}>
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted">Page {page} of {totalPages}</span>
        <select className="btn btn-ghost btn-sm" value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} aria-label="Rows per page">
          {PAGE_SIZES.map((n) => (<option key={n} value={n}>{n} / page</option>))}
        </select>
        <span className="text-sm text-muted">{total} rows</span>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" onClick={() => setPage(page - 1)} disabled={page <= 1}>‹ Prev</Button>
        <Button variant="ghost" size="sm" onClick={() => setPage(page + 1)} disabled={page >= totalPages}>Next ›</Button>
      </div>
    </div>);
}

// ======================================================
// END: Component Functions
// ======================================================

// ======================================================
// END OF FILE : Pagination.jsx
// ======================================================
