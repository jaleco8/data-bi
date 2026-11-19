/** Controles de conciliación entre fuentes y capas. Cada uno compara dos números. */
export interface Reconciliation {
  name: string;
  description: string;
  expected: string; // SQL que devuelve una columna "v"
  actual: string;
  relTolerance?: number;
  absTolerance?: number;
}

export const RECONCILIATIONS: Reconciliation[] = [
  {
    name: 'pedidos_raw_vs_core',
    description: 'Todos los pedidos del OMS llegan a core (no se pierden filas por tipo de cambio o país).',
    expected: `SELECT count(*) AS v FROM raw_shop.orders`,
    actual: `SELECT count(*) AS v FROM core.fact_order`,
    absTolerance: 0,
  },
  {
    name: 'lineas_raw_vs_core',
    description: 'Todas las líneas de pedido llegan a core con su SKU en el catálogo del ERP.',
    expected: `SELECT count(*) AS v FROM raw_shop.order_items`,
    actual: `SELECT count(*) AS v FROM core.fact_order_line`,
    absTolerance: 0,
  },
  {
    name: 'pedidos_pagados_vs_cobros',
    description: 'Cada pedido pagado en el OMS tiene exactamente un cobro exitoso en la pasarela.',
    expected: `SELECT count(*) AS v FROM core.fact_order WHERE is_paid`,
    actual: `SELECT count(DISTINCT order_id) AS v FROM core.fact_payment WHERE kind = 'charge' AND status = 'succeeded'`,
    absTolerance: 0,
  },
  {
    name: 'monto_cobrado_vs_total_pedidos',
    description: 'Monto cobrado por la pasarela (moneda local) = total de pedidos pagados en el OMS.',
    expected: `SELECT round(sum(total), 2) AS v FROM core.fact_order WHERE is_paid`,
    actual: `SELECT round(sum(amount_local), 2) AS v FROM core.fact_payment WHERE kind = 'charge' AND status = 'succeeded'`,
    relTolerance: 0.000001,
  },
  {
    name: 'reembolsos_vs_cancelaciones_devoluciones',
    description: 'Reembolsos de la pasarela = pedidos cancelados + devoluciones reembolsadas (moneda local).',
    expected: `SELECT round((SELECT coalesce(sum(total),0) FROM core.fact_order WHERE is_cancelled) + (SELECT coalesce(sum(refund_amount),0) FROM raw_shop.returns WHERE status = 'refunded'), 2) AS v`,
    actual: `SELECT round(sum(amount_local), 2) AS v FROM core.fact_payment WHERE kind = 'refund' AND status = 'succeeded'`,
    relTolerance: 0.000001,
  },
  {
    name: 'envios_vs_pedidos_despachados',
    description: 'Cada pedido despachado en el OMS tiene un envío en el sistema del transportista.',
    expected: `SELECT count(*) AS v FROM core.fact_order WHERE shipped_at IS NOT NULL`,
    actual: `SELECT count(*) AS v FROM core.fact_shipment`,
    absTolerance: 0,
  },
  {
    name: 'unidades_despachadas_vs_wms',
    description: 'Unidades despachadas según el OMS = salidas (PICK) registradas en el WMS.',
    expected: `SELECT sum(l.qty) AS v FROM core.fact_order_line l JOIN core.fact_order o USING (order_id) WHERE o.shipped_at IS NOT NULL`,
    actual: `SELECT -sum(qty) AS v FROM core.fact_inventory_movement WHERE movement_type = 'PICK'`,
    absTolerance: 0,
  },
  {
    name: 'compras_ga4_vs_pedidos_web_app',
    description: 'Compras registradas en GA4 vs pedidos pagados web/app en el OMS. GA pierde ~3-5% por bloqueadores y consentimiento.',
    expected: `SELECT count(*) AS v FROM core.fact_order WHERE is_paid AND channel IN ('web', 'app')`,
    actual: `SELECT sum(purchases) AS v FROM core.fact_web_traffic_daily`,
    relTolerance: 0.06,
  },
  {
    name: 'clientes_con_ficha_crm',
    description: 'Compradores con ficha en el CRM tras resolver identidad por email (esperado ≥ 95%).',
    expected: `SELECT count(*) AS v FROM core.dim_customer WHERE is_buyer`,
    actual: `SELECT count(*) AS v FROM core.dim_customer WHERE is_buyer AND crm_contact_id IS NOT NULL`,
    relTolerance: 0.05,
  },
  {
    name: 'nps_sin_duplicados',
    description: 'Cada respuesta NPS del CRM aparece una sola vez tras la resolución de identidad.',
    expected: `SELECT count(*) AS v FROM raw_crm.nps_responses`,
    actual: `SELECT count(*) AS v FROM core.fact_nps`,
    absTolerance: 0,
  },
  {
    name: 'tickets_sin_duplicados',
    description: 'Cada ticket de la mesa de ayuda aparece una sola vez en core.',
    expected: `SELECT count(*) AS v FROM raw_helpdesk.tickets`,
    actual: `SELECT count(*) AS v FROM core.fact_support_ticket`,
    absTolerance: 0,
  },
  {
    name: 'gmv_mart_vs_core',
    description: 'GMV de mart.orders = mercadería neta de pedidos pagados en core.',
    expected: `SELECT round(sum(merch_usd), 2) AS v FROM core.fact_order WHERE is_paid`,
    actual: `SELECT round(sum(gmv_usd), 2) AS v FROM mart.orders`,
    absTolerance: 0.01,
  },
  {
    name: 'ingreso_neto_lineas_vs_pedidos',
    description: 'Ingreso neto sumado por líneas (mart.order_lines) = por pedidos (mart.orders), salvo redondeo.',
    expected: `SELECT sum(net_revenue_usd) AS v FROM mart.orders`,
    actual: `SELECT sum(net_revenue_usd) AS v FROM mart.order_lines`,
    relTolerance: 0.0001,
  },
];
