-- El catálogo guarda la definición completa (varias tablas fuente por métrica).
DROP TABLE IF EXISTS semantic.metric;
CREATE TABLE semantic.metric (
  metric_key   text PRIMARY KEY,
  label        text NOT NULL,
  domain       text NOT NULL,
  description  text NOT NULL,
  synonyms     text[] NOT NULL DEFAULT '{}',
  unit         text NOT NULL,
  time_mode    text NOT NULL,
  definition   jsonb NOT NULL,
  owner        text NOT NULL,
  refresh      text NOT NULL,
  catalog_version int NOT NULL,
  validated_at timestamptz,
  updated_at   timestamptz NOT NULL DEFAULT now()
);
DROP TABLE IF EXISTS semantic.dimension;
CREATE TABLE semantic.dimension (
  dimension_key text PRIMARY KEY,
  label         text NOT NULL,
  description   text NOT NULL,
  tables        jsonb NOT NULL
);
GRANT SELECT ON semantic.metric, semantic.dimension TO app_ro;
