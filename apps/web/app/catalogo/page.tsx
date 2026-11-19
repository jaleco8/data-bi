'use client';
import { useState } from 'react';
import type { MetricDef } from '@data-bi/shared';
import { useApi } from '@/lib/api';

type Cat = { version: number; cutoff: string; data_from: string; metrics: Array<MetricDef & { dimensions: string[] }>; dimensions: Record<string, { label: string; description: string }> };

const UNIT: Record<string, string> = { usd: 'USD', count: 'conteo', pct: '%', days: 'días', hours: 'horas', score: 'puntaje', ratio: 'razón' };

export default function CatalogPage() {
  const { data, error } = useApi<Cat>('/catalog');
  const [q, setQ] = useState('');
  if (error) return <main><div className="error-box">{error}</div></main>;
  if (!data) return <main><div className="skeleton" /></main>;
  const ql = q.toLowerCase();
  const metrics = data.metrics.filter((m) => !q || [m.key, m.label, m.description, ...m.synonyms].join(' ').toLowerCase().includes(ql));
  const domains = [...new Set(metrics.map((m) => m.domain))];
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Catálogo de métricas certificadas</h1>
          <div className="muted">
            Versión {data.version} · {data.metrics.length} métricas · datos {data.data_from} → {data.cutoff}. Fuente: <code>semantic/metrics.yaml</code>
          </div>
        </div>
        <input type="search" placeholder="Buscar métrica o sinónimo…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar métrica"
          style={{ padding: '8px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', minWidth: 260 }} />
      </div>
      {domains.map((d) => (
        <section key={d} style={{ marginBottom: 24 }}>
          <h2 style={{ textTransform: 'capitalize', marginBottom: 10 }}>{d}</h2>
          <div className="list-cards">
            {metrics.filter((m) => m.domain === d).map((m) => (
              <article key={m.key} className="card">
                <div className="card-head">
                  <strong>{m.label}</strong>
                  <span className="badge">{UNIT[m.unit]}</span>
                </div>
                <code className="small">{m.key}</code>
                <p className="small" style={{ margin: '6px 0' }}>{m.description}</p>
                {m.notes && <p className="small muted" style={{ margin: '0 0 6px' }}>Nota: {m.notes}</p>}
                <details className="prov">
                  <summary>Definición técnica</summary>
                  <dl>
                    <dt>Responsable</dt><dd>{m.owner}</dd>
                    <dt>Actualización</dt><dd>{m.refresh}</dd>
                    <dt>Temporalidad</dt><dd>{m.time === 'sum' ? 'acumulada en el periodo' : m.time === 'last' ? 'foto de cierre' : 'foto actual'}</dd>
                    <dt>Sinónimos</dt><dd>{m.synonyms.join(', ') || '—'}</dd>
                    <dt>Dimensiones</dt><dd>{m.dimensions.join(', ')}</dd>
                  </dl>
                  {m.sources.map((s) => (
                    <pre key={s.table}>{`${s.table}\n${s.expression}${s.base_filter ? `\nWHERE ${s.base_filter}` : ''}`}</pre>
                  ))}
                </details>
              </article>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
