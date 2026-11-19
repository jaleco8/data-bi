import { makePool } from './db.js';

const pool = makePool(1);
for (let i = 0; i < 60; i++) {
  try {
    await pool.query('SELECT 1');
    console.log('✔ Postgres disponible');
    await pool.end();
    process.exit(0);
  } catch {
    await new Promise((r) => setTimeout(r, 1000));
  }
}
console.error('✖ Postgres no respondió en 60 s');
process.exit(1);
