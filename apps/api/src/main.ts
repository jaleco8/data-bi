import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AgentService } from './application/agent/agent.service.js';
import { CatalogService } from './application/catalog.service.js';
import { DashboardsService } from './application/dashboards.service.js';
import { MetricsService } from './application/metrics.service.js';
import { SearchService } from './application/search.service.js';
import { DbModule } from './infrastructure/db.js';
import { ApiController } from './interface/http.controllers.js';

@Module({
  imports: [DbModule],
  controllers: [ApiController],
  providers: [CatalogService, MetricsService, SearchService, DashboardsService, AgentService],
})
class AppModule {}

const app = await NestFactory.create(AppModule, { logger: ['log', 'warn', 'error'] });
app.enableCors({ origin: true });
app.enableShutdownHooks();
const port = Number(process.env.API_PORT ?? 4000);
await app.listen(port);
console.log(`API escuchando en http://localhost:${port}/api (modelo ${process.env.OPENAI_MODEL || 'gpt-6-luna'})`);
