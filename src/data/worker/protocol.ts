// Message format between pool and worker, plus helpers shared by both sides.
import type { RawFormat } from '../http';

export interface WorkerRequest { id: number; name: string; input: unknown; format?: RawFormat; args?: unknown }
export type WorkerResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

/** ArrayBuffer input is decoded according to the declared format; everything else passes through. */
export function decodePayload(input: unknown, format?: RawFormat): unknown {
  if (input instanceof ArrayBuffer && format && format !== 'arraybuffer') {
    const text = new TextDecoder().decode(input);
    return format === 'json' ? JSON.parse(text) : text;
  }
  return input;
}

/** Array buffers of typed arrays on the result itself or its top-level properties. */
export function collectTransferables(result: unknown): Transferable[] {
  const out = new Set<ArrayBuffer>();
  const visit = (v: unknown) => {
    if (v instanceof ArrayBuffer) out.add(v);
    else if (ArrayBuffer.isView(v) && v.buffer instanceof ArrayBuffer) out.add(v.buffer);
  };
  visit(result);
  if (result && typeof result === 'object' && !ArrayBuffer.isView(result) && !(result instanceof ArrayBuffer) && !Array.isArray(result)) {
    for (const v of Object.values(result)) visit(v);
  }
  return [...out].filter((b) => b.byteLength > 0);
}
