// ======================================================
// File Name : bonusPeriod.ts
// Purpose   : Best-effort From / To dates for a Default Table "Year Placed in Service"
//             label ('2027+', '2024', '2005–2007', '2025 (acquired before 1/20/2025)',
//             'Before 9/11/2001'). Used only to PRE-FILL the period of rows copied into
//             the Customize Table; the user can change it when they edit the row.
// ======================================================

export interface BonusPeriod { fromDate: string; toDate: string } // '' = open

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function periodFromYearLabel(label: string): BonusPeriod {
  const t = (label ?? '').replace(/\s+/g, ' ').trim();
  // 'Before 9/11/2001'
  const open = /^before\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (open) return { fromDate: '', toDate: addDays(iso(Number(open[3]), Number(open[1]), Number(open[2])), -1) };
  // '2027+'
  const plus = /^(\d{4})\s*\+/.exec(t);
  if (plus) return { fromDate: iso(Number(plus[1]), 1, 1), toDate: '' };
  // '2005–2007'
  const range = /^(\d{4})\s*[–-]\s*(\d{4})/.exec(t);
  if (range) return { fromDate: iso(Number(range[1]), 1, 1), toDate: iso(Number(range[2]), 12, 31) };
  const y = /^(\d{4})/.exec(t);
  if (!y) return { fromDate: '', toDate: '' };
  const year = Number(y[1]);
  const q = /(after|before)\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i.exec(t);
  if (q && Number(q[4]) === year) {
    const qd = iso(year, Number(q[2]), Number(q[3]));
    return /after/i.test(q[1]) ? { fromDate: addDays(qd, 1), toDate: iso(year, 12, 31) } : { fromDate: iso(year, 1, 1), toDate: addDays(qd, -1) };
  }
  return { fromDate: iso(year, 1, 1), toDate: iso(year, 12, 31) };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Reads what the user typed in "Year Placed in Service" and returns its From / To dates ('' = open),
// or null when it is not recognised (the caller then keeps the dates it already has). Accepts:
// 2026 · 2027+ · 2026–2027 · Jan 2026 · Jan 2026 – Jun 2026 · 2026-01 to 2026-06 · Jan 2026+ ·
// 2025-01-20 – Open · 20 Jan 2025 – 31 Mar 2025 · 2025 (acquired after 1/19/2025) · Before 9/11/2001.
export function parsePeriodLabel(label: string): BonusPeriod | null {
  const t = (label ?? '').replace(/\s+/g, ' ').trim();
  if (!t) return null;
  // One edge of a period -> its first / last day. 'Open' = no limit. null = not an edge.
  const edge = (txt: string): { from: string; to: string; open?: boolean } | null => {
    const v = txt.trim();
    if (/^open$/i.test(v)) return { from: '', to: '', open: true };
    let x = /^([A-Za-z]{3})[A-Za-z]*\.? (\d{4})$/.exec(v);
    if (x) { const mi = MONTHS.indexOf(x[1].toLowerCase()); if (mi < 0) return null; const y = Number(x[2]); return { from: iso(y, mi + 1, 1), to: iso(y, mi + 1, lastDay(y, mi + 1)) }; }
    x = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(v);
    if (x) { const y = Number(x[1]); const m = Number(x[2]); return { from: iso(y, m, 1), to: iso(y, m, lastDay(y, m)) }; }
    x = /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.exec(v);
    if (x) { const d = iso(Number(x[1]), Number(x[2]), Number(x[3])); return { from: d, to: d }; }
    x = /^(\d{1,2}) ([A-Za-z]{3})[A-Za-z]*\.? (\d{4})$/.exec(v);
    if (x) { const mi = MONTHS.indexOf(x[2].toLowerCase()); if (mi < 0) return null; const d = iso(Number(x[3]), mi + 1, Number(x[1])); return { from: d, to: d }; }
    return null;
  };
  const plusM = /^(.+?)\s*(\+|onwards)$/i.exec(t);
  if (plusM) { const e = edge(plusM[1]); if (e && !e.open) return { fromDate: e.from, toDate: '' }; }
  const parts = t.split(/\s*(?:–|—|-(?=\s)|\sto\s)\s*/i);
  if (parts.length === 2) {
    const a = edge(parts[0]); const b = edge(parts[1]);
    if (a && b && !(a.open && b.open)) return { fromDate: a.open ? '' : a.from, toDate: b.open ? '' : b.to };
  }
  const one = edge(t);
  if (one && !one.open) return { fromDate: one.from, toDate: one.to };
  // Default Table style labels
  if (/^before\s+\d{1,2}\/\d{1,2}\/\d{4}/i.test(t) || /^\d{4}$/.test(t) || /^\d{4}\s*\+$/.test(t) || /^\d{4}\s*[–-]\s*\d{4}$/.test(t) || /^\d{4}\s*\(/.test(t)) return periodFromYearLabel(t);
  return null;
}
