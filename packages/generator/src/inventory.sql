-- Simula el WMS a partir de los despachos y devoluciones ya generados.
SELECT setseed(0.42);

TRUNCATE raw_wms.stock_movements RESTART IDENTITY;

CREATE TEMP TABLE tmp_picks AS
SELECT o.warehouse_code, i.sku, o.shipped_at::date AS d, SUM(i.qty)::int AS qty
FROM raw_shop.orders o
JOIN raw_shop.order_items i USING (order_id)
WHERE o.shipped_at IS NOT NULL
GROUP BY 1, 2, 3;

CREATE TEMP TABLE tmp_month_demand AS
SELECT warehouse_code, sku, date_trunc('month', d)::date AS m, SUM(qty)::int AS qty
FROM tmp_picks GROUP BY 1, 2, 3;

-- Saldo inicial: ~1,3 meses de demanda promedio
INSERT INTO raw_wms.stock_movements (warehouse_code, sku, movement_type, qty, moved_on, reference)
SELECT warehouse_code, sku, 'OPENING', CEIL(AVG(qty) * 1.3)::int + 1, DATE '2023-12-31', 'Saldo inicial migración WMS'
FROM tmp_month_demand GROUP BY 1, 2;

-- Recepciones mensuales: el planificador compra según la demanda del mes con error de pronóstico
-- (entre −8% y +14%); ~6% de los meses el proveedor no entrega. Eso genera quiebres realistas.
INSERT INTO raw_wms.stock_movements (warehouse_code, sku, movement_type, qty, moved_on, reference)
SELECT warehouse_code, sku, 'RECEIPT',
       ROUND(qty * (0.92 + random() * 0.22))::int,
       m,
       'PO-' || to_char(m, 'YYYYMM') || '-' || substr(md5(warehouse_code || sku || m::text), 1, 6)
FROM tmp_month_demand
WHERE random() > 0.06
  AND NOT (sku LIKE 'P-STAR-0001-%' AND m IN (DATE '2026-08-01', DATE '2026-09-01', DATE '2026-10-01'));

-- Despachos (salidas diarias agregadas)
INSERT INTO raw_wms.stock_movements (warehouse_code, sku, movement_type, qty, moved_on, reference)
SELECT warehouse_code, sku, 'PICK', -qty, d, 'Despachos del día'
FROM tmp_picks;

-- Reingreso de devoluciones en buen estado
INSERT INTO raw_wms.stock_movements (warehouse_code, sku, movement_type, qty, moved_on, reference)
SELECT o.warehouse_code, r.sku, 'RETURN_RESTOCK', SUM(r.qty)::int, r.received_at::date, 'Devoluciones reingresadas'
FROM raw_shop.returns r JOIN raw_shop.orders o USING (order_id)
WHERE r.received_at IS NOT NULL AND r.reason NOT IN ('defectuoso', 'llego_danado')
GROUP BY 1, 2, 5;

-- Historia: quiebre del producto estrella. Ajuste a cero el 2026-09-20 y reposición grande el 2026-10-26.
INSERT INTO raw_wms.stock_movements (warehouse_code, sku, movement_type, qty, moved_on, reference)
SELECT warehouse_code, sku, 'ADJUSTMENT', -SUM(qty)::int, DATE '2026-09-20', 'Ajuste por conteo cíclico'
FROM raw_wms.stock_movements
WHERE sku LIKE 'P-STAR-0001-%' AND moved_on < DATE '2026-09-20'
GROUP BY 1, 2
HAVING SUM(qty) <> 0;

INSERT INTO raw_wms.stock_movements (warehouse_code, sku, movement_type, qty, moved_on, reference)
SELECT warehouse_code, sku, 'RECEIPT', CEIL(AVG(qty) * 3)::int, DATE '2026-10-26', 'PO-202610-STAR'
FROM tmp_month_demand WHERE sku LIKE 'P-STAR-0001-%' GROUP BY 1, 2;

CREATE INDEX IF NOT EXISTS stock_mov_sku_idx ON raw_wms.stock_movements (sku, warehouse_code, moved_on);
