-- ============================================================================
-- MART · tablas certificadas. Son las ÚNICAS que consulta el chat (rol app_ro).
-- Cada métrica del catálogo (semantic/metrics.yaml) apunta a una de estas tablas.
-- ============================================================================

-- Pedidos (1 fila por pedido) ---------------------------------------------------
DROP TABLE IF EXISTS mart.orders CASCADE;
CREATE TABLE mart.orders AS
WITH lines AS (
  SELECT order_id, SUM(qty) AS units, SUM(line_net_ex_tax_usd) AS net_ex_tax_usd, SUM(cost_usd) AS cost_usd,
         SUM(refund_ex_tax_usd) AS refund_ex_tax_usd, SUM(returned_qty) AS returned_units, SUM(line_discount_usd) AS line_discount_usd
  FROM core.fact_order_line GROUP BY 1
), pay AS (
  SELECT DISTINCT ON (order_id) order_id, method, gateway
  FROM core.fact_payment WHERE kind = 'charge' ORDER BY order_id, (status = 'succeeded') DESC, created_at
), sh AS (
  SELECT DISTINCT ON (order_id) order_id, carrier, is_on_time, order_to_delivery_days FROM core.fact_shipment ORDER BY order_id, shipped_at
)
SELECT o.order_id, o.order_number, o.customer_key, o.order_date, o.created_at,
       o.status, o.is_paid, o.is_cancelled, o.is_valid, o.is_first_order,
       CASE WHEN o.is_first_order THEN 'nuevo' ELSE 'recurrente' END AS customer_type,
       o.channel, o.device, o.country_code, dc.country_name, o.region, o.city, o.warehouse_code,
       o.utm_source, o.utm_medium, o.utm_campaign, o.coupon_code,
       pay.method AS payment_method, pay.gateway AS payment_gateway,
       sh.carrier, sh.is_on_time, sh.order_to_delivery_days,
       l.units,
       CASE WHEN o.is_paid THEN o.merch_usd ELSE 0 END                          AS gmv_usd,
       CASE WHEN o.is_valid THEN round(l.net_ex_tax_usd - l.refund_ex_tax_usd, 2) ELSE 0 END AS net_revenue_usd,
       CASE WHEN o.is_valid THEN round(l.net_ex_tax_usd - l.refund_ex_tax_usd - l.cost_usd * (1 - l.returned_units::numeric / NULLIF(l.units, 0)), 2) ELSE 0 END AS gross_margin_usd,
       round(o.coupon_discount_usd + l.line_discount_usd, 2) AS discount_usd,
       o.shipping_usd, o.total_usd,
       l.returned_units, round(l.refund_ex_tax_usd, 2) AS refund_ex_tax_usd
FROM core.fact_order o
JOIN core.dim_country dc USING (country_code)
JOIN lines l USING (order_id)
LEFT JOIN pay USING (order_id)
LEFT JOIN sh USING (order_id);
ALTER TABLE mart.orders ADD PRIMARY KEY (order_id);
CREATE INDEX ON mart.orders (order_date);
CREATE INDEX ON mart.orders (country_code, order_date);
ANALYZE mart.orders;

-- Líneas de pedido con producto -----------------------------------------------------
DROP TABLE IF EXISTS mart.order_lines CASCADE;
CREATE TABLE mart.order_lines AS
SELECT l.order_id, l.line_no, o.order_date, o.country_code, o.region, o.channel, o.device, o.is_valid, o.is_paid,
       o.customer_type, o.utm_medium,
       l.sku, p.product_code, p.product_name, p.brand, p.category_l1, p.category_l2,
       l.qty AS units,
       CASE WHEN o.is_paid THEN round(l.line_merch_usd, 2) ELSE 0 END AS gmv_usd,
       CASE WHEN o.is_valid THEN round(l.line_net_ex_tax_usd - l.refund_ex_tax_usd, 2) ELSE 0 END AS net_revenue_usd,
       CASE WHEN o.is_valid THEN round(l.cost_usd, 2) ELSE 0 END AS cost_usd,
       CASE WHEN o.is_valid THEN round(l.line_net_ex_tax_usd - l.refund_ex_tax_usd - l.cost_usd * (1 - l.returned_qty::numeric / l.qty), 2) ELSE 0 END AS gross_margin_usd,
       l.returned_qty AS returned_units,
       round(l.refund_usd, 2) AS refund_usd,
       (o.status = 'delivered') AS is_delivered
