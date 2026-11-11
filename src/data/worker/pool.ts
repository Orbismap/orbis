// Worker pool. Falls back to running parsers inline where Workers do not exist (tests, old engines).
import type { Parser, ParserName, ParserResult } from '../parsers';
import type { RawFormat } from '../http';
import { decodePayload, type WorkerRequest, type WorkerResponse } from './protocol';

interface Slot { worker: Worker; busy: number }
interface Pending { resolve(v: unknown): void; reject(e: Error): void; slot: Slot }

const size = () => Math.max(1, Math.min(4, (typeof navigator !== 'undefined' ? navigator.hardwareConcurrency || 2 : 2) - 1));

let slots: Slot[] | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensure(): Slot[] | undefined {
  if (slots) return slots;
  if (typeof Worker === 'undefined') return undefined;
  try {
    slots = Array.from({ length: size() }, () => {
      const slot: Slot = { worker: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }), busy: 0 };
      slot.worker.onmessage = (e: MessageEvent<WorkerResponse>) => {
        const m = e.data;
        const p = pending.get(m.id);
        if (!p) return;
        pending.delete(m.id);
        p.slot.busy--;
        if (m.ok) p.resolve(m.result);
        else p.reject(new Error(m.error));
      };
      slot.worker.onerror = (e) => {
        for (const [id, p] of pending) {
          if (p.slot === slot) {
            pending.delete(id);
            slot.busy = 0;
            p.reject(new Error(e.message || 'Worker-Fehler'));
          }
        }
      };
      return slot;
    });
  } catch {
    slots = undefined;
  }
  return slots;
}

export interface RunOptions { format?: RawFormat; args?: unknown; signal?: AbortSignal }

/**
 * Runs the named parser. `input` may be an ArrayBuffer (decoded in the worker according to `format`),
 * which is transferred, so the caller must not use it afterwards.
 */
export async function runParser<N extends ParserName>(name: N, input: unknown, opts: RunOptions = {}): Promise<ParserResult<N>> {
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError');
  const pool = ensure();
  if (!pool) {
    const { parsers } = await import('../parsers');
    return (await (parsers[name] as Parser)(decodePayload(input, opts.format), opts.args)) as ParserResult<N>;
  }
  const slot = pool.reduce((a, b) => (b.busy < a.busy ? b : a));
  const id = nextId++;
  const req: WorkerRequest = { id, name, input, format: opts.format, args: opts.args };
  return new Promise<ParserResult<N>>((resolve, reject) => {
    slot.busy++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject, slot });
    // a late result of an aborted job is simply dropped by the caller
    opts.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
    slot.worker.postMessage(req, input instanceof ArrayBuffer ? [input] : []);
  });
}
