// ======================================================
// File Name : irs-lookup.ts
// Purpose   : Finds the IRS asset class + recovery period for a plain
//             description ("Dell laptop", "delivery van"). Free, no API key.
//             1) Tries to read IRS Pub 946 Table B-1 live from irs.gov
//                (cached 24h in memory).
//             2) If irs.gov cannot be reached / parsed, uses the common Table B-1
//                rows stored in Postgres (irs_class_lookup).
//             Then scores the rows by keyword and returns the best matches.
// ======================================================

import { loadIrsClassRows } from '../db/repo.js';

export interface ClassRow { code: string; description: string; classLife: string; gds: string; ads: string }
export interface LookupMatch extends ClassRow { score: number }
export interface LookupResult { source: 'irs.gov (live)' | 'built-in Table B-1'; matches: LookupMatch[] }

const IRS_URL = 'https://www.irs.gov/publications/p946';

const STOP = new Set(['the', 'and', 'for', 'with', 'new', 'used', 'a', 'an', 'of', 'to', 'in', 'on', 'except', 'not']);
const tokens = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((t) => t.length > 1 && !STOP.has(t));
const stem = (t: string) => t.replace(/(ies|es|s)$/, '');

// ---------- live read of irs.gov (best effort) ----------

let liveCache: { rows: ClassRow[]; at: number } | null = null;
const DAY = 24 * 60 * 60 * 1000;

const clean = (h: string) => h.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

export function parseTableB1(html: string): ClassRow[] {
  const rows: ClassRow[] = [];
  for (const tr of html.match(/<tr[\s\S]*?<\/tr>/gi) ?? []) {
    const cells = (tr.match(/<t[dh][\s\S]*?<\/t[dh]>/gi) ?? []).map(clean);
    if (cells.length < 4 || !/^\d{2}(\.\d{1,3})?$/.test(cells[0])) continue;
    const [code, description, classLife, gds, ads] = cells;
    if (!/^\d/.test(gds ?? '') && !/^\d/.test(classLife ?? '')) continue;
    rows.push({ code, description, classLife, gds, ads: ads ?? '' });
  }
  return rows;
}

async function liveRows(): Promise<ClassRow[] | null> {
  if (liveCache && Date.now() - liveCache.at < DAY) return liveCache.rows;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    const r = await fetch(IRS_URL, { signal: ctl.signal, headers: { 'user-agent': 'AssetLedger/0.1' } });
    clearTimeout(timer);
    if (!r.ok) return null;
    const rows = parseTableB1(await r.text());
    if (rows.length < 20) return null; // page layout changed -> use the built-in table
    liveCache = { rows, at: Date.now() };
    return rows;
  } catch {
    return null;
  }
}

// ---------- matching ----------

function score(q: string[], row: ClassRow): number {
  const desc = tokens(row.description).map(stem);
  let s = 0;
  for (const t of q.map(stem)) {
    if (desc.includes(t)) s += 3;
    else if (desc.some((d) => d.startsWith(t) || t.startsWith(d))) s += 1;
  }
  return s;
}

export async function lookupAssetClass(query: string): Promise<LookupResult> {
  const q = tokens(query);
  // Built-in rows carry the extra everyday words (laptop, van...), so they are always scored too.
  const live = await liveRows();
  const builtIn = await loadIrsClassRows();
  const pool = new Map<string, ClassRow & { src: number }>();
  for (const r of builtIn) pool.set(r.code, { ...r, src: 0 });
  if (live) for (const r of live) {
    const b = pool.get(r.code);
    pool.set(r.code, b ? { ...r, description: `${r.description}. ${b.description}`, src: 1 } : { ...r, src: 1 });
  }
  const matches = [...pool.values()]
    .map((r) => ({ code: r.code, description: r.description.slice(0, 220), classLife: r.classLife, gds: r.gds, ads: r.ads, score: score(q, r) }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  return { source: live ? 'irs.gov (live)' : 'built-in Table B-1', matches };
}
