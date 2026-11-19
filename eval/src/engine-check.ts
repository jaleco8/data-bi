import pg from 'pg';
import { CASES } from './cases.js';

/**
 * Verificación determinista (sin LLM): para cada pregunta numérica, la consulta
 * que el agente DEBERÍA emitir se ejecuta en el motor de métricas del API y se
 * compara con el SQL de referencia independiente.
 */
type Q = { metric: string; date_from?: string; date_to?: string; filters?: Array<{ dimension: string; values: string[] }>; group_by?: string[] };
const f = (dimension: string, ...values: string[]) => ({ dimension, values });

const QUERIES: Record<string, { query: Q; pick?: 'max_row' }> = {
  gmv_oct: { query: { metric: 'gmv', date_from: '2026-10-01', date_to: '2026-10-31' } },
  ventas_mes_pasado: { query: { metric: 'gmv', date_from: '2026-10-01', date_to: '2026-10-31' } },
  ingresos_netos_q3: { query: { metric: 'ingresos_netos', date_from: '2026-07-01', date_to: '2026-09-30' } },
  pedidos_sept: { query: { metric: 'pedidos', date_from: '2026-09-01', date_to: '2026-09-30' } },
  pedidos_mx_oct: { query: { metric: 'pedidos', date_from: '2026-10-01', date_to: '2026-10-31', filters: [f('pais', 'México')] } },
  aov_2025: { query: { metric: 'ticket_promedio', date_from: '2025-01-01', date_to: '2025-12-31' } },
  gmv_black_friday_2025: { query: { metric: 'gmv', date_from: '2025-11-28', date_to: '2025-11-28' } },
  top_categoria_oct: { query: { metric: 'ingresos_netos', date_from: '2026-10-01', date_to: '2026-10-31', group_by: ['categoria'] }, pick: 'max_row' },
  margen_pct_electronica: { query: { metric: 'margen_bruto_pct', date_from: '2026-01-01', filters: [f('categoria', 'Electrónica')] } },
  unidades_star_oct: { query: { metric: 'unidades_vendidas', date_from: '2026-10-01', date_to: '2026-10-31', filters: [f('codigo_producto', 'P-STAR-0001')] } },
  clientes_nuevos_oct: { query: { metric: 'clientes_nuevos', date_from: '2026-10-01', date_to: '2026-10-31' } },
  tasa_cancelacion_2026: { query: { metric: 'tasa_cancelacion', date_from: '2026-01-01' } },
  devolucion_moda_2026: { query: { metric: 'tasa_devolucion', date_from: '2026-01-01', filters: [f('categoria', 'Moda')] } },
  devoluciones_licuadora: { query: { metric: 'devoluciones', date_from: '2026-01-01', filters: [f('codigo_producto', 'P-DEF-0001'), f('motivo_devolucion', 'defectuoso')] } },
  ontime_rutaexpress_co_sep: { query: { metric: 'entregas_a_tiempo', date_from: '2026-09-01', date_to: '2026-09-30', filters: [f('transportista', 'RutaExpress'), f('pais', 'CO')] } },
  tiempo_entrega_ar_oct: { query: { metric: 'tiempo_entrega_promedio', date_from: '2026-10-01', date_to: '2026-10-31', filters: [f('pais', 'AR')] } },
  conversion_mobile_bug: { query: { metric: 'tasa_conversion', date_from: '2026-10-06', date_to: '2026-10-27', filters: [f('dispositivo_ga', 'mobile')] } },
  sesiones_oct: { query: { metric: 'sesiones', date_from: '2026-10-01', date_to: '2026-10-31' } },
  inversion_q3: { query: { metric: 'inversion_publicitaria', date_from: '2026-07-01', date_to: '2026-09-30' } },
  roas_video: { query: { metric: 'roas', date_from: '2026-07-01', date_to: '2026-11-18', filters: [f('campana', 'Prospecting_Q3_2026_Video')] } },
  cac_pagado_2026: { query: { metric: 'cac_pagado', date_from: '2026-01-01' } },
  quiebre_sep: { query: { metric: 'tasa_quiebre_stock', date_from: '2026-09-01', date_to: '2026-09-30' } },
  valor_inventario: { query: { metric: 'valor_inventario', date_from: '2026-11-01' } },
  clientes_frecuentes: { query: { metric: 'clientes_frecuentes' } },
  clientes_activos: { query: { metric: 'clientes_activos' } },
  recompra_cohorte_2025_01: { query: { metric: 'tasa_recompra', date_from: '2025-01-01', date_to: '2025-01-31' } },
  rating_producto_oct: { query: { metric: 'calificacion_promedio', date_from: '2026-10-01', date_to: '2026-10-31', filters: [f('fuente_resena', 'producto')] } },
  rating_google_medellin_sep: { query: { metric: 'calificacion_promedio', date_from: '2026-09-01', date_to: '2026-09-30', filters: [f('ubicacion', 'Mercadia Punto de Retiro Medellín Centro')] } },
  tickets_retraso_oct: { query: { metric: 'tickets', date_from: '2026-10-01', date_to: '2026-10-31', filters: [f('categoria_ticket', 'retraso_entrega')] } },
  nps_q3: { query: { metric: 'nps', date_from: '2026-07-01', date_to: '2026-09-30' } },
  fallo_paylatam: { query: { metric: 'tasa_fallo_pagos', date_from: '2026-06-10', date_to: '2026-06-20', filters: [f('pasarela', 'PayLatam')] } },
};

const api = process.env.EVAL_API ?? 'http://localhost:4000';
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://databi:databi@localhost:5433/databi', max: 2 });
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(20, Number);

let ok = 0;
let n = 0;
for (const c of CASES.filter((x) => x.kind === 'number')) {
  const spec = QUERIES[c.id];
  if (!spec) continue;
  n++;
  const expected = Number((await db.query(c.expected_sql!)).rows[0].v);
  const r = await fetch(`${api}/api/metrics/query`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: spec.query }) });
  const body = (await r.json()) as { result?: { total: number; rows: Array<{ valor: number }> }; message?: string };
  if (!body.result) {
    console.log(`✖ ${c.id.padEnd(28)} error: ${body.message}`);
    continue;
  }
  const got = spec.pick === 'max_row' ? Math.max(...body.result.rows.map((x) => x.valor)) : body.result.total;
  const tol = c.tolerance?.abs ?? Math.max(Math.abs(expected) * (c.tolerance?.rel ?? 0.0005), 0.01);
  const pass = Math.abs(got - expected) <= tol;
  if (pass) ok++;
  console.log(`${pass ? '✔' : '✖'} ${c.id.padEnd(28)} referencia=${expected.toFixed(4).padStart(16)}  motor=${Number(got).toFixed(4).padStart(16)}`);
}
console.log(`\nMotor vs. referencia independiente: ${ok}/${n}`);
await db.end();
if (ok !== n) process.exitCode = 1;
