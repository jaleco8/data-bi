import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { generateCatalog } from './catalog.js';
import { END, SCALES, START, type Scale } from './config.js';
import { WriterSet } from './copy.js';
import { Rng } from './rng.js';
import { simulate, writeCrmContacts } from './sim.js';

const RAW_SCHEMAS = ['raw_crm', 'raw_shop', 'raw_erp', 'raw_wms', 'raw_payments', 'raw_carriers', 'raw_ga4', 'raw_ads', 'raw_gbp', 'raw_reviews', 'raw_helpdesk'];

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((a) => a !== '--'),
    options: { scale: { type: 'string', default: process.env.SCALE ?? 'small' }, seed: { type: 'string', default: '20261119' } },
    allowPositionals: true,
  });
  const scale = values.scale as Scale;
  const cfg = SCALES[scale];
  if (!cfg) throw new Error(`Escala desconocida: ${scale}. Usa small | medium | large`);

  const url = process.env.DATABASE_URL ?? 'postgres://databi:databi@localhost:5433/databi';
  const pool = new pg.Pool({ connectionString: url, max: 2 });
  const client = await pool.connect();
  const t0 = Date.now();
  console.log(`▶ Generando dataset escala=${scale} (pedidos objetivo ${cfg.targetOrders.toLocaleString('es')}) ${START.toISOString().slice(0, 10)} → ${END.toISOString().slice(0, 10)}`);

  // Limpiar capa raw
  const { rows } = await client.query<{ t: string }>(
    `SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname = ANY($1)`,
    [RAW_SCHEMAS],
  );
  if (rows.length) await client.query(`TRUNCATE ${rows.map((r) => r.t).join(', ')} RESTART IDENTITY`);
  await client.query(`SET synchronous_commit = off`);

  const rng = new Rng(Number(values.seed));
  const w = new WriterSet(client);

  console.log('  · catálogo (ERP)…');
  const catalog = await generateCatalog(rng, cfg.products, w);
  console.log(`    ${catalog.products.length.toLocaleString('es')} productos`);

  console.log('  · simulación diaria (OMS, pagos, transportistas, GA4, ads, reseñas, helpdesk, GBP)…');
  const res = await simulate(rng, cfg, catalog, w);
  await w.flushAll();

  console.log('  · contactos CRM…');
  await writeCrmContacts(rng, res, cfg, w);
  await w.flushAll();

  console.log('  · movimientos de inventario (WMS)…');
  const invSql = readFileSync(new URL('./inventory.sql', import.meta.url), 'utf8');
  await client.query(invSql);

  await client.query(
    `INSERT INTO ops.dataset_info (key, value) VALUES
       ('scale', $1), ('seed', $2), ('generated_at', now()::text), ('data_from', $3), ('data_to', $4)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [scale, values.seed, START.toISOString().slice(0, 10), new Date(END.getTime() - 1).toISOString().slice(0, 10)],
  );

  console.log('  · ANALYZE…');
  for (const s of RAW_SCHEMAS) {
    const t = await client.query<{ t: string }>(`SELECT schemaname || '.' || tablename AS t FROM pg_tables WHERE schemaname = $1`, [s]);
    for (const r of t.rows) await client.query(`ANALYZE ${r.t}`);
  }

  const counts = await client.query<{ t: string; n: string }>(
    `SELECT schemaname || '.' || relname AS t, n_live_tup::text AS n FROM pg_stat_user_tables WHERE schemaname = ANY($1) ORDER BY 1`,
    [RAW_SCHEMAS],
  );
  let total = 0;
  console.log('\n  Filas por tabla raw:');
  for (const r of counts.rows) {
    total += Number(r.n);
    console.log(`    ${r.t.padEnd(36)} ${Number(r.n).toLocaleString('es').padStart(12)}`);
  }
  const size = await client.query<{ s: string }>(`SELECT pg_size_pretty(pg_database_size(current_database())) AS s`);
  console.log(`\n✔ ${total.toLocaleString('es')} filas raw en ${((Date.now() - t0) / 1000).toFixed(0)} s · tamaño BD ${size.rows[0].s}`);
  client.release();
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
