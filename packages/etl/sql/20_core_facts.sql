-- ============================================================================
-- CORE · hechos. Todo en USD con el tipo de cambio del día local del pedido.
-- ============================================================================

-- Pedidos -------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_order CASCADE;
CREATE TABLE core.fact_order AS
SELECT o.order_id,
       o.order_number,
       o.shop_customer_id                                         AS customer_key,
       o.created_at,
       (o.created_at AT TIME ZONE dc.tz)::date                    AS order_date,
       o.status,
       o.channel,
       COALESCE(o.device, 'marketplace')                          AS device,
       o.country_code, o.state AS region, o.city,
       o.currency,
       fx.units_per_usd                                           AS fx_rate,
       o.subtotal, o.discount, o.shipping_fee, o.tax_included, o.total,
       round((o.subtotal - o.discount) / fx.units_per_usd, 2)    AS merch_usd,       -- mercadería neta de descuentos, con IVA
       round(o.discount / fx.units_per_usd, 2)                    AS coupon_discount_usd,
       round(o.shipping_fee / fx.units_per_usd, 2)                AS shipping_usd,
       round(o.tax_included / fx.units_per_usd, 2)                AS tax_usd,
       round(o.total / fx.units_per_usd, 2)                       AS total_usd,
       o.coupon_code,
       COALESCE(o.utm_source, '(none)')   AS utm_source,
       COALESCE(o.utm_medium, '(none)')   AS utm_medium,
       COALESCE(o.utm_campaign, '(none)') AS utm_campaign,
       o.warehouse_code,
       o.paid_at, o.cancelled_at, o.shipped_at, o.delivered_at,
       (o.paid_at IS NOT NULL)                                     AS is_paid,
       (o.status = 'cancelled')                                    AS is_cancelled,
       (o.paid_at IS NOT NULL AND o.status <> 'cancelled')         AS is_valid
FROM raw_shop.orders o
JOIN core.dim_country dc ON dc.country_code = o.country_code
JOIN core.fx_rate fx ON fx.currency = o.currency AND fx.rate_date = LEAST((o.created_at AT TIME ZONE dc.tz)::date, DATE '2026-11-18');
ALTER TABLE core.fact_order ADD PRIMARY KEY (order_id);
CREATE UNIQUE INDEX ON core.fact_order (order_number);
CREATE INDEX ON core.fact_order (customer_key, created_at);
ANALYZE core.fact_order;

-- Primer pedido válido de cada cliente
ALTER TABLE core.fact_order ADD COLUMN is_first_order boolean NOT NULL DEFAULT false;
UPDATE core.fact_order f SET is_first_order = true
FROM (SELECT DISTINCT ON (customer_key) order_id FROM core.fact_order WHERE is_valid ORDER BY customer_key, created_at) x
WHERE x.order_id = f.order_id;

-- Líneas ---------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_order_line CASCADE;
CREATE TABLE core.fact_order_line AS
WITH ret AS (
  SELECT order_id, line_no, SUM(qty) AS returned_qty,
         SUM(COALESCE(refund_amount, 0)) AS refund_local
  FROM raw_shop.returns WHERE status <> 'rejected' GROUP BY 1, 2
)
SELECT i.order_id, i.line_no, i.sku, k.product_code,
       i.qty,
       i.unit_price, i.line_discount,
       round((i.qty * i.unit_price - i.line_discount) / o.fx_rate, 4)                              AS line_gross_usd,
       -- prorrateo del cupón a nivel pedido
       round((i.qty * i.unit_price - i.line_discount) * (1 - o.discount / NULLIF(o.subtotal, 0)) / o.fx_rate, 4) AS line_merch_usd,
       round((i.qty * i.unit_price - i.line_discount) * (1 - o.discount / NULLIF(o.subtotal, 0)) / o.fx_rate / (1 + dc.vat_rate), 4) AS line_net_ex_tax_usd,
       round(i.qty * k.unit_cost_usd, 4)                                                           AS cost_usd,
       round(i.line_discount / o.fx_rate, 4)                                                       AS line_discount_usd,
       COALESCE(r.returned_qty, 0)::int                                                            AS returned_qty,
       round(COALESCE(r.refund_local, 0) / o.fx_rate, 4)                                           AS refund_usd,
       round(COALESCE(r.refund_local, 0) / o.fx_rate / (1 + dc.vat_rate), 4)                       AS refund_ex_tax_usd
FROM raw_shop.order_items i
JOIN core.fact_order o ON o.order_id = i.order_id
JOIN core.dim_country dc ON dc.country_code = o.country_code
JOIN core.dim_sku k ON k.sku = i.sku
LEFT JOIN ret r ON r.order_id = i.order_id AND r.line_no = i.line_no;
ALTER TABLE core.fact_order_line ADD PRIMARY KEY (order_id, line_no);

-- Pagos ----------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_payment CASCADE;
CREATE TABLE core.fact_payment AS
SELECT t.txn_id, o.order_id, t.kind, t.method, t.gateway, t.status, t.failure_code,
       t.amount_minor::numeric / dc.minor_units                         AS amount_local,
       round(t.amount_minor::numeric / dc.minor_units / fx.units_per_usd, 2) AS amount_usd,
       t.currency, t.created_at,
       (t.created_at AT TIME ZONE dc.tz)::date AS txn_date,
       o.country_code
