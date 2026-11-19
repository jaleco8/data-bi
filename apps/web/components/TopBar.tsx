'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useApi, usePersona } from '@/lib/api';

const LINKS = [
  { href: '/', label: 'Chat' },
  { href: '/dashboards', label: 'Dashboards' },
  { href: '/catalogo', label: 'Catálogo de métricas' },
  { href: '/calidad', label: 'Calidad de datos' },
];

export function TopBar() {
  const path = usePathname();
  const { persona, setPersona } = usePersona();
  const personas = useApi<Array<{ user_key: string; label: string }>>('/personas');
  return (
    <header className="topbar">
      <Link href="/" className="brand">
        Mercadia <span>Data</span>
      </Link>
      <nav className="nav" aria-label="Principal">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href} aria-current={(l.href === '/' ? path === '/' : path.startsWith(l.href)) ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="spacer" />
      <label className="small muted">
        Perfil{' '}
        <select value={persona} onChange={(e) => setPersona(e.target.value)}>
          {(personas.data ?? [{ user_key: 'direccion', label: 'Dirección general' }]).map((p) => (
            <option key={p.user_key} value={p.user_key}>
              {p.label}
            </option>
          ))}
        </select>
      </label>
    </header>
  );
}
