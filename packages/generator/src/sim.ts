import { fakerES_MX as faker } from '@faker-js/faker';
import type { Catalog, Product } from './catalog.js';
import { DAY_MS, END, EXTRACTED_AT, START, STORIES, dayDate, inWindow, isPromoDay, seasonality, ymd, type ScaleConfig } from './config.js';
import type { WriterSet } from './copy.js';
import {
  CARRIER_OFFSET, COUNTRIES, DEVICES, GBP_LOCATIONS, MX_NORTH, PAYMENT_METHODS, RETURN_REASONS, TRAFFIC_SOURCES, WAREHOUSES,
  type Country, type TrafficSource,
} from './reference.js';
import { Rng, Weighted, weighted } from './rng.js';
import { gbpReply, gbpText, npsComment, reviewText, ticketText } from './text.js';

interface Customer {
  id: number;
  ci: number; // índice de país
  region: string;
  city: string;
  first: string;
  last: string;
  email: string;
  gender: string;
  birth: Date;
  acceptsMk: boolean;
  createdAt: Date;
  weight: number;
  churnDay: number;
  orders: number;
  spendUsd: number;
  lastOrderDay: number;
  ordersLast365: number;
}

const NOW = EXTRACTED_AT.getTime();
const HOUR = 3_600_000;
const EMAIL_DOMAINS = weighted([['gmail.com', 0.55], ['hotmail.com', 0.17], ['outlook.com', 0.1], ['yahoo.com', 0.08], ['icloud.com', 0.06], ['live.com', 0.04]] as const);
const HOUR_W = new Weighted(
  Array.from({ length: 24 }, (_, h) => h),
  [0.6, 0.35, 0.2, 0.15, 0.15, 0.25, 0.6, 1.1, 1.6, 2.0, 2.3, 2.6, 2.9, 2.8, 2.5, 2.3, 2.2, 2.3, 2.6, 3.0, 3.4, 3.5, 2.8, 1.6],
);
const N_LINES = weighted([[1, 0.36], [2, 0.27], [3, 0.17], [4, 0.1], [5, 0.06], [6, 0.04]] as const);
const METHODS = weighted(PAYMENT_METHODS);
const FAIL_CODES = weighted([['card_declined', 0.4], ['insufficient_funds', 0.3], ['do_not_honor', 0.15], ['fraud_suspected', 0.05], ['gateway_timeout', 0.1]] as const);

function strip(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}
function money(v: number, integer: boolean): number {
  return integer ? Math.round(v) : Math.round(v * 100) / 100;
}
function m2(v: number): string {
  return v.toFixed(2);
}

export interface SimResult {
  customers: Customer[];
  buyers: number;
}

