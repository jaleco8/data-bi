import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type pg from 'pg';
import { from as copyFrom } from 'pg-copy-streams';

function enc(v: unknown): string {
  if (v === null || v === undefined) return '\\N';
  if (v instanceof Date) return v.toISOString();
  if (typeof v === 'boolean') return v ? 't' : 'f';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '\\N';
  return String(v)
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
}

/** Acumula filas y las envía con COPY FROM STDIN en lotes. */
export class TableWriter {
  private buf: string[] = [];
  public count = 0;

  constructor(
    private readonly client: pg.PoolClient,
    public readonly table: string,
    private readonly cols: readonly string[],
    private readonly batchSize = 25_000,
  ) {}

  push(row: readonly unknown[]): void {
    let line = '';
    for (let i = 0; i < row.length; i++) {
      if (i) line += '\t';
      line += enc(row[i]);
    }
    this.buf.push(line + '\n');
    this.count++;
  }

  async flushIfNeeded(): Promise<void> {
    if (this.buf.length >= this.batchSize) await this.flush();
  }

  async flush(): Promise<void> {
    if (!this.buf.length) return;
    const data = this.buf.join('');
    this.buf = [];
    const stream = this.client.query(copyFrom(`COPY ${this.table} (${this.cols.join(', ')}) FROM STDIN`));
    await pipeline(Readable.from([data]), stream);
  }
}

export class WriterSet {
  private writers = new Map<string, TableWriter>();
  constructor(private readonly client: pg.PoolClient) {}

  get(table: string, cols: readonly string[]): TableWriter {
    let w = this.writers.get(table);
    if (!w) {
      w = new TableWriter(this.client, table, cols);
      this.writers.set(table, w);
    }
    return w;
  }

  async flushIfNeeded(): Promise<void> {
    for (const w of this.writers.values()) await w.flushIfNeeded();
  }

  async flushAll(): Promise<void> {
    for (const w of this.writers.values()) await w.flush();
  }

  summary(): Record<string, number> {
    return Object.fromEntries([...this.writers.values()].map((w) => [w.table, w.count]));
  }
}
