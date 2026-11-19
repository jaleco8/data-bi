import type { Grain, MetricCatalog, MetricDef, MetricQuery, MetricSource, Scope } from './types.js';

/**
 * Motor de métricas: convierte una MetricQuery validada en SQL parametrizado.
 * - Identificadores (tabla, columnas, grano) salen SOLO del catálogo / enums.
 * - Valores del usuario siempre como parámetros ($n).
 * - El alcance (países permitidos) se inyecta siempre como filtro adicional.
 */

export class MetricQueryError extends Error {
  constructor(
    message: string,
    public readonly code: 'unknown_metric' | 'unknown_dimension' | 'unsupported' | 'out_of_scope' | 'bad_request',
  ) {
    super(message);
  }
}

export interface BuiltQuery {
  metric: MetricDef;
  source: MetricSource;
  table: string;
  sql: string;
  params: unknown[];
  totalSql: string;
  totalParams: unknown[];
  period: { from: string; to: string };
  columns: string[];
  notes: string[];
  limit: number;
}

const GRAINS: Grain[] = ['day', 'week', 'month', 'quarter', 'year'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function addDays(d: string, n: number): string {
  const t = new Date(d + 'T00:00:00Z').getTime() + n * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00Z').getTime() - new Date(a + 'T00:00:00Z').getTime()) / 86_400_000);
}
export function shiftYear(d: string, n: number): string {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y + n, m - 1, day)).toISOString().slice(0, 10);
}

export function resolvePeriod(q: MetricQuery, cutoff: string): { from: string; to: string } {
  let to = q.date_to ?? cutoff;
  let from = q.date_from ?? addDays(to, -29);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new MetricQueryError('Fechas deben tener formato YYYY-MM-DD', 'bad_request');
  if (to > cutoff) to = cutoff;
  if (from > to) throw new MetricQueryError(`El periodo es inválido o posterior a la fecha de corte (${cutoff}).`, 'bad_request');
  return { from, to };
}

export function comparisonPeriod(p: { from: string; to: string }, mode: 'previous_period' | 'previous_year'): { from: string; to: string } {
  if (mode === 'previous_year') return { from: shiftYear(p.from, -1), to: shiftYear(p.to, -1) };
  const len = daysBetween(p.from, p.to) + 1;
  return { from: addDays(p.from, -len), to: addDays(p.to, -len) };
}

export function findMetric(cat: MetricCatalog, key: string): MetricDef {
  const m = cat.metrics.find((x) => x.key === key);
  if (!m) throw new MetricQueryError(`Métrica desconocida: "${key}". Usa list_metrics para ver el catálogo.`, 'unknown_metric');
  return m;
}

export function pickSource(cat: MetricCatalog, m: MetricDef, dims: string[]): MetricSource {
  for (const s of m.sources) {
    const t = cat.tables[s.table];
    if (t && dims.every((d) => d in t.dimensions)) return s;
  }
  const allowed = [...new Set(m.sources.flatMap((s) => Object.keys(cat.tables[s.table]?.dimensions ?? {})))];
  const bad = dims.filter((d) => !allowed.includes(d));
  throw new MetricQueryError(
    bad.length
      ? `La métrica "${m.key}" no se puede desglosar/filtrar por: ${bad.join(', ')}. Dimensiones disponibles: ${allowed.join(', ')}.`
      : `La combinación de dimensiones ${dims.join(' + ')} no está disponible en una misma tabla para "${m.key}".`,
    'unknown_dimension',
  );
}

