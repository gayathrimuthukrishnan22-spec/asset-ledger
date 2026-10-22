// ======================================================
// File Name : set-balaji-admin.ts
// Purpose   : One-off fix — updates the seeded "Balaji A." user (id u1)
//             so it logs in as balaji@gmail.com / Balaji@123, with the
//             Administrator role. Does not touch the other 3 seed users
//             (Jordan, Maria, Tom).
// Run with  : npx tsx --env-file=.env scripts/set-balaji-admin.ts
// ======================================================

import { pool } from '../src/db/postgres.js';

// ======================================================
// START: Script Functions
// ======================================================

// ======================================================
// Function : main
// Purpose  : One-off fix: updates user u1 to the Balaji admin login and Administrator role.
// ======================================================

async function main(): Promise<void> {
  const result = await pool.query(
    `UPDATE users
       SET name = $2, email = $3, role = $4, status = 'Active', password = $5
     WHERE id = $1
     RETURNING id, name, email, role, status`,
    ['u1', 'balaji', 'balaji@gmail.com', 'Administrator', 'Balaji@123']
  );

  if (result.rowCount === 0) {
    console.log('No user with id u1 found — inserting a fresh row instead.');
    await pool.query(
      `INSERT INTO users (id, name, email, role, "lastActive", status, password, "menuAccess")
       VALUES ('u1', 'balaji', 'balaji@gmail.com', 'Administrator', 'Just now', 'Active', 'Balaji@123', '{}')`
    );
  } else {
    console.log('Updated:', result.rows[0]);
  }

  await pool.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});

// ======================================================
// END: Script Functions
// ======================================================

// ======================================================
// END OF FILE : set-balaji-admin.ts
// ======================================================
