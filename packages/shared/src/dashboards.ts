import { addDays } from './metric-sql.js';
import type { DashboardDef, RelativePeriod } from './types.js';

/** Convierte un periodo relativo en fechas concretas a partir de la fecha de corte. */
export function resolveRelativePeriod(p: RelativePeriod, cutoff: string, dataFrom = '2024-01-01'): { date_from: string; date_to: string } {
  const [y, m] = cutoff.split('-').map(Number);
  switch (p) {
    case 'last_7d':
      return { date_from: addDays(cutoff, -6), date_to: cutoff };
    case 'last_30d':
      return { date_from: addDays(cutoff, -29), date_to: cutoff };
    case 'last_90d':
      return { date_from: addDays(cutoff, -89), date_to: cutoff };
    case 'last_12m': {
      const from = new Date(Date.UTC(y - 1, m, 1)).toISOString().slice(0, 10);
      return { date_from: from, date_to: cutoff };
    }
    case 'ytd':
      return { date_from: `${y}-01-01`, date_to: cutoff };
    case 'last_full_month': {
      const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
      const last = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
      return { date_from: first, date_to: last };
    }
    case 'all':
      return { date_from: dataFrom, date_to: cutoff };
  }
}

export const PERIOD_LABEL: Record<RelativePeriod, string> = {
  last_7d: 'Últimos 7 días',
  last_30d: 'Últimos 30 días',
  last_90d: 'Últimos 90 días',
  last_12m: 'Últimos 12 meses',
  ytd: 'Año en curso',
  last_full_month: 'Último mes cerrado',
  all: 'Histórico completo',
};

