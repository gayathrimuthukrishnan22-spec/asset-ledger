// ======================================================
// File Name : books.ts
// Purpose   : The master list of books the ledger maintains. Until now
//             the whole app ran on ONE book (Federal Tax); this is the
//             single source of truth for every book so each table's
//             Book dropdown, the /api/books endpoint and the server-side
//             book resolution all agree.
//             Rows live ONLY in the Postgres `books` table (db/config-tables.sql). Rows mirror the "Books List" sheet (Name, Description,
//             Book of Record, Period Close Date, Reporting Month End,
//             Reporting Year End).
// ======================================================

// ======================================================
// START: Book Definitions
// ======================================================

export interface BookDef {
  name: string;
  description: string;
  bookOfRecord: boolean;
  periodCloseDate: string;
  reportingMonthEnd: string;
  reportingYearEnd: string;
}

/**
 * The book every page opens on. The VALUE lives in the DB (app_settings, key DEFAULT_BOOK_KEY);
 * it is filled in at boot by services/books.ts via setDefaultBook() (live binding - importers see the update).
 */
export const DEFAULT_BOOK_KEY = 'defaultBook';
export let DEFAULT_BOOK = '';
export function setDefaultBook(name: string): void { DEFAULT_BOOK = name; }

/**
 * Live book list. Filled from the books table at boot (services/books.ts) and
 * refreshed in place, so every importer keeps seeing the current rows.
 */
export const BOOKS: BookDef[] = [];
export const BOOK_NAMES: string[] = [];

// ======================================================
// Function : replaceBooks
// Purpose  : Swaps the contents of BOOKS / BOOK_NAMES in place (same array
//            objects, so existing imports stay valid).
// ======================================================

export function replaceBooks(rows: BookDef[]): void {
  BOOKS.splice(0, BOOKS.length, ...rows);
  BOOK_NAMES.splice(0, BOOK_NAMES.length, ...rows.map((b) => b.name));
}

// ======================================================
// Function : resolveBook
// Purpose  : Turns whatever came in on a query string / body into a
//            known book name (case-insensitive, trimmed). Anything
//            missing or unknown falls back to DEFAULT_BOOK so a bad
//            ?book= value can never 500 a page — it just shows the
//            default book.
// Input    : raw (unknown)
// Output   : a name from BOOK_NAMES
// ======================================================

export function resolveBook(raw: unknown): string {
  if (typeof raw !== 'string') return DEFAULT_BOOK;
  const wanted = raw.trim().toLowerCase();
  if (!wanted) return DEFAULT_BOOK;
  return BOOK_NAMES.find((n) => n.toLowerCase() === wanted) ?? DEFAULT_BOOK;
}

// ======================================================
// Function : isKnownBook
// Purpose  : True when the value names one of the maintained books.
// ======================================================

export function isKnownBook(raw: unknown): boolean {
  return typeof raw === 'string' && BOOK_NAMES.some((n) => n.toLowerCase() === raw.trim().toLowerCase());
}

// ======================================================
// END: Book Definitions
// ======================================================

// ======================================================
// END OF FILE : books.ts
// ======================================================
