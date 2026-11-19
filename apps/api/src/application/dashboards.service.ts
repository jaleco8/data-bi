import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import {
  MetricQueryError, OFFICIAL_DASHBOARDS, PERIOD_LABEL, resolveRelativePeriod,
  type DashboardContext, type ExplorationWidget, type MetricResult, type RenderedWidget, type Scope,
} from '@data-bi/shared';
import type { z } from 'zod';
import { RW_POOL } from '../infrastructure/db.js';
import { CatalogService } from './catalog.service.js';
import { chartFromResult } from './charts.js';
import type { PatchInput, SaveExplorationInput } from './exploration.js';
import { MetricsService } from './metrics.service.js';

@Injectable()
export class DashboardsService {
  constructor(
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(CatalogService) private readonly cat: CatalogService,
    @Inject(RW_POOL) private readonly rw: pg.Pool,
  ) {}

  list() {
    return OFFICIAL_DASHBOARDS.map(({ slug, title, description, widgets }) => ({ slug, title, description, widgets: widgets.length }));
  }

  async renderOfficial(slug: string, scope: Scope) {
    const board = OFFICIAL_DASHBOARDS.find((x) => x.slug === slug);
    if (!board) throw new NotFoundException(`Dashboard ${slug} no existe`);
    await this.cat.refreshCutoff();
    const widgets = await Promise.all(board.widgets.map((w) => this.renderExisting(w, scope)));
    return { ...board, cutoff: this.cat.cutoff, scope: scope.label, widgets };
  }

  async listSaved(scope: Scope) {
    const r = await this.rw.query(`SELECT dashboard_id, title, jsonb_array_length(widgets) AS widgets, updated_at FROM chat.dashboard WHERE user_key = $1 ORDER BY updated_at DESC`, [scope.user_key]);
    return r.rows;
  }

  async renderSaved(id: string, scope: Scope) {
    const r = await this.rw.query<{ title: string; widgets: ExplorationWidget[]; selection: DashboardContext['selection'] | null }>(
      `SELECT title, widgets, selection FROM chat.dashboard WHERE dashboard_id = $1 AND user_key = $2`,
      [id, scope.user_key],
    );
    if (!r.rows.length) throw new NotFoundException('Dashboard no encontrado');
    await this.cat.refreshCutoff();
    const { title, widgets, selection } = r.rows[0];
    const rendered = await Promise.all(widgets.map((w, i) => this.renderExisting({ ...w, id: widgets.some((other, j) => j !== i && other.id === w.id) ? `${w.id}-${i}` : w.id }, scope)));
    return { slug: id, title, description: 'Exploración guardada.', cutoff: this.cat.cutoff, scope: scope.label, widgets: rendered, selection: selection ?? undefined };
  }

  async save({ title, widgets, selection }: z.infer<typeof SaveExplorationInput>, scope: Scope) {
    await this.cat.refreshCutoff();
    await Promise.all(widgets.map((w) => this.renderWidget(w, scope)));
    const id = randomUUID();
    await this.rw.query(
      `INSERT INTO chat.dashboard (dashboard_id, user_key, title, widgets, selection) VALUES ($1, $2, $3, $4, $5)`,
      [id, scope.user_key, title, JSON.stringify(widgets), selection ? JSON.stringify(selection) : null],
    );
    return { dashboard_id: id, url: `/dashboards/guardados/${id}` };
  }

