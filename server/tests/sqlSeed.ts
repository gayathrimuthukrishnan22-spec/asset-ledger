// Reads the seed .sql files (db/*.sql) so calculation tests run WITHOUT a database.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dbDir = resolve(dirname(fileURLToPath(import.meta.url)), '../db');
export type Cell = string | number | null;

// Returns the rows of the first "INSERT INTO <table> ... VALUES ...;" (handles 'quoted', $j$dollar$j$, numbers, ::jsonb)
export function sqlRows(file: string, table: string): Cell[][] {
  const sql = readFileSync(resolve(dbDir, file), 'utf8');
  const start = sql.search(new RegExp(`INSERT INTO ${table}\\b`));
  if (start < 0) throw new Error(`INSERT INTO ${table} not found in ${file}`);
  let i = sql.indexOf('VALUES', start) + 6;
  const rows: Cell[][] = [];
  let row: Cell[] | null = null;
  while (i < sql.length) {
    const ch = sql[i];
    if (!row) {
      if (ch === '(') { row = []; i++; continue; }
      if (ch === ';' || /^\s*ON CONFLICT/.test(sql.slice(i, i + 30))) break;
      i++; continue;
    }
    if (/\s|,/.test(ch)) { i++; continue; }
    if (ch === ')') { rows.push(row); row = null; i++; continue; }
    if (sql.startsWith('$j$', i)) {
      const end = sql.indexOf('$j$', i + 3);
      row.push(sql.slice(i + 3, end)); i = end + 3;
      if (sql.startsWith('::jsonb', i)) i += 7;
      continue;
    }
    if (ch === "'") {
      let j = i + 1, s = '';
      while (true) { if (sql[j] === "'" && sql[j + 1] === "'") { s += "'"; j += 2; } else if (sql[j] === "'") break; else s += sql[j++]; }
      row.push(s); i = j + 1; continue;
    }
    const m = /^-?\d+(\.\d+)?|^NULL/i.exec(sql.slice(i, i + 40));
    if (!m) throw new Error(`Cannot parse near: ${sql.slice(i, i + 40)}`);
    row.push(/^NULL/i.test(m[0]) ? null : Number(m[0])); i += m[0].length;
  }
  return rows;
}
