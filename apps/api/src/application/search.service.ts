import { Inject, Injectable } from '@nestjs/common';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import path from 'node:path';
import type pg from 'pg';
import type { Scope, SearchHit } from '@data-bi/shared';
import { RO_POOL } from '../infrastructure/db.js';
import { ROOT } from './catalog.service.js';

export interface SearchFilters {
  source_types?: string[];
  product_code?: string;
  category_l1?: string;
  country?: string;
  rating_min?: number;
  rating_max?: number;
  date_from?: string;
  date_to?: string;
}

env.cacheDir = path.join(ROOT, '.cache/models');

/** Búsqueda semántica en vec.chunk (pgvector, coseno) con filtros por metadatos. */
@Injectable()
export class SearchService {
  private extractor: Promise<FeatureExtractionPipeline> | null = null;

  constructor(@Inject(RO_POOL) private readonly ro: pg.Pool) {}

  private async embed(text: string): Promise<string> {
    // (cast a unknown: el tipo de unión de pipeline() es demasiado complejo para tsc)
    this.extractor ??= (pipeline as unknown as (t: string, m: string, o: object) => Promise<FeatureExtractionPipeline>)('feature-extraction', 'Xenova/multilingual-e5-small', { dtype: 'q8' });
    const ex = await this.extractor;
    const out = await ex([`query: ${text}`], { pooling: 'mean', normalize: true });
    return '[' + (out.tolist() as number[][])[0].map((x) => x.toFixed(6)).join(',') + ']';
  }

  async search(query: string, f: SearchFilters, scope: Scope, k = 8): Promise<{ hits: SearchHit[]; sql: string; params: unknown[] }> {
    const vec = await this.embed(query);
    const params: unknown[] = [vec];
    const where: string[] = ['embedding IS NOT NULL'];
    const add = (cond: (n: string) => string, v: unknown) => {
      params.push(v);
      where.push(cond(`$${params.length}`));
    };
    if (f.source_types?.length) add((p) => `source_type = ANY(${p}::text[])`, f.source_types);
    if (f.product_code) {
      // acepta el código (P-000123) o el nombre del producto: el modelo a veces pasa el nombre
      let codes = [f.product_code.trim()];
      if (!/^P-[A-Z0-9-]+$/i.test(codes[0])) {
        const r = await this.ro.query<{ product_code: string }>(
          `SELECT product_code FROM mart.products WHERE product_name ILIKE $1 ORDER BY similarity(product_name, $2) DESC LIMIT 5`,
          [`%${codes[0]}%`, codes[0]],
        );
        if (r.rows.length) codes = r.rows.map((x) => x.product_code);
      }
      add((p) => `product_code = ANY(${p}::text[])`, codes);
    }
    if (f.category_l1) add((p) => `category_l1 = ${p}`, f.category_l1);
    if (f.country) add((p) => `country_code = ${p}`, f.country.toUpperCase());
    if (f.rating_min !== undefined) add((p) => `rating >= ${p}`, f.rating_min);
    if (f.rating_max !== undefined) add((p) => `rating <= ${p}`, f.rating_max);
    if (f.date_from) add((p) => `doc_date >= ${p}::date`, f.date_from);
    if (f.date_to) add((p) => `doc_date <= ${p}::date`, f.date_to);
    // alcance: los documentos de política no tienen país y son visibles para todos
    if (scope.countries) add((p) => `(country_code = ANY(${p}::text[]) OR source_type = 'policy')`, scope.countries);
    params.push(Math.min(Math.max(k, 1), 25));
    const sql = `SELECT chunk_id, source_type, source_id, title, content, product_code, category_l1, country_code, rating, doc_date::text,
       1 - (embedding <=> $1::vector) AS similarity
FROM vec.chunk
WHERE ${where.join(' AND ')}
ORDER BY embedding <=> $1::vector
LIMIT $${params.length}`;
    const client = await this.ro.connect();
    try {
      // con filtros selectivos, HNSW necesita explorar más candidatos para devolver k resultados
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL hnsw.ef_search = 200`);
      await client.query(`SET LOCAL hnsw.iterative_scan = relaxed_order`).catch(() => undefined);
      const r = await client.query(sql, params);
      await client.query('COMMIT');
      return { hits: r.rows as SearchHit[], sql, params: ['<vector 384d>', ...params.slice(1)] };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
