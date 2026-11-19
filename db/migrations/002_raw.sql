-- Capa RAW: cada sistema con sus propios nombres, tipos y formatos.
-- Se mantienen "imperfecciones" típicas: emails con mayúsculas/espacios, montos en moneda local,
-- ratings como texto (GBP), timestamps en microsegundos (GA4), etc.

---------------------------------------------------------------- ERP
CREATE TABLE raw_erp.categories (
  category_id   int PRIMARY KEY,
  parent_id     int,
  name          text NOT NULL,
  level         int NOT NULL
);
CREATE TABLE raw_erp.suppliers (
  supplier_id     int PRIMARY KEY,
  supplier_name   text NOT NULL,
  country_code    text NOT NULL,
  lead_time_days  int NOT NULL
);
CREATE TABLE raw_erp.products (
  product_code   text PRIMARY KEY,
  product_name   text NOT NULL,
  description    text NOT NULL,
  category_id    int NOT NULL,
  brand          text NOT NULL,
  supplier_id    int NOT NULL,
  launch_date    date NOT NULL,
  status         text NOT NULL            -- ACTIVE / DISCONTINUED
);
CREATE TABLE raw_erp.skus (
  sku              text PRIMARY KEY,
  product_code     text NOT NULL,
  variant_label    text,
  list_price_usd   numeric(12,2) NOT NULL,
  unit_cost_usd    numeric(12,2) NOT NULL,
  weight_kg        numeric(8,3) NOT NULL
);
CREATE TABLE raw_erp.fx_rates (
  rate_date      date NOT NULL,
  currency       text NOT NULL,
  units_per_usd  numeric(18,6) NOT NULL,
  PRIMARY KEY (rate_date, currency)
);

---------------------------------------------------------------- WMS
CREATE TABLE raw_wms.warehouses (
  warehouse_code  text PRIMARY KEY,
  warehouse_name  text NOT NULL,
  country_code    text NOT NULL,
  city            text NOT NULL
);
CREATE TABLE raw_wms.stock_movements (
  movement_id     bigserial PRIMARY KEY,
  warehouse_code  text NOT NULL,
  sku             text NOT NULL,
  movement_type   text NOT NULL,   -- OPENING / RECEIPT / PICK / RETURN_RESTOCK
  qty             int NOT NULL,    -- con signo
  moved_on        date NOT NULL,
  reference       text
);

---------------------------------------------------------------- CRM
CREATE TABLE raw_crm.contacts (
  contact_id         text PRIMARY KEY,   -- CRM-0000001
  email              text,
  first_name         text,
  last_name          text,
  phone              text,
  country            text,               -- nombre del país, no código
  state              text,
  city               text,
  birth_date         date,
  gender             text,
  created_at         timestamptz NOT NULL,
  marketing_opt_in   boolean NOT NULL,
  lifecycle_stage    text NOT NULL,      -- lead / customer / vip / churn_risk
  loyalty_tier       text                -- bronze / silver / gold / platinum
);
CREATE TABLE raw_crm.email_campaigns (
  campaign_id     text PRIMARY KEY,
  campaign_name   text NOT NULL,
  sent_at         timestamptz NOT NULL,
  target_segment  text NOT NULL,
  sends           int NOT NULL,
  opens           int NOT NULL,
  clicks          int NOT NULL,
  utm_campaign    text NOT NULL
);
CREATE TABLE raw_crm.nps_responses (
  response_id    bigint PRIMARY KEY,
  contact_id     text NOT NULL,
  score          int NOT NULL,
  comment        text,
  responded_at   timestamptz NOT NULL
);

