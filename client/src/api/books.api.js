// ======================================================
// File Name : books.api.js
// Purpose   : API client for the list of books every Book dropdown shows.
// ======================================================

import { api } from './client';

export const booksApi = {
    // -> { defaultBook, books: [{ name, description, bookOfRecord, periodCloseDate, reportingMonthEnd, reportingYearEnd }] }
    list: () => api.get('/books')
};

// ======================================================
// END OF FILE : books.api.js
// ======================================================
