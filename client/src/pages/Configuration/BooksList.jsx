// ======================================================
// File Name : BooksList.jsx
// Purpose   : Configuration -> Books List. Shows every book the ledger
//             maintains (all 15) with the same columns as the "Books
//             List" sheet: Name, Description, Book of Record.
//             The list comes from the server (GET /api/books), the same
//             source every Book dropdown in the app uses, so this page
//             and the dropdowns can never disagree.
// ======================================================

import { useMemo, useState } from 'react';
import { AppLayout } from '../../layout/AppLayout';
import { Button } from '../../components/ui/Button';
import { Pagination, usePagination } from '../../components/ui/Pagination';
import { useBooks } from '../../hooks/useBooks';
import { downloadCsv } from '../../utils/csv';

// ======================================================
// START: Page Component
// ======================================================

// ======================================================
// Function : exportBooksCsv
// Purpose  : Downloads the (filtered) books list as a CSV with the sheet's columns.
// ======================================================
function exportBooksCsv(rows) {
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Name', 'Description', 'Book of Record'];
    const lines = [header.join(',')];
    rows.forEach((b) => lines.push([
        b.name, b.description ?? '', b.bookOfRecord ? 'Yes' : ''
    ].map(q).join(',')));
    downloadCsv('books_list.csv', lines.join('\n'));
}

// ======================================================
// Function : BooksList
// Purpose  : React component that renders the Configuration -> Books List page.
// ======================================================
export function BooksList() {
    const { books } = useBooks();
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return books;
        return books.filter((b) => [b.name, b.description].some((v) => String(v ?? '').toLowerCase().includes(q)));
    }, [books, query]);

    const pg = usePagination(filtered, 25); // all 15 books fit on one page

    return (<AppLayout active="books" title="Books List" crumb="Home / Configuration / Books List">
      <div className="page-header">
        <div>
          <h1>Books List</h1>
          <p>{books.length} books are maintained. Every addition, adjustment and other lifecycle change applies to all {books.length} of them.</p>
        </div>
      </div>

      <div className="card mb-4">
        <div className="card-pad flex items-center gap-4" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div className="hint" style={{ marginTop: 0, marginBottom: 4 }}>Search</div>
            <input
              className="btn btn-ghost"
              style={{ width: '100%', textAlign: 'left' }}
              placeholder="Search book name or description..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <Button variant="ghost" onClick={() => exportBooksCsv(filtered)} style={{ marginLeft: 'auto' }}>Export CSV</Button>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>Books</h3>
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Book of Record</th>
              </tr>
            </thead>
            <tbody>
              {pg.pageItems.length === 0 && <tr><td colSpan={3} className="text-muted">No books match your search.</td></tr>}
              {pg.pageItems.map((b) => (<tr key={b.name}>
                  <td className="mono">{b.name}</td>
                  <td className="text-sm">{b.description || '—'}</td>
                  <td className="text-sm">{b.bookOfRecord ? 'Yes' : ''}</td>
                </tr>))}
            </tbody>
          </table>
        </div>
        <Pagination {...pg.pager}/>
      </div>
    </AppLayout>);
}

// ======================================================
// END: BooksList
// ======================================================

// ======================================================
// END: Page Component
// ======================================================

// ======================================================
// END OF FILE : BooksList.jsx
// ======================================================
