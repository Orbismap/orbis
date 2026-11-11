// Worker entry: runs registered parsers off the main thread.
import { parsers, type Parser, type ParserName } from '../parsers';
import { decodePayload, collectTransferables, type WorkerRequest, type WorkerResponse } from './protocol';

const scope = self as unknown as {
  postMessage(msg: WorkerResponse, transfer: Transferable[]): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

scope.onmessage = async (e) => {
  const { id, name, input, format, args } = e.data;
  try {
    const fn = parsers[name as ParserName] as Parser | undefined;
    if (!fn) throw new Error(`Unbekannter Parser: ${name}`);
    const result = await fn(decodePayload(input, format), args);
    scope.postMessage({ id, ok: true, result }, collectTransferables(result));
  } catch (err) {
    scope.postMessage({ id, ok: false, error: (err as Error)?.message ?? String(err) }, []);
  }
};
