import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';
import path from 'node:path';
import { ROOT } from './db.js';

/**
 * Embeddings locales con intfloat/multilingual-e5-small (ONNX cuantizado, 384 dims).
 * El modelo se descarga una vez a .cache/models y luego funciona sin red.
 * e5 requiere prefijos: "query: " para preguntas y "passage: " para documentos.
 */
export const EMBEDDING_MODEL = 'Xenova/multilingual-e5-small';
export const EMBEDDING_DIMS = 384;

env.cacheDir = path.join(ROOT, '.cache/models');

let extractor: Promise<FeatureExtractionPipeline> | null = null;

export async function getEmbedder(): Promise<(texts: string[]) => Promise<number[][]>> {
  // (cast a unknown: el tipo de unión de pipeline() es demasiado complejo para tsc)
  extractor ??= (pipeline as unknown as (t: string, m: string, o: object) => Promise<FeatureExtractionPipeline>)('feature-extraction', EMBEDDING_MODEL, { dtype: 'q8' });
  const ex = await extractor;
  return async (texts: string[]) => {
    const out = await ex(texts, { pooling: 'mean', normalize: true });
    return out.tolist() as number[][];
  };
}

export function toPgVector(v: number[]): string {
  return '[' + v.map((x) => x.toFixed(6)).join(',') + ']';
}
