# Mercadia Data · analítica conversacional sobre un e-commerce ficticio

Demo completa de una plataforma de datos para un e-commerce grande (5 países LATAM, ~1,1 M de pedidos, ~47 M de filas entre todas las capas) donde se puede **preguntar en español y recibir cifras verificables con gráfico**, además de dashboards oficiales que usan exactamente las mismas definiciones.

Todos los datos son ficticios y se generan de forma determinista.

## Arquitectura

```
 Fuentes simuladas (raw_*)            ETL + conciliación             Capa certificada            Consumo
┌──────────────────────────┐   ┌─────────────────────────┐   ┌──────────────────────┐   ┌──────────────────────────┐
│ raw_shop      (OMS)      │   │ identidad de cliente    │   │ mart.* (tablas       │   │ API NestJS               │
│ raw_crm       (CRM)      │   │ tipo de cambio diario   │   │   certificadas)      │──▶│  · motor de métricas     │
│ raw_erp       (ERP)      │──▶│ husos horarios locales  │──▶│ semantic.metric      │   │  · agente OpenAI (tools) │
│ raw_wms       (WMS)      │   │ deduplicación           │   │   (catálogo YAML)    │   │  · búsqueda vectorial    │
│ raw_payments  (pasarela) │   │ 13 controles de         │   │ vec.chunk (pgvector) │   │ Web Next.js              │
│ raw_carriers  (envíos)   │   │   conciliación          │   │   embeddings locales │   │  · chat con gráficos     │
│ raw_ga4 · raw_ads        │   │ core.* (estrella)       │   └──────────────────────┘   │  · 7 dashboards oficiales│
│ raw_gbp · raw_reviews    │   └─────────────────────────┘                              │  · catálogo y calidad    │
│ raw_helpdesk             │                                                            └──────────────────────────┘
└──────────────────────────┘
```

**Principio clave (arquitectura híbrida):**
- **Preguntas numéricas → SQL sobre tablas estructuradas**, a través de un **catálogo de 49 métricas certificadas** (`semantic/metrics.yaml`). El LLM no escribe SQL para indicadores: elige métrica + periodo + agrupación + filtros; el backend valida, aplica el alcance del usuario y ejecuta SQL parametrizado con un rol de solo lectura.
- **Preguntas sobre texto → búsqueda vectorial** (pgvector) en reseñas, tickets, NPS, Google y políticas. Los fragmentos se citan; los porcentajes se cuentan con métricas, no con fragmentos.
- Cada gráfico muestra **definición, filtros, fecha de corte y SQL ejecutado** («¿De dónde sale esta cifra?»).

## Requisitos
Docker, Node ≥ 22, pnpm 10. ~6 GB libres para la escala `large`. Para el chat: `OPENAI_API_KEY` (API de OpenAI; modelo `gpt-6-luna` por defecto, configurable con `OPENAI_MODEL`).

## Puesta en marcha

```bash
cp .env.example .env          # y completa OPENAI_API_KEY para el chat
```

```bash
pnpm install
```

```bash
pnpm db:up && pnpm migrate
```

```bash
pnpm gen --scale large        # small ≈ 1,7 M filas en ~10 s · large ≈ 18 M filas en ~100 s
```

```bash
pnpm etl                      # raw → core → mart + conciliaciones (~2–5 min en large)
```

```bash
pnpm metrics:load             # valida cada métrica con el rol de solo lectura y carga el catálogo
```

```bash
pnpm embed                    # embeddings locales multilingual-e5-small (~35 min en large, reanudable)
```

```bash
pnpm dev:api                  # http://localhost:4000/api
```

```bash
pnpm dev:web                  # http://localhost:3000
```

Los dashboards, el catálogo y la página de calidad funcionan sin API key; solo el chat la necesita.

## Verificación

```bash
pnpm --filter @data-bi/eval run engine-check   # motor de métricas vs SQL de referencia independiente (sin LLM)
```

```bash
pnpm eval                                      # 43 preguntas al chat: números, ambigüedad, alcance, texto y "por qué"
```

## Volumen (escala `large`)

| Capa | Filas |
|---|---|
| raw (11 fuentes) | 17,9 M |
| core + mart | 29,4 M |
| vec.chunk | ~209 K fragmentos (384 dims) |

Principales: 1,08 M pedidos · 2,5 M líneas · 1,25 M transacciones de pago · 1,0 M envíos y 3,4 M eventos de tracking · 3,4 M movimientos de inventario · 3,4 M eventos GA4 (muestra) · 465 K contactos CRM · 259 K reseñas de producto · 50 K reseñas de Google · 110 K tickets · 50 K productos / 112 K SKUs.

## Estructura

```
db/migrations/        esquemas por capa, roles (app_ro solo lectura), catálogo, vectores, chat
packages/generator/   simulador determinista por fuente (+ historias plantadas)
packages/etl/         SQL raw→core→mart, conciliaciones, carga de catálogo, embeddings
packages/shared/      tipos, motor de métricas (MetricQuery → SQL), dashboards oficiales
semantic/metrics.yaml catálogo de métricas certificadas (fuente única de verdad)
corpus/               políticas y FAQ (se vectorizan con versión y vigencia)
apps/api/             NestJS: agente OpenAI, métricas, búsqueda, dashboards, auditoría
apps/web/             Next.js: chat, dashboards, catálogo, calidad de datos
eval/                 set de evaluación + verificación determinista del motor
docs/demo-stories.md  historias de negocio plantadas y preguntas para la demo
```

## Seguridad del chat
- El rol `app_ro` solo ve `mart`, `semantic` y `vec`, en transacciones de solo lectura con `statement_timeout`.
- Identificadores SQL salen únicamente del catálogo; los valores del usuario van como parámetros.
- El alcance por país se inyecta en el motor y en la búsqueda; el SQL exploratorio está deshabilitado para perfiles restringidos.
- Toda llamada a herramientas queda auditada en `chat.tool_call` con su SQL.