---------------------------------------------------------------- SHOP (OMS)
CREATE TABLE raw_shop.customers (
  shop_customer_id  bigint PRIMARY KEY,
  email             text NOT NULL,
  created_at        timestamptz NOT NULL,
  country_code      text NOT NULL,
  accepts_marketing boolean NOT NULL
);
CREATE TABLE raw_shop.orders (
  order_id          bigint PRIMARY KEY,
  order_number      text NOT NULL,
  shop_customer_id  bigint NOT NULL,
  created_at        timestamptz NOT NULL,
  status            text NOT NULL,     -- payment_failed / cancelled / paid / shipped / delivered
  channel           text NOT NULL,     -- web / app / marketplace
  device            text,              -- desktop / mobile / ios / android
  country_code      text NOT NULL,
  state             text NOT NULL,
  city              text NOT NULL,
  currency          text NOT NULL,
  subtotal          numeric(14,2) NOT NULL,   -- impuestos incluidos, moneda local
  discount          numeric(14,2) NOT NULL,
  shipping_fee      numeric(14,2) NOT NULL,
  tax_included      numeric(14,2) NOT NULL,
  total             numeric(14,2) NOT NULL,
  coupon_code       text,
  utm_source        text,
  utm_medium        text,
  utm_campaign      text,
  ga_client_id      text,
  warehouse_code    text NOT NULL,
  paid_at           timestamptz,
  cancelled_at      timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz
);
CREATE TABLE raw_shop.order_items (
  order_id     bigint NOT NULL,
  line_no      int NOT NULL,
  sku          text NOT NULL,
  qty          int NOT NULL,
  unit_price   numeric(14,2) NOT NULL,   -- moneda local, impuestos incluidos
  line_discount numeric(14,2) NOT NULL,
  PRIMARY KEY (order_id, line_no)
);
CREATE TABLE raw_shop.returns (
  return_id      bigint PRIMARY KEY,
  order_id       bigint NOT NULL,
  line_no        int NOT NULL,
  sku            text NOT NULL,
  qty            int NOT NULL,
  reason         text NOT NULL,
  requested_at   timestamptz NOT NULL,
  received_at    timestamptz,
  refund_amount  numeric(14,2),   -- moneda local
  status         text NOT NULL    -- requested / received / refunded / rejected
);

---------------------------------------------------------------- PAGOS
CREATE TABLE raw_payments.transactions (
  txn_id        text PRIMARY KEY,
  order_ref     text NOT NULL,          -- order_number del OMS
  kind          text NOT NULL,          -- charge / refund / chargeback
  method        text NOT NULL,          -- card / debit / wallet / bank_transfer / cash_voucher / bnpl
  gateway       text NOT NULL,
  status        text NOT NULL,          -- succeeded / failed
  failure_code  text,
  amount_minor  bigint NOT NULL,        -- centavos (unidades menores)
  currency      text NOT NULL,
  created_at    timestamptz NOT NULL
);

---------------------------------------------------------------- TRANSPORTISTAS
CREATE TABLE raw_carriers.shipments (
  tracking_no     text PRIMARY KEY,
  carrier         text NOT NULL,
  order_ref       text NOT NULL,
  origin_wh       text NOT NULL,
  dest_country    text NOT NULL,
  dest_state      text NOT NULL,
  dest_city       text NOT NULL,
  service_level   text NOT NULL,        -- standard / express
  shipped_at      timestamptz NOT NULL,
  promised_date   date NOT NULL,
  delivered_at    timestamptz,
  last_status     text NOT NULL,        -- IN_TRANSIT / DELIVERED / EXCEPTION
  cost_usd        numeric(10,2) NOT NULL
);
CREATE TABLE raw_carriers.tracking_events (
  tracking_no  text NOT NULL,
  event_seq    int NOT NULL,
  event_code   text NOT NULL,           -- PICKED_UP / IN_TRANSIT / OUT_FOR_DELIVERY / DELIVERED / EXCEPTION
  event_at     timestamptz NOT NULL,
  location     text,
  note         text,
  PRIMARY KEY (tracking_no, event_seq)
);

