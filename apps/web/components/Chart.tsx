'use client';
import dynamic from 'next/dynamic';
import { useEffect, useMemo, useState } from 'react';
import { formatValue, type ChartSpec, type Row } from '@data-bi/shared';
import { Provenance } from './Provenance';

const ReactECharts = dynamic(() => import('echarts-for-react'), { ssr: false, loading: () => <div className="skeleton" /> });

// Paleta categórica validada (orden fijo; pasos distintos para modo claro y oscuro)
const PALETTE = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#0ca30c', '#9085e9', '#e66767'],
};
const OTHER = { light: '#9a9a96', dark: '#6f6e6a' };
const MAX_SERIES = 7; // el 8.º slot se reserva para "Otros"
const LOWER_IS_BETTER = new Set([
  'tasa_devolucion', 'devoluciones', 'monto_reembolsado', 'tasa_cancelacion', 'tasa_quiebre_stock', 'tiempo_entrega_promedio',
  'dias_retraso_promedio', 'costo_envio_promedio', 'abandono_checkout', 'cac_pagado', 'cac_combinado', 'cpc', 'resenas_negativas_pct',
  'tickets', 'tiempo_primera_respuesta', 'tiempo_resolucion', 'tasa_fallo_pagos', 'descuentos',
]);

function useDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = matchMedia('(prefers-color-scheme: dark)');
    const upd = () => setDark(mq.matches);
    upd();
    mq.addEventListener('change', upd);
    return () => mq.removeEventListener('change', upd);
  }, []);
  return dark;
}

const DIM_LABELS: Record<string, string> = { periodo: 'Periodo', valor: 'Valor', contribucion: 'Contribución al cambio neto' };
const label = (k: string) => DIM_LABELS[k] ?? k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Pivotea filas largas (x, serie, valor) → x × series, plegando la cola en "Otros" (solo para sumas). */
function pivot(spec: ChartSpec) {
  const x = spec.x!;
  const s = spec.series!;
  const totals = new Map<string, number>();
  for (const r of spec.data) totals.set(String(r[s]), (totals.get(String(r[s])) ?? 0) + Math.abs(Number(r.valor) || 0));
  const ranked = [...totals.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const additive = spec.unit === 'usd' || spec.unit === 'count';
  const keep = ranked.length > MAX_SERIES + 1 ? ranked.slice(0, MAX_SERIES) : ranked;
  // color sigue a la entidad: orden alfabético estable entre los conservados
  const series = [...keep].sort((a, b) => a.localeCompare(b, 'es'));
  const hasOther = additive && ranked.length > keep.length;
  const xs = [...new Set(spec.data.map((r) => String(r[x])))];
  const grid = new Map<string, Map<string, number | null>>();
  for (const r of spec.data) {
    const key = keep.includes(String(r[s])) ? String(r[s]) : hasOther ? 'Otros' : null;
    if (!key) continue;
    const row = grid.get(String(r[x])) ?? new Map();
    row.set(key, key === 'Otros' ? (row.get(key) ?? 0)! + (Number(r.valor) || 0) : (r.valor as number | null));
    grid.set(String(r[x]), row);
  }
  return { xs, series: hasOther ? [...series, 'Otros'] : series, grid, dropped: ranked.length - keep.length - (hasOther ? 0 : 0) };
}

export function Chart({ spec, height = 280, showProvenance = true }: { spec: ChartSpec; height?: number; showProvenance?: boolean }) {
  const dark = useDark();
  const [asTable, setAsTable] = useState(spec.type === 'table');
  const mode = dark ? 'dark' : 'light';
  const fmt = (v: unknown, compact = false) => formatValue(v === null || v === undefined ? null : Number(v), spec.unit, compact);

  const option = useMemo(() => {
    if (spec.type === 'kpi' || spec.type === 'table') return null;
    const ink = dark ? '#c3c2b7' : '#52514e';
    const grid = dark ? '#2a313b' : '#e8e8e4';
    const colors = PALETTE[mode];
    const base = {
      backgroundColor: 'transparent',
      textStyle: { color: ink, fontFamily: 'inherit' },
      grid: { left: 8, right: 16, top: 36, bottom: 8, containLabel: true },
      tooltip: {
        trigger: spec.type === 'pie' ? 'item' : 'axis',
        axisPointer: { type: spec.type === 'line' || spec.type === 'area' ? 'line' : 'shadow' },
        valueFormatter: (v: unknown) => fmt(v),
        backgroundColor: dark ? '#1f242c' : '#ffffff',
        borderColor: grid,
        textStyle: { color: dark ? '#f0efec' : '#0b0b0b' },
      },
      animationDuration: 300,
    };

    if (spec.type === 'pie') {
      const x = spec.x!;
      const rows = [...spec.data].sort((a, b) => String(a[x]).localeCompare(String(b[x]), 'es'));
      return {
        ...base,
        color: colors,
        legend: { bottom: 0, type: 'scroll', textStyle: { color: ink } },
        series: [
          {
            type: 'pie',
            radius: ['45%', '70%'],
            center: ['50%', '45%'],
            itemStyle: { borderColor: dark ? '#171b21' : '#ffffff', borderWidth: 2, borderRadius: 4 },
            label: { color: ink, formatter: (p: { name: string; percent: number }) => `${p.name}\n${p.percent.toFixed(1)} %` },
            data: rows.map((r) => ({ name: String(r[x]), value: r.valor })),
          },
        ],
      };
    }

    const horizontal = spec.type === 'horizontal_bar';
    const isLine = spec.type === 'line' || spec.type === 'area';
    const stacked = spec.type === 'stacked_bar' || (spec.type === 'area' && !!spec.series);
    const axisCat = { type: 'category', axisLine: { lineStyle: { color: grid } }, axisTick: { show: false }, axisLabel: { color: ink, hideOverlap: true } };
    const axisVal = {
      type: 'value',
      splitNumber: horizontal ? 3 : 5,
      splitLine: { lineStyle: { color: grid } },
      axisLabel: { color: ink, hideOverlap: true, formatter: (v: number) => formatValue(v, spec.unit, true).replace('US$ ', '$') },
    };

    let xs: string[];
    let seriesNames: string[];
    let getVal: (x: string, s: string) => number | null;
    if (spec.series) {
      const p = pivot(spec);
      xs = p.xs;
      seriesNames = p.series;
      getVal = (x, s) => p.grid.get(x)?.get(s) ?? null;
    } else {
      const rows: Row[] = horizontal ? [...spec.data].reverse() : spec.data;
      xs = rows.map((r) => String(r[spec.x!]));
      seriesNames = [spec.title];
      const m = new Map(rows.map((r) => [String(r[spec.x!]), r.valor as number | null]));
      getVal = (x) => m.get(x) ?? null;
    }
    const color = (name: string, i: number) => (name === 'Otros' ? OTHER[mode] : colors[i % colors.length]);
    const multi = seriesNames.length > 1;
    return {
      ...base,
      legend: multi ? { top: 0, type: 'scroll', textStyle: { color: ink }, itemWidth: 12, itemHeight: 8 } : undefined,
      grid: { ...base.grid, top: multi ? 36 : 12 },
      xAxis: horizontal ? axisVal : { ...axisCat, data: xs, boundaryGap: !isLine },
      yAxis: horizontal ? { ...axisCat, data: xs } : axisVal,
      series: seriesNames.map((name, i) => ({
        name,
        type: isLine ? 'line' : 'bar',
        data: xs.map((x) => getVal(x, name)),
        stack: stacked ? 'total' : undefined,
        color: color(name, i),
        showSymbol: isLine && xs.length <= 24,
        symbolSize: 8,
        lineStyle: { width: 2 },
        areaStyle: spec.type === 'area' ? { opacity: stacked ? 0.85 : 0.15 } : undefined,
        smooth: false,
        barMaxWidth: 36,
        itemStyle: isLine
          ? undefined
          : {
              borderRadius: stacked ? 0 : horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0],
              borderColor: stacked ? (dark ? '#171b21' : '#ffffff') : undefined,
              borderWidth: stacked ? 1 : 0,
            },
        emphasis: { focus: 'series' },
      })),
    };
  }, [spec, dark, mode]);

  return (
    <div>
      {spec.type === 'kpi' ? (
        <Kpi spec={spec} />
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -4 }}>
            {spec.type !== 'table' && (
              <button className="ghost small" style={{ padding: '2px 10px' }} onClick={() => setAsTable((t) => !t)} aria-pressed={asTable}>
                {asTable ? 'Ver gráfico' : 'Ver tabla'}
              </button>
            )}
          </div>
          {asTable || !option ? <DataTable spec={spec} /> : <ReactECharts option={option} style={{ height }} notMerge />}
        </>
      )}
      {showProvenance && spec.provenance && <Provenance spec={spec} />}
    </div>
  );
}

