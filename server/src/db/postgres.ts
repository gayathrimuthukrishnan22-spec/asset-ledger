// ======================================================
// File Name : postgres.ts
// Purpose   : Single shared Postgres (Neon) pool for the server.
//             Import { pool } from './db/postgres.js' anywhere you
//             need to run a query. Replaces db/clickhouse.ts — same
//             role, different database.
// ======================================================

import pg from 'pg';

// ======================================================
// START: Database Functions
// ======================================================

const { Pool } = pg;

// Neon requires SSL. `sslmode=require` in the connection string is
// usually enough, but we set it explicitly here too so this also works
// against a bare DATABASE_URL with no query params, and so a self-signed
// chain during local proxying doesn't hard-fail the connection.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === 'false' ? false : { rejectUnauthorized: false }
});

// ======================================================
// Function : pingPostgres
// Purpose  : Quick connectivity check; returns true when "SELECT 1" succeeds, false otherwise.
// ======================================================

// Quick connectivity check — call this once at server boot if you want
// an early, clear error instead of a failure on first query.
export async function pingPostgres(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ======================================================
// END: Database Functions
// ======================================================

// ======================================================
// END OF FILE : postgres.ts
// ======================================================
