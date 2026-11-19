import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import pg from 'pg';
import { CASES, type EvalCase } from './cases.js';

/**
 * Evalúa el chat contra respuestas de referencia.
 *   pnpm eval                 → corre todo contra el API (requiere GEMINI_API_KEY en el API)
 *   pnpm eval -- --dry        → solo calcula y muestra los valores esperados (sin LLM)
 *   pnpm eval -- --only id1,id2
 */
const { values } = parseArgs({
  args: process.argv.slice(2).filter((a) => a !== '--'),
  options: { dry: { type: 'boolean', default: false }, only: { type: 'string' }, api: { type: 'string', default: process.env.EVAL_API ?? 'http://localhost:4000' } },
});

interface Trace { id: string; name: string; input: Record<string, unknown>; ok: boolean; output: unknown }
interface ChatResp { conversation_id: string; text: string; traces: Trace[]; charts: Array<{ chart: { data: Array<Record<string, unknown>>; provenance?: { filters?: Array<{ dimension: string; values: string[] }> } } }> }

const db = new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://databi:databi@localhost:5433/databi', max: 2 });
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(20, Number);

const cases = values.only ? CASES.filter((c) => values.only!.split(',').includes(c.id)) : CASES;
const results: Array<{ id: string; kind: string; pass: boolean; detail: string; expected?: number | null; seconds?: number; tools?: string[] }> = [];

for (const c of cases) {
  let expected: number | null = null;
  if (c.expected_sql) expected = Number((await db.query(c.expected_sql)).rows[0].v);
  if (values.dry) {
    console.log(`${c.id.padEnd(30)} ${c.kind.padEnd(8)} esperado=${expected ?? '—'}`);
    continue;
  }
  const t0 = Date.now();
  let resp: ChatResp;
  try {
    const r = await fetch(`${values.api}/api/chat/sync`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-user-key': c.persona ?? 'direccion' },
      body: JSON.stringify({ message: c.question }),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${await r.text()}`);
    resp = (await r.json()) as ChatResp;
  } catch (e) {
    results.push({ id: c.id, kind: c.kind, pass: false, detail: `error: ${(e as Error).message}`, expected });
    console.log(`✖ ${c.id}: ${(e as Error).message}`);
    continue;
  }
  const seconds = (Date.now() - t0) / 1000;
  const verdict = grade(c, resp, expected);
  results.push({ id: c.id, kind: c.kind, ...verdict, expected, seconds, tools: resp.traces.map((t) => `${t.name}${t.ok ? '' : '!'}`) });
  console.log(`${verdict.pass ? '✔' : '✖'} ${c.id.padEnd(30)} ${seconds.toFixed(1).padStart(5)} s  ${verdict.detail}`);
}

if (!values.dry) {
  const byKind = new Map<string, { n: number; ok: number }>();
  for (const r of results) {
    const k = byKind.get(r.kind) ?? { n: 0, ok: 0 };
    k.n++;
    if (r.pass) k.ok++;
    byKind.set(r.kind, k);
  }
  const total = results.filter((r) => r.pass).length;
  console.log(`\nResultado: ${total}/${results.length} (${((100 * total) / results.length).toFixed(0)} %)`);
  for (const [k, v] of byKind) console.log(`  ${k.padEnd(8)} ${v.ok}/${v.n}`);
  const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../reports');
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`Reporte: ${file}`);
}
await db.end();

/* ------------------------------------------------------------------ calificación */

function close(a: number, b: number, tol: EvalCase['tolerance']): boolean {
  if (tol?.abs !== undefined) return Math.abs(a - b) <= tol.abs;
  const rel = tol?.rel ?? 0.001;
  return Math.abs(a - b) <= Math.max(Math.abs(b) * rel, 0.5);
}

function numbersFrom(traces: Trace[]): number[] {
  const out: number[] = [];
  for (const t of traces) {
    if (t.name !== 'query_metric' || !t.ok) continue;
    const o = t.output as { total?: number | null; rows?: Array<Record<string, unknown>> };
    if (typeof o.total === 'number') out.push(o.total);
    for (const r of o.rows ?? []) if (typeof r.valor === 'number') out.push(r.valor);
  }
  return out;
}

function grade(c: EvalCase, r: ChatResp, expected: number | null): { pass: boolean; detail: string } {
  const used = new Set(r.traces.filter((t) => t.ok).map((t) => t.name));
  const metricCalls = r.traces.filter((t) => t.name === 'query_metric' && t.ok);
  switch (c.kind) {
    case 'number': {
      const nums = numbersFrom(r.traces);
      const hit = nums.find((n) => close(n, expected!, c.tolerance));
      return hit !== undefined
        ? { pass: true, detail: `esperado ${fmt(expected)} · obtenido ${fmt(hit)}` }
        : { pass: false, detail: `esperado ${fmt(expected)} · valores devueltos ${nums.slice(0, 5).map(fmt).join(', ') || 'ninguno'}` };
    }
    case 'clarify': {
      const asked = /\?/.test(r.text.slice(-400));
      return asked && metricCalls.length === 0
        ? { pass: true, detail: 'pidió aclaración sin calcular' }
        : { pass: false, detail: `${metricCalls.length} métricas calculadas; ${asked ? 'sí' : 'no'} preguntó` };
    }
    case 'scope': {
      const leaked = r.charts.some((ch) =>
        ch.chart.data.some((row) => Object.values(row).includes(c.forbidden_country!)) ||
        (ch.chart.provenance?.filters ?? []).some((f) => f.dimension === 'pais' && f.values.map((v) => v.toUpperCase()).includes(c.forbidden_country!)),
      ) || r.traces.some((t) => t.name === 'run_readonly_sql' && t.ok);
      return leaked ? { pass: false, detail: `se mostraron datos de ${c.forbidden_country}` } : { pass: true, detail: 'no se filtraron datos fuera de alcance' };
    }
    case 'search':
    case 'mixed': {
      const missing = (c.must_use ?? []).filter((t) => !used.has(t));
      if (missing.length) return { pass: false, detail: `no usó ${missing.join(', ')}` };
      if (c.hits_must_match) {
        const hits = r.traces
          .filter((t) => t.name === 'search_text' && t.ok)
          .flatMap((t) => (t.output as { hits: Array<Record<string, unknown>> }).hits)
          .filter((h) => c.hits_must_match!.pattern.test(String(h[c.hits_must_match!.field === 'source_type' ? 'type' : c.hits_must_match!.field === 'source_id' ? 'id' : 'product_code'] ?? '')));
        if (hits.length < c.hits_must_match.min) return { pass: false, detail: `solo ${hits.length} fragmentos pertinentes` };
      }
      if (c.text_must_match && !c.text_must_match.test(r.text)) return { pass: false, detail: `la respuesta no menciona ${c.text_must_match}` };
      return { pass: true, detail: `herramientas: ${[...used].join(', ')}` };
    }
  }
}

function fmt(n: number | null | undefined): string {
  return n === null || n === undefined ? '—' : Number(n).toLocaleString('es', { maximumFractionDigits: 4 });
}
