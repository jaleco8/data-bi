import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

export function makePool(max = 4): pg.Pool {
  return new pg.Pool({
    connectionString: process.env.DATABASE_URL ?? 'postgres://databi:databi@localhost:5433/databi',
    max,
  });
}

export function elapsed(t0: number): string {
  const s = (Date.now() - t0) / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.floor(s / 60)} min ${Math.round(s % 60)} s`;
}
