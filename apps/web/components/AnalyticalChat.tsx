'use client';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChartSpec, ChatEvent, DashboardContext, DashboardPatch, SearchHit } from '@data-bi/shared';
import { API, usePersona } from '@/lib/api';
import { Chart } from '@/components/Chart';

type Part =
  | { kind: 'text'; text: string }
  | { kind: 'chart'; id: string; chart: ChartSpec }
  | { kind: 'search'; id: string; query: string; hits: SearchHit[] };
interface Step {
  id: string;
  name: string;
  ok?: boolean;
  summary?: string;
}
interface Turn {
  user: string;
  parts: Part[];
  steps: Step[];
  error?: string;
  done: boolean;
}

const TOOL_LABEL: Record<string, string> = {
  update_dashboard: 'Preparando cambios del tablero',
  query_metric: 'Consultando métrica',
  list_dimension_values: 'Buscando valores',
  explain_metric: 'Leyendo definición',
  search_text: 'Búsqueda semántica',
  run_readonly_sql: 'SQL exploratorio',
  pin_charts: 'Guardando dashboard',
};

const SUGGESTIONS = [
  '¿Cuánto vendimos el mes pasado por país, comparado con el mismo mes del año anterior?',
  '¿Por qué cayó la conversión en octubre de 2026?',
  '¿Qué está pasando con las entregas de RutaExpress en Colombia?',
  '¿De qué se quejan los clientes de la Licuadora PowerMix 900?',
  '¿Qué campañas tuvieron peor ROAS el último trimestre?',
  '¿Cuántos pedidos tuvimos ayer?',
  '¿Qué dice la política sobre devoluciones de productos defectuosos?',
  'Muéstrame la evolución mensual de clientes frecuentes y la tasa de recompra por cohorte',
];