---------------------------------------------------------------- GA4
-- Agregado diario estilo Data API (sesiones totales, sin muestreo)
CREATE TABLE raw_ga4.daily_traffic (
  date                text NOT NULL,    -- 'YYYYMMDD' como lo devuelve GA
  session_source      text NOT NULL,
  session_medium      text NOT NULL,
  session_campaign    text NOT NULL,
  device_category     text NOT NULL,    -- desktop / mobile / tablet / app
  country             text NOT NULL,    -- nombre del país en inglés
  sessions            int NOT NULL,
  total_users         int NOT NULL,
  new_users           int NOT NULL,
  engaged_sessions    int NOT NULL,
  add_to_carts        int NOT NULL,
  checkouts           int NOT NULL,
  ecommerce_purchases int NOT NULL,
  purchase_revenue    numeric(14,2) NOT NULL   -- USD
);
-- Export de eventos (BigQuery-like) para una muestra de sesiones
CREATE TABLE raw_ga4.events_sample (
  event_date        text NOT NULL,
  event_timestamp   bigint NOT NULL,   -- microsegundos epoch
  event_name        text NOT NULL,
  user_pseudo_id    text NOT NULL,
  ga_session_id     bigint NOT NULL,
  device_category   text NOT NULL,
  geo_country       text NOT NULL,
  traffic_source    text NOT NULL,
  traffic_medium    text NOT NULL,
  page_location     text,
  item_id           text,
  value_usd         numeric(12,2),
  transaction_id    text
);

---------------------------------------------------------------- ADS
CREATE TABLE raw_ads.daily_spend (
  platform       text NOT NULL,     -- google_ads / meta_ads / tiktok_ads
  date           date NOT NULL,
  campaign_id    text NOT NULL,
  campaign_name  text NOT NULL,
  country_code   text NOT NULL,
  impressions    bigint NOT NULL,
  clicks         int NOT NULL,
  cost_micros    bigint NOT NULL,   -- USD * 1e6 (estilo Google Ads)
  PRIMARY KEY (platform, date, campaign_id, country_code)
);

---------------------------------------------------------------- GOOGLE BUSINESS PROFILE
CREATE TABLE raw_gbp.locations (
  location_id    text PRIMARY KEY,
  location_name  text NOT NULL,
  country_code   text NOT NULL,
  city           text NOT NULL,
  location_type  text NOT NULL       -- pickup_point / showroom / warehouse_store
);
CREATE TABLE raw_gbp.reviews (
  review_id       text PRIMARY KEY,
  location_id     text NOT NULL,
  reviewer_name   text NOT NULL,
  star_rating     text NOT NULL,      -- 'ONE'..'FIVE' como la API de GBP
  comment         text,
  create_time     timestamptz NOT NULL,
  reply_comment   text,
  reply_time      timestamptz
);

---------------------------------------------------------------- RESEÑAS DE PRODUCTO
CREATE TABLE raw_reviews.product_reviews (
  review_id          bigint PRIMARY KEY,
  product_code       text NOT NULL,
  sku                text,
  order_id           bigint,
  shop_customer_id   bigint,
  rating             int NOT NULL,
  title              text,
  body               text NOT NULL,
  created_at         timestamptz NOT NULL,
  verified_purchase  boolean NOT NULL,
  helpful_votes      int NOT NULL
);

---------------------------------------------------------------- HELPDESK
CREATE TABLE raw_helpdesk.tickets (
  ticket_id          bigint PRIMARY KEY,
  requester_email    text NOT NULL,
  order_number       text,
  channel            text NOT NULL,     -- email / chat / whatsapp / phone
  category           text NOT NULL,
  subject            text NOT NULL,
  description        text NOT NULL,
  priority           text NOT NULL,
  status             text NOT NULL,     -- open / pending / solved / closed
  created_at         timestamptz NOT NULL,
  first_response_at  timestamptz,
  solved_at          timestamptz,
  csat               int                -- 1..5, opcional
);
