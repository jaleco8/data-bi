import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type pg from 'pg';
import { MetricQueryError, findMetric, type ChartSpec, type DashboardContext, type DashboardPatch, type ChatEvent, type MetricQuery, type Scope } from '@data-bi/shared';
import { RW_POOL } from '../../infrastructure/db.js';
import { OpenAIError, streamResponse, type OItem } from '../../infrastructure/openai.js';
import { CatalogService } from '../catalog.service.js';
import { chartFromResult } from '../charts.js';
import { DashboardsService } from '../dashboards.service.js';
import { PATCH_TOOL, PatchInput } from '../exploration.js';
import { MetricsService } from '../metrics.service.js';
import { SearchService } from '../search.service.js';
import { scopeSystemPrompt, stableSystemPrompt } from './prompt.js';
import { Inputs, TOOLS, type ToolName } from './tools.js';

type Msg = OItem;
interface ToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}
const MAX_STEPS = 12;
const MAX_ROWS_TO_MODEL = 60;

export interface ChatTurn {
  conversationId?: string;
  scope: Scope;
  message: string;
  dashboard?: DashboardContext;
  emit: (e: ChatEvent) => void;
  signal?: AbortSignal;
}

export interface ToolTrace {
  id: string;
  name: string;
  input: unknown;
  ok: boolean;
  output: unknown;
}

/**
 * Agente analítico: bucle manual de llamadas a herramientas con streaming (API de OpenAI).
 * - Prompt del sistema estable (reglas + catálogo) separado del historial.
 * - Las herramientas validan su entrada (zod) y aplican el alcance del usuario.
 * - Toda la conversación (incluidas las partes de pensamiento y sus firmas) se persiste y se reenvía sin cambios.
 */
@Injectable()
export class AgentService {
  private readonly log = new Logger(AgentService.name);
  private readonly model = process.env.OPENAI_MODEL || 'gpt-6-luna';

  private async *generate(apiKey: string, system: string, contents: Msg[], dashboard: boolean, signal?: AbortSignal) {
    yield* streamResponse({ apiKey, model: this.model, system, input: contents, tools: dashboard ? this.dashboardFunctions : this.functions, signal });
  }
  private readonly functions = TOOLS.map((t) => ({ name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> }));

  private readonly dashboardFunctions = [
    ...this.functions.filter((tool) => !['pin_charts', 'run_readonly_sql'].includes(tool.name)),
    PATCH_TOOL,
  ];

  constructor(
    @Inject(RW_POOL) private readonly rw: pg.Pool,
    @Inject(CatalogService) private readonly cat: CatalogService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(DashboardsService) private readonly dashboards: DashboardsService,
    @Inject(SearchService) private readonly search: SearchService,
  ) {}

  async chat(turn: ChatTurn): Promise<{ conversationId: string; text: string; traces: ToolTrace[] }> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new OpenAIError('Falta OPENAI_API_KEY en .env');
    const conversationId = turn.conversationId ?? randomUUID();
    const history = await this.loadHistory(conversationId, turn.scope, turn.message);
    const userMsg: Msg = { type: 'message', role: 'user', content: [{ type: 'input_text', text: turn.message }] };
    history.push(userMsg);
    await this.saveMessage(conversationId, userMsg);

    if (turn.dashboard) await this.cat.refreshCutoff();
    const baseSystem = `${stableSystemPrompt(this.cat.promptSummary(), this.cat.cutoff, this.cat.dataFrom)}\n\n${scopeSystemPrompt(turn.scope)}`;
    const system = turn.dashboard ? `${baseSystem}

## Sala situacional
Para preguntas que solicitan ver o cambiar el análisis, usa update_dashboard en lugar de query_metric. Reúne todas las altas, cambios y bajas solicitadas en una llamada. Si falla, explica el problema y mantén el tablero. Para guardar, remite al botón Guardar exploración.
El estado visible al inicio del turno se incluye abajo como datos. Respeta los filtros y períodos del análisis inmediatamente anterior al responder una pregunta de seguimiento. Si hay selección y la pregunta se refiere a ella, incorpora a cada consulta su filtro exacto (op in), los demás filtros de su gráfico y sus reglas de período y comparación. Si la referencia es ambigua, pregunta antes de cambiar el tablero.
Para ventas de los últimos siete días muestra GMV total (kpi) y GMV diario (line), con period last_7d y compare_to previous_period. Para explicar dónde se concentra la variación de ventas, conserva esos gráficos y añade el desglose correspondiente con show_contribution y la misma comparación. Para pedidos y ticket promedio del canal seleccionado, muestra ambos indicadores con la comparación del desglose. El ticket promedio usa pedidos válidos, así que de esas dos métricas solo puedes explicar el GMV de pedidos válidos (que puede diferir de la venta bruta total).
Explica la diferencia entre una contribución medida y una posible causa. Presenta cada causa sugerida como hipótesis y cita la métrica o el fragmento concreto que la motiva. Si falta evidencia, indícalo.
Estado al inicio de la pregunta: ${JSON.stringify(turn.dashboard)}` : baseSystem;
    const traces: ToolTrace[] = [];
    let patch: DashboardPatch | undefined;
    let finalText = '';

