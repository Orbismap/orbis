// Colouring of a scalar grid into an equirectangular RGBA image (premultiplied) for the field renderer.
import { buildLut, scaleRange, type ColorScale } from '../../core/color';
import { sampleScalar } from './grid';

/** Premultiplied RGBA table of a scale (so that texture filtering never fringes at soft alpha edges). */
export function premultipliedLut(scale: ColorScale, size = 512): Uint8Array {
  const [min, max] = scaleRange(scale);
  const lut = buildLut(scale, min, max, size);
  for (let i = 0; i < size; i++) {
    const a = lut[i * 4 + 3]! / 255;
    lut[i * 4] = Math.round(lut[i * 4]! * a);
    lut[i * 4 + 1] = Math.round(lut[i * 4 + 1]! * a);
    lut[i * 4 + 2] = Math.round(lut[i * 4 + 2]! * a);
  }
  return lut;
}

/**
 * w×h image of the scalar grid: bilinear in value (so ramps stay smooth), then looked up in the table. Cells without
 * data stay transparent.
 */
export function bakeScalar(field: Float32Array, scale: ColorScale, w = 1440, h = 720): Uint8Array {
  const [min, max] = scaleRange(scale);
  const lut = premultipliedLut(scale);
  const n = lut.length / 4;
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const lat = 90 - ((y + 0.5) / h) * 180;
    for (let x = 0; x < w; x++) {
      const v = sampleScalar(field, -180 + ((x + 0.5) / w) * 360, lat);
      if (v !== v) continue;
      const t = Math.min(1, Math.max(0, (v - min) / (max - min)));
      const k = Math.round(t * (n - 1)) * 4;
      const o = (y * w + x) * 4;
      out[o] = lut[k]!;
      out[o + 1] = lut[k + 1]!;
      out[o + 2] = lut[k + 2]!;
      out[o + 3] = lut[k + 3]!;
    }
  }
  return out;
}
