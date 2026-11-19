import { STORIES, START, ymd, DAY_MS } from './config.js';
import type { WriterSet } from './copy.js';
import { COLORS, MODEL_WORDS, PACKS, SIZES_APPAREL, SIZES_SHOE, TAXONOMY, type L1, type L2 } from './reference.js';
import { Rng, Weighted } from './rng.js';
import { productDescription } from './text.js';

export interface Sku {
  sku: string;
  priceUsd: number;
  costUsd: number;
}
export interface Product {
  code: string;
  name: string;
  l1: L1;
  l2: L2;
  brand: string;
  launchDay: number; // índice de día desde START (negativo = antes)
  quality: number; // media esperada de rating
  skus: Sku[];
  isStar: boolean;
  isDefect: boolean;
}

export interface Catalog {
  products: Product[];
  popularity: Weighted<Product>;
}

export async function generateCatalog(rng: Rng, nProducts: number, w: WriterSet): Promise<Catalog> {
  const cats = w.get('raw_erp.categories', ['category_id', 'parent_id', 'name', 'level']);
  const sup = w.get('raw_erp.suppliers', ['supplier_id', 'supplier_name', 'country_code', 'lead_time_days']);
  const prod = w.get('raw_erp.products', ['product_code', 'product_name', 'description', 'category_id', 'brand', 'supplier_id', 'launch_date', 'status']);
  const skuW = w.get('raw_erp.skus', ['sku', 'product_code', 'variant_label', 'list_price_usd', 'unit_cost_usd', 'weight_kg']);

  // Categorías
  const l2Ids = new Map<L2, number>();
  let catId = 1;
  for (const l1 of TAXONOMY) {
    const l1Id = catId++;
    cats.push([l1Id, null, l1.name, 1]);
    for (const l2 of l1.children) {
      l2Ids.set(l2, catId);
      cats.push([catId++, l1Id, l2.name, 2]);
    }
  }

  // Proveedores
  const supplierCountries = ['CN', 'CN', 'CN', 'MX', 'CO', 'BR', 'US', 'VN', 'IN', 'CL', 'AR', 'ES'];
  const supNames = ['Grupo', 'Industrias', 'Manufacturas', 'Distribuidora', 'Comercial', 'Importadora', 'Fábrica'];
  const supSuffix = ['del Pacífico', 'Austral', 'Global', 'Andina', 'Oriente', 'Norte', 'Delta', 'Horizonte', 'Unión', 'Sol'];
  const nSuppliers = Math.max(40, Math.round(nProducts / 120));
  for (let i = 1; i <= nSuppliers; i++) {
    const cc = rng.pick(supplierCountries);
    sup.push([i, `${rng.pick(supNames)} ${rng.pick(supSuffix)} ${i}`, cc, cc === 'CN' || cc === 'VN' || cc === 'IN' ? rng.int(35, 60) : rng.int(7, 25)]);
  }

  // Productos
  const products: Product[] = [];
  const counts = TAXONOMY.map((l1) => Math.round(l1.share * nProducts));
  let seq = 1;
  for (let ci = 0; ci < TAXONOMY.length; ci++) {
    const l1 = TAXONOMY[ci];
    for (let k = 0; k < counts[ci]; k++) {
      const l2 = rng.pick(l1.children);
      const brand = rng.pick(l1.brands);
      const noun = rng.pick(l2.nouns);
      const model = `${rng.pick(MODEL_WORDS)}${rng.chance(0.5) ? ' ' + rng.int(2, 900) : ''}`;
      const name = `${noun} ${brand} ${model}`;
      const code = `P-${String(seq++).padStart(6, '0')}`;
      // la mayoría ya existía al iniciar la ventana; ~15% se lanza durante la ventana
      const launchDay = rng.chance(0.85) ? -rng.int(30, 1500) : rng.int(0, 1000);
      products.push(makeProduct(rng, code, name, l1, l2, brand, launchDay, false, false));
    }
  }

  // Productos de las historias
  const elec = TAXONOMY.find((t) => t.key === 'electronica')!;
  const hogar = TAXONOMY.find((t) => t.key === 'hogar')!;
  const star = makeProduct(rng, STORIES.starProduct.code, STORIES.starProduct.name, elec, elec.children.find((c) => c.name === 'Audífonos')!, 'Sonix', -400, true, false);
  star.skus = [
    { sku: `${star.code}-NEG`, priceUsd: 89.9, costUsd: 41.0 },
    { sku: `${star.code}-BLA`, priceUsd: 89.9, costUsd: 41.0 },
  ];
  star.quality = 4.6;
  const defect = makeProduct(rng, STORIES.defectProduct.code, STORIES.defectProduct.name, hogar, hogar.children.find((c) => c.name.startsWith('Licuadoras'))!, 'PowerMix', -300, false, true);
  defect.skus = [{ sku: `${defect.code}-UNI`, priceUsd: 64.9, costUsd: 27.5 }];
  defect.quality = 4.3;

  // Popularidad Zipf con orden aleatorio; las historias se insertan en rangos fijos
  rng.shuffle(products);
  products.splice(STORIES.starProduct.popularityRank - 1, 0, star);
  products.splice(STORIES.defectProduct.popularityRank - 1, 0, defect);
  // Los productos caros se venden menos: popularidad = Zipf(rango) × precio^-0.85
  const weights = products.map((p, i) => (1 / Math.pow(i + 1, 0.92)) * Math.pow(p.skus[0].priceUsd / 25, p.isStar || p.isDefect ? 0 : -0.85));

  for (const p of products) {
    const desc = productDescription(rng, p.name, p.l2.name, p.l2.features, p.brand);
    const launch = new Date(START.getTime() + p.launchDay * DAY_MS);
    const discontinued = !p.isStar && !p.isDefect && rng.chance(0.06);
    prod.push([p.code, p.name, desc, l2Ids.get(p.l2), p.brand, rng.int(1, nSuppliers), ymd(launch), discontinued ? 'DISCONTINUED' : 'ACTIVE']);
    for (const s of p.skus) {
      const variant = s.sku.split('-').slice(2).join('-');
      skuW.push([s.sku, p.code, variant || null, s.priceUsd.toFixed(2), s.costUsd.toFixed(2), (rng.float(0.1, 3) * (p.l1.key === 'electronica' ? 1.5 : 1)).toFixed(3)]);
    }
  }
  await w.flushAll();
  return { products, popularity: new Weighted(products, weights) };
}