FROM core.fact_order_line l
JOIN mart.orders o USING (order_id)
JOIN core.dim_product p USING (product_code);
CREATE INDEX ON mart.order_lines (order_date);
CREATE INDEX ON mart.order_lines (product_code, order_date);
CREATE INDEX ON mart.order_lines (category_l1, order_date);

-- Clientes con comportamiento (foto a la fecha de corte) -------------------------------
DROP TABLE IF EXISTS mart.customers CASCADE;
CREATE TABLE mart.customers AS
WITH cutoff AS (SELECT MAX(order_date) AS d FROM core.fact_order),
agg AS (
  SELECT o.customer_key,
         MIN(o.order_date) AS first_order_date,
         MAX(o.order_date) AS last_order_date,
         COUNT(*) AS orders_count,
         SUM(o.net_revenue_usd) AS net_revenue_usd,
         COUNT(*) FILTER (WHERE o.order_date > (SELECT d FROM cutoff) - 365) AS orders_last_365d
  FROM mart.orders o WHERE o.is_valid GROUP BY 1
),
ltv AS (
  SELECT o.customer_key, SUM(o.net_revenue_usd) AS ltv_365_usd
  FROM mart.orders o JOIN agg a USING (customer_key)
  WHERE o.is_valid AND o.order_date < a.first_order_date + 365
  GROUP BY 1
)
SELECT c.customer_key, c.crm_contact_id, c.country_code, c.region, c.city, c.gender,
       date_part('year', age((SELECT d FROM cutoff), c.birth_date))::int AS age,
       CASE WHEN c.birth_date IS NULL THEN 'sin dato'
            WHEN age((SELECT d FROM cutoff), c.birth_date) < interval '25 years' THEN '18-24'
            WHEN age((SELECT d FROM cutoff), c.birth_date) < interval '35 years' THEN '25-34'
            WHEN age((SELECT d FROM cutoff), c.birth_date) < interval '45 years' THEN '35-44'
            WHEN age((SELECT d FROM cutoff), c.birth_date) < interval '55 years' THEN '45-54'
            ELSE '55+' END AS age_band,
       c.customer_since, c.marketing_opt_in, c.crm_lifecycle_stage, c.loyalty_tier, c.is_buyer,
       a.first_order_date, date_trunc('month', a.first_order_date)::date AS cohort_month, a.last_order_date,
       COALESCE(a.orders_count, 0) AS orders_count,
       COALESCE(round(a.net_revenue_usd, 2), 0) AS net_revenue_usd,
       CASE WHEN a.first_order_date <= (SELECT d FROM cutoff) - 365 THEN round(l.ltv_365_usd, 2) END AS ltv_365_usd,
       COALESCE(a.orders_last_365d, 0) AS orders_last_365d,
       (COALESCE(a.orders_last_365d, 0) >= 4) AS is_frequent,
       (a.last_order_date > (SELECT d FROM cutoff) - 90) AS is_active_90d,
       (COALESCE(a.orders_count, 0) >= 2) AS is_repeat,
       CASE
         WHEN a.customer_key IS NULL THEN 'Lead sin compra'
         WHEN a.orders_last_365d >= 4 AND a.last_order_date > (SELECT d FROM cutoff) - 60 THEN 'Campeón'
         WHEN a.orders_last_365d >= 2 AND a.last_order_date > (SELECT d FROM cutoff) - 120 THEN 'Leal'
         WHEN a.first_order_date > (SELECT d FROM cutoff) - 60 THEN 'Nuevo'
         WHEN a.last_order_date > (SELECT d FROM cutoff) - 180 THEN 'Ocasional'
         WHEN a.orders_count >= 3 THEN 'En riesgo'
         ELSE 'Inactivo' END AS rfm_segment
FROM core.dim_customer c
LEFT JOIN agg a USING (customer_key)
LEFT JOIN ltv l USING (customer_key);
ALTER TABLE mart.customers ADD PRIMARY KEY (customer_key);
CREATE INDEX ON mart.customers (first_order_date);

