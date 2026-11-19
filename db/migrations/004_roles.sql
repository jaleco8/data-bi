-- Rol de solo lectura que usa el chat para ejecutar métricas.
-- Solo ve mart (tablas certificadas), semantic (catálogo) y vec (búsqueda). Nunca raw ni core.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_ro') THEN
    CREATE ROLE app_ro LOGIN PASSWORD 'app_ro';
  END IF;
END $$;

ALTER ROLE app_ro SET statement_timeout = '15s';
ALTER ROLE app_ro SET default_transaction_read_only = on;

GRANT CONNECT ON DATABASE databi TO app_ro;
GRANT USAGE ON SCHEMA mart, semantic, vec TO app_ro;
GRANT SELECT ON ALL TABLES IN SCHEMA mart, semantic, vec TO app_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA mart GRANT SELECT ON TABLES TO app_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA semantic GRANT SELECT ON TABLES TO app_ro;
ALTER DEFAULT PRIVILEGES IN SCHEMA vec GRANT SELECT ON TABLES TO app_ro;
REVOKE ALL ON SCHEMA core FROM app_ro;
