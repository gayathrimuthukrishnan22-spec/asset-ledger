// ======================================================
// File Name : apply-schema.ts
// Purpose   : Apply the three SQL schema files (schema.sql,
//             schema-core.sql, schema-transactions.sql) against
//             Postgres (Neon) using the already-installed `pg`
//             library, instead of requiring the `psql` CLI binary
//             to be on PATH (e.g. on Render's shell/build image).
//             Splits each file on ';' and runs statements in order.
// Run with  : npx tsx --env-file=.env scripts/apply-schema.ts
//             (on Render Shell: cd server && npx tsx scripts/apply-schema.ts)
// ======================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { pool } from '../src/db/postgres.js';

// ======================================================
// START: Script Functions
// ======================================================

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const files = ['schema.sql', 'schema-core.sql', 'schema-transactions.sql', 'schema-books.sql'];

// ======================================================
// Function : splitStatements
// Purpose  : Strips "--" comment lines from a SQL file and splits it into individual statements on ";".
// ======================================================

function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')
    // Naive split on ';' — fine here because none of our DDL embeds a
    // semicolon inside a string literal or a function body.
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ======================================================
// Function : main
// Purpose  : Runs every schema file in order against Postgres and reports progress.
// ======================================================

async function main(): Promise<void> {
  for (const file of files) {
    const fullPath = path.join(__dirname, '..', 'db', file);
    const sql = readFileSync(fullPath, 'utf-8');
    const statements = splitStatements(sql);
    console.log(`\n[apply-schema] ${file}: ${statements.length} statement(s)`);
    for (const statement of statements) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 70);
      process.stdout.write(`  -> ${preview}...`);
      try {
        await pool.query(statement);
        console.log(' ok');
      } catch (err) {
        console.log(' FAILED');
        throw err;
      }
    }
  }
  console.log('\n[apply-schema] Done. Run `npm run db:check` to verify.');
  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[apply-schema] Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});

// ======================================================
// END: Script Functions
// ======================================================

// ======================================================
// END OF FILE : apply-schema.ts
// ======================================================
