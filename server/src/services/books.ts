// ======================================================
// File Name : books.ts
// Purpose   : Loads the book list from the Postgres `books` table into the
//             in-memory BOOKS / BOOK_NAMES arrays (data/books.ts) that the
//             synchronous request path reads. Seeds the table once from
//             (rows come from db/config-tables.sql; nothing is hard-coded here).
//             Also loads the default book NAME from app_settings. Call initBooks() at boot, BEFORE
//             initStore() (which writes one entry per book for every asset).
// ======================================================

import { BOOK_NAMES, DEFAULT_BOOK_KEY, replaceBooks, setDefaultBook } from '../data/books.js';
import { loadAppSetting, loadBooks } from '../db/repo.js';

// Re-reads the table; call after any change to the rows.
export async function refreshBooks(): Promise<number> {
  const rows = await loadBooks();
  if (!rows.length) throw new Error('books table is empty - add at least one active book');
  replaceBooks(rows);
  return rows.length;
}

export async function initBooks(): Promise<number> {
  const n = await refreshBooks();
  const def = await loadAppSetting(DEFAULT_BOOK_KEY);
  if (!def || !BOOK_NAMES.includes(def)) {
    throw new Error(`app_settings key '${DEFAULT_BOOK_KEY}' is missing or not a known book - run db/config-tables.sql`);
  }
  setDefaultBook(def);
  return n;
}
