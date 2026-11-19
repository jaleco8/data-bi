import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type pg from 'pg';
import { loadCatalog, type MetricCatalog } from '@data-bi/shared/node';
import { RO_POOL } from '../infrastructure/db.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/** Catálogo de métricas certificadas + fecha de corte del dataset. */
@Injectable()
export class CatalogService implements OnModuleInit {
  catalog!: MetricCatalog;
  cutoff = '';
  dataFrom = '';

  constructor(@Inject(RO_POOL) private readonly ro: pg.Pool) {}

  async onModuleInit() {
    this.catalog = loadCatalog(path.join(ROOT, 'semantic/metrics.yaml'));
    await this.refreshCutoff();
  }

  async refreshCutoff() {
    const r = await this.ro.query<{ data_from: string; data_to: string }>(`SELECT data_from::text, data_to::text FROM mart.dataset_info`);
    this.cutoff = r.rows[0].data_to;
    this.dataFrom = r.rows[0].data_from;
  }

  /** Resumen compacto para el prompt del sistema (estable → cacheable). */
  promptSummary(): string {
    const lines: string[] = [];
    const byDomain = new Map<string, typeof this.catalog.metrics>();
    for (const m of this.catalog.metrics) byDomain.set(m.domain, [...(byDomain.get(m.domain) ?? []), m]);
    for (const [domain, metrics] of byDomain) {
      lines.push(`\n### ${domain}`);
      for (const m of metrics) {
        const dims = [...new Set(m.sources.flatMap((s) => Object.keys(this.catalog.tables[s.table].dimensions)))];
        lines.push(
          `- \`${m.key}\` — ${m.label} [${m.unit}${m.time === 'none' ? ', foto actual' : m.time === 'last' ? ', foto de cierre' : ''}]. ${m.description.trim().replace(/\s+/g, ' ')}` +
            (m.synonyms.length ? ` Sinónimos: ${m.synonyms.join(', ')}.` : '') +
            ` Dimensiones: ${dims.join(', ')}.` +
            (m.notes ? ` Nota: ${m.notes}` : ''),
        );
      }
    }
    lines.push('\n### Dimensiones');
    for (const [k, d] of Object.entries(this.catalog.dimensions)) lines.push(`- \`${k}\`: ${d.label}. ${d.description}`);
    return lines.join('\n');
  }
}
