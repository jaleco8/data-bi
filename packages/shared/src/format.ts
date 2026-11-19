import type { Unit } from './types.js';

export function formatValue(v: number | null | undefined, unit: Unit, compact = false): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const nf = (opts: Intl.NumberFormatOptions) => new Intl.NumberFormat('es-CL', opts).format(v);
  switch (unit) {
    case 'usd':
      return compact && Math.abs(v) >= 1_000 ? `US$ ${nf({ notation: 'compact', maximumFractionDigits: 1 })}` : `US$ ${nf({ maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 })}`;
    case 'pct':
      return `${new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(v * 100)} %`;
    case 'count':
      return compact && Math.abs(v) >= 10_000 ? nf({ notation: 'compact', maximumFractionDigits: 1 }) : nf({ maximumFractionDigits: 0 });
    case 'days':
      return `${nf({ maximumFractionDigits: 1 })} días`;
    case 'hours':
      return `${nf({ maximumFractionDigits: 1 })} h`;
    case 'ratio':
      return `${nf({ maximumFractionDigits: 2 })}x`;
    case 'score':
      return nf({ maximumFractionDigits: 2 });
  }
}
