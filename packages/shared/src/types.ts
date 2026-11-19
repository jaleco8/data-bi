/* Tipos compartidos entre ETL, API, web y evaluación. Sin dependencias de runtime. */

export type Unit = 'usd' | 'count' | 'pct' | 'days' | 'hours' | 'score' | 'ratio';
export type TimeMode = 'sum' | 'last' | 'none';
export type Grain = 'day' | 'week' | 'month' | 'quarter' | 'year';

export interface MetricSource {
  table: string;
  expression: string;
  base_filter?: string;
}

export interface MetricDef {
  key: string;
  label: string;
  domain: string;
  synonyms: string[];
  unit: Unit;
  description: string;
  sources: MetricSource[];
  time: TimeMode;
  owner: string;
  refresh: string;
  notes?: string;
}

export interface TableDef {
  date_column: string;
  dimensions: Record<string, string>;
}

export interface DimensionDef {
  label: string;
  description: string;
}

export interface MetricCatalog {
  version: number;
  tables: Record<string, TableDef>;
  dimensions: Record<string, DimensionDef>;
  metrics: MetricDef[];
}

export interface MetricFilter {
  dimension: string;
  op?: 'in' | 'not_in' | 'contains';
  values: string[];
}

/** Petición acotada que el LLM puede emitir. Nunca contiene SQL. */
export interface MetricQuery {
  metric: string;
  date_from?: string; // YYYY-MM-DD inclusive
  date_to?: string; // YYYY-MM-DD inclusive
  grain?: Grain;
  group_by?: string[];
  filters?: MetricFilter[];
  compare_to?: 'previous_period' | 'previous_year';
  order?: 'value_desc' | 'value_asc' | 'dimension';
  limit?: number;
}

/** Alcance de datos del usuario (p. ej. gerente de un país). */
export interface Scope {
  user_key: string;
  label: string;
  countries: string[] | null; // null = todos
}

export type Row = Record<string, string | number | null>;

export interface MetricResult {
  metric: string;
  label: string;
  unit: Unit;
  description: string;
  table: string;
  query: MetricQuery;
  period: { from: string; to: string };
  columns: string[];
  rows: Row[];
  total: number | null;
  comparison?: { period: { from: string; to: string }; total: number | null; rows: Row[]; change_pct: number | null; sql: string; params: unknown[] };
  sql: string;
  params: unknown[];
  cutoff: string;
  notes: string[];
  truncated: boolean;
}

export type ChartType = 'kpi' | 'bar' | 'horizontal_bar' | 'stacked_bar' | 'line' | 'area' | 'pie' | 'table';

export interface ChartSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  /** columna del eje X / categoría */
  x?: string;
  /** columnas numéricas a graficar */
  y: string[];
  /** columna para separar series (pivot) */
  series?: string;
  unit: Unit;
  data: Row[];
  /** trazabilidad: de dónde salió cada número */
  provenance?: Provenance;
}

export interface Provenance {
  kind: 'metric' | 'search';
  metric?: string;
  label?: string;
  definition?: string;
  table?: string;
  period?: { from: string; to: string };
  filters?: MetricFilter[];
  group_by?: string[];
  grain?: Grain;
  sql?: string;
  params?: unknown[];
  cutoff?: string;
  notes?: string[];
}

export interface SearchHit {
  chunk_id: number;
  source_type: string;
  source_id: string;
  title: string | null;
  content: string;
  product_code: string | null;
  category_l1: string | null;
  country_code: string | null;
  rating: number | null;
  doc_date: string | null;
  similarity: number;
}

export type RelativePeriod = 'last_7d' | 'last_30d' | 'last_90d' | 'last_12m' | 'ytd' | 'last_full_month' | 'all';

export interface DashboardWidget {
  id: string;
  title: string;
  period: RelativePeriod;
  query: MetricQuery;
  chart: ChartType;
  width?: 1 | 2 | 3;
}

export interface DashboardDef {
  slug: string;
  title: string;
  description: string;
  widgets: DashboardWidget[];
}

export interface ExplorationWidget extends Omit<DashboardWidget, 'period'> {
  period?: RelativePeriod;
  comparison_period?: { date_from: string; date_to: string };
  show_contribution?: boolean;
}

export interface RenderedWidget {
  id: string;
  title: string;
  width: number;
  period_label: string;
  definition: ExplorationWidget;
  chart?: ChartSpec;
  comparison_chart?: ChartSpec;
  error?: string;
}

export interface DashboardContext {
  widgets: ExplorationWidget[];
  selection?: { dimension: string; value: string; widget: ExplorationWidget };
}

export interface DashboardPatch {
  removed: string[];
  widgets: RenderedWidget[];
  cutoff: string;
}

/** Eventos que el API envía al cliente por SSE. */
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; id: string; name: string; ok: boolean; summary: string }
  | { type: 'chart'; id: string; chart: ChartSpec }
  | { type: 'search'; id: string; query: string; hits: SearchHit[] }
  | ({ type: 'dashboard_patch' } & DashboardPatch)
  | { type: 'done'; conversation_id: string }
  | { type: 'error'; message: string };
