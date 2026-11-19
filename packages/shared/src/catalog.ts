import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import type { MetricCatalog } from './types.js';

/** Carga y valida estructuralmente semantic/metrics.yaml. */
export function loadCatalog(path: string): MetricCatalog {
  const cat = YAML.parse(readFileSync(path, 'utf8')) as MetricCatalog;
  const errors: string[] = [];
  const keys = new Set<string>();
  for (const m of cat.metrics) {
    if (keys.has(m.key)) errors.push(`Métrica duplicada: ${m.key}`);
    keys.add(m.key);
    if (!m.sources?.length) errors.push(`${m.key}: sin sources`);
    for (const s of m.sources ?? []) {
      if (!cat.tables[s.table]) errors.push(`${m.key}: tabla no declarada ${s.table}`);
      if (/;|--|\/\*/.test(s.expression + (s.base_filter ?? ''))) errors.push(`${m.key}: expresión con caracteres no permitidos`);
    }
    if (!['sum', 'last', 'none'].includes(m.time)) errors.push(`${m.key}: time inválido`);
  }
  for (const [t, def] of Object.entries(cat.tables)) {
    for (const d of Object.keys(def.dimensions)) if (!cat.dimensions[d]) errors.push(`${t}: dimensión sin documentar ${d}`);
    if (!/^mart\.[a-z_]+$/.test(t)) errors.push(`${t}: solo se permiten tablas del esquema mart`);
  }
  if (errors.length) throw new Error('Catálogo inválido:\n  ' + errors.join('\n  '));
  return cat;
}
