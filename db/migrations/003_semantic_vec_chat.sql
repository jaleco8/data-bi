-- Catálogo de métricas certificadas (se carga desde semantic/metrics.yaml)
CREATE TABLE semantic.metric (
  metric_key      text PRIMARY KEY,
  label           text NOT NULL,
  description     text NOT NULL,
  synonyms        text[] NOT NULL DEFAULT '{}',
  unit            text NOT NULL,             -- usd / count / pct / days / score
  source_table    text NOT NULL,             -- mart.xxx
  expression      text NOT NULL,             -- expresión SQL agregada
  date_column     text,                      -- null = métrica "foto actual"
  base_filter     text,
  dimensions      jsonb NOT NULL,            -- { nombre: columna }
  owner           text NOT NULL,
  refresh         text NOT NULL,
  version         int NOT NULL DEFAULT 1,
  notes           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE semantic.dimension (
  dimension_key  text PRIMARY KEY,
  label          text NOT NULL,
  description    text NOT NULL
);

-- Fragmentos de texto vectorizados (reseñas, tickets, productos, políticas)
CREATE TABLE vec.chunk (
  chunk_id      bigserial PRIMARY KEY,
  source_type   text NOT NULL,   -- product_review / google_review / support_ticket / product / policy / nps
  source_id     text NOT NULL,
  title         text,
  content       text NOT NULL,
  -- metadatos filtrables
  product_code  text,
  category_l1   text,
  country_code  text,
  rating        int,
  doc_date      date,
  extra         jsonb,
  embedding     vector(384),
  UNIQUE (source_type, source_id)
);
CREATE INDEX chunk_source_idx ON vec.chunk (source_type, doc_date);
CREATE INDEX chunk_product_idx ON vec.chunk (product_code);
-- El índice HNSW se crea al terminar la carga de embeddings (más rápido que mantenerlo durante inserts).

-- Chat: auditoría y dashboards
CREATE TABLE chat.conversation (
  conversation_id  uuid PRIMARY KEY,
  user_key         text NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  title            text
);
CREATE TABLE chat.message (
  message_id       bigserial PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES chat.conversation(conversation_id),
  role             text NOT NULL,
  content          jsonb NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chat.tool_call (
  tool_call_id     bigserial PRIMARY KEY,
  conversation_id  uuid NOT NULL REFERENCES chat.conversation(conversation_id),
  tool_name        text NOT NULL,
  input            jsonb NOT NULL,
  output_summary   jsonb,
  sql_text         text,
  duration_ms      int,
  error            text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE chat.dashboard (
  dashboard_id   uuid PRIMARY KEY,
  user_key       text NOT NULL,
  title          text NOT NULL,
  widgets        jsonb NOT NULL DEFAULT '[]',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
