/** PRNG determinista (mulberry32) + distribuciones usadas por el generador. */
export class Rng {
  private s: number;
  private spare: number | null = null;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)];
  }

  normal(mean = 0, sd = 1): number {
    if (this.spare !== null) {
      const v = this.spare;
      this.spare = null;
      return mean + sd * v;
    }
    let u = 0;
    let v = 0;
    while (u === 0) u = this.next();
    while (v === 0) v = this.next();
    const mag = Math.sqrt(-2 * Math.log(u));
    this.spare = mag * Math.sin(2 * Math.PI * v);
    return mean + sd * mag * Math.cos(2 * Math.PI * v);
  }

  lognormal(mu: number, sigma: number): number {
    return Math.exp(this.normal(mu, sigma));
  }

  exp(mean: number): number {
    return -Math.log(1 - this.next()) * mean;
  }

  poisson(lambda: number): number {
    if (lambda <= 0) return 0;
    if (lambda > 40) return Math.max(0, Math.round(this.normal(lambda, Math.sqrt(lambda))));
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }

  binomial(n: number, p: number): number {
    if (n <= 0 || p <= 0) return 0;
    if (n > 60) return Math.min(n, this.poisson(n * p));
    let k = 0;
    for (let i = 0; i < n; i++) if (this.next() < p) k++;
    return k;
  }

  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
}

/** Muestreo ponderado O(log n) con distribución acumulada. */
export class Weighted<T> {
  private cum: Float64Array;
  private total: number;
  constructor(public readonly items: readonly T[], weights: readonly number[]) {
    this.cum = new Float64Array(weights.length);
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      this.cum[i] = acc;
    }
    this.total = acc;
  }
  sample(rng: Rng): T {
    return this.items[this.sampleIndex(rng)];
  }
  sampleIndex(rng: Rng): number {
    const x = rng.next() * this.total;
    let lo = 0;
    let hi = this.cum.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this.cum[mid] < x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

export function weighted<T>(pairs: ReadonlyArray<readonly [T, number]>): Weighted<T> {
  return new Weighted(
    pairs.map((p) => p[0]),
    pairs.map((p) => p[1]),
  );
}
