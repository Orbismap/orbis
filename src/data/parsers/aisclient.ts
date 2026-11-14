// WebSocket client of aisstream.io (not a parser; lives here because every .ts in a category folder is a layer).
// Endpoint order: the proxy relay `<PROXY>/ais` (the worker holds the key, visitors need none), then the user's own key
// directly at stream.aisstream.io. Reconnects with back-off (2 s doubling to 60 s), resubscribes on box changes and
// closes cleanly. The key never appears in URLs, logs or error texts.
import { PROXY } from '../endpoints';

export type AisBoxes = [[number, number], [number, number]][];
export interface AisClientOptions {
  onMessage(text: string): void;
  /** 'relay' | 'key' while connected, 'down' while no endpoint works, 'idle' when closed */
  onState(state: 'relay' | 'key' | 'down' | 'idle', note?: string): void;
  getKey(): string | undefined;
}

const DIRECT = 'wss://stream.aisstream.io/v0/stream';
export const relayUrl = (proxy = PROXY): string => {
  const u = new URL(proxy);
  u.protocol = 'wss:';
  u.pathname = `${u.pathname.replace(/\/$/, '')}/ais`;
  u.search = '';
  return u.toString();
};
const TYPES = ['PositionReport', 'StandardClassBPositionReport', 'ShipStaticData', 'StaticDataReport'];

export class AisClient {
  private ws: WebSocket | null = null;
  private boxes: AisBoxes | null = null;
  private closed = false;
  private retry = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private mode: 'relay' | 'key' = 'relay';
  private gotData = false;
  private failsRelay = 0;

  constructor(private o: AisClientOptions) {}

  setBoxes(boxes: AisBoxes | null): void {
    this.boxes = boxes;
    if (!boxes) { this.close(); return; }
    this.closed = false;
    if (this.ws?.readyState === WebSocket.OPEN) this.subscribe();
    else if (!this.ws && !this.timer) this.connect();
  }

  close(): void {
    this.closed = true;
    clearTimeout(this.timer);
    this.timer = undefined;
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null; try { ws.close(); } catch { /* already closed */ } }
    this.o.onState('idle');
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || !this.boxes) return;
    const key = this.mode === 'key' ? this.o.getKey() : undefined;
    this.ws.send(JSON.stringify(key ? { APIKey: key, BoundingBoxes: this.boxes, FilterMessageTypes: TYPES } : { BoundingBoxes: this.boxes }));
  }

  private connect(): void {
    if (this.closed) return;
    const key = this.o.getKey();
    // the relay first; after three failures in a row (or a rejected relay) the user's own key, if any
    this.mode = this.failsRelay >= 3 && key ? 'key' : 'relay';
    let ws: WebSocket;
    try { ws = new WebSocket(this.mode === 'key' ? DIRECT : relayUrl()); } catch { this.fail(); return; }
    this.ws = ws;
    this.gotData = false;
    ws.onopen = () => { this.subscribe(); };
    ws.onmessage = async (ev) => {
      const text = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
      if (!this.gotData) {
        this.gotData = true;
        this.retry = 0;
        if (this.mode === 'relay') this.failsRelay = 0;
        this.o.onState(this.mode);
      }
      this.o.onMessage(text);
    };
    ws.onerror = () => { /* onclose follows */ };
    ws.onclose = () => { this.ws = null; if (!this.closed) this.fail(); };
  }

  private fail(): void {
    if (this.mode === 'relay') this.failsRelay++;
    const hasKey = !!this.o.getKey();
    this.o.onState('down', this.mode === 'relay' ? (hasKey ? 'AIS-Relay nicht erreichbar, nutze deinen aisstream.io-Schlüssel' : 'AIS-Relay des Daten-Proxys nicht erreichbar') : 'aisstream.io nicht erreichbar, Schlüssel prüfen');
    const delay = Math.min(60_000, 2000 * 2 ** this.retry++);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = undefined; this.connect(); }, this.failsRelay === 3 && hasKey ? 500 : delay);
  }
}