export async function simulate(rng: Rng, cfg: ScaleConfig, cat: Catalog, w: WriterSet): Promise<SimResult> {
  faker.seed(42);
  const firstNames = Array.from({ length: 400 }, () => faker.person.firstName());
  const lastNames = Array.from({ length: 400 }, () => faker.person.lastName());

  /* ------------------------------------------------------------ writers */
  const W = {
    fx: w.get('raw_erp.fx_rates', ['rate_date', 'currency', 'units_per_usd']),
    wh: w.get('raw_wms.warehouses', ['warehouse_code', 'warehouse_name', 'country_code', 'city']),
    cust: w.get('raw_shop.customers', ['shop_customer_id', 'email', 'created_at', 'country_code', 'accepts_marketing']),
    ord: w.get('raw_shop.orders', [
      'order_id', 'order_number', 'shop_customer_id', 'created_at', 'status', 'channel', 'device', 'country_code', 'state', 'city', 'currency',
      'subtotal', 'discount', 'shipping_fee', 'tax_included', 'total', 'coupon_code', 'utm_source', 'utm_medium', 'utm_campaign', 'ga_client_id',
      'warehouse_code', 'paid_at', 'cancelled_at', 'shipped_at', 'delivered_at',
    ]),
    item: w.get('raw_shop.order_items', ['order_id', 'line_no', 'sku', 'qty', 'unit_price', 'line_discount']),
    ret: w.get('raw_shop.returns', ['return_id', 'order_id', 'line_no', 'sku', 'qty', 'reason', 'requested_at', 'received_at', 'refund_amount', 'status']),
    txn: w.get('raw_payments.transactions', ['txn_id', 'order_ref', 'kind', 'method', 'gateway', 'status', 'failure_code', 'amount_minor', 'currency', 'created_at']),
    ship: w.get('raw_carriers.shipments', [
      'tracking_no', 'carrier', 'order_ref', 'origin_wh', 'dest_country', 'dest_state', 'dest_city', 'service_level', 'shipped_at', 'promised_date',
      'delivered_at', 'last_status', 'cost_usd',
    ]),
    trk: w.get('raw_carriers.tracking_events', ['tracking_no', 'event_seq', 'event_code', 'event_at', 'location', 'note']),
    ga: w.get('raw_ga4.daily_traffic', [
      'date', 'session_source', 'session_medium', 'session_campaign', 'device_category', 'country', 'sessions', 'total_users', 'new_users',
      'engaged_sessions', 'add_to_carts', 'checkouts', 'ecommerce_purchases', 'purchase_revenue',
    ]),
    gaEv: w.get('raw_ga4.events_sample', [
      'event_date', 'event_timestamp', 'event_name', 'user_pseudo_id', 'ga_session_id', 'device_category', 'geo_country', 'traffic_source',
      'traffic_medium', 'page_location', 'item_id', 'value_usd', 'transaction_id',
    ]),
    ads: w.get('raw_ads.daily_spend', ['platform', 'date', 'campaign_id', 'campaign_name', 'country_code', 'impressions', 'clicks', 'cost_micros']),
    rev: w.get('raw_reviews.product_reviews', [
      'review_id', 'product_code', 'sku', 'order_id', 'shop_customer_id', 'rating', 'title', 'body', 'created_at', 'verified_purchase', 'helpful_votes',
    ]),
    tkt: w.get('raw_helpdesk.tickets', [
      'ticket_id', 'requester_email', 'order_number', 'channel', 'category', 'subject', 'description', 'priority', 'status', 'created_at',
      'first_response_at', 'solved_at', 'csat',
    ]),
    nps: w.get('raw_crm.nps_responses', ['response_id', 'contact_id', 'score', 'comment', 'responded_at']),
    gbpLoc: w.get('raw_gbp.locations', ['location_id', 'location_name', 'country_code', 'city', 'location_type']),
    gbpRev: w.get('raw_gbp.reviews', ['review_id', 'location_id', 'reviewer_name', 'star_rating', 'comment', 'create_time', 'reply_comment', 'reply_time']),
    emailCamp: w.get('raw_crm.email_campaigns', ['campaign_id', 'campaign_name', 'sent_at', 'target_segment', 'sends', 'opens', 'clicks', 'utm_campaign']),
  };

  for (const wh of WAREHOUSES) W.wh.push([wh.code, wh.name, wh.country, wh.city]);
  for (const l of GBP_LOCATIONS) W.gbpLoc.push([l.id, l.name, l.country, l.city, l.type]);

  const nDays = Math.round((END.getTime() - START.getTime()) / DAY_MS);

  /* ------------------------------------------------------------ tipos de cambio */
  const fx: number[][] = COUNTRIES.map(() => new Array(nDays));
  COUNTRIES.forEach((c, ci) => {
    let r = c.fx0;
    const drift = Math.log(1 + c.fxDriftYear) / 365;
    for (let d = 0; d < nDays; d++) {
      r *= Math.exp(drift + rng.normal(0, c.fxVol));
      fx[ci][d] = r;
      W.fx.push([ymd(dayDate(d)), c.currency, r.toFixed(6)]);
    }
  });

  /* ------------------------------------------------------------ campañas de email (CRM) */
  const emailByDay: string[] = new Array(nDays).fill('newsletter_semanal');
  {
    let id = 1;
    for (let d = 0; d < nDays; d++) {
      const date = dayDate(d);
      const isTue = date.getUTCDay() === 2;
      const promo = isPromoDay(date) && rng.chance(0.6);
      if (!isTue && !promo) continue;
      const theme = promo ? rng.pick(['black_friday', 'cyber', 'hot_sale', 'ultimas_horas']) : rng.pick(['newsletter', 'novedades', 'ofertas_semana', 'categoria_destacada', 'recompra']);
      const utm = `${theme}_${ymd(date).replace(/-/g, '')}`;
      const sends = Math.round(rng.float(0.5, 0.9) * cfg.targetOrders * 0.25);
      const opens = Math.round(sends * rng.float(0.18, 0.32));
      const clicks = Math.round(opens * rng.float(0.06, 0.14));
      W.emailCamp.push([`EM-${String(id++).padStart(5, '0')}`, `${theme.replace(/_/g, ' ')} ${ymd(date)}`, new Date(date.getTime() + 10 * HOUR), promo ? 'all_opt_in' : rng.pick(['all_opt_in', 'vip', 'dormidos_90d', 'compradores_recientes']), sends, opens, clicks, utm]);
      for (let k = 0; k < 7 && d + k < nDays; k++) emailByDay[d + k] = utm;
    }
  }

  /* ------------------------------------------------------------ factores diarios */
  const growth = (d: number) => Math.pow(1.33, d / 365);
  const factors = Array.from({ length: nDays }, (_, d) => seasonality(dayDate(d)) * growth(d));
  const totalF = factors.reduce((a, b) => a + b, 0);
  const base = cfg.targetOrders / totalF;
  const countryW = new Weighted(COUNTRIES.map((_, i) => i), COUNTRIES.map((c) => c.share));
  const regionW = COUNTRIES.map((c) => new Weighted(c.regions, c.regions.map((r) => r.w)));
  const carrierW = COUNTRIES.map((c) => weighted(c.carriers));

  /* ------------------------------------------------------------ clientes */
  const customers: Customer[] = [];
  const pools: Customer[][] = COUNTRIES.map(() => []);
  function newCustomer(ci: number, day: number, at: Date): Customer {
    const c = COUNTRIES[ci];
    const region = regionW[ci].sample(rng);
    const first = rng.pick(firstNames);
    const last = rng.pick(lastNames);
    const id = customers.length + 1;
    const email = `${strip(first)}${rng.chance(0.5) ? '.' : ''}${strip(last)}${rng.chance(0.7) ? rng.int(1, 9999) : ''}${id % 97}@${EMAIL_DOMAINS.sample(rng)}`;
    const cust: Customer = {
      id, ci, region: region.name, city: rng.pick(region.cities), first, last, email,
      gender: rng.chance(0.52) ? 'F' : rng.chance(0.96) ? 'M' : 'X',
      birth: new Date(Date.UTC(rng.int(1958, 2006), rng.int(0, 11), rng.int(1, 28))),
      acceptsMk: rng.chance(0.62), createdAt: at,
      weight: Math.min(8, Math.max(0.08, rng.lognormal(0, 0.95))),
      churnDay: day + Math.round(rng.exp(520)),
      orders: 0, spendUsd: 0, lastOrderDay: day, ordersLast365: 0,
    };
    customers.push(cust);
    pools[ci].push(cust);
    W.cust.push([id, rng.chance(0.04) ? ` ${email}` : email, at, c.code, cust.acceptsMk]);
    return cust;
  }
  function pickReturning(ci: number, day: number): Customer | null {
    const pool = pools[ci];
    if (pool.length < 50) return null;
    for (let t = 0; t < 60; t++) {
      const c = pool[Math.floor(rng.next() * pool.length)];
      if (c.churnDay < day || c.lastOrderDay === day) continue;
      if (rng.next() * 8 < c.weight) return c;
    }
    return null;
  }

  /* ------------------------------------------------------------ contadores */
  let orderId = 0;
  let returnId = 0;
  let reviewId = 0;
  let ticketId = 0;
  let npsId = 0;
  let txnSeq = 0;
  let trkSeq = 0;
  let gbpId = 0;
  const pendingLast365: Array<[number, Customer]> = []; // para clientes frecuentes

  const story = STORIES;
  const nextTxn = () => `txn_${(++txnSeq).toString(36).padStart(8, '0')}`;

  /* ------------------------------------------------------------ bucle diario */
  for (let d = 0; d < nDays; d++) {
    const date = dayDate(d);
    const ds = ymd(date);
    const promo = isPromoDay(date);
    const expectedDay = base * factors[d];
    const appShift = Math.min(0.06, d / nDays * 0.06);
    const gaAgg = new Map<string, { orders: number; revenue: number; orderNums: string[]; src: TrafficSource; ci: number; ga: string; expOrders: number; convAdj: number }>();

    for (let ci = 0; ci < COUNTRIES.length; ci++) {
      const country = COUNTRIES[ci];
      const expCountry = expectedDay * country.share;
      for (const dev of DEVICES) {
        let devShare = dev.share;
        if (dev.channel === 'app') devShare += appShift / 2;
        if (dev.device === 'mobile') devShare -= appShift;
        const sources: Array<TrafficSource | null> = dev.channel === 'marketplace' ? [null] : TRAFFIC_SOURCES;
        for (const src of sources) {
          if (src?.active && !inWindow(date, src.active[0], src.active[1])) continue;
          const expOrders = expCountry * devShare * (src ? src.orderShare : 1);
          let storyF = 1;
          if (dev.device === 'mobile' && inWindow(date, story.mobileCheckoutBug.from, story.mobileCheckoutBug.to)) storyF *= story.mobileCheckoutBug.convFactor;
          const n = rng.poisson(expOrders * storyF * rng.lognormal(0, 0.06));
          let agg = null as null | { orders: number; revenue: number; orderNums: string[]; src: TrafficSource; ci: number; ga: string; expOrders: number; convAdj: number };
          if (src && dev.ga) {
            const key = `${ci}|${dev.ga}|${src.source}|${src.medium}|${src.campaign}`;
            agg = gaAgg.get(key) ?? null;
            if (!agg) {
              agg = { orders: 0, revenue: 0, orderNums: [], src, ci, ga: dev.ga, expOrders: 0, convAdj: dev.convMult };
              gaAgg.set(key, agg);
            }
            agg.expOrders += expOrders;
          }
          for (let k = 0; k < n; k++) {
            const o = createOrder(d, date, ci, country, dev, src, promo);
            if (o && agg) {
              agg.orders++;
              agg.revenue += o.totalUsd;
              agg.orderNums.push(o.number);
            }
          }
        }
      }
    }

    /* ---------- GA4 agregado + muestra de eventos + gasto en anuncios ---------- */
    const adsAgg = new Map<string, { src: TrafficSource; ci: number; clicks: number }>();
    for (const a of gaAgg.values()) {
      const conv = a.src.conv * a.convAdj * (a.src.campaign === '(direct)' ? 1 : 1);
      const sessions = Math.max(a.orders, Math.round((a.expOrders / conv) * rng.lognormal(0, 0.05)));
      if (sessions === 0) continue;
      const users = Math.round(sessions * rng.float(0.78, 0.9));
      const newUsers = Math.round(users * (a.src.medium === 'paid_social' ? 0.7 : a.src.medium === 'crm' ? 0.1 : 0.4));
      const engaged = Math.round(sessions * rng.float(0.45, 0.7));
      const purchases = rng.binomial(a.orders, 0.965); // ~3.5% de pérdida de tracking
      const checkouts = Math.max(purchases, Math.round(a.orders / rng.float(0.42, 0.55)));
      const atc = Math.max(checkouts, Math.round(checkouts / rng.float(0.35, 0.5)));
      W.ga.push([
        ds.replace(/-/g, ''), a.src.source, a.src.medium, a.src.campaign === '__email__' ? emailByDay[d] : a.src.campaign, a.ga,
        COUNTRIES[a.ci].gaName, sessions, users, newUsers, engaged, atc, checkouts, purchases, m2(a.revenue * (purchases / Math.max(1, a.orders))),
      ]);
      if (a.src.platform) {
        const key = `${a.src.campaign}|${a.ci}`;
        const x = adsAgg.get(key) ?? { src: a.src, ci: a.ci, clicks: 0 };
        x.clicks += Math.round(sessions * rng.float(1.02, 1.12));
        adsAgg.set(key, x);
      }
      // muestra de eventos
      const sampled = rng.binomial(sessions, cfg.gaSampleRate);
      for (let s = 0; s < sampled; s++) emitSampleSession(date, a, s < a.orderNums.length && rng.chance(0.9) ? a.orderNums[s] : null);
    }
    for (const x of adsAgg.values()) {
      const c = COUNTRIES[x.ci];
      const cpc = x.src.cpc! * rng.lognormal(0, 0.08) * (c.code === 'AR' ? 0.75 : c.code === 'MX' ? 1.1 : 1) * (promo ? 1.35 : 1);
      const impressions = Math.round(x.clicks / (x.src.ctr! * rng.lognormal(0, 0.1)));
      W.ads.push([x.src.platform, ds, `${x.src.platform!.slice(0, 2)}-${x.src.campaign}-${c.code}`.toLowerCase(), x.src.campaign, c.code, impressions, x.clicks, Math.round(x.clicks * cpc * 1e6)]);
    }

    /* ---------- reseñas de Google Business Profile ---------- */
    for (const loc of GBP_LOCATIONS) {
      const n = rng.poisson((cfg.gbpReviewsPerLocationWeek / 7) * Math.sqrt(growth(d)));
      for (let k = 0; k < n; k++) {
        const isStory = loc.id === 'GBP-CO-MED' && inWindow(date, story.carrierDelay.from, story.carrierDelay.to);
        const stars = isStory ? (rng.chance(0.6) ? rng.int(1, 2) : rng.int(3, 5)) : weighted([[5, 0.52], [4, 0.22], [3, 0.1], [2, 0.06], [1, 0.1]] as const).sample(rng);
        const at = new Date(date.getTime() + HOUR_W.sample(rng) * HOUR + rng.int(0, 3599) * 1000);
        const reply = gbpReply(rng, stars);
        W.gbpRev.push([
          `gbp_${(++gbpId).toString(36)}`, loc.id, `${rng.pick(firstNames)} ${rng.pick(lastNames).charAt(0)}.`,
          ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'][stars - 1], gbpText(rng, stars, isStory), at, reply,
          reply ? new Date(Math.min(NOW - 1000, at.getTime() + rng.int(2, 96) * HOUR)) : null,
        ]);
      }
    }

    if (d % 30 === 0) process.stdout.write(`\r  día ${d}/${nDays} (${ds}) pedidos=${orderId} clientes=${customers.length}   `);
    await w.flushIfNeeded();
  }
  process.stdout.write('\n');

  return { customers, buyers: customers.length };

  /* ================================================================ helpers */

  function emitSampleSession(date: Date, a: { src: TrafficSource; ci: number; ga: string }, orderNumber: string | null) {
    const sid = rng.int(1_000_000_000, 1_999_999_999);
    const user = `${rng.int(100000000, 999999999)}.${Math.floor(date.getTime() / 1000)}`;
    let t = date.getTime() + HOUR_W.sample(rng) * HOUR + rng.int(0, 3599) * 1000;
    const country = COUNTRIES[a.ci].gaName;
    const ev = (name: string, page: string | null, item: string | null, value: number | null, tx: string | null) => {
      t += rng.int(3, 90) * 1000;
      W.gaEv.push([ymd(date).replace(/-/g, ''), t * 1000, name, user, sid, a.ga, country, a.src.source, a.src.medium, page, item, value === null ? null : m2(value), tx]);
    };
    ev('session_start', 'https://www.mercadia.example/', null, null, null);
    const views = rng.int(1, 6);
    let lastItem: Product | null = null;
    for (let i = 0; i < views; i++) {
      if (rng.chance(0.55)) {
        lastItem = cat.popularity.sample(rng);
        ev('view_item', `https://www.mercadia.example/p/${lastItem.code.toLowerCase()}`, lastItem.code, lastItem.skus[0].priceUsd, null);
      } else ev('page_view', `https://www.mercadia.example/${rng.pick(['', 'c/ofertas', 'c/moda', 'c/electronica', 'c/hogar', 'buscar', 'c/belleza'])}`, null, null, null);
    }
    if (lastItem && (orderNumber || rng.chance(0.12))) {
      ev('add_to_cart', null, lastItem.code, lastItem.skus[0].priceUsd, null);
      if (orderNumber || rng.chance(0.4)) {
        ev('begin_checkout', 'https://www.mercadia.example/checkout', null, null, null);
        if (orderNumber) ev('purchase', 'https://www.mercadia.example/checkout/gracias', null, lastItem.skus[0].priceUsd, orderNumber);
      }
    }
  }

  function createOrder(d: number, date: Date, ci: number, country: Country, dev: (typeof DEVICES)[number], src: TrafficSource | null, promo: boolean) {
    const pNew = 0.42 - (d / nDays) * 0.1;
    let cust = rng.chance(pNew) ? null : pickReturning(ci, d);
    // hora local del país → UTC
    let createdMs = date.getTime() + (HOUR_W.sample(rng) + country.utcOffset) * HOUR + rng.int(0, 3599) * 1000;
    if (createdMs >= NOW - HOUR) createdMs = NOW - rng.int(2, 6) * HOUR;
    const created = new Date(createdMs);
    if (!cust) cust = newCustomer(ci, d, new Date(created.getTime() - rng.int(60, 7200) * 1000));
    const fxr = fx[ci][d];

    /* líneas */
    const nLines = N_LINES.sample(rng);
    const lines: Array<{ p: Product; sku: string; qty: number; unit: number; disc: number; usd: number }> = [];
    const usedSku = new Set<string>();
    for (let li = 0; li < nLines; li++) {
      let p: Product | null = null;
      for (let t = 0; t < 6; t++) {
        const cand = cat.popularity.sample(rng);
        if (cand.launchDay > d) continue;
        if (cand.isStar && inWindow(date, story.starProduct.stockoutFrom, story.starProduct.stockoutTo)) continue;
        p = cand;
        break;
      }
      if (!p) continue;
      const s = rng.pick(p.skus);
      if (usedSku.has(s.sku)) continue;
      usedSku.add(s.sku);
      const qty = rng.chance(p.l1.qtyBias) ? rng.int(2, 4) : rng.chance(0.08) ? 2 : 1;
      const unit = money(s.priceUsd * fxr, country.integerCurrency);
      const discPct = promo ? (rng.chance(0.45) ? rng.float(0.15, 0.35) : 0) : rng.chance(0.07) ? 0.1 : 0;
      const disc = money(unit * qty * discPct, country.integerCurrency);
      lines.push({ p, sku: s.sku, qty, unit, disc, usd: (unit * qty - disc) / fxr });
    }
    if (!lines.length) return null;

    const id = ++orderId;
    const number = `${country.code}-${(100000 + id).toString()}`;
    const subtotal = lines.reduce((a, l) => a + l.unit * l.qty - l.disc, 0);
    const subtotalUsd = subtotal / fxr;
    let coupon: string | null = null;
    let discPct = 0;
    if (cust.orders === 0 && rng.chance(0.3)) [coupon, discPct] = ['BIENVENIDA10', 0.1];
    else if (promo && rng.chance(0.35)) [coupon, discPct] = [date.getUTCMonth() === 4 ? 'HOTSALE15' : 'BLACK20', date.getUTCMonth() === 4 ? 0.15 : 0.2];
    else if (rng.chance(0.05)) [coupon, discPct] = ['VUELVE15', 0.15];
    const discount = money(subtotal * discPct, country.integerCurrency);
    const shipping = subtotalUsd >= 49 || dev.channel === 'marketplace' ? 0 : money(4.99 * fxr, country.integerCurrency);
    const total = money(subtotal - discount + shipping, country.integerCurrency);
    const taxIncl = money(((subtotal - discount) * country.vat) / (1 + country.vat), country.integerCurrency);
    const totalUsd = total / fxr;
    const warehouse = country.code === 'MX' ? (MX_NORTH.has(cust.region) ? 'WH-MX-02' : 'WH-MX-01') : `WH-${country.code}-01`;

    /* pagos */
    const method = METHODS.sample(rng);
    const gateway = method === 'card' || method === 'debit' ? country.cardGateway : method === 'wallet' ? 'Kuanto Wallet' : 'Pagora';
    let failP = method === 'card' ? 0.045 : 0.02;
    const outage = gateway === story.gatewayOutage.gateway && inWindow(date, story.gatewayOutage.from, story.gatewayOutage.to) && (method === 'card' || method === 'debit');
    if (outage) failP = story.gatewayOutage.failRate;
    const minorMult = country.code === 'CL' ? 1 : 100;
    let t = created.getTime() + rng.int(20, 240) * 1000;
    let paidAt: Date | null = null;
    if (rng.chance(failP)) {
      W.txn.push([nextTxn(), number, 'charge', method, gateway, 'failed', outage && rng.chance(0.7) ? 'gateway_timeout' : FAIL_CODES.sample(rng), Math.round(total * minorMult), country.currency, new Date(t)]);
      if (rng.chance(0.55)) {
        t += rng.int(60, 1800) * 1000;
        const m2nd = rng.chance(0.6) ? method : 'wallet';
        W.txn.push([nextTxn(), number, 'charge', m2nd, m2nd === 'wallet' ? 'Kuanto Wallet' : gateway, 'succeeded', null, Math.round(total * minorMult), country.currency, new Date(t)]);
        paidAt = new Date(t);
      }
    } else {
      // vouchers en efectivo y transferencias se acreditan horas después
      if (method === 'cash_voucher' || method === 'bank_transfer') t += rng.int(1, 30) * HOUR;
      if (t < NOW) {
        W.txn.push([nextTxn(), number, 'charge', method, gateway, 'succeeded', null, Math.round(total * minorMult), country.currency, new Date(t)]);
        paidAt = new Date(t);
      }
    }

    let status = paidAt ? 'paid' : 'payment_failed';
    let cancelledAt: Date | null = null;
    let shippedAt: Date | null = null;
    let deliveredAt: Date | null = null;
    let carrier = '';
    let promised = '';
    let lateDays = 0;

    if (paidAt && rng.chance(0.035)) {
      cancelledAt = new Date(paidAt.getTime() + rng.int(1, 30) * HOUR);
      if (cancelledAt.getTime() < NOW) {
        status = 'cancelled';
        W.txn.push([nextTxn(), number, 'refund', method, gateway, 'succeeded', null, Math.round(total * minorMult), country.currency, new Date(cancelledAt.getTime() + rng.int(1, 48) * HOUR)]);
      } else cancelledAt = null;
    }

    if (status === 'paid') {
      const handling = (promo ? rng.float(1, 3.5) : rng.float(0.3, 1.6)) * DAY_MS;
      const sh = paidAt!.getTime() + handling;
      if (sh < NOW) {
        shippedAt = new Date(sh);
        status = 'shipped';
        carrier = carrierW[ci].sample(rng);
        const express = rng.chance(0.18);
        const promiseDays = country.baseDeliveryDays + (express ? 0 : 1);
        const promisedDate = new Date(Date.UTC(shippedAt.getUTCFullYear(), shippedAt.getUTCMonth(), shippedAt.getUTCDate()) + promiseDays * DAY_MS);
        promised = ymd(promisedDate);
        let transit = Math.max(0.6, rng.normal(country.baseDeliveryDays - (express ? 1 : 0) + CARRIER_OFFSET[carrier], 1.1));
        if (promo || date.getUTCMonth() === 11) transit += rng.float(0.5, 2);
        const delayStory = carrier === story.carrierDelay.carrier && country.code === story.carrierDelay.country && inWindow(shippedAt, story.carrierDelay.from, story.carrierDelay.to);
        if (delayStory) transit += Math.max(0, rng.normal(story.carrierDelay.extraDays, 1.5));
        const exception = rng.chance(0.012);
        if (exception) transit += rng.float(3, 12);
        const del = sh + transit * DAY_MS;
        const tracking = `${carrier.slice(0, 2).toUpperCase()}${(++trkSeq).toString().padStart(10, '0')}`;
        if (del < NOW) {
          deliveredAt = new Date(del);
          status = 'delivered';
          lateDays = Math.max(0, Math.floor((del - promisedDate.getTime()) / DAY_MS));
        }
        const cost = (3 + lines.length * 0.6 + (express ? 2.5 : 0)) * (country.code === 'AR' ? 1.2 : 1);
        W.ship.push([
          tracking, carrier, number, warehouse, country.code, cust.region, cust.city, express ? 'express' : 'standard', shippedAt, promised,
          deliveredAt, deliveredAt ? 'DELIVERED' : exception ? 'EXCEPTION' : 'IN_TRANSIT', cost.toFixed(2),
        ]);
        // tracking events
        let seq = 1;
        W.trk.push([tracking, seq++, 'PICKED_UP', shippedAt, WAREHOUSES.find((x) => x.code === warehouse)!.city, null]);
        const midT = sh + Math.min(transit * 0.4, 1.5) * DAY_MS;
        if (midT < NOW) W.trk.push([tracking, seq++, 'IN_TRANSIT', new Date(midT), 'Centro de distribución regional', null]);
        if (exception && sh + transit * 0.6 * DAY_MS < NOW) W.trk.push([tracking, seq++, 'EXCEPTION', new Date(sh + transit * 0.6 * DAY_MS), cust.city, rng.pick(['Dirección incompleta', 'Destinatario ausente', 'Daño en paquete', 'Retraso operativo'])]);
        if (delayStory && sh + transit * 0.7 * DAY_MS < NOW) W.trk.push([tracking, seq++, 'IN_TRANSIT', new Date(sh + transit * 0.7 * DAY_MS), 'Centro de distribución regional', 'Demora por congestión operativa']);
        if (deliveredAt) {
          if (rng.chance(0.35)) W.trk.push([tracking, seq++, 'OUT_FOR_DELIVERY', new Date(del - rng.int(2, 8) * HOUR), cust.city, null]);
          W.trk.push([tracking, seq++, 'DELIVERED', deliveredAt, cust.city, null]);
        }
      }
    }

    /* fila del pedido + líneas */
    const ga = src && dev.ga ? `${rng.int(100000000, 999999999)}.${Math.floor(created.getTime() / 1000)}` : null;
    W.ord.push([
      id, number, cust.id, created, status, dev.channel, dev.device === 'marketplace' ? null : dev.device, country.code, cust.region, cust.city, country.currency,
      m2(subtotal), m2(discount), m2(shipping), m2(taxIncl), m2(total), coupon,
      src?.source ?? (dev.channel === 'marketplace' ? 'marketplace' : null), src?.medium ?? null,
      src ? (src.campaign === '__email__' ? emailByDay[d] : src.campaign) : null, ga,
      warehouse, paidAt, cancelledAt, shippedAt, deliveredAt,
    ]);
    lines.forEach((l, i) => W.item.push([id, i + 1, l.sku, l.qty, m2(l.unit), m2(l.disc)]));

    /* cliente */
    if (status !== 'payment_failed' && status !== 'cancelled') {
      cust.orders++;
      cust.spendUsd += totalUsd;
      cust.lastOrderDay = d;
      if (d >= nDays - 365) cust.ordersLast365++;
    }

    /* devoluciones, reseñas, tickets, NPS */
    let returned = false;
    let returnReason = '';
    let storyDefectOrder = false;
    if (deliveredAt) {
      lines.forEach((l, i) => {
        const storyDefect = l.p.isDefect && ymd(created) >= story.defectProduct.defectFrom;
        if (storyDefect) storyDefectOrder = true;
        let pRet = l.p.l1.returnRate * (lateDays >= 3 ? 1.6 : 1);
        if (storyDefect) pRet = story.defectProduct.returnRate;
        if (rng.chance(pRet)) {
          const reason = storyDefect && rng.chance(0.85) ? 'defectuoso'
            : lateDays >= 3 && rng.chance(0.4) ? 'llego_tarde'
            : l.p.l1.key === 'moda' || l.p.l1.key === 'calzado' ? (rng.chance(0.55) ? 'talla_incorrecta' : rng.pick(RETURN_REASONS))
            : rng.pick(RETURN_REASONS.filter((r) => r !== 'talla_incorrecta'));
          const req = deliveredAt!.getTime() + rng.int(1, 20) * DAY_MS + rng.int(0, 86399) * 1000;
          if (req >= NOW) return;
          returned = true;
          returnReason = reason;
          const rejected = rng.chance(0.05);
          const rec = req + rng.float(3, 9) * DAY_MS;
          const refundAt = rec + rng.float(0.5, 4) * DAY_MS;
          const received = rec < NOW;
          const refunded = !rejected && received && refundAt < NOW;
          const refund = money((l.unit * l.qty - l.disc) * (1 - discPct), country.integerCurrency);
          W.ret.push([++returnId, id, i + 1, l.sku, l.qty, reason, new Date(req), received ? new Date(rec) : null, refunded ? m2(refund) : null,
            rejected && received ? 'rejected' : refunded ? 'refunded' : received ? 'received' : 'requested']);
          if (refunded) W.txn.push([nextTxn(), number, 'refund', method, gateway, 'succeeded', null, Math.round(refund * minorMult), country.currency, new Date(refundAt)]);
        }
        // reseña de producto
        const pRev = 0.11 * (lateDays >= 3 ? 1.3 : 1) * (storyDefect ? 2.2 : 1);
        if (rng.chance(pRev)) {
          const genericDefect = !storyDefect && rng.chance(0.015);
          let r = l.p.quality + rng.normal(0, 0.85) - (lateDays >= 3 ? 1.1 : lateDays >= 1 ? 0.4 : 0) - (storyDefect ? 2.6 : 0) - (genericDefect ? 2.5 : 0);
          r = Math.min(5, Math.max(1, Math.round(r)));
          const at = deliveredAt!.getTime() + rng.float(1, 30) * DAY_MS;
          if (at < NOW) {
            const txt = reviewText(rng, { l1Key: l.p.l1.key, l2Name: l.p.l2.name, productName: l.p.name, rating: r, lateDays, carrier, promised, storyDefect, genericDefect });
            W.rev.push([++reviewId, l.p.code, l.sku, id, cust!.id, r, txt.title, txt.body, new Date(at), true, Math.floor(rng.exp(r <= 2 ? 6 : 2))]);
          }
        }
      });
    }

    let tCat: string | null = null;
    if (status === 'payment_failed' && rng.chance(0.18)) tCat = 'pago_rechazado';
    else if (status === 'cancelled' && rng.chance(0.25)) tCat = 'cancelacion';
    else if (lateDays >= 2 && rng.chance(0.28 + lateDays * 0.04)) tCat = 'retraso_entrega';
    else if (storyDefectOrder && rng.chance(0.35)) tCat = 'producto_defectuoso';
    else if (returned && rng.chance(0.35)) tCat = rng.pick(returnReason === 'talla_incorrecta' ? ['cambio_talla', 'devolucion'] : returnReason === 'defectuoso' || returnReason === 'llego_danado' ? ['producto_defectuoso', 'devolucion', 'reembolso'] : ['devolucion', 'reembolso']);
    else if (rng.chance(0.03)) tCat = rng.pick(['factura', 'consulta_producto', 'cuenta', 'retraso_entrega']);
    if (tCat) {
      const base = tCat === 'retraso_entrega' && promised ? new Date(promised + 'T12:00:00Z').getTime() + rng.float(0.5, 3) * DAY_MS : created.getTime() + rng.float(0.1, 8) * DAY_MS;
      if (base < NOW) {
        const channel = weighted([['email', 0.35], ['chat', 0.3], ['whatsapp', 0.25], ['phone', 0.1]] as const).sample(rng);
        const peak = promo || date.getUTCMonth() === 11;
        const frHours = Math.max(0.05, rng.lognormal(channel === 'email' ? 1.6 : channel === 'phone' ? -1.5 : 0, 0.8) * (peak ? 2.2 : 1));
        const fr = base + frHours * HOUR;
        const solveH = frHours + rng.lognormal(3, 0.9);
        const solved = base + solveH * HOUR;
        const solvedOk = solved < NOW;
        const line = lines[0];
        const txt = ticketText(rng, {
          category: tCat, orderNumber: number, productName: line.p.name, carrier: carrier || 'el transportista', promised: promised || 'la fecha indicada',
          daysWaiting: Math.max(1, Math.round((base - created.getTime()) / DAY_MS)), reason: returnReason || 'cambio_de_opinion', storyDefect: storyDefectOrder,
        });
        const csat = solvedOk && rng.chance(0.35) ? Math.min(5, Math.max(1, Math.round(rng.normal(tCat === 'retraso_entrega' ? 3 : 3.9, 1.1) - (solveH > 72 ? 0.8 : 0)))) : null;
        W.tkt.push([
          ++ticketId, cust.email, number, channel, tCat, txt.subject, txt.description,
          tCat === 'pago_rechazado' || tCat === 'producto_defectuoso' ? 'high' : tCat === 'retraso_entrega' && lateDays > 4 ? 'high' : rng.chance(0.2) ? 'low' : 'normal',
          solvedOk ? (rng.chance(0.7) ? 'closed' : 'solved') : fr < NOW ? 'pending' : 'open',
          new Date(base), fr < NOW ? new Date(fr) : null, solvedOk ? new Date(solved) : null, csat,
        ]);
      }
    }

    if (deliveredAt && rng.chance(0.035)) {
      const at = deliveredAt.getTime() + rng.float(1, 15) * DAY_MS;
      if (at < NOW) {
        const score = Math.min(10, Math.max(0, Math.round(rng.normal(8.1, 1.8) - (lateDays >= 2 ? 2.5 : 0) - (returned ? 1.2 : 0))));
        W.nps.push([++npsId, `CRM-${String(cust.id).padStart(8, '0')}`, score, npsComment(rng, score, lateDays >= 2), new Date(at)]);
      }
    }
    void pendingLast365;
    return { number, totalUsd };
  }
}