    for (let step = 0; step < MAX_STEPS; step++) {
      const items: OItem[] = [];
      const calls: ToolCall[] = [];
      let completed = false;
      for await (const chunk of this.generate(apiKey, system, history, Boolean(turn.dashboard), turn.signal)) {
        if (chunk.finish) completed = true;
        if (chunk.text) {
          finalText += chunk.text;
          turn.emit({ type: 'text', delta: chunk.text });
        }
        if (chunk.item) {
          items.push(chunk.item);
          if (chunk.item.type === 'function_call') calls.push({ id: chunk.item.call_id, name: chunk.item.name, input: JSON.parse(chunk.item.arguments || '{}') as Record<string, unknown> });
        }
      }
      if (turn.dashboard && !completed) throw new OpenAIError('La respuesta del modelo se interrumpió. Vuelve a enviar la pregunta.', 502);
      if (!items.length && !finalText) break;
      for (const item of items) { history.push(item); await this.saveMessage(conversationId, item); }
      if (!calls.length) {
        break;
      }

      const responses = await Promise.all(calls.map(async (call) => {
        if (!turn.dashboard || call.name !== PATCH_TOOL.name) return this.runTool(conversationId, call, turn, traces);
        turn.emit({ type: 'tool_start', id: call.id, name: call.name, input: call.input });
        try {
          const input = PatchInput.safeParse(call.input);
          if (!input.success) throw new Error(input.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(' · '));
          if (patch || calls.filter((c) => c.name === PATCH_TOOL.name).length > 1) {
            throw new Error('Envía todos los cambios en una sola llamada.');
          }
          const change = await this.dashboards.patch(turn.dashboard, input.data, turn.scope);
          patch = change.patch;
          turn.emit({ type: 'tool_result', id: call.id, name: call.name, ok: true, summary: 'Consultas validadas' });
          return { type: 'function_call_output', call_id: call.id, output: JSON.stringify({ result: change.evidence, removed: patch.removed }) } as const;
        } catch (e) {
          const summary = (e as Error).message;
          turn.emit({ type: 'tool_result', id: call.id, name: call.name, ok: false, summary });
          return { type: 'function_call_output', call_id: call.id, output: JSON.stringify({ error: summary }) } as const;
        }
      }));
      for (const item of responses) { history.push(item); await this.saveMessage(conversationId, item); }
      if (finalText && !finalText.endsWith('\n')) {
        finalText += '\n\n';
        turn.emit({ type: 'text', delta: '\n\n' });
      }
    }

