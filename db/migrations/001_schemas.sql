-- Extensiones y esquemas por capa.
-- raw_*    : un esquema por sistema fuente, tal como "llega" (sin limpiar)
-- core     : modelo estrella integrado y limpio
-- mart     : tablas analíticas certificadas (lo único que consulta el chat)
-- semantic : catálogo de métricas certificadas
-- vec      : fragmentos de texto + embeddings (pgvector)
-- chat     : sesiones, auditoría y dashboards guardados
-- ops      : bitácora de cargas y conciliaciones

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE SCHEMA IF NOT EXISTS raw_crm;       -- CRM: contactos, segmentos, campañas email, NPS
CREATE SCHEMA IF NOT EXISTS raw_shop;      -- Plataforma e-commerce (OMS): clientes, pedidos, devoluciones
CREATE SCHEMA IF NOT EXISTS raw_erp;       -- ERP: catálogo, costos, proveedores, compras, tipos de cambio
CREATE SCHEMA IF NOT EXISTS raw_wms;       -- WMS: almacenes y movimientos de stock
CREATE SCHEMA IF NOT EXISTS raw_payments;  -- Pasarela de pagos
CREATE SCHEMA IF NOT EXISTS raw_carriers;  -- Transportistas: envíos y tracking
CREATE SCHEMA IF NOT EXISTS raw_ga4;       -- Google Analytics 4: agregados diarios + export de eventos (muestra)
CREATE SCHEMA IF NOT EXISTS raw_ads;       -- Plataformas de anuncios: gasto diario por campaña
CREATE SCHEMA IF NOT EXISTS raw_gbp;       -- Google Business Profile: reseñas de tiendas/puntos de retiro
CREATE SCHEMA IF NOT EXISTS raw_reviews;   -- Reseñas de producto del sitio
CREATE SCHEMA IF NOT EXISTS raw_helpdesk;  -- Mesa de ayuda: tickets de soporte

CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS mart;
CREATE SCHEMA IF NOT EXISTS semantic;
CREATE SCHEMA IF NOT EXISTS vec;
CREATE SCHEMA IF NOT EXISTS chat;
CREATE SCHEMA IF NOT EXISTS ops;

CREATE TABLE IF NOT EXISTS ops.etl_run (
  run_id       bigserial PRIMARY KEY,
  job          text NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  status       text NOT NULL DEFAULT 'running',
  rows_out     bigint,
  detail       jsonb
);

CREATE TABLE IF NOT EXISTS ops.reconciliation (
  check_id     bigserial PRIMARY KEY,
  run_id       bigint REFERENCES ops.etl_run(run_id),
  name         text NOT NULL,
  description  text NOT NULL,
  expected     numeric,
  actual       numeric,
  tolerance    numeric NOT NULL DEFAULT 0,
  passed       boolean NOT NULL,
  checked_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ops.dataset_info (
  key   text PRIMARY KEY,
  value text NOT NULL
);
