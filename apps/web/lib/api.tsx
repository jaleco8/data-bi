'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const PersonaCtx = createContext<{ persona: string; setPersona: (p: string) => void }>({ persona: 'direccion', setPersona: () => {} });

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [persona, setPersonaState] = useState('direccion');
  useEffect(() => {
    try {
      const p = localStorage.getItem('persona');
      if (p) setPersonaState(p);
    } catch {}
  }, []);
  const setPersona = (p: string) => {
    setPersonaState(p);
    try {
      localStorage.setItem('persona', p);
    } catch {}
  };
  return <PersonaCtx.Provider value={{ persona, setPersona }}>{children}</PersonaCtx.Provider>;
}

export const usePersona = () => useContext(PersonaCtx);

export async function apiGet<T>(path: string, persona: string): Promise<T> {
  const r = await fetch(`${API}/api${path}`, { headers: { 'x-user-key': persona }, cache: 'no-store' });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
  return r.json();
}

/** Hook simple de carga con estado. */
export function useApi<T>(path: string | null) {
  const { persona } = usePersona();
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true });
  useEffect(() => {
    if (!path) return;
    let alive = true;
    setState({ loading: true });
    apiGet<T>(path, persona)
      .then((data) => alive && setState({ data, loading: false }))
      .catch((e) => alive && setState({ error: String(e.message ?? e), loading: false }));
    return () => {
      alive = false;
    };
  }, [path, persona]);
  return state;
}
