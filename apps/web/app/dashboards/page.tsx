'use client';
import Link from 'next/link';
import { useApi } from '@/lib/api';

export default function DashboardsPage() {
  const official = useApi<{ official: Array<{ slug: string; title: string; description: string; widgets: number }> }>('/dashboards');
  const saved = useApi<Array<{ dashboard_id: string; title: string; widgets: number; updated_at: string }>>('/dashboards/saved');
  return (
    <main>
      <div className="page-head">
        <div>
          <h1>Dashboards</h1>
          <div className="muted">Vistas oficiales construidas con las mismas métricas certificadas que usa el chat.</div>
        </div>
      </div>
      <div className="list-cards">
        {official.data?.official.map((d) => (
          <Link key={d.slug} href={`/dashboards/${d.slug}`} className="card">
            <h2>{d.title}</h2>
            <p className="muted small">{d.description}</p>
            <span className="badge">{d.widgets} indicadores</span>
          </Link>
        ))}
      </div>
      <h2 style={{ margin: '28px 0 12px' }}>Exploraciones guardadas</h2>
      {saved.data?.length ? (
        <div className="list-cards">
          {saved.data.map((d) => (
            <Link key={d.dashboard_id} href={`/dashboards/guardados/${d.dashboard_id}`} className="card">
              <h2>{d.title}</h2>
              <span className="badge">{d.widgets} gráficos</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="muted">Aún no hay dashboards guardados. Abre un dashboard y usa «Guardar exploración».</p>
      )}
    </main>
  );
}