export function buildMetricQuery(cat: MetricCatalog, q: MetricQuery, scope: Scope, cutoff: string, periodOverride?: { from: string; to: string }): BuiltQuery {
  const m = findMetric(cat, q.metric);
  const groupBy = [...new Set(q.group_by ?? [])];
  if (groupBy.length > 2) throw new MetricQueryError('Máximo 2 dimensiones de agrupación.', 'bad_request');
  if (q.grain && !GRAINS.includes(q.grain)) throw new MetricQueryError(`Grano inválido: ${q.grain}`, 'bad_request');
  const filters = q.filters ?? [];
  const dimsNeeded = [...groupBy, ...filters.map((f) => f.dimension)];
  if (scope.countries) dimsNeeded.push('pais');
  const source = pickSource(cat, m, [...new Set(dimsNeeded)]);
  const table = cat.tables[source.table];
  const notes: string[] = [];
  const params: unknown[] = [];
  const p = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };

  // --- alcance del usuario
  if (scope.countries) {
    const pf = filters.filter((f) => f.dimension === 'pais' && (f.op ?? 'in') === 'in');
    for (const f of pf) {
      const outside = f.values.map((v) => normalizeCountry(v)).filter((v) => !scope.countries!.includes(v));
      if (outside.length) {
        throw new MetricQueryError(`Tu perfil (${scope.label}) solo tiene acceso a: ${scope.countries.join(', ')}. No puedo consultar ${outside.join(', ')}.`, 'out_of_scope');
      }
    }
  }

  // --- periodo
  const period = periodOverride ?? resolvePeriod(q, cutoff);
  const where: string[] = [];
  const dc = table.date_column;
  let grain = q.grain;
  if (m.time === 'none') {
    if (grain) notes.push('Métrica de foto actual: se ignora la agrupación temporal.');
    grain = undefined;
    notes.push(`Foto a la fecha de corte (${cutoff}); no depende del periodo pedido.`);
  } else {
    where.push(`${dc} >= ${p(period.from)}::date`, `${dc} <= ${p(period.to)}::date`);
    if (source.table === 'mart.customers') notes.push('Periodo aplicado a la cohorte (fecha del primer pedido).');
  }
  if (source.base_filter) where.push(`(${source.base_filter})`);

  // --- filtros
  for (const f of filters) {
    const col = table.dimensions[f.dimension];
    const op = f.op ?? 'in';
    const vals = (f.values ?? []).map(String).filter((v) => v.length);
    if (!vals.length) continue;
    const norm = f.dimension === 'pais' ? vals.map((v) => normalizeCountry(v)) : vals;
    if (op === 'in') where.push(`${col}::text = ANY(${p(norm)}::text[])`);
    else if (op === 'not_in') where.push(`NOT (${col}::text = ANY(${p(norm)}::text[]))`);
    else if (op === 'contains') where.push(`${col}::text ILIKE ANY(${p(norm.map((v) => `%${v}%`))}::text[])`);
    else throw new MetricQueryError(`Operador inválido: ${op}`, 'bad_request');
  }
  if (scope.countries) where.push(`${table.dimensions.pais}::text = ANY(${p(scope.countries)}::text[])`);

  // --- fotos (inventario): última fecha del periodo o de cada bucket
  if (m.time === 'last') {
    const inner = `SELECT MAX(${dc}) FROM ${source.table} WHERE ${dc} >= $1::date AND ${dc} <= $2::date`;
    if (grain && grain !== 'day') where.push(`${dc} IN (${inner} GROUP BY date_trunc('${grain}', ${dc}))`);
    else if (!grain) where.push(`${dc} = (${inner})`);
    notes.push('Métrica de foto: se usa el último cierre disponible del periodo (cierres mensuales y foto a la fecha de corte).');
  }

  // --- SELECT
  const select: string[] = [];
  const columns: string[] = [];
  if (grain) {
    select.push(`date_trunc('${grain}', ${dc})::date AS periodo`);
    columns.push('periodo');
  }
  for (const g of groupBy) {
    select.push(`${table.dimensions[g]} AS "${g}"`);
    columns.push(g);
  }
  select.push(`${source.expression} AS valor`);
  columns.push('valor');

  const whereSql = where.length ? `WHERE ${where.join('\n  AND ')}` : '';
  const nGroup = (grain ? 1 : 0) + groupBy.length;
  const groupSql = nGroup ? `GROUP BY ${Array.from({ length: nGroup }, (_, i) => i + 1).join(', ')}` : '';
  let order = '';
  if (grain) order = `ORDER BY 1${groupBy.length ? ', ' + groupBy.map((_, i) => i + 2).join(', ') : ''}`;
  else if (groupBy.length) order = q.order === 'dimension' ? `ORDER BY 1` : `ORDER BY valor ${q.order === 'value_asc' ? 'ASC' : 'DESC'} NULLS LAST`;
  const limit = Math.min(Math.max(1, q.limit ?? (grain ? 500 : 25)), 1000);

  const sql = `SELECT ${select.join(',\n       ')}\nFROM ${source.table}\n${whereSql}\n${groupSql}\n${order}\nLIMIT ${limit + 1}`.replace(/\n\n+/g, '\n');

  // total sin desglose (para KPI y para cuadrar el desglose)
  let totalWhere = where;
  if (m.time === 'last' && grain) {
    totalWhere = where.filter((w) => !w.startsWith(`${dc} IN (`));
    totalWhere.push(`${dc} = (SELECT MAX(${dc}) FROM ${source.table} WHERE ${dc} >= $1::date AND ${dc} <= $2::date)`);
  }
  const totalSql = `SELECT ${source.expression} AS valor\nFROM ${source.table}\n${totalWhere.length ? 'WHERE ' + totalWhere.join('\n  AND ') : ''}`;

  return { metric: m, source, table: source.table, sql, params, totalSql, totalParams: params, period, columns, notes, limit };
}

const COUNTRY_NAMES: Record<string, string> = {
  mexico: 'MX', méxico: 'MX', mx: 'MX',
  colombia: 'CO', co: 'CO',
  chile: 'CL', cl: 'CL',
  peru: 'PE', perú: 'PE', pe: 'PE',
  argentina: 'AR', ar: 'AR',
};
export function normalizeCountry(v: string): string {
  return COUNTRY_NAMES[v.trim().toLowerCase()] ?? v.trim().toUpperCase();
}