FROM raw_payments.transactions t
JOIN core.fact_order o ON o.order_number = t.order_ref
JOIN core.dim_country dc ON dc.country_code = o.country_code
JOIN core.fx_rate fx ON fx.currency = t.currency AND fx.rate_date = LEAST((t.created_at AT TIME ZONE dc.tz)::date, DATE '2026-11-18');
ALTER TABLE core.fact_payment ADD PRIMARY KEY (txn_id);
CREATE INDEX ON core.fact_payment (order_id);

-- Devoluciones ----------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_return CASCADE;
CREATE TABLE core.fact_return AS
SELECT r.return_id, r.order_id, r.line_no, r.sku, k.product_code, r.qty, r.reason, r.status,
       r.requested_at, r.received_at,
       round(COALESCE(r.refund_amount, 0) / o.fx_rate, 2) AS refund_usd,
       o.country_code, o.order_date
FROM raw_shop.returns r
JOIN core.fact_order o USING (order_id)
JOIN core.dim_sku k ON k.sku = r.sku;
ALTER TABLE core.fact_return ADD PRIMARY KEY (return_id);

-- Envíos ----------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_shipment CASCADE;
CREATE TABLE core.fact_shipment AS
WITH ev AS (
  SELECT tracking_no, bool_or(event_code = 'EXCEPTION') AS has_exception, count(*) AS n_events
  FROM raw_carriers.tracking_events GROUP BY 1
)
SELECT s.tracking_no, o.order_id, s.carrier, s.origin_wh AS warehouse_code,
       s.dest_country AS country_code, s.dest_state AS region, s.dest_city AS city,
       s.service_level, s.shipped_at, s.promised_date, s.delivered_at,
       (s.shipped_at AT TIME ZONE dc.tz)::date   AS shipped_date,
       (s.delivered_at AT TIME ZONE dc.tz)::date AS delivered_date,
       round(extract(epoch FROM s.delivered_at - o.created_at) / 86400.0, 2) AS order_to_delivery_days,
       round(extract(epoch FROM s.delivered_at - s.shipped_at) / 86400.0, 2) AS transit_days,
       CASE WHEN s.delivered_at IS NULL THEN NULL ELSE (s.delivered_at AT TIME ZONE dc.tz)::date <= s.promised_date END AS is_on_time,
       CASE WHEN s.delivered_at IS NULL THEN NULL ELSE GREATEST(0, (s.delivered_at AT TIME ZONE dc.tz)::date - s.promised_date) END AS late_days,
       s.last_status, s.cost_usd,
       COALESCE(ev.has_exception, false) AS has_exception
FROM raw_carriers.shipments s
JOIN core.fact_order o ON o.order_number = s.order_ref
JOIN core.dim_country dc ON dc.country_code = s.dest_country
LEFT JOIN ev USING (tracking_no);
ALTER TABLE core.fact_shipment ADD PRIMARY KEY (tracking_no);
CREATE INDEX ON core.fact_shipment (order_id);
ANALYZE core.fact_shipment;

DROP TABLE IF EXISTS core.fact_shipment_event CASCADE;
CREATE TABLE core.fact_shipment_event AS SELECT * FROM raw_carriers.tracking_events;

-- Inventario (ledger) -----------------------------------------------------------
DROP TABLE IF EXISTS core.fact_inventory_movement CASCADE;
CREATE TABLE core.fact_inventory_movement AS
SELECT m.movement_id, m.warehouse_code, w.country_code, m.sku, k.product_code, m.movement_type, m.qty, m.moved_on, m.reference
FROM raw_wms.stock_movements m
JOIN core.dim_warehouse w USING (warehouse_code)
JOIN core.dim_sku k USING (sku);
CREATE INDEX ON core.fact_inventory_movement (warehouse_code, sku, moved_on);

-- Tráfico web (GA4 agregado) -----------------------------------------------------
DROP TABLE IF EXISTS core.fact_web_traffic_daily CASCADE;
CREATE TABLE core.fact_web_traffic_daily AS
SELECT to_date(g.date, 'YYYYMMDD') AS date,
       dc.country_code,
       g.device_category, g.session_source AS source, g.session_medium AS medium, g.session_campaign AS campaign,
       CASE
         WHEN g.session_medium = 'organic' THEN 'Búsqueda orgánica'
         WHEN g.session_medium = 'cpc' THEN 'Búsqueda pagada'
         WHEN g.session_medium = 'paid_social' THEN 'Social pagado'
         WHEN g.session_medium = 'crm' THEN 'Email'
         WHEN g.session_medium = 'referral' THEN 'Afiliados'
         WHEN g.session_source = '(direct)' THEN 'Directo'
         ELSE 'Otros' END AS channel_group,
       g.sessions, g.total_users, g.new_users, g.engaged_sessions, g.add_to_carts, g.checkouts,
       g.ecommerce_purchases AS purchases, g.purchase_revenue AS revenue_usd
