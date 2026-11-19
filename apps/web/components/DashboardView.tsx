'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import type { DashboardContext, DashboardPatch, RenderedWidget } from '@data-bi/shared';
import { API, useApi, usePersona } from '@/lib/api';
import { AnalyticalChat } from './AnalyticalChat';
import { Chart } from './Chart';

interface Rendered {
  title: string;
  description: string;
  cutoff: string;
  scope: string;
  widgets: RenderedWidget[];
  selection?: DashboardContext['selection'];
}

export function DashboardView({ path }: { path: string }) {
  const { persona } = usePersona();
  return <DashboardLoader key={JSON.stringify([path, persona])} path={path} />;
}

function DashboardLoader({ path }: { path: string }) {
  const { data, error, loading } = useApi<Rendered>(path);
  if (loading) return <main><div className="skeleton" /></main>;
  if (error || !data) return <main><div className="error-box">{error}</div></main>;
  return <DashboardRoom initial={data} />;
}

function DashboardRoom({ initial }: { initial: Rendered }) {
  const { persona } = usePersona();
  const [widgets, setWidgets] = useState(initial.widgets);
  const [cutoff, setCutoff] = useState(initial.cutoff);
  const [selection, setSelection] = useState(initial.selection);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [title, setTitle] = useState('');
  const [saved, setSaved] = useState<{ url: string; title: string }>();
  const [error, setError] = useState('');
  const disabled = busy || saving;

  function applyPatch(patch: DashboardPatch) {
    setWidgets((previous) => {
      const next = new Map(previous.map((w) => [w.id, w]));
      for (const id of patch.removed) next.delete(id);
      for (const widget of patch.widgets) next.set(widget.id, widget);
      return [...next.values()];
    });
    setSelection((current) => {
      if (!current) return current;
      const replacement = patch.widgets.find((widget) => widget.id === current.widget.id);
      if (!replacement) return current;
      return replacement.chart?.data.some((row) => row[current.dimension] === current.value)
        ? { ...current, widget: replacement.definition }
        : undefined;
    });
    setCutoff(patch.cutoff);
    setSaved(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || !title.trim()) return;
    setSaving(true);
    setError('');
    setSaved(undefined);
    try {
      const response = await fetch(`${API}/api/dashboards/saved`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-user-key': persona },
        body: JSON.stringify({ title: title.trim(), widgets: widgets.map((w) => w.definition), selection }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message ?? 'No se pudo guardar la exploración.');
      setSaved({ url: result.url, title: title.trim() });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="situation-room">
      <header className="page-head">
        <div>
          <h1>{initial.title}</h1>
          <p className="muted">{initial.description}</p>
        </div>
        <p className="small muted">Datos al <strong>{cutoff}</strong> · {initial.scope}</p>
        <a className="room-chat-jump small" href="#room-chat">Ir al chat</a>
      </header>
      <div className="room-layout">
        <div className="room-board">
          <form className="room-toolbar" onSubmit={save}>
            <input aria-label="Nombre de la exploración" placeholder="Nombre de la exploración"
              maxLength={120} required value={title} onChange={(event) => setTitle(event.target.value)} />
            <button className="primary" disabled={disabled || !title.trim()}>
              {saving ? 'Guardando…' : 'Guardar exploración'}
            </button>
          </form>
          {saved && <p role="status"><Link href={saved.url}>Abrir «{saved.title}»</Link></p>}
          {error && <p role="alert" className="error-box">{error}</p>}
          <div className="grid">
            {widgets.map((widget) => {
              const { chart, definition } = widget;
              const dimension = definition.query.group_by?.[0];
              const values = dimension && definition.query.group_by?.length === 1
                ? [...new Set(chart?.data.flatMap((row) => typeof row[dimension] === 'string' ? [row[dimension]] : []))]
                : [];
              return (
                <section key={widget.id} className={`card ${chart?.type === 'kpi' ? 'w-kpi' : `w-${widget.width}`}`} aria-label={widget.title}>
                  <div className="card-head">
                    <span className="card-title">{widget.title}</span>
                    <button type="button" className="ghost small" aria-label={`Quitar ${widget.title}`} disabled={disabled}
                      onClick={() => {
                        setWidgets((previous) => previous.filter((w) => w.id !== widget.id));
                        setSaved(undefined);
                      }}>Quitar</button>
                  </div>
                  {widget.error && <div className="error-box small">{widget.error}</div>}
                  {chart && (
                    <>
                      <p className="room-period small muted">{chart.subtitle ?? widget.period_label}</p>
                      <Chart key={chart.type} spec={chart} showProvenance={chart.type !== 'kpi'} />
                      {widget.comparison_chart && (
                        <details className="room-period">
                          <summary className="small">Ver período de comparación</summary>
                          <p className="small muted">{widget.comparison_chart.subtitle}</p>
                          <Chart key={widget.comparison_chart.type} spec={widget.comparison_chart} showProvenance={false} />
                        </details>
                      )}
                      {definition.show_contribution && <p className="small muted">La tabla muestra los importes y el porcentaje de la variación neta de cada grupo.</p>}
                      {dimension && values.length > 0 && (
                        <label className="room-selection small">
                          <span>Explorar {dimension.replace(/_/g, ' ')}</span>
                          <select disabled={disabled} value={selection?.widget.id === widget.id && values.includes(selection.value) ? selection.value : ''}
                            onChange={(event) => setSelection(event.target.value ? { dimension, value: event.target.value, widget: definition } : undefined)}>
                            <option value="">Elegir valor</option>
                            {values.map((value) => <option key={value} value={value}>{value}</option>)}
                          </select>
                        </label>
                      )}
                    </>
                  )}
                </section>
              );
            })}
          </div>
          {!widgets.length && <p className="muted">Pide un indicador en el chat para añadirlo al tablero.</p>}
        </div>
        <aside className="card room-conversation" aria-labelledby="room-chat">
          <h2 id="room-chat">Chat del tablero</h2>
          {selection && (
            <div className="room-toolbar small">
              <span>{selection.dimension.replace(/_/g, ' ')} · <strong>{selection.value}</strong></span>
              <button type="button" className="ghost" disabled={disabled} onClick={() => setSelection(undefined)}>Limpiar selección</button>
            </div>
          )}
          <AnalyticalChat dashboard={{ widgets: widgets.map((w) => w.definition), selection }}
            onPatch={applyPatch} onBusy={setBusy} disabled={saving} />
        </aside>
      </div>
    </main>
  );
}
