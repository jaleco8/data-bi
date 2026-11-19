/**
 * Set de evaluación del chat. Las respuestas de referencia se calculan con SQL
 * INDEPENDIENTE del motor de métricas (sobre core.* cuando es posible), de modo que
 * un error en el catálogo o en el motor también se detecta.
 *
 * kind:
 *  - number   : alguna llamada exitosa a query_metric debe devolver el valor esperado
 *               (total o una fila), con tolerancia relativa/absoluta.
 *  - clarify  : el asistente debe pedir aclaración sin calcular una métrica.
 *  - scope    : el usuario pide datos fuera de su alcance; no debe filtrarse ningún dato.
 *  - search   : debe usar search_text y recuperar evidencia pertinente.
 *  - mixed    : pregunta "por qué": debe cuantificar con métricas y llegar a la causa plantada.
 */
export interface EvalCase {
  id: string;
  persona?: string;
  question: string;
  kind: 'number' | 'clarify' | 'scope' | 'search' | 'mixed';
  /** SQL de referencia: devuelve una columna v */
  expected_sql?: string;
  tolerance?: { rel?: number; abs?: number };
  /** para kind=search / mixed */
  must_use?: string[];
  text_must_match?: RegExp;
  hits_must_match?: { field: 'source_type' | 'product_code' | 'source_id'; pattern: RegExp; min: number };
  forbidden_country?: string;
}

const LINES_NET = `(l.line_net_ex_tax_usd - l.refund_ex_tax_usd)`;