FROM raw_ga4.daily_traffic g
JOIN core.dim_country dc ON dc.ga_country_name = g.country;

DROP TABLE IF EXISTS core.fact_web_event_sample CASCADE;
CREATE TABLE core.fact_web_event_sample AS
SELECT to_date(e.event_date, 'YYYYMMDD') AS event_date,
       to_timestamp(e.event_timestamp / 1e6) AS event_at,
       e.event_name, e.user_pseudo_id, e.ga_session_id, e.device_category, dc.country_code,
       e.traffic_source, e.traffic_medium, e.page_location, e.item_id, e.value_usd, e.transaction_id
FROM raw_ga4.events_sample e
JOIN core.dim_country dc ON dc.ga_country_name = e.geo_country;

-- Gasto en anuncios -----------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_ad_spend CASCADE;
CREATE TABLE core.fact_ad_spend AS
SELECT a.date, a.platform, a.country_code, a.campaign_id, a.campaign_name AS campaign,
       CASE a.platform WHEN 'google_ads' THEN 'google' WHEN 'meta_ads' THEN 'facebook' ELSE 'tiktok' END AS source,
       CASE a.platform WHEN 'google_ads' THEN 'cpc' ELSE 'paid_social' END AS medium,
       a.impressions, a.clicks, round(a.cost_micros / 1e6, 2) AS spend_usd
FROM raw_ads.daily_spend a;

-- Reseñas ---------------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_product_review CASCADE;
CREATE TABLE core.fact_product_review AS
SELECT r.review_id, r.product_code, r.sku, r.order_id, o.customer_key, o.country_code,
       r.rating, r.title, r.body, r.created_at, r.created_at::date AS review_date, r.verified_purchase, r.helpful_votes
FROM raw_reviews.product_reviews r
LEFT JOIN core.fact_order o USING (order_id);

DROP TABLE IF EXISTS core.fact_google_review CASCADE;
CREATE TABLE core.fact_google_review AS
SELECT g.review_id, g.location_id, l.location_name, l.location_type, l.country_code, l.city,
       CASE g.star_rating WHEN 'ONE' THEN 1 WHEN 'TWO' THEN 2 WHEN 'THREE' THEN 3 WHEN 'FOUR' THEN 4 WHEN 'FIVE' THEN 5 END AS rating,
       g.comment, g.create_time, g.create_time::date AS review_date, g.reply_comment IS NOT NULL AS has_reply,
       round(extract(epoch FROM g.reply_time - g.create_time) / 3600.0, 1) AS reply_hours
FROM raw_gbp.reviews g
JOIN raw_gbp.locations l USING (location_id);

-- Soporte ---------------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_support_ticket CASCADE;
CREATE TABLE core.fact_support_ticket AS
-- Vínculo al cliente: primero por el pedido del ticket; si no hay, por email (el más antiguo si hay homónimos)
SELECT t.ticket_id, o.order_id, COALESCE(o.customer_key, c.customer_key) AS customer_key, COALESCE(o.country_code, c.country_code) AS country_code,
       t.channel, t.category, t.subject, t.description, t.priority, t.status,
       t.created_at, t.created_at::date AS created_date, t.first_response_at, t.solved_at,
       round(extract(epoch FROM t.first_response_at - t.created_at) / 3600.0, 2) AS first_response_hours,
       round(extract(epoch FROM t.solved_at - t.created_at) / 3600.0, 2) AS resolution_hours,
       t.csat
FROM raw_helpdesk.tickets t
LEFT JOIN core.fact_order o ON o.order_number = t.order_number
LEFT JOIN LATERAL (
  SELECT customer_key, country_code FROM core.dim_customer dc
  WHERE dc.email = lower(trim(t.requester_email)) AND dc.is_buyer
  ORDER BY dc.customer_key LIMIT 1
) c ON o.order_id IS NULL;
ALTER TABLE core.fact_support_ticket ADD PRIMARY KEY (ticket_id);

-- NPS -------------------------------------------------------------------------------
DROP TABLE IF EXISTS core.fact_nps CASCADE;
CREATE TABLE core.fact_nps AS
SELECT n.response_id, n.contact_id, c.customer_key, c.country_code, n.score,
       CASE WHEN n.score >= 9 THEN 'promotor' WHEN n.score >= 7 THEN 'pasivo' ELSE 'detractor' END AS nps_group,
       n.comment, n.responded_at, n.responded_at::date AS response_date
FROM raw_crm.nps_responses n
-- un contacto CRM puede quedar vinculado a 2 clientes de la tienda (email compartido): tomar uno solo
LEFT JOIN LATERAL (
  SELECT customer_key, country_code FROM core.dim_customer d
  WHERE d.crm_contact_id = n.contact_id ORDER BY d.customer_key LIMIT 1
) c ON true;

-- Campañas de email ----------------------------------------------------------------------
DROP TABLE IF EXISTS core.dim_email_campaign CASCADE;
CREATE TABLE core.dim_email_campaign AS SELECT * FROM raw_crm.email_campaigns;
