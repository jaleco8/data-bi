import { Body, Controller, Get, Headers, HttpException, HttpStatus, Inject, Param, Post, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import type pg from 'pg';
import { z } from 'zod';
import { MetricQueryError, type ChatEvent, type MetricQuery } from '@data-bi/shared';
import { AgentService } from '../application/agent/agent.service.js';
import { CatalogService } from '../application/catalog.service.js';
import { chartFromResult } from '../application/charts.js';
import { DashboardsService } from '../application/dashboards.service.js';
import { DashboardContextInput, SaveExplorationInput } from '../application/exploration.js';
import { MetricsService } from '../application/metrics.service.js';
import { SearchService } from '../application/search.service.js';
import { PERSONAS, resolveScope } from '../domain/scope.js';
import { RW_POOL } from '../infrastructure/db.js';

const ChatBody = z.object({ message: z.string().min(1).max(4000), conversation_id: z.string().uuid().optional(), dashboard: DashboardContextInput.optional() });

function mapError(e: unknown): never {
  if (e instanceof MetricQueryError) throw new HttpException({ code: e.code, message: e.message }, e.code === 'out_of_scope' ? HttpStatus.FORBIDDEN : HttpStatus.BAD_REQUEST);
  throw e;
}

@Controller('api')
export class ApiController {
  constructor(
    @Inject(CatalogService) private readonly cat: CatalogService,
    @Inject(MetricsService) private readonly metrics: MetricsService,
    @Inject(SearchService) private readonly search: SearchService,
    @Inject(DashboardsService) private readonly dashboards: DashboardsService,
    @Inject(AgentService) private readonly agent: AgentService,
    @Inject(RW_POOL) private readonly rw: pg.Pool,
  ) {}

  @Get('health')
  health() {
    return { ok: true, cutoff: this.cat.cutoff, metrics: this.cat.catalog.metrics.length, llm: Boolean(process.env.OPENAI_API_KEY), model: process.env.OPENAI_MODEL || 'gpt-6-luna' };
  }

  /** Diagnóstico: latencia y disponibilidad de modelos de OpenAI con una petición mínima. */
  @Get('llm/ping')
  async llmPing(@Query('models') models?: string) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) throw new HttpException('Falta OPENAI_API_KEY', HttpStatus.SERVICE_UNAVAILABLE);
    const list = (models ?? process.env.OPENAI_MODEL ?? 'gpt-6-luna').split(',').map((m) => m.trim()).filter(Boolean).slice(0, 6);
    return Promise.all(
      list.map(async (model) => {
        const t0 = Date.now();
        try {
          const r = await fetch('https://api.openai.com/v1/responses', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
            body: JSON.stringify({ model, input: 'Responde solo: ok', max_output_tokens: 16 }),
            signal: AbortSignal.timeout(60_000),
          });
          const j = (await r.json().catch(() => ({}))) as { error?: { message?: string }; modelVersion?: string };
          return { model, status: r.status, ms: Date.now() - t0, version: j.modelVersion, error: j.error?.message };
        } catch (e) {
          return { model, status: 0, ms: Date.now() - t0, error: (e as Error).message };
        }
      }),
    );
  }

  @Get('personas')
  personas() {
    return Object.values(PERSONAS);
  }

  @Get('catalog')
  catalog() {
    const c = this.cat.catalog;
    return {
      version: c.version,
      cutoff: this.cat.cutoff,
      data_from: this.cat.dataFrom,
      metrics: c.metrics.map((m) => ({
        ...m,
        dimensions: [...new Set(m.sources.flatMap((s) => Object.keys(c.tables[s.table].dimensions)))],
      })),
      dimensions: c.dimensions,
    };
  }

  @Post('metrics/query')
  async query(@Body() body: { query: MetricQuery; chart?: string; title?: string }, @Headers('x-user-key') user?: string) {
    try {
      const r = await this.metrics.run(body.query, resolveScope(user));
      return { result: r, chart: chartFromResult(r, body.chart as never, body.title) };
    } catch (e) {
      mapError(e);
    }
  }

  @Post('search')
  async doSearch(@Body() body: { query: string; filters?: Record<string, unknown>; k?: number }, @Headers('x-user-key') user?: string) {
    return this.search.search(body.query, body.filters ?? {}, resolveScope(user), body.k ?? 8);
  }

  @Get('dashboards')
  listDashboards(@Headers('x-user-key') user?: string) {
    return { official: this.dashboards.list(), user: resolveScope(user).user_key };
  }

  @Get('dashboards/saved')
  saved(@Headers('x-user-key') user?: string) {
    return this.dashboards.listSaved(resolveScope(user));
  }

  @Post('dashboards/saved')
  async save(@Body() body: unknown, @Headers('x-user-key') user?: string) {
    const parsed = SaveExplorationInput.safeParse(body);
    if (!parsed.success) throw new HttpException('Nombre o composición inválidos.', HttpStatus.BAD_REQUEST);
    try {
      return await this.dashboards.save(parsed.data, resolveScope(user));
    } catch (e) {
      mapError(e);
    }
  }

  @Get('dashboards/saved/:id')
  savedOne(@Param('id') id: string, @Headers('x-user-key') user?: string) {
    return this.dashboards.renderSaved(id, resolveScope(user));
  }

  @Get('dashboards/:slug')
  dashboard(@Param('slug') slug: string, @Headers('x-user-key') user?: string) {
    return this.dashboards.renderOfficial(slug, resolveScope(user));
  }

  @Get('quality')
  async quality() {
    const run = await this.rw.query(`SELECT run_id, job, started_at, finished_at, status, rows_out FROM ops.etl_run WHERE status <> 'running' ORDER BY run_id DESC LIMIT 1`);
    const checks = run.rows.length
      ? await this.rw.query(`SELECT name, description, expected, actual, tolerance, passed FROM ops.reconciliation WHERE run_id = $1 ORDER BY check_id`, [run.rows[0].run_id])
      : { rows: [] };
    const vec = await this.rw.query(`SELECT source_type, count(*)::int AS n, count(embedding)::int AS embedded FROM vec.chunk GROUP BY 1 ORDER BY 2 DESC`);
    return { run: run.rows[0] ?? null, checks: checks.rows, vectors: vec.rows };
  }

  /** Chat con streaming SSE. */
  @Post('chat')
  async chat(@Body() body: unknown, @Headers('x-user-key') user: string | undefined, @Req() req: Request, @Res() res: Response) {
    const parsed = ChatBody.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ message: 'Cuerpo inválido', issues: parsed.error.issues });
      return;
    }
    if (!process.env.OPENAI_API_KEY) {
      res.status(503).json({ message: 'Falta OPENAI_API_KEY en .env: el chat necesita la API de OpenAI. Los dashboards funcionan sin ella.' });
      return;
    }
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    const ac = new AbortController();
    res.on('close', () => {
      if (!res.writableFinished) ac.abort();
    });
    const emit = (e: ChatEvent) => {
      if (!res.writableEnded) res.write(`data: ${JSON.stringify(e)}\n\n`);
    };
    try {
      await this.agent.chat({ conversationId: parsed.data.conversation_id, scope: resolveScope(user), message: parsed.data.message, dashboard: parsed.data.dashboard, emit, signal: ac.signal });
    } catch (e) {
      if (!ac.signal.aborted) emit({ type: 'error', message: (e as Error).message });
    } finally {
      res.end();
    }
    void req;
  }

  /** Chat sin streaming (usado por la evaluación): devuelve texto final + trazas de herramientas. */
  @Post('chat/sync')
  async chatSync(@Body() body: unknown, @Headers('x-user-key') user?: string) {
    const parsed = ChatBody.safeParse(body);
    if (!parsed.success) throw new HttpException('Cuerpo inválido', HttpStatus.BAD_REQUEST);
    const events: ChatEvent[] = [];
    let r: Awaited<ReturnType<AgentService['chat']>>;
    try {
      r = await this.agent.chat({ conversationId: parsed.data.conversation_id, scope: resolveScope(user), message: parsed.data.message, dashboard: parsed.data.dashboard, emit: (e) => e.type !== 'text' && events.push(e) });
    } catch (e) {
      const status = (e as { status?: number }).status;
      throw new HttpException({ message: (e as Error).message }, status === 429 || status === 503 ? HttpStatus.SERVICE_UNAVAILABLE : HttpStatus.BAD_GATEWAY);
    }
    return { conversation_id: r.conversationId, text: r.text, traces: r.traces, charts: events.filter((e) => e.type === 'chart'), ...(parsed.data.dashboard && { dashboard_patch: events.find((e) => e.type === 'dashboard_patch') }) };
  }
}
