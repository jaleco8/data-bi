import { z } from 'zod';

/** Definiciones de herramientas (JSON Schema para el modelo) + validadores zod (para el backend). */

const filterSchema = {
  type: 'object',
  properties: {
    dimension: { type: 'string', description: 'Clave de dimensión del catálogo (p. ej. pais, categoria, transportista).' },
    op: { type: 'string', enum: ['in', 'not_in', 'contains'], description: 'in (por defecto), not_in o contains (coincidencia parcial, sin distinguir mayúsculas).' },
    values: { type: 'array', items: { type: 'string' }, description: 'Valores exactos (usa list_dimension_values si no los conoces).' },
  },
  required: ['dimension', 'values'],
  additionalProperties: false,
} as const;

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export const TOOLS: ToolDef[] = [
  {
    name: 'query_metric',
    description:
      'Calcula una métrica certificada del catálogo y muestra un gráfico al usuario. Devuelve total del periodo, filas del desglose y comparación opcional. Úsala para TODA cifra de negocio.',
    input_schema: {
      type: 'object',
      properties: {
        metric: { type: 'string', description: 'Clave de la métrica (p. ej. gmv, pedidos, entregas_a_tiempo).' },
        date_from: { type: 'string', description: 'Inicio YYYY-MM-DD inclusive. Por defecto: 30 días antes del corte.' },
        date_to: { type: 'string', description: 'Fin YYYY-MM-DD inclusive. Por defecto: fecha de corte.' },
        grain: { type: 'string', enum: ['day', 'week', 'month', 'quarter', 'year'], description: 'Agrupar por tiempo (para evolución).' },
        group_by: { type: 'array', items: { type: 'string' }, description: 'Hasta 2 dimensiones de desglose.' },
        filters: { type: 'array', items: filterSchema },
        compare_to: { type: 'string', enum: ['previous_period', 'previous_year'], description: 'Comparar contra el periodo anterior de igual duración o el mismo periodo del año anterior.' },
        order: { type: 'string', enum: ['value_desc', 'value_asc', 'dimension'] },
        limit: { type: 'integer', description: 'Máximo de filas del desglose (por defecto 25; 500 con grano).' },
        chart: { type: 'string', enum: ['kpi', 'bar', 'horizontal_bar', 'stacked_bar', 'line', 'area', 'pie', 'table'], description: 'Tipo de gráfico sugerido.' },
        title: { type: 'string', description: 'Título breve del gráfico en español.' },
      },
      required: ['metric'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_dimension_values',
    description: 'Lista los valores existentes de una dimensión (los más frecuentes primero), opcionalmente filtrando por texto. Úsala antes de filtrar por nombres de producto, campaña, categoría, transportista, etc.',
    input_schema: {
      type: 'object',
      properties: {
        dimension: { type: 'string' },
        metric: { type: 'string', description: 'Métrica para la que se usará el filtro (elige la tabla correcta).' },
        search: { type: 'string', description: 'Texto parcial a buscar.' },
      },
      required: ['dimension'],
      additionalProperties: false,
    },
  },
  {
    name: 'explain_metric',
    description: 'Devuelve la definición completa de una métrica: fórmula, tablas, dimensiones, responsable y frecuencia de actualización.',
    input_schema: {
      type: 'object',
      properties: { metric: { type: 'string' } },
      required: ['metric'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_text',
    description:
      'Búsqueda semántica (vectorial) sobre texto no estructurado: reseñas de producto (product_review), reseñas de Google (google_review), tickets de soporte (support_ticket), comentarios NPS (nps), fichas de producto (product) y políticas/FAQ (policy). Devuelve los fragmentos más parecidos con sus metadatos.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Qué buscar, en lenguaje natural.' },
        source_types: { type: 'array', items: { type: 'string', enum: ['product_review', 'google_review', 'support_ticket', 'nps', 'product', 'policy'] } },
        product_code: { type: 'string' },
        category_l1: { type: 'string', description: 'Categoría de primer nivel exacta (p. ej. Electrónica).' },
        country: { type: 'string', description: 'Código de país (MX, CO, CL, PE, AR).' },
        rating_min: { type: 'integer' },
        rating_max: { type: 'integer' },
        date_from: { type: 'string' },
        date_to: { type: 'string' },
        k: { type: 'integer', description: 'Cantidad de fragmentos (1–25, por defecto 8).' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'run_readonly_sql',
    description:
      'Ejecuta un SELECT de solo lectura sobre tablas mart.* (máx. 200 filas, 10 s). Solo para preguntas que el catálogo no cubre; el resultado NO es una cifra certificada. Tablas: mart.orders, mart.order_lines, mart.customers, mart.returns, mart.shipments, mart.inventory_snapshot, mart.web_traffic_daily, mart.marketing_daily, mart.reviews, mart.support_tickets, mart.nps, mart.payments, mart.products.',
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string' },
        purpose: { type: 'string', description: 'Por qué no alcanza con una métrica certificada.' },
      },
      required: ['sql', 'purpose'],
      additionalProperties: false,
    },
  },
  {
    name: 'pin_charts',
    description: 'Guarda gráficos de esta conversación en un dashboard personal del usuario (lo crea si no existe).',
    input_schema: {
      type: 'object',
      properties: {
        chart_ids: { type: 'array', items: { type: 'string' }, description: 'Ids de gráficos devueltos por query_metric.' },
        dashboard_title: { type: 'string' },
      },
      required: ['chart_ids', 'dashboard_title'],
      additionalProperties: false,
    },
  },
];

const Filter = z.object({ dimension: z.string(), op: z.enum(['in', 'not_in', 'contains']).optional(), values: z.array(z.string()).min(1) });

export const QueryMetricInput = z.object({
  metric: z.string(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
  grain: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional(),
  group_by: z.array(z.string()).max(2).optional(),
  filters: z.array(Filter).optional(),
  compare_to: z.enum(['previous_period', 'previous_year']).optional(),
  order: z.enum(['value_desc', 'value_asc', 'dimension']).optional(),
  limit: z.number().int().positive().max(1000).optional(),
  chart: z.enum(['kpi', 'bar', 'horizontal_bar', 'stacked_bar', 'line', 'area', 'pie', 'table']).optional(),
  title: z.string().optional(),
});

export const Inputs = {
  query_metric: QueryMetricInput,
  list_dimension_values: z.object({ dimension: z.string(), metric: z.string().optional(), search: z.string().optional() }),
  explain_metric: z.object({ metric: z.string() }),
  search_text: z.object({
    query: z.string().min(2),
    source_types: z.array(z.enum(['product_review', 'google_review', 'support_ticket', 'nps', 'product', 'policy'])).optional(),
    product_code: z.string().optional(),
    category_l1: z.string().optional(),
    country: z.string().optional(),
    rating_min: z.number().int().optional(),
    rating_max: z.number().int().optional(),
    date_from: z.string().optional(),
    date_to: z.string().optional(),
    k: z.number().int().optional(),
  }),
  run_readonly_sql: z.object({ sql: z.string().min(6), purpose: z.string() }),
  pin_charts: z.object({ chart_ids: z.array(z.string()).min(1), dashboard_title: z.string().min(1) }),
} as const;

export type ToolName = keyof typeof Inputs;