/** Contactos del CRM: compradores (con duplicados y ruido) + leads sin compra. */
export async function writeCrmContacts(rng: Rng, res: SimResult, cfg: ScaleConfig, w: WriterSet): Promise<void> {
  const W = w.get('raw_crm.contacts', [
    'contact_id', 'email', 'first_name', 'last_name', 'phone', 'country', 'state', 'city', 'birth_date', 'gender', 'created_at', 'marketing_opt_in', 'lifecycle_stage', 'loyalty_tier',
  ]);
  const nDays = Math.round((END.getTime() - START.getTime()) / DAY_MS);
  const phonePrefix: Record<string, string> = { MX: '+52 55', CO: '+57 3', CL: '+56 9', PE: '+51 9', AR: '+54 11' };
  let extra = 0;
  for (const c of res.customers) {
    if (rng.chance(0.03)) continue; // no sincronizado al CRM
    const country = COUNTRIES[c.ci];
    const stage = c.orders === 0 ? 'lead' : c.ordersLast365 >= 4 || c.spendUsd > 1500 ? 'vip' : nDays - c.lastOrderDay > 180 ? 'churn_risk' : 'customer';
    const tier = c.spendUsd > 2000 ? 'platinum' : c.spendUsd > 800 ? 'gold' : c.spendUsd > 250 ? 'silver' : 'bronze';
    let email = c.email;
    if (rng.chance(0.1)) email = email.charAt(0).toUpperCase() + email.slice(1);
    if (rng.chance(0.02)) email = email.toUpperCase();
    const row = [
      `CRM-${String(c.id).padStart(8, '0')}`, email, c.first, c.last, `${phonePrefix[country.code]} ${rng.int(1000000, 9999999)}`, country.name, c.region, c.city,
      ymd(c.birth), c.gender, new Date(c.createdAt.getTime() - rng.int(0, 90) * DAY_MS * (rng.chance(0.3) ? 1 : 0)), c.acceptsMk, stage, tier,
    ];
    W.push(row);
    if (rng.chance(0.01)) {
      // duplicado típico de CRM (alta manual)
      W.push([`CRM-D${String(++extra).padStart(7, '0')}`, ` ${c.email.toUpperCase()} `, c.first, c.last, null, country.name, c.region, c.city, null, c.gender, new Date(c.createdAt.getTime() + rng.int(10, 400) * DAY_MS), c.acceptsMk, 'lead', null]);
    }
    await W.flushIfNeeded();
  }
  // leads que nunca compraron
  const nLeads = Math.round(res.customers.length * cfg.leadsRatio);
  faker.seed(7);
  for (let i = 0; i < nLeads; i++) {
    const ci = new Weighted(COUNTRIES.map((_, k) => k), COUNTRIES.map((c) => c.share)).sampleIndex(rng);
    const country = COUNTRIES[ci];
    const region = rng.pick(country.regions);
    const first = faker.person.firstName();
    const last = faker.person.lastName();
    W.push([
      `CRM-L${String(i + 1).padStart(7, '0')}`, `${strip(first)}.${strip(last)}${rng.int(1, 999)}@${EMAIL_DOMAINS.sample(rng)}`, first, last, null, country.name, region.name,
      rng.pick(region.cities), null, null, new Date(START.getTime() + rng.int(0, nDays - 1) * DAY_MS + rng.int(0, 86399) * 1000), rng.chance(0.8), 'lead', null,
    ]);
    await W.flushIfNeeded();
  }
  await W.flush();
}
