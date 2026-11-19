export type Scale = 'small' | 'medium' | 'large';

export interface ScaleConfig {
  targetOrders: number;
  products: number;
  leadsRatio: number;
  gaSampleRate: number;
  gbpReviewsPerLocationWeek: number;
}

export const SCALES: Record<Scale, ScaleConfig> = {
  small: { targetOrders: 120_000, products: 6_000, leadsRatio: 0.2, gaSampleRate: 0.0015, gbpReviewsPerLocationWeek: 3 },
  medium: { targetOrders: 450_000, products: 20_000, leadsRatio: 0.2, gaSampleRate: 0.006, gbpReviewsPerLocationWeek: 8 },
  large: { targetOrders: 1_200_000, products: 50_000, leadsRatio: 0.2, gaSampleRate: 0.0135, gbpReviewsPerLocationWeek: 18 },
};

/** Ventana de datos: desde START (incl.) hasta END (excl.). EXTRACTED_AT = momento de la "extracción". */
export const START = new Date('2024-01-01T00:00:00Z');
export const END = new Date('2026-11-19T00:00:00Z');
export const EXTRACTED_AT = END;
export const DAY_MS = 86_400_000;

export function dayIndex(d: Date): number {
  return Math.floor((d.getTime() - START.getTime()) / DAY_MS);
}
export function dayDate(i: number): Date {
  return new Date(START.getTime() + i * DAY_MS);
}
export function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function inWindow(d: Date, from: string, to: string): boolean {
  const s = ymd(d);
  return s >= from && s <= to;
}

/** Historias plantadas en los datos. Documentadas en docs/demo-stories.md. */
export const STORIES = {
  starProduct: {
    code: 'P-STAR-0001',
    name: 'Audífonos inalámbricos Sonix Air Pro 2',
    popularityRank: 2,
    stockoutFrom: '2026-09-20',
    stockoutTo: '2026-10-25',
  },
  defectProduct: {
    code: 'P-DEF-0001',
    name: 'Licuadora PowerMix 900',
    popularityRank: 18,
    defectFrom: '2026-03-01',
    returnRate: 0.24,
  },
  carrierDelay: {
    carrier: 'RutaExpress',
    country: 'CO',
    from: '2026-08-01',
    to: '2026-10-31',
    extraDays: 4.5,
  },
  badCampaign: { campaign: 'Prospecting_Q3_2026_Video', from: '2026-07-01', to: '2026-09-30' },
  mobileCheckoutBug: { from: '2026-10-06', to: '2026-10-27', convFactor: 0.55 },
  gatewayOutage: { gateway: 'PayLatam', from: '2026-06-10', to: '2026-06-20', failRate: 0.19 },
};

export function seasonality(d: Date): number {
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const y = d.getUTCFullYear();
  const s = ymd(d);
  const monthF = [0.86, 0.84, 0.95, 0.95, 1.0, 0.96, 1.0, 1.0, 0.95, 1.02, 1.12, 1.35][m];
  let f = monthF;
  // Black Friday / Cyber Monday
  const bf: Record<number, string> = { 2024: '2024-11-29', 2025: '2025-11-28', 2026: '2026-11-27' };
  const bfDate = bf[y];
  if (bfDate) {
    const diff = (d.getTime() - new Date(bfDate + 'T00:00:00Z').getTime()) / DAY_MS;
    if (diff === 0) f *= 3.6;
    else if (diff === 1 || diff === 2) f *= 2.0;
    else if (diff === 3) f *= 2.9; // Cyber Monday
    else if (diff >= -5 && diff < 0) f *= 1.35;
    else if (diff > 3 && diff <= 6) f *= 1.3;
  }
  // Hot Sale (fines de mayo)
  const hot: Record<number, [string, string]> = { 2024: ['2024-05-27', '2024-05-31'], 2025: ['2025-05-26', '2025-05-30'], 2026: ['2026-05-25', '2026-05-29'] };
  if (hot[y] && s >= hot[y][0] && s <= hot[y][1]) f *= 1.7;
  // Navidad
  if (m === 11) {
    if (day <= 22) f *= 1 + day * 0.02;
    else if (day === 24 || day === 25) f *= 0.55;
    else if (day > 25) f *= 0.8;
  }
  // Día de la madre (mayo, semana previa al 10)
  if (m === 4 && day >= 3 && day <= 9) f *= 1.25;
  const weekday = [1.0, 1.06, 1.02, 1.0, 0.98, 0.93, 0.88][d.getUTCDay()];
  return f * weekday;
}

export function isPromoDay(d: Date): boolean {
  const s = ymd(d);
  return (
    (s >= '2024-11-27' && s <= '2024-12-03') ||
    (s >= '2025-11-26' && s <= '2025-12-02') ||
    (s >= '2024-05-27' && s <= '2024-05-31') ||
    (s >= '2025-05-26' && s <= '2025-05-30') ||
    (s >= '2026-05-25' && s <= '2026-05-29')
  );
}