function makeProduct(rng: Rng, code: string, name: string, l1: L1, l2: L2, brand: string, launchDay: number, isStar: boolean, isDefect: boolean): Product {
  const [lo, hi] = l2.price;
  const price = Math.exp(rng.float(Math.log(lo), Math.log(hi)));
  const margin = rng.float(0.28, 0.6);
  const basePrice = Math.round(price * 100) / 100 - 0.01 > 1 ? Math.floor(price) + 0.9 : Math.round(price * 100) / 100;
  let labels: string[];
  switch (l2.variants) {
    case 'size_apparel':
      labels = rng.shuffle([...SIZES_APPAREL]).slice(0, rng.int(2, 5));
      break;
    case 'size_shoe':
      labels = rng.shuffle([...SIZES_SHOE]).slice(0, rng.int(3, 6));
      break;
    case 'color':
      labels = rng.shuffle([...COLORS]).slice(0, rng.int(1, 3));
      break;
    case 'pack':
      labels = rng.shuffle([...PACKS]).slice(0, rng.int(1, 2));
      break;
    default:
      labels = [''];
  }
  const skus: Sku[] = labels.map((lab, i) => {
    const mult = lab === 'Pack x2' ? 1.9 : lab === 'Pack x6' ? 5.4 : 1;
    const p = Math.round(basePrice * mult * 100) / 100;
    const tag = lab ? lab.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '').toUpperCase().slice(0, 6) : String(i + 1).padStart(2, '0');
    return { sku: `${code}-${tag}`, priceUsd: p, costUsd: Math.round(p * (1 - margin) * 100) / 100 };
  });
  return {
    code,
    name,
    l1,
    l2,
    brand,
    launchDay,
    quality: Math.min(4.95, Math.max(2.9, rng.normal(4.5, 0.35))),
    skus,
    isStar,
    isDefect,
  };
}