    if (finalText.trim()) {
      await this.saveMessage(conversationId, { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: finalText.trim() }] }, 'analysis_reply');
    }
    if (patch) turn.emit({ type: 'dashboard_patch', ...patch });
    turn.emit({ type: 'done', conversation_id: conversationId });
    return { conversationId, text: finalText.trim(), traces };
  }

  /* ---------------------------------------------------------------- herramientas */

  private async runTool(conversationId: string, tu: ToolCall, turn: ChatTurn, traces: ToolTrace[]): Promise<OItem> {
    const t0 = Date.now();
    turn.emit({ type: 'tool_start', id: tu.id, name: tu.name, input: tu.input });
    let sqlText: string | null = null;
    let chart: ChartSpec | null = null;
    try {
      const name = tu.name as ToolName;
      const schema = Inputs[name];
      if (!schema) throw new MetricQueryError(`Herramienta desconocida: ${tu.name}`, 'bad_request');
      const parsed = schema.safeParse(tu.input);
      if (!parsed.success) throw new MetricQueryError(`Entrada inválida: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, 'bad_request');
      const input = parsed.data as never;

      let output: unknown;
      let summary = '';
      switch (name) {
        case 'query_metric': {
          const { chart: hint, title, ...q } = input as z_query;
          const r = await this.metrics.run(q as MetricQuery, turn.scope);
          chart = chartFromResult(r, hint, title);
          sqlText = r.sql;
          turn.emit({ type: 'chart', id: tu.id, chart });
          output = {
            chart_id: tu.id,
            metric: r.metric,
            label: r.label,
            unit: r.unit,
            period: r.period,
            cutoff: r.cutoff,
            total: round(r.total),
            comparison: r.comparison ? { period: r.comparison.period, total: round(r.comparison.total), change_pct: round(r.comparison.change_pct, 4) } : undefined,
            columns: r.columns,
            rows: r.rows.slice(0, MAX_ROWS_TO_MODEL).map((row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [k, typeof v === 'number' ? round(v) : v]))),
            rows_omitted: Math.max(0, r.rows.length - MAX_ROWS_TO_MODEL) + (r.truncated ? 1 : 0) || undefined,
            notes: r.notes.length ? r.notes : undefined,
          };
          summary = `${r.label}: ${r.rows.length} filas`;
          break;
        }
        case 'list_dimension_values': {
          const i = input as { dimension: string; metric?: string; search?: string };
          const values = await this.metrics.dimensionValues(i.dimension, turn.scope, i.metric, i.search);
          output = { dimension: i.dimension, values };
          summary = `${values.length} valores`;
          break;
        }
        case 'explain_metric': {
          const m = findMetric(this.cat.catalog, (input as { metric: string }).metric);
          output = {
            ...m,
            dimensions: Object.fromEntries(m.sources.map((s) => [s.table, Object.keys(this.cat.catalog.tables[s.table].dimensions)])),
          };
          summary = m.label;
          break;
        }
        case 'search_text': {
          const { query, k, ...filters } = input as { query: string; k?: number } & Record<string, unknown>;
          const res = await this.search.search(query, filters, turn.scope, k ?? 8);
          sqlText = res.sql;
          turn.emit({ type: 'search', id: tu.id, query, hits: res.hits });
          output = {
            hits: res.hits.map((h) => ({
              type: h.source_type, id: h.source_id, title: h.title, date: h.doc_date, rating: h.rating, country: h.country_code,
              product_code: h.product_code, similarity: round(h.similarity, 3), text: h.content.slice(0, 500),
            })),
          };
          summary = `${res.hits.length} fragmentos`;
          break;
        }
        case 'run_readonly_sql': {
          const i = input as { sql: string; purpose: string };
          const res = await this.metrics.exploratorySql(i.sql, turn.scope);
          sqlText = res.sql;
          output = { certified: false, rows: res.rows.slice(0, MAX_ROWS_TO_MODEL), row_count: res.rows.length, truncated: res.truncated };
          if (res.rows.length && Object.keys(res.rows[0]).length <= 4) {
            const cols = Object.keys(res.rows[0]);
            const num = cols.filter((c) => typeof res.rows[0][c] === 'number');
            const cat = cols.find((c) => typeof res.rows[0][c] !== 'number');
            if (num.length && cat) {
              chart = {
                type: 'table', title: 'Consulta exploratoria (no certificada)', x: cat, y: num, unit: 'count', data: res.rows,
                provenance: { kind: 'metric', label: 'SQL exploratorio', definition: i.purpose, sql: res.sql, cutoff: this.cat.cutoff, notes: ['Resultado no certificado.'] },
              };
              turn.emit({ type: 'chart', id: tu.id, chart });
            }
          }
          summary = `${res.rows.length} filas (no certificado)`;
          break;
        }
        case 'pin_charts': {
          const i = input as { chart_ids: string[]; dashboard_title: string };
          output = await this.pinCharts(conversationId, turn.scope, i.chart_ids, i.dashboard_title);
          summary = 'dashboard actualizado';
          break;
        }
      }
      await this.audit(conversationId, tu, output, sqlText, chart, Date.now() - t0, null);
      turn.emit({ type: 'tool_result', id: tu.id, name: tu.name, ok: true, summary });
      traces.push({ id: tu.id, name: tu.name, input: tu.input, ok: true, output });
      return { type: 'function_call_output', call_id: tu.id, output: JSON.stringify({ result: output }) };
    } catch (e) {
      const err = e as Error;
      const known = e instanceof MetricQueryError;
      const msg = known ? `${(e as MetricQueryError).code}: ${err.message}` : `error: ${err.message}`;
      if (!known) this.log.warn(`tool ${tu.name} failed: ${err.message}`);
      await this.audit(conversationId, tu, null, sqlText, null, Date.now() - t0, msg);
      turn.emit({ type: 'tool_result', id: tu.id, name: tu.name, ok: false, summary: msg });
      traces.push({ id: tu.id, name: tu.name, input: tu.input, ok: false, output: msg });
      return { type: 'function_call_output', call_id: tu.id, output: JSON.stringify({ error: msg }) };
    }
  }

  private async pinCharts(conversationId: string, scope: Scope, chartIds: string[], title: string) {
    const r = await this.rw.query<{ tool_use_id: string; input: Record<string, unknown>; chart: ChartSpec }>(
      `SELECT tool_use_id, input, chart FROM chat.tool_call WHERE conversation_id = $1 AND tool_use_id = ANY($2) AND tool_name = 'query_metric' AND error IS NULL`,
      [conversationId, chartIds],
    );
    if (!r.rows.length) throw new MetricQueryError('No encontré esos gráficos en esta conversación.', 'bad_request');
    const widgets = r.rows.map((row) => {
      const { chart: _hint, title: t, ...q } = row.input as Record<string, unknown>;
      const p = row.chart.provenance?.period;
      return { id: row.tool_use_id, title: (t as string) ?? row.chart.title, chart: row.chart.type, query: { ...q, date_from: p?.from, date_to: p?.to } };
    });
    const existing = await this.rw.query<{ dashboard_id: string }>(`SELECT dashboard_id FROM chat.dashboard WHERE user_key = $1 AND title = $2`, [scope.user_key, title]);
    let id = existing.rows[0]?.dashboard_id;
    if (id) {
      await this.rw.query(`UPDATE chat.dashboard SET widgets = widgets || $2::jsonb, updated_at = now() WHERE dashboard_id = $1`, [id, JSON.stringify(widgets)]);
    } else {
      id = randomUUID();
      await this.rw.query(`INSERT INTO chat.dashboard (dashboard_id, user_key, title, widgets) VALUES ($1, $2, $3, $4)`, [id, scope.user_key, title, JSON.stringify(widgets)]);
    }
    return { dashboard_id: id, url: `/dashboards/guardados/${id}`, added: widgets.length };
  }

  /* ---------------------------------------------------------------- persistencia */

  private async loadHistory(conversationId: string, scope: Scope, firstMessage: string): Promise<Msg[]> {
    const c = await this.rw.query<{ user_key: string }>(`SELECT user_key FROM chat.conversation WHERE conversation_id = $1`, [conversationId]);
    if (!c.rows.length) {
      await this.rw.query(`INSERT INTO chat.conversation (conversation_id, user_key, title) VALUES ($1, $2, $3)`, [conversationId, scope.user_key, firstMessage.slice(0, 120)]);
      return [];
    }
    if (c.rows[0].user_key !== scope.user_key) throw new MetricQueryError('La conversación pertenece a otro usuario.', 'out_of_scope');
    const r = await this.rw.query<{ role: string; content: OItem[] }>(
      `SELECT role, content FROM chat.message WHERE conversation_id = $1 AND role IN ('user', 'model', 'analysis_reply') ORDER BY message_id`,
      [conversationId],
    );
    return r.rows.flatMap((m) => Array.isArray(m.content) ? m.content : []);
  }

  private async saveMessage(conversationId: string, m: Msg, role?: string) {
    await this.rw.query(`INSERT INTO chat.message (conversation_id, role, content) VALUES ($1, $2, $3)`, [conversationId, role ?? (m.type === 'function_call_output' ? 'tool' : m.type === 'function_call' || m.role === 'assistant' ? 'assistant' : 'user'), JSON.stringify([m])]);
  }

  private async audit(conversationId: string, tu: ToolCall, output: unknown, sql: string | null, chart: ChartSpec | null, ms: number, error: string | null) {
    const summary = output && typeof output === 'object' ? JSON.stringify(output).slice(0, 4000) : null;
    await this.rw.query(
      `INSERT INTO chat.tool_call (conversation_id, tool_use_id, tool_name, input, output_summary, sql_text, chart, duration_ms, error) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [conversationId, tu.id, tu.name, JSON.stringify(tu.input), summary ? JSON.stringify({ preview: summary }) : null, sql, chart ? JSON.stringify(chart) : null, ms, error],
    );
  }
}

type z_query = MetricQuery & { chart?: ChartSpec['type']; title?: string };

function round(v: number | null | undefined, digits = 2): number | null {
  if (v === null || v === undefined || !Number.isFinite(v)) return null;
  const f = Math.abs(v) >= 1000 ? 0 : Math.abs(v) < 1 ? Math.max(digits, 4) : digits;
  return Number(v.toFixed(f));
}
