# Historias plantadas en los datos (guion de demo)

El generador inserta situaciones de negocio realistas para que la demo tenga algo que **descubrir**. Cada una deja huella coherente en varias fuentes a la vez (pedidos, WMS, transportistas, GA4, anuncios, reseñas, tickets, NPS, Google), que es justamente lo que demuestra el valor de integrar.

Configuración: `packages/generator/src/config.ts` → `STORIES`. Fecha de corte de los datos: **2026-11-18**.

| # | Historia | Dónde se ve | Pregunta para la demo |
|---|---|---|---|
| 1 | **Quiebre del producto estrella** «Audífonos inalámbricos Sonix Air Pro 2» (sin stock 2026-09-20 → 2026-10-25) | Ventas del producto caen a cero; foto de inventario al 30-sep ≈ 0; reposición grande el 26-oct (WMS) | «¿Por qué se desplomaron las ventas de los Audífonos Sonix Air Pro 2 a fines de septiembre?» |
| 2 | **Defecto de lote** en la «Licuadora PowerMix 900» desde 2026-03-01 | ~24 % de devoluciones por *defectuoso*, reseñas de 1–2★ que mencionan vaso agrietado / fugas / motor, tickets de producto defectuoso | «¿De qué se quejan los clientes de la Licuadora PowerMix 900?» · «¿Qué productos tienen más devoluciones por defecto este año?» |
| 3 | **Retrasos de RutaExpress en Colombia** (ago–oct 2026, +4,5 días) | Entregas a tiempo de RutaExpress-CO cae a ~6 % en septiembre; tickets *retraso_entrega*; reseñas que mencionan el retraso; Google del punto de retiro Medellín Centro baja a ~2,6★; NPS de detractores | «¿Por qué bajaron las entregas a tiempo en Colombia en septiembre?» |
| 4 | **Campaña con ROAS pésimo** `Prospecting_Q3_2026_Video` (Meta, jul–sep 2026) | Gasto alto en Ads, sesiones en GA4, casi sin pedidos atribuidos (ROAS ≈ 0,22) | «¿Qué campañas tuvieron peor ROAS el último trimestre?» |
| 5 | **Bug del checkout móvil** (2026-10-06 → 2026-10-27) | Conversión de GA4 en *mobile* cae ~45 % con sesiones normales; pedidos web-mobile bajan | «¿Por qué cayó la conversión en octubre?» |
| 6 | **Caída de pasarela** PayLatam (2026-06-10 → 2026-06-20) | Tasa de fallo de cobros ~18 % (timeouts) en MX/CO/PE; tickets *pago_rechazado* | «¿Qué pasó con los pagos rechazados a mediados de junio?» |
| 7 | **Estacionalidad** | Black Friday / Cyber Monday, Hot Sale (fines de mayo), Día de la Madre, diciembre, caída en Navidad; crecimiento ~33 % anual | «Muéstrame el GMV diario de noviembre 2025» |

## Ambigüedades que el asistente debe aclarar
- «¿Cuántos clientes tenemos?» → base total (CRM + tienda), clientes activos 90 d, compradores del periodo o clientes frecuentes.
- «¿Cuál es el CAC?» → CAC pagado (solo campañas con pauta) vs CAC combinado (gasto total / todos los clientes nuevos).
- «¿Cuántos pedidos?» → por defecto pedidos **válidos** (pagados y no cancelados); existe `pedidos_creados`.
- «Ventas» → por defecto **GMV** (con IVA, antes de devoluciones); existe `ingresos_netos`.

## Alcance por perfil
Selector «Perfil» en la barra superior: *Gerencia México* solo ve MX, *Gerencia Colombia* solo CO, *Cono Sur* CL+AR. El backend inyecta el filtro de país en toda métrica y búsqueda, y bloquea el SQL exploratorio para perfiles restringidos.
