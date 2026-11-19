-- ============================================================================
-- CORE · dimensiones. Reconstrucción completa (idempotente).
-- ============================================================================

-- Maestro de países (dato de referencia del negocio)
DROP TABLE IF EXISTS core.dim_country CASCADE;
CREATE TABLE core.dim_country AS
SELECT * FROM (VALUES
  ('MX', 'México',    'Mexico',    'MXN', 0.16, 100, 'America/Mexico_City'),
  ('CO', 'Colombia',  'Colombia',  'COP', 0.19, 100, 'America/Bogota'),
  ('CL', 'Chile',     'Chile',     'CLP', 0.19,   1, 'America/Santiago'),
  ('PE', 'Perú',      'Peru',      'PEN', 0.18, 100, 'America/Lima'),
  ('AR', 'Argentina', 'Argentina', 'ARS', 0.21, 100, 'America/Argentina/Buenos_Aires')
) v(country_code, country_name, ga_country_name, currency, vat_rate, minor_units, tz);
ALTER TABLE core.dim_country ADD PRIMARY KEY (country_code);

-- Tipos de cambio (ERP)
DROP TABLE IF EXISTS core.fx_rate CASCADE;
CREATE TABLE core.fx_rate AS
SELECT rate_date, currency, units_per_usd FROM raw_erp.fx_rates;
ALTER TABLE core.fx_rate ADD PRIMARY KEY (rate_date, currency);

-- Calendario
DROP TABLE IF EXISTS core.dim_date CASCADE;
CREATE TABLE core.dim_date AS
SELECT d::date AS date,
       extract(isodow FROM d)::int AS iso_dow,
       to_char(d, 'TMDay') AS day_name,
       date_trunc('week', d)::date AS week_start,
       date_trunc('month', d)::date AS month_start,
       date_trunc('quarter', d)::date AS quarter_start,
       extract(year FROM d)::int AS year,
       (d::date IN (DATE '2024-11-29', DATE '2025-11-28', DATE '2026-11-27')) AS is_black_friday
FROM generate_series(DATE '2023-12-01', DATE '2026-12-31', interval '1 day') d;
ALTER TABLE core.dim_date ADD PRIMARY KEY (date);

-- Categorías y productos (ERP)
DROP TABLE IF EXISTS core.dim_product CASCADE;
CREATE TABLE core.dim_product AS
SELECT p.product_code, p.product_name, p.description, p.brand,
       c2.name AS category_l2, c1.name AS category_l1,
       s.supplier_name, s.country_code AS supplier_country, s.lead_time_days,
       p.launch_date, p.status
FROM raw_erp.products p
JOIN raw_erp.categories c2 ON c2.category_id = p.category_id
LEFT JOIN raw_erp.categories c1 ON c1.category_id = c2.parent_id
LEFT JOIN raw_erp.suppliers s ON s.supplier_id = p.supplier_id;
ALTER TABLE core.dim_product ADD PRIMARY KEY (product_code);

DROP TABLE IF EXISTS core.dim_sku CASCADE;
CREATE TABLE core.dim_sku AS
SELECT k.sku, k.product_code, k.variant_label, k.list_price_usd, k.unit_cost_usd, k.weight_kg
FROM raw_erp.skus k;
ALTER TABLE core.dim_sku ADD PRIMARY KEY (sku);

DROP TABLE IF EXISTS core.dim_warehouse CASCADE;
CREATE TABLE core.dim_warehouse AS SELECT * FROM raw_wms.warehouses;
ALTER TABLE core.dim_warehouse ADD PRIMARY KEY (warehouse_code);

-- ----------------------------------------------------------------------------
-- Cliente unificado: tienda (OMS) + CRM, resuelto por email normalizado.
-- Reglas: email = lower(trim()); en el CRM se descartan duplicados conservando
-- el contacto más antiguo; leads del CRM sin compra entran con is_buyer = false.
-- ----------------------------------------------------------------------------
DROP TABLE IF EXISTS core.crm_contact_dedup CASCADE;
CREATE TABLE core.crm_contact_dedup AS
SELECT DISTINCT ON (email_norm) *
FROM (SELECT c.*, lower(trim(c.email)) AS email_norm FROM raw_crm.contacts c WHERE c.email IS NOT NULL) x
ORDER BY email_norm, created_at, contact_id;
CREATE UNIQUE INDEX ON core.crm_contact_dedup (email_norm);

DROP TABLE IF EXISTS core.dim_customer CASCADE;
CREATE TABLE core.dim_customer AS
WITH shop AS (
  SELECT sc.*, lower(trim(sc.email)) AS email_norm FROM raw_shop.customers sc
), last_addr AS (
  SELECT DISTINCT ON (shop_customer_id) shop_customer_id, state, city
  FROM raw_shop.orders ORDER BY shop_customer_id, created_at DESC
)
SELECT s.shop_customer_id AS customer_key,
       s.shop_customer_id,
       c.contact_id AS crm_contact_id,
       s.email_norm AS email,
       c.first_name, c.last_name,
       s.country_code,
       COALESCE(c.state, a.state) AS region,
       COALESCE(c.city, a.city) AS city,
       c.birth_date, c.gender,
       s.created_at AS customer_since,
       COALESCE(c.marketing_opt_in, s.accepts_marketing) AS marketing_opt_in,
       c.lifecycle_stage AS crm_lifecycle_stage,
       c.loyalty_tier,
       true AS is_buyer
FROM shop s
LEFT JOIN core.crm_contact_dedup c USING (email_norm)
LEFT JOIN last_addr a ON a.shop_customer_id = s.shop_customer_id
UNION ALL
SELECT 1000000000 + row_number() OVER (ORDER BY c.contact_id) AS customer_key,
       NULL, c.contact_id, c.email_norm, c.first_name, c.last_name,
       dc.country_code, c.state, c.city, c.birth_date, c.gender, c.created_at,
       c.marketing_opt_in, c.lifecycle_stage, c.loyalty_tier, false
FROM core.crm_contact_dedup c
LEFT JOIN core.dim_country dc ON dc.country_name = c.country
WHERE NOT EXISTS (SELECT 1 FROM shop s WHERE s.email_norm = c.email_norm);
ALTER TABLE core.dim_customer ADD PRIMARY KEY (customer_key);
CREATE INDEX ON core.dim_customer (crm_contact_id);
CREATE INDEX ON core.dim_customer (email);

ANALYZE core.dim_customer;
ANALYZE core.dim_product;
ANALYZE core.dim_sku;
ANALYZE core.crm_contact_dedup;
