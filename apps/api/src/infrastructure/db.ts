import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import pg from 'pg';

// numeric/bigint → number (los montos analíticos caben holgadamente en double)
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(20, (v) => (v === null ? null : Number(v)));
pg.types.setTypeParser(1082, (v) => v); // date como 'YYYY-MM-DD'

export const RO_POOL = Symbol('RO_POOL'); // solo lectura: mart/semantic/vec (consultas del chat y dashboards)
export const RW_POOL = Symbol('RW_POOL'); // escritura: solo esquema chat (auditoría, conversaciones, dashboards guardados)

@Global()
@Module({
  providers: [
    {
      provide: RO_POOL,
      useFactory: () => new pg.Pool({ connectionString: process.env.DATABASE_URL_RO ?? 'postgres://app_ro:app_ro@localhost:5433/databi', max: 8 }),
    },
    {
      provide: RW_POOL,
      useFactory: () => new pg.Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://databi:databi@localhost:5433/databi', max: 4 }),
    },
  ],
  exports: [RO_POOL, RW_POOL],
})
export class DbModule implements OnModuleDestroy {
  constructor(
    @Inject(RO_POOL) private readonly ro: pg.Pool,
    @Inject(RW_POOL) private readonly rw: pg.Pool,
  ) {}
  async onModuleDestroy() {
    await Promise.all([this.ro.end(), this.rw.end()]);
  }
}
