import path from 'node:path';
import pg from 'pg';
import { buildMetricQuery, loadCatalog, type Scope } from '@data-bi/shared/node';
import { ROOT, makePool } from './db.js';

/**
 * Carga semantic/metrics.yaml en semantic.metric y VALIDA cada métrica ejecutándola
 * con el rol de solo lectura del chat (app_ro), en cada tabla fuente declarada.
 */
const cat = loadCatalog(path.join(ROOT, 'semantic/metrics.yaml'));
const admin = makePool(1);
const ro = new pg.Pool({ connectionString: process.env.DATABASE_URL_RO ?? 'postgres://app_ro:app_ro@localhost:5433/databi', max: 1 });
const scope: Scope = { user_key: 'validator', label: 'validador', countries: null };

const cutoff = (await ro.query<{ d: string }>(`SELECT data_to::text AS d FROM mart.dataset_info`)).rows[0].d;
let failed = 0;
for (const m of cat.metrics) {
  for (const s of m.sources) {
    const firstDim = Object.keys(cat.tables[s.table].dimensions)[0];
    const single = { ...m, sources: [s] };
    const c2 = { ...cat, metrics: cat.metrics.map((x) => (x.key === m.key ? single : x)) };
    try {
      const b = buildMetricQuery(c2, { metric: m.key, group_by: [firstDim], date_from: '2026-01-01', date_to: cutoff }, scope, cutoff);
      const t = Date.now();
      const r = await ro.query(b.sql, b.params);
      const tot = await ro.query(b.totalSql, b.totalParams);
      console.log(`  ✔ ${m.key.padEnd(26)} ${s.table.padEnd(26)} ${String(r.rowCount).padStart(4)} filas  total=${Number(tot.rows[0].valor).toFixed(3)}  ${Date.now() - t} ms`);
    } catch (e) {
      failed++;
      console.log(`  ✖ ${m.key.padEnd(26)} ${s.table}: ${(e as Error).message}`);
    }
  }
}
if (failed) {
  console.error(`\n✖ ${failed} métricas no validaron; no se actualiza el catálogo.`);
  process.exit(1);
}

const client = await admin.connect();
await client.query('BEGIN');
await client.query('DELETE FROM semantic.metric');
await client.query('DELETE FROM semantic.dimension');
for (const m of cat.metrics) {
  await client.query(
    `INSERT INTO semantic.metric (metric_key, label, domain, description, synonyms, unit, time_mode, definition, owner, refresh, catalog_version, validated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now())`,
    [m.key, m.label, m.domain, m.description.trim(), m.synonyms, m.unit, m.time, JSON.stringify(m), m.owner, m.refresh, cat.version],
  );
}
for (const [k, d] of Object.entries(cat.dimensions)) {
  const tables = Object.entries(cat.tables).filter(([, t]) => k in t.dimensions).map(([n]) => n);
  await client.query(`INSERT INTO semantic.dimension (dimension_key, label, description, tables) VALUES ($1,$2,$3,$4)`, [k, d.label, d.description, JSON.stringify(tables)]);
}
await client.query('COMMIT');
client.release();
console.log(`\n✔ Catálogo v${cat.version}: ${cat.metrics.length} métricas y ${Object.keys(cat.dimensions).length} dimensiones validadas y cargadas (corte ${cutoff}).`);
await admin.end();
await ro.end();