export const CASES: EvalCase[] = [
  // ------------------------------------------------------------ ventas
  { id: 'gmv_oct', kind: 'number', question: '¿Cuál fue el GMV de octubre de 2026?',
    expected_sql: `SELECT sum(merch_usd) v FROM core.fact_order WHERE is_paid AND order_date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'ventas_mes_pasado', kind: 'number', question: '¿Cuánto vendimos el mes pasado?',
    expected_sql: `SELECT sum(merch_usd) v FROM core.fact_order WHERE is_paid AND order_date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'ingresos_netos_q3', kind: 'number', question: 'Ingresos netos del tercer trimestre de 2026',
    expected_sql: `SELECT sum(${LINES_NET}) v FROM core.fact_order_line l JOIN core.fact_order o USING (order_id) WHERE o.is_valid AND o.order_date BETWEEN '2026-07-01' AND '2026-09-30'` },
  { id: 'pedidos_sept', kind: 'number', question: '¿Cuántos pedidos válidos tuvimos en septiembre de 2026?',
    expected_sql: `SELECT count(*) v FROM core.fact_order WHERE is_valid AND order_date BETWEEN '2026-09-01' AND '2026-09-30'` },
  { id: 'pedidos_mx_oct', kind: 'number', question: 'Pedidos válidos en México en octubre de 2026',
    expected_sql: `SELECT count(*) v FROM core.fact_order WHERE is_valid AND country_code = 'MX' AND order_date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'aov_2025', kind: 'number', question: '¿Cuál fue el ticket promedio en 2025?',
    expected_sql: `SELECT sum(merch_usd) / count(*) v FROM core.fact_order WHERE is_valid AND order_date BETWEEN '2025-01-01' AND '2025-12-31'` },
  { id: 'gmv_black_friday_2025', kind: 'number', question: 'GMV del Black Friday 2025 (el 28 de noviembre)',
    expected_sql: `SELECT sum(merch_usd) v FROM core.fact_order WHERE is_paid AND order_date = '2025-11-28'` },
  { id: 'top_categoria_oct', kind: 'number', question: '¿Qué categoría tuvo más ingresos netos en octubre de 2026 y cuánto?',
    expected_sql: `SELECT max(x) v FROM (SELECT p.category_l1, sum(${LINES_NET}) x FROM core.fact_order_line l JOIN core.fact_order o USING (order_id) JOIN core.dim_product p USING (product_code) WHERE o.is_valid AND o.order_date BETWEEN '2026-10-01' AND '2026-10-31' GROUP BY 1) t` },
  { id: 'margen_pct_electronica', kind: 'number', question: 'Margen bruto porcentual de Electrónica en lo que va de 2026', tolerance: { abs: 0.002 },
    expected_sql: `SELECT sum(${LINES_NET} - l.cost_usd * (1 - l.returned_qty::numeric / l.qty)) / sum(${LINES_NET}) v FROM core.fact_order_line l JOIN core.fact_order o USING (order_id) JOIN core.dim_product p USING (product_code) WHERE o.is_valid AND p.category_l1 = 'Electrónica' AND o.order_date BETWEEN '2026-01-01' AND '2026-11-18'` },
  { id: 'unidades_star_oct', kind: 'number', question: '¿Cuántas unidades vendimos de los Audífonos inalámbricos Sonix Air Pro 2 en octubre de 2026?', tolerance: { abs: 0.5 },
    expected_sql: `SELECT coalesce(sum(l.qty), 0) v FROM core.fact_order_line l JOIN core.fact_order o USING (order_id) WHERE o.is_valid AND l.product_code = 'P-STAR-0001' AND o.order_date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'clientes_nuevos_oct', kind: 'number', question: '¿Cuántos clientes nuevos captamos en octubre de 2026?',
    expected_sql: `SELECT count(*) v FROM core.fact_order WHERE is_valid AND is_first_order AND order_date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'tasa_cancelacion_2026', kind: 'number', question: 'Tasa de cancelación de pedidos en 2026', tolerance: { abs: 0.0005 },
    expected_sql: `SELECT avg(is_cancelled::int) v FROM core.fact_order WHERE is_paid AND order_date BETWEEN '2026-01-01' AND '2026-11-18'` },

  // ------------------------------------------------------------ devoluciones
  { id: 'devolucion_moda_2026', kind: 'number', question: 'Tasa de devolución de la categoría Moda en 2026', tolerance: { abs: 0.0005 },
    expected_sql: `SELECT sum(l.returned_qty)::numeric / sum(l.qty) v FROM core.fact_order_line l JOIN core.fact_order o USING (order_id) JOIN core.dim_product p USING (product_code) WHERE o.is_valid AND p.category_l1 = 'Moda' AND o.order_date BETWEEN '2026-01-01' AND '2026-11-18'` },
  { id: 'devoluciones_licuadora', kind: 'number', question: '¿Cuántas solicitudes de devolución por producto defectuoso tuvo la Licuadora PowerMix 900 en 2026?', tolerance: { abs: 0.5 },
    expected_sql: `SELECT count(*) v FROM raw_shop.returns r WHERE r.sku LIKE 'P-DEF-0001-%' AND r.reason = 'defectuoso' AND r.requested_at >= '2026-01-01' AND r.requested_at < '2026-11-19' AND (r.requested_at AT TIME ZONE (SELECT tz FROM core.dim_country c JOIN core.fact_order o ON o.country_code = c.country_code WHERE o.order_id = r.order_id))::date BETWEEN '2026-01-01' AND '2026-11-18'` },

  // ------------------------------------------------------------ logística
  { id: 'ontime_rutaexpress_co_sep', kind: 'number', question: '¿Qué porcentaje de entregas a tiempo tuvo RutaExpress en Colombia en septiembre de 2026?', tolerance: { abs: 0.0005 },
    expected_sql: `SELECT avg(is_on_time::int) v FROM core.fact_shipment WHERE carrier = 'RutaExpress' AND country_code = 'CO' AND delivered_at IS NOT NULL AND shipped_date BETWEEN '2026-09-01' AND '2026-09-30'` },
  { id: 'tiempo_entrega_ar_oct', kind: 'number', question: 'Tiempo promedio de entrega en Argentina en octubre de 2026', tolerance: { abs: 0.01 },
    expected_sql: `SELECT avg(order_to_delivery_days) v FROM core.fact_shipment WHERE country_code = 'AR' AND shipped_date BETWEEN '2026-10-01' AND '2026-10-31'` },

  // ------------------------------------------------------------ web y marketing
  { id: 'conversion_mobile_bug', kind: 'number', question: 'Tasa de conversión en dispositivos mobile entre el 6 y el 27 de octubre de 2026', tolerance: { abs: 0.0002 },
    expected_sql: `SELECT sum(ecommerce_purchases)::numeric / sum(sessions) v FROM raw_ga4.daily_traffic WHERE device_category = 'mobile' AND date BETWEEN '20261006' AND '20261027'` },
  { id: 'sesiones_oct', kind: 'number', question: '¿Cuántas sesiones tuvo el sitio en octubre de 2026?',
    expected_sql: `SELECT sum(sessions) v FROM raw_ga4.daily_traffic WHERE date BETWEEN '20261001' AND '20261031'` },
  { id: 'inversion_q3', kind: 'number', question: 'Inversión publicitaria total del tercer trimestre de 2026',
    expected_sql: `SELECT sum(cost_micros) / 1e6 v FROM raw_ads.daily_spend WHERE date BETWEEN '2026-07-01' AND '2026-09-30'`, tolerance: { rel: 0.002 } },
  { id: 'roas_video', kind: 'number', question: '¿Qué ROAS tuvo la campaña Prospecting_Q3_2026_Video?', tolerance: { abs: 0.01 },
    expected_sql: `SELECT (SELECT coalesce(sum(o.net_revenue_usd),0) FROM mart.orders o WHERE o.utm_campaign = 'Prospecting_Q3_2026_Video' AND o.channel <> 'marketplace') / (SELECT sum(cost_micros)/1e6 FROM raw_ads.daily_spend WHERE campaign_name = 'Prospecting_Q3_2026_Video') v` },
  { id: 'cac_pagado_2026', kind: 'number', question: 'CAC de campañas pagadas en 2026', tolerance: { rel: 0.003 },
    expected_sql: `SELECT (SELECT sum(cost_micros)/1e6 FROM raw_ads.daily_spend WHERE date BETWEEN '2026-01-01' AND '2026-11-18') / (SELECT count(*) FROM core.fact_order WHERE is_valid AND is_first_order AND utm_medium IN ('cpc','paid_social') AND channel <> 'marketplace' AND order_date BETWEEN '2026-01-01' AND '2026-11-18') v` },

  // ------------------------------------------------------------ inventario y clientes
  { id: 'quiebre_sep', kind: 'number', question: 'Tasa de quiebre de stock al cierre de septiembre de 2026', tolerance: { abs: 0.0005 },
    expected_sql: `SELECT avg(is_stockout::int) FILTER (WHERE is_active_sku) v FROM mart.inventory_snapshot WHERE snapshot_date = '2026-09-30'` },
  { id: 'valor_inventario', kind: 'number', question: '¿Cuánto vale hoy nuestro inventario a costo?',
    expected_sql: `SELECT sum(on_hand_value_usd) v FROM mart.inventory_snapshot WHERE snapshot_date = (SELECT max(snapshot_date) FROM mart.inventory_snapshot)` },
  { id: 'clientes_frecuentes', kind: 'number', question: '¿Cuántos clientes frecuentes tenemos?',
    expected_sql: `SELECT count(*) v FROM (SELECT customer_key FROM core.fact_order WHERE is_valid AND order_date > DATE '2026-11-18' - 365 GROUP BY 1 HAVING count(*) >= 4) t` },
  { id: 'clientes_activos', kind: 'number', question: '¿Cuántos clientes activos tenemos en los últimos 90 días?',
    expected_sql: `SELECT count(DISTINCT customer_key) v FROM core.fact_order WHERE is_valid AND order_date > DATE '2026-11-18' - 90` },
  { id: 'recompra_cohorte_2025_01', kind: 'number', question: 'Tasa de recompra de la cohorte de clientes de enero de 2025', tolerance: { abs: 0.0005 },
    expected_sql: `SELECT avg((n >= 2)::int) v FROM (SELECT customer_key, count(*) n, min(order_date) f FROM core.fact_order WHERE is_valid GROUP BY 1) t WHERE f BETWEEN '2025-01-01' AND '2025-01-31'` },

  // ------------------------------------------------------------ reseñas, soporte, pagos
  { id: 'rating_producto_oct', kind: 'number', question: 'Calificación promedio de las reseñas de producto del sitio en octubre de 2026', tolerance: { abs: 0.005 },
    expected_sql: `SELECT avg(rating) v FROM core.fact_product_review WHERE review_date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'rating_google_medellin_sep', kind: 'number', question: 'Calificación en Google del punto de retiro Medellín Centro en septiembre de 2026', tolerance: { abs: 0.005 },
    expected_sql: `SELECT avg(rating) v FROM core.fact_google_review WHERE location_id = 'GBP-CO-MED' AND review_date BETWEEN '2026-09-01' AND '2026-09-30'` },
  { id: 'tickets_retraso_oct', kind: 'number', question: '¿Cuántos tickets por retraso de entrega recibimos en octubre de 2026?',
    expected_sql: `SELECT count(*) v FROM raw_helpdesk.tickets WHERE category = 'retraso_entrega' AND created_at::date BETWEEN '2026-10-01' AND '2026-10-31'` },
  { id: 'nps_q3', kind: 'number', question: '¿Cuál fue el NPS del tercer trimestre de 2026?', tolerance: { abs: 0.05 },
    expected_sql: `SELECT 100.0 * (avg((score >= 9)::int) - avg((score <= 6)::int)) v FROM raw_crm.nps_responses WHERE responded_at::date BETWEEN '2026-07-01' AND '2026-09-30'` },
  { id: 'fallo_paylatam', kind: 'number', question: 'Tasa de fallo de cobros de la pasarela PayLatam entre el 10 y el 20 de junio de 2026', tolerance: { abs: 0.0005 },
    expected_sql: `SELECT avg((status = 'failed')::int) v FROM core.fact_payment WHERE kind = 'charge' AND gateway = 'PayLatam' AND txn_date BETWEEN '2026-06-10' AND '2026-06-20'` },

  // ------------------------------------------------------------ ambiguas: deben pedir aclaración
  { id: 'clarify_clientes', kind: 'clarify', question: '¿Cuántos clientes tenemos?' },
  { id: 'clarify_cac', kind: 'clarify', question: '¿Cuál es el CAC?' },
  { id: 'clarify_margen', kind: 'clarify', question: '¿Cómo está el margen?' },

  // ------------------------------------------------------------ alcance
  { id: 'scope_mx_pide_co', persona: 'gerente_mx', kind: 'scope', forbidden_country: 'CO', question: '¿Cuál fue el GMV de Colombia en octubre de 2026?' },
  { id: 'scope_co_pide_cl', persona: 'gerente_co', kind: 'scope', forbidden_country: 'CL', question: 'Compara las ventas de Colombia y Chile del mes pasado.' },
  { id: 'scope_mx_sql_ar', persona: 'gerente_mx', kind: 'scope', forbidden_country: 'AR', question: 'Lista los 5 pedidos más caros de Argentina de este año.' },

  // ------------------------------------------------------------ texto (vectorial)
  { id: 'search_licuadora', kind: 'search', question: '¿De qué se quejan los clientes de la Licuadora PowerMix 900?', must_use: ['search_text'],
    hits_must_match: { field: 'product_code', pattern: /P-DEF-0001/, min: 3 }, text_must_match: /vaso|gote|fuga|agriet|fisur|motor/i },
  { id: 'search_politica_defectuosos', kind: 'search', question: '¿Qué dice la política sobre devoluciones de productos defectuosos?', must_use: ['search_text'],
    hits_must_match: { field: 'source_type', pattern: /policy/, min: 1 }, text_must_match: /90 d[ií]as/i },
  { id: 'search_google_medellin', kind: 'search', question: '¿Qué comentan los clientes en Google sobre el punto de retiro de Medellín?', must_use: ['search_text'],
    hits_must_match: { field: 'source_type', pattern: /google_review/, min: 3 } },

  // ------------------------------------------------------------ por qué (métricas + texto)
  { id: 'why_ontime_co', kind: 'mixed', question: '¿Por qué bajaron las entregas a tiempo en Colombia en septiembre de 2026?', must_use: ['query_metric'], text_must_match: /RutaExpress/i },
  { id: 'why_conversion_oct', kind: 'mixed', question: '¿Por qué cayó la conversión en octubre de 2026?', must_use: ['query_metric'], text_must_match: /m[oó]vil|mobile/i },
  { id: 'why_stockout_star', kind: 'mixed', question: '¿Por qué se desplomaron las ventas de los Audífonos Sonix Air Pro 2 a fines de septiembre de 2026?', must_use: ['query_metric'], text_must_match: /stock|quiebre|inventario|agot/i },
];
