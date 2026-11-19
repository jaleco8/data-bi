import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, elapsed, makePool } from './db.js';
import { RECONCILIATIONS } from './reconcile.js';

/**
 * ETL raw → core → mart. Reconstrucción completa e idempotente; luego corre los
 * controles de conciliación y falla (exit 1) si alguno no cuadra.
 */
const pool = makePool(2);
const client = await pool.connect();
const t0 = Date.now();
const run = await client.query<{ run_id: string }>(`INSERT INTO ops.etl_run (job) VALUES ('raw_to_mart') RETURNING run_id`);
const runId = run.rows[0].run_id;

try {
  await client.query(`SET work_mem = '256MB'; SET maintenance_work_mem = '768MB'; SET synchronous_commit = off;`);
  const dir = path.join(ROOT, 'packages/etl/sql');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    const t = Date.now();
    process.stdout.write(`  · ${f} … `);
    await client.query(readFileSync(path.join(dir, f), 'utf8'));
    console.log(elapsed(t));
  }

  process.stdout.write('  · ANALYZE core/mart … ');
  const tabs = await client.query<{ t: string }>(`SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname IN ('core', 'mart')`);
  for (const r of tabs.rows) await client.query(`ANALYZE ${r.t}`);
  console.log('ok');

  console.log('\n  Conciliación:');
  let failed = 0;
  for (const c of RECONCILIATIONS) {
    const exp = Number((await client.query(c.expected)).rows[0].v ?? 0);
    const act = Number((await client.query(c.actual)).rows[0].v ?? 0);
    const diff = Math.abs(exp - act);
    const tol = c.relTolerance !== undefined ? Math.abs(exp) * c.relTolerance : (c.absTolerance ?? 0);
    const passed = diff <= tol + 1e-9;
    if (!passed) failed++;
    await client.query(
      `INSERT INTO ops.reconciliation (run_id, name, description, expected, actual, tolerance, passed) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [runId, c.name, c.description, exp, act, tol, passed],
    );
    console.log(`    ${passed ? '✔' : '✖'} ${c.name.padEnd(34)} esperado=${fmt(exp)} real=${fmt(act)}${passed ? '' : `  (dif ${fmt(diff)} > tol ${fmt(tol)})`}`);
  }

  const counts = await client.query<{ t: string; n: string }>(
    `SELECT schemaname || '.' || relname AS t, n_live_tup::text AS n FROM pg_stat_user_tables WHERE schemaname IN ('core', 'mart') ORDER BY 1`,
  );
  const total = counts.rows.reduce((a, r) => a + Number(r.n), 0);
  await client.query(`UPDATE ops.etl_run SET finished_at = now(), status = $2, rows_out = $3, detail = $4 WHERE run_id = $1`, [
    runId, failed ? 'failed_reconciliation' : 'ok', total, JSON.stringify(Object.fromEntries(counts.rows.map((r) => [r.t, Number(r.n)]))),
  ]);
  console.log(`\n${failed ? '✖' : '✔'} ETL terminado en ${elapsed(t0)} · ${total.toLocaleString('es')} filas en core+mart · ${failed} controles fallidos`);
  if (failed) process.exitCode = 1;
} catch (e) {
  await client.query(`UPDATE ops.etl_run SET finished_at = now(), status = 'error', detail = $2 WHERE run_id = $1`, [runId, JSON.stringify({ error: String(e) })]);
  throw e;
} finally {
  client.release();
  await pool.end();
}

function fmt(n: number): string {
  return n.toLocaleString('es', { maximumFractionDigits: 2 });
}
