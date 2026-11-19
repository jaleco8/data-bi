import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, makePool } from './db.js';

const dir = path.join(ROOT, 'db/migrations');
const pool = makePool(1);
await pool.query(`CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
const done = new Set((await pool.query<{ name: string }>('SELECT name FROM public.schema_migrations')).rows.map((r) => r.name));
const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
for (const f of files) {
  if (done.has(f)) continue;
  const sql = readFileSync(path.join(dir, f), 'utf8');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [f]);
    await client.query('COMMIT');
    console.log(`✔ ${f}`);
  } catch (e) {
    await client.query('ROLLBACK');
    console.error(`✖ ${f}`);
    throw e;
  } finally {
    client.release();
  }
}
console.log('Migraciones al día.');
await pool.end();