/** Dashboards oficiales: usan exactamente las métricas certificadas del catálogo. */
export const OFFICIAL_DASHBOARDS: DashboardDef[] = [
  {
    slug: 'ejecutivo',
    title: 'Resumen ejecutivo',
    description: 'Indicadores clave del negocio con la misma definición que usa el chat.',
    widgets: [
      { id: 'k1', title: 'GMV', period: 'last_30d', chart: 'kpi', query: { metric: 'gmv', compare_to: 'previous_period' } },
      { id: 'k2', title: 'Ingresos netos', period: 'last_30d', chart: 'kpi', query: { metric: 'ingresos_netos', compare_to: 'previous_period' } },
      { id: 'k3', title: 'Pedidos válidos', period: 'last_30d', chart: 'kpi', query: { metric: 'pedidos', compare_to: 'previous_period' } },
      { id: 'k4', title: 'Ticket promedio', period: 'last_30d', chart: 'kpi', query: { metric: 'ticket_promedio', compare_to: 'previous_period' } },
      { id: 'k5', title: 'Conversión', period: 'last_30d', chart: 'kpi', query: { metric: 'tasa_conversion', compare_to: 'previous_period' } },
      { id: 'k6', title: 'Entregas a tiempo', period: 'last_30d', chart: 'kpi', query: { metric: 'entregas_a_tiempo', compare_to: 'previous_period' } },
      { id: 'c1', title: 'GMV mensual por país', period: 'last_12m', chart: 'stacked_bar', width: 2, query: { metric: 'gmv', grain: 'month', group_by: ['pais'] } },
      { id: 'c2', title: 'Ingresos netos por categoría', period: 'last_90d', chart: 'horizontal_bar', query: { metric: 'ingresos_netos', group_by: ['categoria'] } },
      { id: 'c3', title: 'Pedidos diarios', period: 'last_90d', chart: 'line', width: 2, query: { metric: 'pedidos', grain: 'day' } },
      { id: 'c4', title: 'Nuevos vs recurrentes', period: 'last_90d', chart: 'pie', query: { metric: 'pedidos', group_by: ['tipo_cliente'] } },
    ],
  },
  {
    slug: 'ventas',
    title: 'Ventas y productos',
    description: 'Venta bruta, ingresos, margen y desempeño del catálogo.',
    widgets: [
      { id: 'k1', title: 'GMV', period: 'last_90d', chart: 'kpi', query: { metric: 'gmv', compare_to: 'previous_year' } },
      { id: 'k2', title: 'Margen bruto %', period: 'last_90d', chart: 'kpi', query: { metric: 'margen_bruto_pct', compare_to: 'previous_year' } },
      { id: 'k3', title: 'Unidades vendidas', period: 'last_90d', chart: 'kpi', query: { metric: 'unidades_vendidas', compare_to: 'previous_year' } },
      { id: 'k4', title: 'Descuentos', period: 'last_90d', chart: 'kpi', query: { metric: 'descuentos', compare_to: 'previous_year' } },
      { id: 'c1', title: 'GMV semanal por canal', period: 'last_12m', chart: 'area', width: 2, query: { metric: 'gmv', grain: 'week', group_by: ['canal'] } },
      { id: 'c2', title: 'Margen por categoría', period: 'last_90d', chart: 'horizontal_bar', query: { metric: 'margen_bruto', group_by: ['categoria'] } },
      { id: 'c3', title: 'Top 15 productos por ingresos', period: 'last_90d', chart: 'table', width: 2, query: { metric: 'ingresos_netos', group_by: ['producto'], limit: 15 } },
      { id: 'c4', title: 'Ventas por dispositivo', period: 'last_90d', chart: 'pie', query: { metric: 'gmv', group_by: ['dispositivo'] } },
    ],
  },
  {
    slug: 'clientes',
    title: 'Clientes y CRM',
    description: 'Base de clientes unificada (tienda + CRM), recompra, LTV y segmentos.',
    widgets: [
      { id: 'k1', title: 'Clientes activos (90 d)', period: 'last_30d', chart: 'kpi', query: { metric: 'clientes_activos' } },
      { id: 'k2', title: 'Clientes frecuentes', period: 'last_30d', chart: 'kpi', query: { metric: 'clientes_frecuentes' } },
      { id: 'k3', title: 'Clientes nuevos', period: 'last_30d', chart: 'kpi', query: { metric: 'clientes_nuevos', compare_to: 'previous_period' } },
      { id: 'k4', title: 'NPS', period: 'last_90d', chart: 'kpi', query: { metric: 'nps', compare_to: 'previous_period' } },
      { id: 'c1', title: 'Clientes por segmento RFM', period: 'last_30d', chart: 'horizontal_bar', query: { metric: 'base_clientes', group_by: ['segmento_rfm'] } },
      { id: 'c2', title: 'Tasa de recompra por cohorte', period: 'all', chart: 'line', width: 2, query: { metric: 'tasa_recompra', grain: 'month' } },
      { id: 'c3', title: 'LTV 12 meses por país', period: 'all', chart: 'bar', query: { metric: 'ltv_365', group_by: ['pais'] } },
      { id: 'c4', title: 'Clientes nuevos por mes', period: 'last_12m', chart: 'bar', width: 2, query: { metric: 'clientes_nuevos', grain: 'month' } },
    ],
  },
  {
    slug: 'marketing',
    title: 'Marketing y tráfico',
    description: 'Inversión, ROAS y CAC por campaña (Ads) cruzado con sesiones de GA4 y pedidos del OMS.',
    widgets: [
      { id: 'k1', title: 'Inversión publicitaria', period: 'last_90d', chart: 'kpi', query: { metric: 'inversion_publicitaria', compare_to: 'previous_period' } },
      { id: 'k2', title: 'ROAS', period: 'last_90d', chart: 'kpi', query: { metric: 'roas', compare_to: 'previous_period' } },
      { id: 'k3', title: 'CAC pagado', period: 'last_90d', chart: 'kpi', query: { metric: 'cac_pagado', compare_to: 'previous_period' } },
      { id: 'k4', title: 'Sesiones', period: 'last_90d', chart: 'kpi', query: { metric: 'sesiones', compare_to: 'previous_period' } },
      { id: 'c1', title: 'ROAS por campaña', period: 'last_90d', chart: 'horizontal_bar', width: 2, query: { metric: 'roas', group_by: ['campana'] } },
      { id: 'c2', title: 'Sesiones por grupo de canal', period: 'last_90d', chart: 'pie', query: { metric: 'sesiones', group_by: ['grupo_canal'] } },
      { id: 'c3', title: 'Conversión semanal por dispositivo', period: 'last_12m', chart: 'line', width: 3, query: { metric: 'tasa_conversion', grain: 'week', group_by: ['dispositivo_ga'] } },
    ],
  },
  {
    slug: 'logistica',
    title: 'Logística y entregas',
    description: 'Puntualidad, tiempos y desempeño por transportista y país.',
    widgets: [
      { id: 'k1', title: 'Entregas a tiempo', period: 'last_30d', chart: 'kpi', query: { metric: 'entregas_a_tiempo', compare_to: 'previous_period' } },
      { id: 'k2', title: 'OTIF', period: 'last_30d', chart: 'kpi', query: { metric: 'otif', compare_to: 'previous_period' } },
      { id: 'k3', title: 'Tiempo de entrega', period: 'last_30d', chart: 'kpi', query: { metric: 'tiempo_entrega_promedio', compare_to: 'previous_period' } },
      { id: 'k4', title: 'Envíos', period: 'last_30d', chart: 'kpi', query: { metric: 'envios', compare_to: 'previous_period' } },
      { id: 'c1', title: 'Entregas a tiempo por transportista (semanal)', period: 'last_12m', chart: 'line', width: 3, query: { metric: 'entregas_a_tiempo', grain: 'week', group_by: ['transportista'] } },
      { id: 'c2', title: 'Tiempo de entrega por país', period: 'last_90d', chart: 'bar', query: { metric: 'tiempo_entrega_promedio', group_by: ['pais'] } },
      { id: 'c3', title: 'Puntualidad por transportista y país', period: 'last_90d', chart: 'table', width: 2, query: { metric: 'entregas_a_tiempo', group_by: ['transportista', 'pais'], limit: 30 } },
    ],
  },
  {
    slug: 'inventario',
    title: 'Inventario',
    description: 'Fotos de cierre de mes del WMS: quiebres, valor y cobertura.',
    widgets: [
      { id: 'k1', title: 'Tasa de quiebre', period: 'last_30d', chart: 'kpi', query: { metric: 'tasa_quiebre_stock' } },
      { id: 'k2', title: 'Valor del inventario', period: 'last_30d', chart: 'kpi', query: { metric: 'valor_inventario' } },
      { id: 'k3', title: 'Unidades en stock', period: 'last_30d', chart: 'kpi', query: { metric: 'unidades_en_stock' } },
      { id: 'k4', title: 'Días de cobertura (mediana)', period: 'last_30d', chart: 'kpi', query: { metric: 'dias_cobertura' } },
      { id: 'c1', title: 'Quiebre de stock por mes', period: 'last_12m', chart: 'line', width: 2, query: { metric: 'tasa_quiebre_stock', grain: 'month' } },
      { id: 'c2', title: 'Valor de inventario por almacén', period: 'last_30d', chart: 'horizontal_bar', query: { metric: 'valor_inventario', group_by: ['almacen'] } },
      { id: 'c3', title: 'Quiebre por categoría', period: 'last_30d', chart: 'bar', width: 3, query: { metric: 'tasa_quiebre_stock', group_by: ['categoria'] } },
    ],
  },
  {
    slug: 'experiencia',
    title: 'Reseñas y soporte',
    description: 'Reseñas de producto y Google, tickets, tiempos de atención y devoluciones.',
    widgets: [
      { id: 'k1', title: 'Calificación promedio', period: 'last_90d', chart: 'kpi', query: { metric: 'calificacion_promedio', compare_to: 'previous_period' } },
      { id: 'k2', title: 'Reseñas negativas', period: 'last_90d', chart: 'kpi', query: { metric: 'resenas_negativas_pct', compare_to: 'previous_period' } },
      { id: 'k3', title: 'Tickets', period: 'last_90d', chart: 'kpi', query: { metric: 'tickets', compare_to: 'previous_period' } },
      { id: 'k4', title: 'Tasa de devolución', period: 'last_90d', chart: 'kpi', query: { metric: 'tasa_devolucion', compare_to: 'previous_period' } },
      { id: 'c1', title: 'Tickets por categoría (mensual)', period: 'last_12m', chart: 'stacked_bar', width: 2, query: { metric: 'tickets', grain: 'month', group_by: ['categoria_ticket'] } },
      { id: 'c2', title: 'Motivos de devolución', period: 'last_90d', chart: 'pie', query: { metric: 'devoluciones', group_by: ['motivo_devolucion'] } },
      { id: 'c3', title: 'Calificación por categoría', period: 'last_90d', chart: 'horizontal_bar', query: { metric: 'calificacion_promedio', group_by: ['categoria'], filters: [{ dimension: 'fuente_resena', values: ['producto'] }] } },
      { id: 'c4', title: 'Productos con más devoluciones', period: 'last_90d', chart: 'table', width: 2, query: { metric: 'devoluciones', group_by: ['producto'], limit: 10 } },
    ],
  },
];
