import { Inject, Injectable } from '@nestjs/common';
import type pg from 'pg';
import {
  MetricQueryError, buildMetricQuery, comparisonPeriod, resolvePeriod, findMetric, pickSource,
  type MetricQuery, type MetricResult, type Row, type Scope,
} from '@data-bi/shared';
import { RO_POOL } from '../infrastructure/db.js';
import { CatalogService } from './catalog.service.js';

/** Ejecuta métricas certificadas con el rol de solo lectura. */
@Injectable()
export class MetricsService {
  constructor(
    @Inject(RO_POOL) private readonly ro: pg.Pool,
    @Inject(CatalogService) private readonly cat: CatalogService,
  ) {}

  async run(q: MetricQuery, scope: Scope, explicitComparison?: { date_from: string; date_to: string }): Promise<MetricResult> {
    const cutoff = this.cat.cutoff;
    const built = buildMetricQuery(this.cat.catalog, q, scope, cutoff);
    const [rowsRes, totalRes] = await Promise.all([this.ro.query(built.sql, built.params), this.ro.query(built.totalSql, built.totalParams)]);
    let rows = rowsRes.rows as Row[];
    const truncated = rows.length > built.limit;
    if (truncated) rows = rows.slice(0, built.limit);
    const total = (totalRes.rows[0]?.valor as number | null) ?? null;

    const result: MetricResult = {
      metric: built.metric.key,
      label: built.metric.label,
      unit: built.metric.unit,
      description: built.metric.description.trim(),
      table: built.table,
      query: q,
      period: built.period,
      columns: built.columns,
      rows,
      total,
      sql: built.sql,
      params: built.params,
      cutoff,
      notes: built.notes,
      truncated,
    };

    if ((explicitComparison || q.compare_to) && built.metric.time !== 'none') {
      const cp = explicitComparison
        ? resolvePeriod({ metric: q.metric, ...explicitComparison }, cutoff)
        : comparisonPeriod(built.period, q.compare_to!);
      if (cp.to >= this.cat.dataFrom) {
        const b2 = buildMetricQuery(this.cat.catalog, q, scope, cutoff, cp);
        const [r2, t2] = await Promise.all([this.ro.query(b2.sql, b2.params), this.ro.query(b2.totalSql, b2.totalParams)]);
        const prev = (t2.rows[0]?.valor as number | null) ?? null;
        result.comparison = {
          period: cp,
          total: prev,
          rows: r2.rows as Row[],
          sql: b2.sql,
          params: b2.params,
          change_pct: prev && total !== null ? (total - prev) / Math.abs(prev) : null,
        };
        if (cp.from < this.cat.dataFrom) result.notes.push(`El periodo de comparación empieza antes del inicio de los datos (${this.cat.dataFrom}).`);
      } else {
        result.notes.push(`No hay datos para el periodo de comparación (los datos empiezan el ${this.cat.dataFrom}).`);
      }
    }
    return result;
  }

  /** Valores distintos de una dimensión (para que el agente use valores exactos en filtros). */
  async dimensionValues(dimension: string, scope: Scope, metric?: string, search?: string): Promise<string[]> {
    const catalog = this.cat.catalog;
    const table = metric
      ? pickSource(catalog, findMetric(catalog, metric), [dimension]).table
      : Object.entries(catalog.tables).find(([, t]) => dimension in t.dimensions)?.[0];
    if (!table) throw new MetricQueryError(`Dimensión desconocida: ${dimension}`, 'unknown_dimension');
    const def = catalog.tables[table];
    const col = def.dimensions[dimension];
    const params: unknown[] = [];
    const where: string[] = [`${col} IS NOT NULL`];
    if (search) {
      params.push(`%${search}%`);
      where.push(`${col}::text ILIKE $${params.length}`);
    }
    if (scope.countries && def.dimensions.pais) {
      params.push(scope.countries);
      where.push(`${def.dimensions.pais}::text = ANY($${params.length}::text[])`);
    }
    const r = await this.ro.query<{ v: string; n: number }>(
      `SELECT ${col}::text AS v, count(*)::int AS n FROM ${table} WHERE ${where.join(' AND ')} GROUP BY 1 ORDER BY 2 DESC LIMIT 40`,
      params,
    );
    return r.rows.map((x) => x.v);
  }

  /**
   * SQL exploratorio (no certificado). Defensa en profundidad:
   * rol app_ro (solo SELECT sobre mart/semantic/vec, transacción read-only, timeout 15 s)
   * + validación léxica + LIMIT forzado.
   */
  async exploratorySql(sql: string, scope: Scope): Promise<{ rows: Row[]; truncated: boolean; sql: string }> {
    const clean = sql.trim().replace(/;+\s*$/, '');
    if (!/^(select|with)\b/i.test(clean)) throw new MetricQueryError('Solo se permiten consultas SELECT.', 'bad_request');
    if (/;/.test(clean)) throw new MetricQueryError('Solo una sentencia por consulta.', 'bad_request');
    if (/\b(raw_\w+|core|ops|chat|pg_catalog|information_schema)\s*\./i.test(clean) || /\bpg_\w+\s*\(/i.test(clean))
      throw new MetricQueryError('Solo se pueden consultar tablas del esquema mart.', 'bad_request');
    if (scope.countries) throw new MetricQueryError('El SQL exploratorio solo está disponible para perfiles sin restricción de país.', 'out_of_scope');
    const wrapped = `SELECT * FROM (${clean}) AS q LIMIT 201`;
    const client = await this.ro.connect();
    try {
      await client.query('BEGIN READ ONLY');
      await client.query(`SET LOCAL statement_timeout = '10s'`);
      const r = await client.query(wrapped);
      await client.query('COMMIT');
      const rows = r.rows as Row[];
      return { rows: rows.slice(0, 200), truncated: rows.length > 200, sql: wrapped };
    } catch (e) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw e;
    } finally {
      client.release();
    }
  }
}