-- Devoluciones --------------------------------------------------------------------------
DROP TABLE IF EXISTS mart.returns CASCADE;
CREATE TABLE mart.returns AS
SELECT r.return_id, r.order_id, r.order_date, (r.requested_at AT TIME ZONE dc.tz)::date AS requested_date,
       r.country_code, r.sku, p.product_code, p.product_name, p.brand, p.category_l1, p.category_l2,
       r.reason, r.status, r.qty AS units, r.refund_usd,
       round(extract(epoch FROM r.received_at - r.requested_at) / 86400.0, 1) AS days_to_receive
FROM core.fact_return r
JOIN core.dim_country dc USING (country_code)
JOIN core.dim_product p USING (product_code);
CREATE INDEX ON mart.returns (requested_date);

-- Envíos --------------------------------------------------------------------------------
DROP TABLE IF EXISTS mart.shipments CASCADE;
CREATE TABLE mart.shipments AS
SELECT s.tracking_no, s.order_id, o.order_date, s.shipped_date, s.promised_date, s.delivered_date,
       s.carrier, s.service_level, s.warehouse_code, s.country_code, s.region, s.city,
       s.order_to_delivery_days, s.transit_days, s.is_on_time, s.late_days,
       (s.is_on_time AND NOT s.has_exception) AS is_otif,
       s.has_exception, s.last_status, s.cost_usd
FROM core.fact_shipment s
JOIN core.fact_order o USING (order_id);
CREATE INDEX ON mart.shipments (shipped_date);
CREATE INDEX ON mart.shipments (carrier, country_code, shipped_date);

-- Inventario: foto de cierre de mes (últimos 12 meses + foto a la fecha de corte) -----------
DROP TABLE IF EXISTS mart.inventory_snapshot CASCADE;
CREATE TABLE mart.inventory_snapshot AS
WITH params AS (
  SELECT (SELECT MAX(moved_on) FROM core.fact_inventory_movement) AS cutoff
), snaps AS (
  SELECT LEAST((m + interval '1 month - 1 day')::date, p.cutoff) AS snapshot_date
  FROM params p, generate_series(date_trunc('month', p.cutoff) - interval '12 months', date_trunc('month', p.cutoff), interval '1 month') m
), keys AS (
  SELECT DISTINCT warehouse_code, sku FROM core.fact_inventory_movement
), opening AS (
  SELECT warehouse_code, sku, SUM(qty) AS qty FROM core.fact_inventory_movement
  WHERE moved_on <= (SELECT MIN(snapshot_date) FROM snaps) GROUP BY 1, 2
), mov AS (
  -- cada movimiento cae en la foto de su cierre de mes (o en la foto de corte)
  SELECT m.warehouse_code, m.sku,
         LEAST((date_trunc('month', m.moved_on) + interval '1 month - 1 day')::date, (SELECT cutoff FROM params)) AS snapshot_date,
         SUM(m.qty) AS qty
  FROM core.fact_inventory_movement m
  WHERE m.moved_on > (SELECT MIN(snapshot_date) FROM snaps)
  GROUP BY 1, 2, 3
), demand AS (
  SELECT warehouse_code, sku, s.snapshot_date, -SUM(m.qty) AS units_90d
  FROM snaps s
  JOIN core.fact_inventory_movement m ON m.movement_type = 'PICK' AND m.moved_on > s.snapshot_date - 90 AND m.moved_on <= s.snapshot_date
  GROUP BY 1, 2, 3
), grid AS (
  SELECT k.warehouse_code, k.sku, s.snapshot_date,
         COALESCE(o.qty, 0) + COALESCE(SUM(mv.qty) OVER (PARTITION BY k.warehouse_code, k.sku ORDER BY s.snapshot_date), 0) AS on_hand_raw
  FROM keys k CROSS JOIN snaps s
  LEFT JOIN opening o USING (warehouse_code, sku)
  LEFT JOIN mov mv ON mv.warehouse_code = k.warehouse_code AND mv.sku = k.sku AND mv.snapshot_date = s.snapshot_date
)
SELECT g.snapshot_date, g.warehouse_code, w.country_code, g.sku, k.product_code, p.product_name, p.brand, p.category_l1, p.category_l2,
       GREATEST(g.on_hand_raw, 0)::int AS on_hand_units,
       round(GREATEST(g.on_hand_raw, 0) * k.unit_cost_usd, 2) AS on_hand_value_usd,
       COALESCE(d.units_90d, 0)::int AS units_sold_90d,
       CASE WHEN COALESCE(d.units_90d, 0) > 0 THEN round(GREATEST(g.on_hand_raw, 0) / (d.units_90d / 90.0), 1) END AS days_of_cover,
       (COALESCE(d.units_90d, 0) > 0) AS is_active_sku,
       (COALESCE(d.units_90d, 0) > 0 AND g.on_hand_raw <= 0) AS is_stockout
