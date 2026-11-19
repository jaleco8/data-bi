import type { ChartSpec, ChartType, MetricResult } from '@data-bi/shared';

/** Construye un ChartSpec a partir del resultado de una métrica (y una sugerencia opcional del agente). */
export function chartFromResult(r: MetricResult, hint?: ChartType, title?: string): ChartSpec {
  const grain = r.columns.includes('periodo');
  const dims = r.columns.filter((c) => c !== 'periodo' && c !== 'valor');
  let type: ChartType;
  let x: string | undefined;
  let series: string | undefined;

  if (!grain && dims.length === 0) {
    type = 'kpi';
  } else if (grain) {
    x = 'periodo';
    series = dims[0];
    type = hint && ['line', 'area', 'bar', 'stacked_bar', 'table'].includes(hint) ? hint : 'line';
  } else if (dims.length === 1) {
    x = dims[0];
    const n = r.rows.length;
    type = hint && ['bar', 'horizontal_bar', 'pie', 'table'].includes(hint) ? hint : n > 8 ? 'horizontal_bar' : 'bar';
    if (type === 'pie' && n > 8) type = 'horizontal_bar';
  } else {
    x = dims[0];
    series = dims[1];
    type = hint && ['stacked_bar', 'table', 'bar'].includes(hint) ? hint : 'table';
  }

  const data = r.rows.map((row) => ({ ...row }));
  if (type === 'kpi') data.splice(0, data.length, { valor: r.total, ...(r.comparison ? { anterior: r.comparison.total, variacion: r.comparison.change_pct } : {}) });

  const filt = (r.query.filters ?? []).map((f) => `${f.dimension}${f.op === 'not_in' ? ' ≠ ' : f.op === 'contains' ? ' ~ ' : ' = '}${f.values.join(', ')}`);
  return {
    type,
    title: title ?? r.label,
    subtitle: `${r.period.from} → ${r.period.to}${filt.length ? ' · ' + filt.join(' · ') : ''}${r.comparison ? ` · vs ${r.comparison.period.from} → ${r.comparison.period.to}` : ''}`,
    x,
    y: ['valor'],
    series,
    unit: r.unit,
    data,
    provenance: {
      kind: 'metric',
      metric: r.metric,
      label: r.label,
      definition: r.description,
      table: r.table,
      period: r.period,
      filters: r.query.filters,
      group_by: r.query.group_by,
      grain: r.query.grain,
      sql: r.sql,
      params: r.params,
      cutoff: r.cutoff,
      notes: r.notes,
    },
  };
}
