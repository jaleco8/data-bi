import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { ROOT, elapsed, makePool } from './db.js';
import { getEmbedder, toPgVector } from './embedder.js';

/**
 * Vectoriza texto no estructurado en vec.chunk (pgvector), en local y reanudable:
 *  1) inserta los fragmentos a vectorizar (sin embedding) — idempotente
 *  2) vectoriza por lotes los que tienen embedding NULL
 *  3) crea el índice HNSW
 *
 * Fuentes: descripciones de producto, reseñas de producto (todas las negativas + muestra),
 * reseñas de Google, tickets de soporte (muestra), comentarios NPS y documentos de políticas.
 */
const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: {
    'reviews-sample': { type: 'string', default: '60000' },
    'tickets-sample': { type: 'string', default: '25000' },
    'products-limit': { type: 'string', default: '0' },
    batch: { type: 'string', default: '128' },
    'skip-insert': { type: 'boolean', default: false },
  },
});

const pool = makePool(2);
const t0 = Date.now();
const reviewsSample = Number(values['reviews-sample']);
const ticketsSample = Number(values['tickets-sample']);
const productsLimit = Number(values['products-limit']);

if (!values['skip-insert']) {
  console.log('▶ Insertando fragmentos a vectorizar…');
  const q = async (label: string, sql: string, params: unknown[] = []) => {
    const r = await pool.query(sql, params);
    console.log(`  · ${label.padEnd(22)} +${(r.rowCount ?? 0).toLocaleString('es')}`);
  };

  await q('productos', `
    INSERT INTO vec.chunk (source_type, source_id, title, content, product_code, category_l1, doc_date, extra)
    SELECT 'product', p.product_code, p.product_name,
           p.product_name || '. ' || p.category_l1 || ' > ' || p.category_l2 || '. Marca ' || p.brand || '. ' || p.description,
           p.product_code, p.category_l1, p.launch_date, jsonb_build_object('brand', p.brand, 'category_l2', p.category_l2)
    FROM core.dim_product p
    ${productsLimit ? 'ORDER BY p.product_code LIMIT ' + productsLimit : ''}
    ON CONFLICT (source_type, source_id) DO NOTHING`);

  // Reseñas: todas las de 1–2 estrellas + muestra aleatoria determinista del resto
  await q('reseñas de producto', `
    INSERT INTO vec.chunk (source_type, source_id, title, content, product_code, category_l1, country_code, rating, doc_date, extra)
    SELECT 'product_review', r.review_id::text, r.title, coalesce(r.title || '. ', '') || r.body,
           r.product_code, p.category_l1, r.country_code, r.rating, r.review_date,
           jsonb_build_object('product_name', p.product_name, 'brand', p.brand, 'order_id', r.order_id)
    FROM core.fact_product_review r JOIN core.dim_product p USING (product_code)
    WHERE r.rating <= 2
       OR r.review_id IN (SELECT review_id FROM core.fact_product_review WHERE rating >= 3 ORDER BY md5(review_id::text) LIMIT $1)
    ON CONFLICT (source_type, source_id) DO NOTHING`, [reviewsSample]);

  await q('reseñas de Google', `
    INSERT INTO vec.chunk (source_type, source_id, title, content, country_code, rating, doc_date, extra)
    SELECT 'google_review', g.review_id, g.location_name, g.comment, g.country_code, g.rating, g.review_date,
           jsonb_build_object('location_id', g.location_id, 'city', g.city)
    FROM core.fact_google_review g WHERE g.comment IS NOT NULL
    ON CONFLICT (source_type, source_id) DO NOTHING`);

  await q('tickets de soporte', `
    INSERT INTO vec.chunk (source_type, source_id, title, content, country_code, doc_date, extra)
    SELECT 'support_ticket', t.ticket_id::text, t.subject, t.subject || '. ' || t.description, t.country_code, t.created_date,
           jsonb_build_object('category', t.category, 'channel', t.channel, 'priority', t.priority)
    FROM core.fact_support_ticket t
    ORDER BY (t.category IN ('producto_defectuoso', 'retraso_entrega', 'pago_rechazado')) DESC, md5(t.ticket_id::text)
    LIMIT $1
    ON CONFLICT (source_type, source_id) DO NOTHING`, [ticketsSample]);

  await q('comentarios NPS', `
    INSERT INTO vec.chunk (source_type, source_id, title, content, country_code, rating, doc_date, extra)
    SELECT 'nps', n.response_id::text, 'NPS ' || n.score, n.comment, n.country_code, n.score, n.response_date,
           jsonb_build_object('nps_group', n.nps_group)
    FROM core.fact_nps n WHERE n.comment IS NOT NULL
    ON CONFLICT (source_type, source_id) DO NOTHING`);

  // Políticas y FAQ (markdown), fragmentadas por sección
  const dir = path.join(ROOT, 'corpus');
  let n = 0;
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    const md = readFileSync(path.join(dir, f), 'utf8');
    const docTitle = (md.match(/^#\s+(.+)$/m)?.[1] ?? f).trim();
    const version = md.match(/Versión:\s*([^\n·]+)/)?.[1]?.trim() ?? null;
    const vigencia = md.match(/Vigente desde:\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;
    const sections = md.split(/^##\s+/m).slice(1);
    for (let i = 0; i < sections.length; i++) {
      const [head, ...body] = sections[i].split('\n');
      const content = `${docTitle} — ${head.trim()}\n${body.join('\n').trim()}`;
      await pool.query(
        `INSERT INTO vec.chunk (source_type, source_id, title, content, doc_date, extra)
         VALUES ('policy', $1, $2, $3, $4, $5)
         ON CONFLICT (source_type, source_id) DO UPDATE SET content = EXCLUDED.content, title = EXCLUDED.title, embedding = NULL`,
        [`${f}#${i + 1}`, `${docTitle} · ${head.trim()}`, content, vigencia, JSON.stringify({ file: f, section: head.trim(), version })],
      );
      n++;
    }
  }
  console.log(`  · ${'políticas y FAQ'.padEnd(22)} ${n} secciones`);
}

const pending = Number((await pool.query(`SELECT count(*) AS n FROM vec.chunk WHERE embedding IS NULL`)).rows[0].n);
console.log(`\n▶ Vectorizando ${pending.toLocaleString('es')} fragmentos con multilingual-e5-small (local)…`);
const embed = await getEmbedder();
const batch = Number(values.batch);
let done = 0;
const tStart = Date.now();
for (;;) {
  // prioridad: políticas y productos primero para que la búsqueda sea útil cuanto antes
  const { rows } = await pool.query<{ chunk_id: string; content: string }>(
    `SELECT chunk_id, content FROM vec.chunk WHERE embedding IS NULL
     ORDER BY (source_type = 'policy') DESC, (source_type = 'product') DESC, chunk_id LIMIT $1`,
    [batch],
  );
  if (!rows.length) break;
  const vectors = await embed(rows.map((r) => `passage: ${r.content.slice(0, 1200)}`));
  await pool.query(
    `UPDATE vec.chunk c SET embedding = v.e::vector
     FROM unnest($1::bigint[], $2::text[]) AS v(id, e) WHERE c.chunk_id = v.id`,
    [rows.map((r) => r.chunk_id), vectors.map(toPgVector)],
  );
  done += rows.length;
  const rate = done / ((Date.now() - tStart) / 1000);
  process.stdout.write(`\r  ${done.toLocaleString('es')}/${pending.toLocaleString('es')} · ${rate.toFixed(0)} fragm./s · ETA ${Math.round((pending - done) / rate / 60)} min   `);
}
process.stdout.write('\n');

console.log('▶ Índice HNSW (coseno)…');
await pool.query(`SET maintenance_work_mem = '1GB'`);
await pool.query(`CREATE INDEX IF NOT EXISTS chunk_embedding_hnsw ON vec.chunk USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64)`);
await pool.query(`ANALYZE vec.chunk`);
const stats = await pool.query<{ source_type: string; n: string }>(`SELECT source_type, count(*)::text AS n FROM vec.chunk WHERE embedding IS NOT NULL GROUP BY 1 ORDER BY 2 DESC`);
for (const s of stats.rows) console.log(`  ${s.source_type.padEnd(16)} ${Number(s.n).toLocaleString('es').padStart(9)}`);
console.log(`✔ Embeddings listos en ${elapsed(t0)}`);
await pool.end();