FROM grid g
JOIN core.dim_warehouse w USING (warehouse_code)
JOIN core.dim_sku k USING (sku)
JOIN core.dim_product p USING (product_code)
LEFT JOIN demand d USING (warehouse_code, sku, snapshot_date)
WHERE COALESCE(d.units_90d, 0) > 0 OR g.on_hand_raw > 0;
CREATE INDEX ON mart.inventory_snapshot (snapshot_date);
CREATE INDEX ON mart.inventory_snapshot (product_code);

-- Tráfico web diario (GA4) ----------------------------------------------------------------
DROP TABLE IF EXISTS mart.web_traffic_daily CASCADE;
CREATE TABLE mart.web_traffic_daily AS
SELECT date, country_code, device_category, source, medium, campaign, channel_group,
       sessions, total_users, new_users, engaged_sessions, add_to_carts, checkouts, purchases, revenue_usd
FROM core.fact_web_traffic_daily;
CREATE INDEX ON mart.web_traffic_daily (date);

-- Marketing diario: gasto (ads) + sesiones (GA4) + pedidos atribuidos por UTM (OMS) ---------
DROP TABLE IF EXISTS mart.marketing_daily CASCADE;
CREATE TABLE mart.marketing_daily AS
WITH spend AS (
  SELECT date, country_code, source, medium, campaign, MAX(platform) AS platform,
         SUM(impressions) AS impressions, SUM(clicks) AS clicks, SUM(spend_usd) AS spend_usd
  FROM core.fact_ad_spend GROUP BY 1, 2, 3, 4, 5
), ga AS (
  SELECT date, country_code, source, medium, campaign, MAX(channel_group) AS channel_group, SUM(sessions) AS sessions
  FROM core.fact_web_traffic_daily GROUP BY 1, 2, 3, 4, 5
), ord AS (
  SELECT order_date AS date, country_code, utm_source AS source, utm_medium AS medium, utm_campaign AS campaign,
         COUNT(*) FILTER (WHERE is_valid) AS orders, SUM(net_revenue_usd) AS net_revenue_usd, SUM(gmv_usd) AS gmv_usd,
         COUNT(*) FILTER (WHERE is_valid AND is_first_order) AS new_customers
  FROM mart.orders WHERE channel <> 'marketplace' GROUP BY 1, 2, 3, 4, 5
)
SELECT COALESCE(s.date, g.date, o.date) AS date,
       COALESCE(s.country_code, g.country_code, o.country_code) AS country_code,
       COALESCE(s.source, g.source, o.source) AS source,
       COALESCE(s.medium, g.medium, o.medium) AS medium,
       COALESCE(s.campaign, g.campaign, o.campaign) AS campaign,
       COALESCE(s.platform, 'sin pauta') AS platform,
       COALESCE(g.channel_group, CASE WHEN COALESCE(s.medium, o.medium) = 'cpc' THEN 'Búsqueda pagada' WHEN COALESCE(s.medium, o.medium) = 'paid_social' THEN 'Social pagado' ELSE 'Otros' END) AS channel_group,
       COALESCE(s.impressions, 0) AS impressions, COALESCE(s.clicks, 0) AS clicks, COALESCE(s.spend_usd, 0) AS spend_usd,
       COALESCE(g.sessions, 0) AS sessions,
       COALESCE(o.orders, 0) AS orders, COALESCE(o.net_revenue_usd, 0) AS net_revenue_usd, COALESCE(o.gmv_usd, 0) AS gmv_usd,
       COALESCE(o.new_customers, 0) AS new_customers
