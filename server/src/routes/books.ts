// ======================================================
// File Name : books.ts
// Purpose   : GET /api/books — the list every Book dropdown reads.
// ======================================================

import { Router } from 'express';
import { BOOKS, DEFAULT_BOOK } from '../data/books.js';

export const booksRouter = Router();

// ======================================================
// Function : GET /
// Purpose  : Returns every maintained book plus the default one.
// Output   : { defaultBook, books: BookDef[] }
// ======================================================

booksRouter.get('/', (_req, res) => {
  res.json({ defaultBook: DEFAULT_BOOK, books: BOOKS });
});

// ======================================================
// END OF FILE : books.ts
// ======================================================
