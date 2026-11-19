'use client';
import type { ChartSpec } from '@data-bi/shared';

/** Panel "¿De dónde sale esta cifra?": definición, filtros, corte y SQL ejecutado. */
export function Provenance({ spec }: { spec: ChartSpec }) {
  const p = spec.provenance!;
  return (
    <details className="prov">
      <summary>¿De dónde sale esta cifra?</summary>
      <dl>
        {p.label && (
          <>
            <dt>Métrica</dt>
            <dd>
              {p.label} {p.metric && <code>({p.metric})</code>}
            </dd>
          </>
        )}
        {p.definition && (
          <>
            <dt>Definición</dt>
            <dd>{p.definition}</dd>
          </>
        )}
        {p.period && (
          <>
            <dt>Periodo</dt>
            <dd>
              {p.period.from} → {p.period.to}
            </dd>
          </>
        )}
        {!!p.group_by?.length && (
          <>
            <dt>Desglose</dt>
            <dd>{p.group_by.join(', ')}</dd>
          </>
        )}
        {!!p.filters?.length && (
          <>
            <dt>Filtros</dt>
            <dd>{p.filters.map((f) => `${f.dimension} ${f.op ?? 'in'} [${f.values.join(', ')}]`).join(' · ')}</dd>
          </>
        )}
        {p.table && (
          <>
            <dt>Tabla</dt>
            <dd>
              <code>{p.table}</code>
            </dd>
          </>
        )}
        {p.cutoff && (
          <>
            <dt>Fecha de corte</dt>
            <dd>{p.cutoff}</dd>
          </>
        )}
        {!!p.notes?.length && (
          <>
            <dt>Notas</dt>
            <dd>{p.notes.join(' ')}</dd>
          </>
        )}
      </dl>
      {p.sql && (
        <pre>
          {p.sql}
          {p.params?.length ? `\n-- parámetros: ${JSON.stringify(p.params)}` : ''}
        </pre>
      )}
    </details>
  );
}