FROM spend s
FULL JOIN ga g USING (date, country_code, source, medium, campaign)
FULL JOIN ord o ON o.date = COALESCE(s.date, g.date) AND o.country_code = COALESCE(s.country_code, g.country_code)
               AND o.source = COALESCE(s.source, g.source) AND o.medium = COALESCE(s.medium, g.medium) AND o.campaign = COALESCE(s.campaign, g.campaign);
CREATE INDEX ON mart.marketing_daily (date);

-- Reseñas: producto (sitio) + Google Business Profile -----------------------------------------
DROP TABLE IF EXISTS mart.reviews CASCADE;
CREATE TABLE mart.reviews AS
SELECT 'producto'::text AS review_source, r.review_id::text AS review_id, r.review_date, r.country_code, r.rating,
       r.title, r.body AS review_text, r.product_code, p.product_name, p.brand, p.category_l1, p.category_l2,
       NULL::text AS location_name, r.verified_purchase, s.carrier, s.late_days
FROM core.fact_product_review r
JOIN core.dim_product p USING (product_code)
LEFT JOIN LATERAL (SELECT carrier, late_days FROM core.fact_shipment fs WHERE fs.order_id = r.order_id LIMIT 1) s ON true
UNION ALL
SELECT 'google', g.review_id, g.review_date, g.country_code, g.rating, NULL, g.comment, NULL, NULL, NULL, NULL, NULL,
       g.location_name, NULL, NULL, NULL
FROM core.fact_google_review g;
CREATE INDEX ON mart.reviews (review_date);
CREATE INDEX ON mart.reviews (product_code);

-- Soporte --------------------------------------------------------------------------------------
DROP TABLE IF EXISTS mart.support_tickets CASCADE;
CREATE TABLE mart.support_tickets AS
SELECT t.ticket_id, t.created_date, t.country_code, t.channel, t.category, t.priority, t.status,
       t.first_response_hours, t.resolution_hours, t.csat, t.subject, t.description,
       o.order_number, s.carrier,
       (t.status IN ('solved', 'closed')) AS is_solved
FROM core.fact_support_ticket t
LEFT JOIN core.fact_order o USING (order_id)
LEFT JOIN LATERAL (SELECT carrier FROM core.fact_shipment fs WHERE fs.order_id = t.order_id LIMIT 1) s ON true;
CREATE INDEX ON mart.support_tickets (created_date);

-- NPS ------------------------------------------------------------------------------------------
DROP TABLE IF EXISTS mart.nps CASCADE;
CREATE TABLE mart.nps AS
SELECT response_id, response_date, country_code, score, nps_group, comment, (customer_key IS NOT NULL) AS matched_customer
FROM core.fact_nps;

-- Pagos ----------------------------------------------------------------------------------------
DROP TABLE IF EXISTS mart.payments CASCADE;
CREATE TABLE mart.payments AS
SELECT txn_id, order_id, txn_date, country_code, kind, method, gateway, status, failure_code, amount_usd
FROM core.fact_payment;
CREATE INDEX ON mart.payments (txn_date);

-- Productos (catálogo) --------------------------------------------------------------------------
DROP TABLE IF EXISTS mart.products CASCADE;
CREATE TABLE mart.products AS
SELECT p.product_code, p.product_name, p.brand, p.category_l1, p.category_l2, p.launch_date, p.status,
       MIN(k.list_price_usd) AS min_price_usd, COUNT(k.sku) AS n_skus
FROM core.dim_product p JOIN core.dim_sku k USING (product_code)
GROUP BY 1, 2, 3, 4, 5, 6, 7;
CREATE INDEX ON mart.products USING gin (product_name gin_trgm_ops);

-- Metadatos del dataset (fecha de corte)
DROP TABLE IF EXISTS mart.dataset_info CASCADE;
CREATE TABLE mart.dataset_info AS
SELECT (SELECT MIN(order_date) FROM mart.orders) AS data_from,
       (SELECT MAX(order_date) FROM mart.orders) AS data_to,
       now() AS refreshed_at;
