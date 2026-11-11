import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { decodeOwx, owxValue } from './decode';
import { dequantize, tileOf } from './index';

/** Encoder mirroring scripts/wetter-icon.py encode(): time difference, plane predictor, zigzag, byte planes, gzip. */
function encodeOwx(q: Int16Array, nt: number, ny: number, nx: number, extra: Record<string, unknown> = {}): ArrayBuffer {
  const n = ny * nx;
  const total = nt * n;
  const z = new Uint16Array(total);
  const s = new Int16Array(n);
  for (let t = 0; t < nt; t++) {
    for (let i = 0; i < n; i++) s[i] = t === 0 ? q[i]! : q[t * n + i]! - q[(t - 1) * n + i]!;
    for (let y = 0; y < ny; y++) {
      for (let x = 0; x < nx; x++) {
        const i = y * nx + x;
        const pred = y === 0 ? (x === 0 ? 0 : s[i - 1]!) : x === 0 ? s[i - nx]! : s[i - 1]! + s[i - nx]! - s[i - nx - 1]!;
        const d = new Int16Array([s[i]! - pred])[0]!;
        z[t * n + i] = ((d << 1) ^ (d >> 15)) & 0xffff;
      }
    }
  }
  const planes = new Uint8Array(total * 2);
  for (let i = 0; i < total; i++) {
    planes[i] = z[i]! & 255;
    planes[total + i] = z[i]! >> 8;
  }
  const header = Buffer.from(JSON.stringify({ var: 'temperature_2m', nt, ny, nx, lat0: 90, lon0: -180, dx: 0.5, dy: -0.5, wrap: true, scale: 0.1, offset: 0, nodata: -32768, pred: 'plane-time', ...extra }));
  const body = gzipSync(Buffer.from(planes));
  const out = Buffer.alloc(8 + header.length + body.length);
  out.write('OWX1', 0, 'latin1');
  out.writeUInt32LE(header.length, 4);
  header.copy(out, 8);
  body.copy(out, 8 + header.length);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}

describe('owx', () => {
  it('decodes a synthetic file (3 steps, 5x4, wrapping values, nodata)', async () => {
    const nt = 3, ny = 4, nx = 5;
    const q = new Int16Array(nt * ny * nx);
    for (let t = 0; t < nt; t++) for (let y = 0; y < ny; y++) for (let x = 0; x < nx; x++) q[t * ny * nx + y * nx + x] = -200 + x * 37 + y * 91 + t * 13 + ((x * y) % 3) * 7;
    q[7] = -32768;
    q[ny * nx + 9] = 32767;
    q[2 * ny * nx + 3] = -32768 + 5; // forces int16 wrap in the differences
    const f = await decodeOwx(encodeOwx(q, nt, ny, nx));
    expect(f.header.var).toBe('temperature_2m');
    expect(f.header.nt).toBe(3);
    expect(Array.from(f.data)).toEqual(Array.from(q));
    expect(owxValue(f, 0, 0, 0)).toBeCloseTo(-20, 5);
    expect(owxValue(f, 0, 1, 2)).toBeUndefined(); // index 7 is nodata
  });
  it('rejects wrong magic', async () => {
    await expect(decodeOwx(new TextEncoder().encode('NOPE0000').buffer as ArrayBuffer)).rejects.toThrow();
  });
  it('helpers', () => {
    expect(tileOf(13.4, 52.5)).toEqual({ c: 4, r: 0 });
    expect(tileOf(-179, -80)).toEqual({ c: 0, r: 3 });
    expect(dequantize({ scale: 0.1, offset: 0, nodata: -32768 }, 215)).toBeCloseTo(21.5);
    expect(dequantize({ scale: 0.1, offset: 0, nodata: -32768 }, -32768)).toBeUndefined();
  });
});
