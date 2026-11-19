'use client';
import { useApi } from '@/lib/api';

type Q = {
  run: { run_id: number; started_at: string; finished_at: string; status: string; rows_out: number } | null;
  checks: Array<{ name: string; description: string; expected: number; actual: number; tolerance: number; passed: boolean }>;
  vectors: Array<{ source_type: string; n: number; embedded: number }>;
};

const n = (v: number) => Number(v).toLocaleString('es', { maximumFractionDigits: 2 });

export default function QualityPage() {
  const { data, error } = useApi<Q>('/quality');
  if (error) return <main><div className="error-box">{error}</div></main>;
  if (!data) return <main><div className="skeleton" /></main>;
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Calidad e integración de datos</h1>
          <div className="muted">Controles de conciliación entre fuentes que corren en cada carga. Si uno falla, la carga queda marcada y no se publica como válida.</div>
        </div>
        {data.run && (
          <div className="small muted" style={{ textAlign: 'right' }}>
            Última carga #{data.run.run_id}: <span className={`badge ${data.run.status === 'ok' ? 'ok' : 'fail'}`}>{data.run.status}</span>
            <br />
            {new Date(data.run.finished_at).toLocaleString('es')} · {n(data.run.rows_out)} filas en core+mart
          </div>
        )}
      </div>
      <section className="card" style={{ marginBottom: 18 }}>
        <h2 style={{ marginBottom: 10 }}>Conciliaciones</h2>
        <div className="table-wrap" style={{ maxHeight: 'none' }}>
          <table>
            <thead>
              <tr><th scope="col">Estado</th><th scope="col">Control</th><th scope="col" className="num">Esperado</th><th scope="col" className="num">Real</th><th scope="col" className="num">Tolerancia</th></tr>
            </thead>
            <tbody>
              {data.checks.map((c) => (
                <tr key={c.name}>
                  <td><span className={`badge ${c.passed ? 'ok' : 'fail'}`}>{c.passed ? '✓ cuadra' : '✕ no cuadra'}</span></td>
                  <td style={{ whiteSpace: 'normal' }}><strong>{c.name}</strong><br /><span className="small muted">{c.description}</span></td>
                  <td className="num">{n(c.expected)}</td>
                  <td className="num">{n(c.actual)}</td>
                  <td className="num">{n(c.tolerance)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <h2 style={{ marginBottom: 10 }}>Texto vectorizado (pgvector)</h2>
        <table>
          <thead><tr><th scope="col">Fuente</th><th scope="col" className="num">Fragmentos</th><th scope="col" className="num">Con embedding</th></tr></thead>
          <tbody>
            {data.vectors.map((v) => (
              <tr key={v.source_type}><td>{v.source_type}</td><td className="num">{n(v.n)}</td><td className="num">{n(v.embedded)} ({Math.round((100 * v.embedded) / v.n)} %)</td></tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}
