// Blitzortung live stream: messages are JSON or LZW-like compressed JSON (the decoder of blitzortung.org's own map).
export type Strike = { lon: number; lat: number; /** strike time, ms since epoch */ t: number; /** arrival at this client */ recv: number };

export function lzwDecode(input: string): string {
  const chars = input.split('');
  if (!chars.length) return '';
  const dict = new Map<number, string>();
  let cur = chars[0]!;
  let prev = cur;
  const out = [cur];
  let code = 256;
  for (let i = 1; i < chars.length; i++) {
    const c = chars[i]!.charCodeAt(0);
    const entry = c < 256 ? chars[i]! : (dict.get(c) ?? prev + cur);
    out.push(entry);
    cur = entry.charAt(0);
    dict.set(code++, prev + cur);
    prev = entry;
  }
  return out.join('');
}

/** One stream message -> strike, or undefined when it is not a located strike. `time` is in nanoseconds. */
export function parseStrike(raw: string, now = Date.now()): { strike: Strike; key: string } | undefined {
  let msg: { time?: number; lat?: number; lon?: number };
  try {
    msg = JSON.parse(raw);
  } catch {
    try {
      msg = JSON.parse(lzwDecode(raw));
    } catch {
      return undefined;
    }
  }
  if (typeof msg?.lat !== 'number' || typeof msg.lon !== 'number' || Math.abs(msg.lat) > 90 || Math.abs(msg.lon) > 180) return undefined;
  let t = typeof msg.time === 'number' ? msg.time / 1e6 : now;
  if (!Number.isFinite(t) || Math.abs(t - now) > 3_600_000) t = now;
  return { strike: { lon: msg.lon, lat: msg.lat, t, recv: now }, key: msg.time !== undefined ? String(msg.time) : `${msg.lat}:${msg.lon}:${Math.round(t / 1000)}` };
}
