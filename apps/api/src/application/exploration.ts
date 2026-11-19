import { z } from 'zod';
import { PERIOD_LABEL, type ExplorationWidget } from '@data-bi/shared';
import { QueryMetricInput, TOOLS } from './agent/tools.js';

const Period = z.enum(Object.keys(PERIOD_LABEL) as [keyof typeof PERIOD_LABEL, ...(keyof typeof PERIOD_LABEL)[]]);
const Chart = QueryMetricInput.shape.chart.unwrap();
const DateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((date) => {
  const parsed = new Date(date);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}, 'Fecha inválida');
const Id = z.string().min(1).max(150);
const Query = QueryMetricInput.omit({ title: true, chart: true }).extend({
  date_from: DateString.optional(),
  date_to: DateString.optional(),
});
const widgetFields = {
  title: z.string().trim().min(1).max(160),
  chart: Chart,
  period: Period.optional(),
  query: Query,
  comparison_period: z.object({ date_from: DateString, date_to: DateString }).optional(),
  show_contribution: z.boolean().optional(),
};
const validPeriods = (w: Omit<ExplorationWidget, 'id'>) =>
  !(w.period && (w.query.date_from || w.query.date_to)) && !(w.comparison_period && w.query.compare_to);
const Widget = z.object({ ...widgetFields, id: Id, width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional() })
  .refine(validPeriods, 'Elige una sola regla para cada período');
const Widgets = z.array(Widget).max(60).refine((ws) => new Set(ws.map((w) => w.id)).size === ws.length, 'Los gráficos deben tener identificadores únicos');

export const DashboardContextInput = z.object({
  widgets: Widgets,
  selection: z.object({ dimension: Id, value: z.string().min(1).max(300), widget: Widget }).optional(),
});

export const SaveExplorationInput = DashboardContextInput.extend({ title: z.string().trim().min(1).max(120) });
export const PatchInput = z.object({
  remove: z.array(Id).max(60).optional(),
  upsert: z.array(z.object({ ...widgetFields, id: Id.optional() })
    .refine(validPeriods, 'Elige una sola regla para cada período')).max(20).optional(),
});

const metricTool = TOOLS.find((tool) => tool.name === 'query_metric')!;
const { chart, title, ...queryProperties } = metricTool.input_schema.properties as Record<string, unknown>;
export const PATCH_TOOL = {
  name: 'update_dashboard',
  description: 'Valida y aplica todos los cambios del tablero juntos. Devuelve las cifras certificadas de los gráficos agregados o modificados.',
  parameters: {
    type: 'object',
    properties: {
      remove: { type: 'array', items: { type: 'string' }, description: 'IDs de gráficos visibles a quitar.' },
      upsert: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', description: 'ID visible al reemplazar un gráfico. Omite para agregar.' },
            title,
            chart,
            query: { type: 'object', properties: queryProperties, required: ['metric'] },
            period: { type: 'string', enum: Object.keys(PERIOD_LABEL), description: 'Regla relativa al corte. Omite date_from y date_to en query si usas period.' },
            comparison_period: {
              type: 'object',
              properties: { date_from: { type: 'string' }, date_to: { type: 'string' } },
              required: ['date_from', 'date_to'],
              description: 'Comparación con fechas explícitas. Omite compare_to en query.',
            },
            show_contribution: { type: 'boolean', description: 'Muestra la diferencia y contribución de cada grupo para GMV o ingresos netos. Requiere comparación y un único group_by sin grain.' },
          },
          required: ['title', 'chart', 'query'],
        },
      },
    },
  },
};
