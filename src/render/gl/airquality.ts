// Classes, colours and the smooth image of the air quality / pollen grid (see data/parsers/airquality.ts).
import { sampleScale, type ColorScale } from '../../core/color';
import { MAX_MERCATOR_LAT } from '../../core/geo';
import { aqSample, type AqGrid, type AqVar } from '../../data/parsers/airquality';

export interface AqSpec {
  label: string;
  unit: string;
  /** upper limits of the classes (the last class is open) */
  limits: number[];
  classes: { color: string; label: string }[];
  /** pollen: 0 is transparent (out of season) */
  pollen?: boolean;
}

const EAQI_CLASSES = [
  { color: '#50F0E6', label: 'Sehr gut' }, { color: '#50CCAA', label: 'Gut' }, { color: '#F0E641', label: 'Mäßig' },
  { color: '#FF5050', label: 'Schlecht' }, { color: '#960032', label: 'Sehr schlecht' }, { color: '#7D2181', label: 'Extrem schlecht' },
];
const POLLEN_CLASSES = [
  { color: '#8FD6A0', label: 'Kein bis sehr schwach' }, { color: '#C8E36A', label: 'Schwach' }, { color: '#F5C842', label: 'Mäßig' },
  { color: '#F0803C', label: 'Stark' }, { color: '#B02E5C', label: 'Sehr stark' },
];
const pollen = (label: string): AqSpec => ({ label, unit: 'Körner/m³', limits: [1, 10, 50, 200], classes: POLLEN_CLASSES, pollen: true });

/** Class limits of the European Air Quality Index (EEA) per pollutant, as used by Open-Meteo. */
export const AQ_SPECS: Record<AqVar, AqSpec> = {
  european_aqi: { label: 'Europäischer Luftqualitätsindex', unit: '', limits: [20, 40, 60, 80, 100], classes: EAQI_CLASSES },
  pm2_5: { label: 'Feinstaub PM2,5', unit: 'µg/m³', limits: [10, 20, 25, 50, 75], classes: EAQI_CLASSES },
  pm10: { label: 'Feinstaub PM10', unit: 'µg/m³', limits: [20, 40, 50, 100, 150], classes: EAQI_CLASSES },
  nitrogen_dioxide: { label: 'Stickstoffdioxid NO₂', unit: 'µg/m³', limits: [40, 90, 120, 230, 340], classes: EAQI_CLASSES },
  ozone: { label: 'Ozon O₃', unit: 'µg/m³', limits: [50, 100, 130, 240, 380], classes: EAQI_CLASSES },
  birch_pollen: pollen('Birkenpollen'),
  alder_pollen: pollen('Erlenpollen'),
  grass_pollen: pollen('Gräserpollen'),
  mugwort_pollen: pollen('Beifußpollen'),
  olive_pollen: pollen('Olivenpollen'),
  ragweed_pollen: pollen('Ambrosiapollen'),
};

/** Index of the class a value falls in. */
export const aqClass = (spec: AqSpec, v: number): number => {
  let i = 0;
  while (i < spec.limits.length && v >= spec.limits[i]!) i++;
  return i;
};

const alpha = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};

/** Colour scale: flat inside a class, short transitions at the limits. Pollen: the first class is see-through. */
export function aqScale(spec: AqSpec): ColorScale {
  const lo = [0, ...spec.limits];
  const hi = [...spec.limits, spec.limits[spec.limits.length - 1]! * 1.6];
  const stops: [number, string][] = [];
  spec.classes.forEach((c, i) => {
    const w = hi[i]! - lo[i]!;
    const a = spec.pollen && i === 0 ? 0 : 0.68;
    stops.push([lo[i]! + w * 0.18, alpha(c.color, a)], [hi[i]! - w * 0.18, alpha(c.color, a)]);
  });
  return { unit: spec.unit, stops, ticks: spec.limits };
}

export const AQ_W = 512;
export const AQ_BOUNDS = (g: AqGrid) => ({ west: g.lon0, east: g.lon0 + (g.nx - 1) * g.step, south: g.lat0, north: g.lat0 + (g.ny - 1) * g.step });

/** RGBA image of one variable: bilinear between nodes, rows spaced in web-mercator, soft fade at the grid edge. */
export function renderAq(g: AqGrid, v: AqVar): { px: Uint8ClampedArray; w: number; h: number } {
  const b = AQ_BOUNDS(g);
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (Math.min(MAX_MERCATOR_LAT, Math.max(-MAX_MERCATOR_LAT, lat)) * Math.PI) / 360));
  const yN = y(b.north);
  const yS = y(b.south);
  const w = AQ_W;
  const h = Math.max(32, Math.round((w * (yN - yS)) / (((b.east - b.west) * Math.PI) / 180)));
  const scale = aqScale(AQ_SPECS[v]);
  const px = new Uint8ClampedArray(w * h * 4);
  const fade = g.step * 0.9;
  for (let j = 0; j < h; j++) {
    const yy = yN - ((j + 0.5) / h) * (yN - yS);
    const lat = (2 * Math.atan(Math.exp(yy)) - Math.PI / 2) * (180 / Math.PI);
    for (let i = 0; i < w; i++) {
      const lon = b.west + ((i + 0.5) / w) * (b.east - b.west);
      const val = aqSample(g, v, lon, lat);
      if (val === undefined) continue;
      const c = sampleScale(scale, val);
      const d = Math.min(lon - b.west, b.east - lon, lat - b.south, b.north - lat);
      const f = Math.max(0, Math.min(1, d / fade));
      const o = (j * w + i) * 4;
      px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = c[3] * f;
    }
  }
  return { px, w, h };
}
