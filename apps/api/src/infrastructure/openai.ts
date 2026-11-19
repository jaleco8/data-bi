/** Cliente REST de OpenAI Responses API con streaming y llamadas a herramientas. */

export interface OToolCall {
  call_id: string;
  name: string;
  arguments: string;
}
export type OItem =
  | { type: 'message'; role: 'user'; content: Array<{ type: 'input_text'; text: string }> }
  | { type: 'message'; role: 'assistant'; content: Array<{ type: 'output_text'; text: string }> }
  | { type: 'function_call'; call_id: string; name: string; arguments: string }
  | { type: 'function_call_output'; call_id: string; output: string };

export class OpenAIError extends Error {
  constructor(message: string, public readonly status?: number) { super(message); }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const FIRST_RESPONSE_TIMEOUT_MS = Number(process.env.OPENAI_FIRST_RESPONSE_TIMEOUT_MS ?? 25_000);

export async function* streamResponse(opts: {
  apiKey: string;
  model: string;
  system: string;
  input: OItem[];
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  signal?: AbortSignal;
}): AsyncGenerator<{ item?: OItem; text?: string; finish?: boolean }> {
  const body = JSON.stringify({
    model: opts.model,
    instructions: opts.system,
    input: opts.input,
    tools: opts.tools.map((t) => ({ type: 'function', name: t.name, description: t.description, parameters: t.parameters, strict: false })),
    stream: true,
    max_output_tokens: 16384,
  });
  let res!: Response;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ttfb = new AbortController();
    const timer = setTimeout(() => ttfb.abort(), FIRST_RESPONSE_TIMEOUT_MS);
    try {
      res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${opts.apiKey}` }, body,
        signal: opts.signal ? AbortSignal.any([opts.signal, ttfb.signal]) : ttfb.signal,
      });
    } catch (e) {
      if (ttfb.signal.aborted && !opts.signal?.aborted) throw new OpenAIError(`OpenAI API: ${opts.model} no respondió en ${FIRST_RESPONSE_TIMEOUT_MS / 1000} s`, 504);
      throw e;
    } finally { clearTimeout(timer); }
    if (res.ok || !RETRYABLE.has(res.status) || attempt === MAX_ATTEMPTS - 1) break;
    await res.body?.cancel();
    const retryAfter = Number(res.headers.get('retry-after'));
    const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : Math.min(20_000, 1500 * 2 ** attempt) + Math.random() * 500;
    await new Promise((r) => setTimeout(r, wait));
  }
  if (!res.ok || !res.body) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json() as { error?: { message?: string } }; msg = j.error?.message ?? msg; } catch {}
    throw new OpenAIError(`OpenAI API: ${msg}`, res.status);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = '';
  const calls = new Map<string, { call_id: string; name: string; arguments: string }>();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const events = buf.split(/\r?\n\r?\n/); buf = events.pop() ?? '';
    for (const ev of events) {
      const data = ev.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('');
      if (!data || data === '[DONE]') continue;
      const j = JSON.parse(data) as { type?: string; delta?: string; item?: { type?: string; id?: string; call_id?: string; name?: string; arguments?: string }; output_index?: number; item_id?: string };
      if (j.type === 'response.output_text.delta' && j.delta) yield { text: j.delta };
      else if (j.type === 'response.output_item.added' && j.item?.type === 'function_call') {
        calls.set(j.item_id ?? j.item.id ?? '', { call_id: j.item.call_id ?? '', name: j.item.name ?? '', arguments: j.item.arguments ?? '' });
      } else if (j.type === 'response.function_call_arguments.delta') {
        const c = calls.get(j.item_id ?? ''); if (c) c.arguments += j.delta ?? '';
      } else if (j.type === 'response.output_item.done' && j.item?.type === 'function_call') {
        yield { item: { type: 'function_call', call_id: j.item.call_id ?? '', name: j.item.name ?? '', arguments: j.item.arguments ?? '' } };
      } else if (j.type === 'response.completed') yield { finish: true };
      else if (j.type === 'response.failed' || j.type === 'error') {
        const err = (j as { response?: { error?: { message?: string; code?: string } }; message?: string });
        throw new OpenAIError(err.response?.error?.message ?? err.message ?? 'La solicitud a OpenAI falló', 502);
      }
    }
  }
}