export function AnalyticalChat({ dashboard, onPatch, onBusy, disabled }: {
  dashboard?: DashboardContext;
  onPatch?: (patch: DashboardPatch) => void;
  onBusy?: (busy: boolean) => void;
  disabled?: boolean;
}) {
  const request = useRef<AbortController | null>(null);
  const { persona } = usePersona();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // cambiar de perfil inicia una conversación nueva (el alcance es por usuario)
    setTurns([]);
    setConversationId(undefined);
    return () => request.current?.abort();
  }, [persona]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const update = (fn: (t: Turn) => Turn) => setTurns((ts) => ts.length ? [...ts.slice(0, -1), fn(ts[ts.length - 1])] : ts);

  async function send(text: string) {
    if (!text.trim() || request.current || disabled) return;
    const controller = new AbortController();
    request.current = controller;
    let pendingPatch: DashboardPatch | undefined;
    let completed = false;
    let streamError = false;
    onBusy?.(true);
    setInput('');
    setBusy(true);
    setTurns((ts) => [...ts, { user: text, parts: [], steps: [], done: false }]);
    try {
      const res = await fetch(`${API}/api/chat`, {
        method: 'POST',
        signal: controller.signal,
        headers: { 'content-type': 'application/json', 'x-user-key': persona },
        body: JSON.stringify({ message: text, conversation_id: conversationId, dashboard }),
      });
      if (!res.ok || !res.body) throw new Error((await res.json().catch(() => ({}))).message ?? `HTTP ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const chunks = buf.split('\n\n');
        buf = chunks.pop() ?? '';
        for (const c of chunks) {
          const line = c.split('\n').find((l) => l.startsWith('data: '));
          if (!line || controller.signal.aborted) continue;
          const event = JSON.parse(line.slice(6)) as ChatEvent;
          if (event.type === 'dashboard_patch') pendingPatch = event;
          if (event.type === 'error') streamError = true;
          if (event.type === 'done') completed = true;
          handle(event);
        }
      }
      if (!completed && !streamError) throw new Error('La respuesta se interrumpió. Puedes volver a enviar la pregunta.');
      if (completed && !streamError && pendingPatch && !controller.signal.aborted) onPatch?.(pendingPatch);
    } catch (e) {
      if (!controller.signal.aborted) update((t) => ({ ...t, error: String((e as Error).message ?? e) }));
    } finally {
      request.current = null;
      if (!controller.signal.aborted) update((t) => ({ ...t, done: true }));
      setBusy(false);
      onBusy?.(false);
    }
  }

  function handle(e: ChatEvent) {
    switch (e.type) {
      case 'text':
        update((t) => {
          const parts = [...t.parts];
          const last = parts[parts.length - 1];
          if (last?.kind === 'text') parts[parts.length - 1] = { kind: 'text', text: last.text + e.delta };
          else parts.push({ kind: 'text', text: e.delta });
          return { ...t, parts };
        });
        break;
      case 'tool_start':
        update((t) => ({ ...t, steps: [...t.steps, { id: e.id, name: e.name }] }));
        break;
      case 'tool_result':
        update((t) => ({ ...t, steps: t.steps.map((s) => (s.id === e.id ? { ...s, ok: e.ok, summary: e.summary } : s)) }));
        break;
      case 'chart':
        update((t) => ({ ...t, parts: [...t.parts, { kind: 'chart', id: e.id, chart: e.chart }] }));
        break;
      case 'search':
        update((t) => ({ ...t, parts: [...t.parts, { kind: 'search', id: e.id, query: e.query, hits: e.hits }] }));
        break;
      case 'done':
        setConversationId(e.conversation_id);
        break;
      case 'error':
        update((t) => ({ ...t, error: e.message }));
        break;
    }
  }

  return (
    <div className={dashboard ? "chat dashboard-chat" : "chat"}>
      <div className="chat-scroll" ref={scrollRef} aria-live="polite">
        {turns.length === 0 && dashboard && (
          <div>
            <p className="muted">Pregunta por los indicadores o pide cambios en la vista.</p>
            <button type="button" className="ghost" disabled={disabled || busy}
              onClick={() => send('Muéstrame las ventas de los últimos siete días')}>
              Ventas de los últimos siete días
            </button>
          </div>
        )}
        {turns.length === 0 && !dashboard && (
          <div style={{ maxWidth: 760, margin: '6vh auto 0', textAlign: 'center' }}>
            <h1>Pregunta a los datos de Mercadia</h1>
            <p className="muted">
              Las cifras salen de métricas certificadas (las mismas de los dashboards) y cada gráfico muestra su definición, filtros y SQL. Para opiniones y políticas se usa búsqueda semántica sobre reseñas, tickets y documentos.
            </p>
            <div className="suggestions" style={{ justifyContent: 'center', marginTop: 20 }}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className="ghost" onClick={() => send(s)}>
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turns.map((t, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="msg-user">{t.user}</div>
            <div className="msg-bot">
              {t.steps.length > 0 && (
                <div className="tool-steps" aria-label="Pasos del agente">
                  {t.steps.map((s) => (
                    <span key={s.id} className={`tool-step ${s.ok === false ? 'err' : ''}`} title={s.summary}>
                      {s.ok === undefined ? '⏳' : s.ok ? '✓' : '✕'} {TOOL_LABEL[s.name] ?? s.name}
                      {s.summary ? ` · ${s.summary}` : ''}
                    </span>
                  ))}
                </div>
              )}
              {t.parts.map((p, j) =>
                p.kind === 'text' ? (
                  p.text.trim() && (
                    <div key={j} className="md">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.text}</ReactMarkdown>
                    </div>
                  )
                ) : p.kind === 'chart' ? (
                  <section key={j} className="card" aria-label={p.chart.title}>
                    <div className="card-head">
                      <span className="card-title">{p.chart.title}</span>
                      <span className="small muted">{p.chart.subtitle}</span>
                    </div>
                    <Chart spec={p.chart} />
                    <div className="small muted">id del gráfico: <code>{p.id}</code></div>
                  </section>
                ) : (
                  <details key={j} className="card">
                    <summary className="small">
                      🔎 {p.hits.length} fragmentos recuperados para «{p.query}»
                    </summary>
                    <div className="hits" style={{ marginTop: 8 }}>
                      {p.hits.map((h) => (
                        <div key={h.chunk_id} className="hit">
                          <div className="meta">
                            {h.source_type} · {h.source_id} · {h.doc_date ?? 's/f'}
                            {h.rating !== null ? ` · ${h.rating}★` : ''}
                            {h.country_code ? ` · ${h.country_code}` : ''} · similitud {h.similarity.toFixed(2)}
                          </div>
                          {h.title && <strong>{h.title}. </strong>}
                          {h.content.slice(0, 320)}
                        </div>
                      ))}
                    </div>
                  </details>
                ),
              )}
              {t.error && <div className="error-box">{t.error}</div>}
              {!t.done && !t.parts.length && !t.steps.length && <div className="muted small">Pensando…</div>}
            </div>
          </div>
        ))}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={dashboard ? "Pregunta sobre el tablero" : "Ej.: ¿Qué categorías crecieron más este trimestre vs el anterior?"}
          aria-label="Pregunta"
          rows={1}
          maxLength={4000}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send(input);
            }
          }}
        />
        <button className="primary" disabled={disabled || busy || !input.trim()}>
          {busy ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  );
}