  async patch(context: DashboardContext, { remove = [], upsert = [] }: z.infer<typeof PatchInput>, scope: Scope) {
    const current = new Map(context.widgets.map((w) => [w.id, w]));
    const targets = [...remove, ...upsert.flatMap((w) => w.id ? [w.id] : [])];
    if (new Set(targets).size !== targets.length || targets.some((id) => !current.has(id))) {
      throw new MetricQueryError('Indica un ID visible y una sola acción por gráfico.', 'bad_request');
    }
    const count = current.size - remove.length + upsert.filter((w) => !w.id).length;
    if (count > 60 || (!remove.length && !upsert.length)) {
      throw new MetricQueryError('Envía al menos un cambio y conserva como máximo 60 gráficos.', 'bad_request');
    }
    const results = await Promise.all(upsert.map(async (w) => {
      const definition = { ...w, id: w.id ?? randomUUID(), width: w.id ? current.get(w.id)?.width : undefined };
      try {
        return await this.renderWidget(definition, scope);
      } catch (e) {
        if (!(e instanceof MetricQueryError)) throw e;
        throw new MetricQueryError(`${w.title}: ${e.message}`, e.code);
      }
    }));
    return {
      patch: { removed: remove, widgets: results.map(({ widget }) => widget), cutoff: this.cat.cutoff },
      evidence: results.map(({ widget, result }) => ({
        id: widget.id, title: widget.title, period: result.period, total: result.total, unit: result.unit,
        comparison: result.comparison && { period: result.comparison.period, total: result.comparison.total, change_pct: result.comparison.change_pct },
        rows: widget.chart?.data.slice(0, 60), truncated: result.truncated || (widget.chart?.data.length ?? 0) > 60,
        notes: result.notes,
      })),
    };
  }

  private async renderExisting(definition: ExplorationWidget, scope: Scope): Promise<RenderedWidget> {
    try {
      return (await this.renderWidget(definition, scope)).widget;
    } catch (e) {
      return { id: definition.id, title: definition.title, width: definition.width ?? 1, period_label: '', definition, error: (e as Error).message };
    }
  }

  private async renderWidget(definition: ExplorationWidget, scope: Scope) {
    const { id, title, period, comparison_period, show_contribution } = definition;
    const query = period
      ? { ...definition.query, ...resolveRelativePeriod(period, this.cat.cutoff, this.cat.dataFrom) }
      : definition.query;
    const result = await this.metrics.run(show_contribution ? { ...query, limit: 1000 } : query, scope, comparison_period);
    const chart = chartFromResult(result, definition.chart, title);
    if (show_contribution) {
      chart.data = contributionRows(result);
      chart.type = chart.data.length <= 12 ? 'horizontal_bar' : 'table';
      chart.y = ['valor'];
    }
    const effectiveDefinition = period ? definition : {
      ...definition,
      query: { ...definition.query, date_from: result.period.from, date_to: result.period.to },
    };
    const comparisonChart = result.comparison && chart.type !== 'kpi' && !show_contribution
      ? chartFromResult({
          ...result,
          rows: result.comparison.rows.slice(0, query.limit ?? (query.grain ? 500 : 25)),
          period: result.comparison.period,
          total: result.comparison.total,
          sql: result.comparison.sql,
          params: result.comparison.params,
          comparison: undefined,
        }, definition.chart, `${title} · período de comparación`)
      : undefined;
    const widget: RenderedWidget = {
      id, title, width: definition.width ?? (chart.type === 'kpi' ? 1 : 2), definition: effectiveDefinition, chart, comparison_chart: comparisonChart,
      period_label: period ? PERIOD_LABEL[period] : `${result.period.from} → ${result.period.to}`,
    };
    return { widget, result };
  }
}

function contributionRows(result: MetricResult) {
  const { comparison, query, metric } = result;
  const dimension = query.group_by?.[0];
  if (!['gmv', 'ingresos_netos'].includes(metric) || !dimension || query.group_by?.length !== 1 || query.grain || !comparison) {
    throw new MetricQueryError('La contribución requiere GMV o ingresos netos por una dimensión y dos períodos con datos.', 'bad_request');
  }
  if (result.truncated || comparison.rows.length > 1000) {
    throw new MetricQueryError('Hay demasiados grupos para calcular la contribución completa. Usa un desglose con menos valores.', 'bad_request');
  }
  const current = new Map(result.rows.map((r) => [r[dimension], Number(r.valor)]));
  const previous = new Map(comparison.rows.map((r) => [r[dimension], Number(r.valor)]));
  const totalDelta = (result.total ?? 0) - (comparison.total ?? 0);
  return [...new Set([...current.keys(), ...previous.keys()])].map((key) => {
    const now = current.get(key) ?? 0;
    const before = previous.get(key) ?? 0;
    const delta = now - before;
    return { [dimension]: key, actual: now, anterior: before, valor: delta, contribucion: totalDelta ? delta / totalDelta : null };
  }).sort((a, b) => totalDelta > 0 ? b.valor - a.valor : a.valor - b.valor);
}