function Kpi({ spec }: { spec: ChartSpec }) {
  const d = spec.data[0] ?? {};
  const delta = d.variacion as number | null | undefined;
  // en métricas donde "subir es malo" el color se invierte
  const lowerIsBetter = LOWER_IS_BETTER.has(spec.provenance?.metric ?? '');
  const good = delta !== null && delta !== undefined && (lowerIsBetter ? delta < 0 : delta > 0);
  return (
    <div>
      <div className="kpi-value">{formatValue(d.valor as number | null, spec.unit, true)}</div>
      {(delta != null || d.anterior != null) && (
        <div className={`delta ${good ? 'up' : 'down'}`}>
          {delta != null && <>{delta > 0 ? '▲' : delta < 0 ? '▼' : '■'} {formatValue(Math.abs(delta), 'pct')}{' '}</>}
          <span className="muted" style={{ fontWeight: 400 }}>
            vs {formatValue(d.anterior as number | null, spec.unit, true)}
          </span>
        </div>
      )}
    </div>
  );
}

export function DataTable({ spec }: { spec: ChartSpec }) {
  const cols = spec.data.length ? Object.keys(spec.data[0]) : [];
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c} className={c === 'valor' || spec.y.includes(c) ? 'num' : undefined} scope="col">
                {'contribucion' in spec.data[0] && c === 'valor' ? 'Variación' : label(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {spec.data.map((r, i) => (
            <tr key={i}>
              {cols.map((c) => (
                <td key={c} className={typeof r[c] === 'number' ? 'num' : undefined}>
                  {c === 'contribucion' ? formatValue(r[c] as number | null, 'pct') : (c === 'valor' || ('contribucion' in r && ['actual', 'anterior'].includes(c))) ? formatValue(r[c] as number | null, spec.unit) : typeof r[c] === 'number' ? (r[c] as number).toLocaleString('es') : String(r[c] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
