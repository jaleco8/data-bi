import type { Scope } from '@data-bi/shared';

/** Perfiles de demo. En producción vendrían del IdP / tabla de permisos. */
export const PERSONAS: Record<string, Scope> = {
  direccion: { user_key: 'direccion', label: 'Dirección general (todos los países)', countries: null },
  gerente_mx: { user_key: 'gerente_mx', label: 'Gerencia México', countries: ['MX'] },
  gerente_co: { user_key: 'gerente_co', label: 'Gerencia Colombia', countries: ['CO'] },
  gerente_cono_sur: { user_key: 'gerente_cono_sur', label: 'Gerencia Cono Sur (CL, AR)', countries: ['CL', 'AR'] },
};

export function resolveScope(userKey?: string | null): Scope {
  return PERSONAS[userKey ?? ''] ?? PERSONAS.direccion;
}
