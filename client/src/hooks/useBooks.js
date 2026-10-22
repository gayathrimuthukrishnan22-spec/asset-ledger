// ======================================================
// File Name : useBooks.js
// Purpose   : Every Book dropdown reads its options from here. The list of
//             books AND the default book come from the database
//             (GET /api/books) - nothing is hard-coded in the client.
//             The app loads them once before it renders (BootDataGate), so:
//               getBookNames()   -> ['GAAP', 'Federal Tax', ...]   (sync)
//               getDefaultBook() -> 'Federal Tax'                  (sync)
//               useBooks()       -> { names, books, defaultBook }  (hook)
// ======================================================

import { useEffect, useState } from 'react';
import { booksApi } from '../api/books.api';

let cache = null;
let inflight = null;

// ======================================================
// Function : loadBooks
// Purpose  : Fetches the book list once and remembers it. A failure is
//            not cached, so the next call simply tries again.
// ======================================================

export function loadBooks() {
    if (cache) return Promise.resolve(cache);
    if (!inflight) {
        inflight = booksApi.list()
            .then((res) => {
                if (!Array.isArray(res?.books) || res.books.length === 0 || !res.defaultBook) throw new Error('no books returned');
                cache = res;
                return res;
            })
            .finally(() => { inflight = null; });
    }
    return inflight;
}

export const getBookNames = () => (cache?.books ?? []).map((b) => b.name);
export const getDefaultBook = () => cache?.defaultBook ?? '';

// ======================================================
// Function : useBooks
// Purpose  : React hook - the book names (and full rows) for a dropdown.
// ======================================================

export function useBooks() {
    const [data, setData] = useState(cache);
    useEffect(() => {
        let alive = true;
        loadBooks()
            .then((res) => { if (alive) setData(res); })
            .catch((err) => console.error('Failed to load books:', err));
        return () => { alive = false; };
    }, []);
    const books = data?.books ?? [];
    return { names: books.map((b) => b.name), books, defaultBook: data?.defaultBook ?? '' };
}

// ======================================================
// END OF FILE : useBooks.js
// ======================================================
