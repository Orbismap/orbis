// Aurora oval: NOAA SWPC OVATION nowcast as a soft green-to-magenta glow, drawn from a small canvas image.
import { effect } from '@preact/signals';
import type { ImageSource } from 'maplibre-gl';
import { MAX_MERCATOR_LAT } from '../../core/geo';
import { formatAge, formatNumber } from '../../core/format';
import { MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { AURORA_W, auroraGrid, latestKp, type AuroraGrid } from '../../data/parsers/aurora';
import { Cleanup, bindOpacity, idBase } from '../../render/common';
import { defineLayer } from '../define';

const W = 720;
const H = 512;
/** [probability %, r, g, b, alpha 0..1] */
const RAMP: [number, number, number, number, number][] = [
  [0, 40, 255, 150, 0],
  [4, 40, 255, 150, 0.16],
  [15, 45, 255, 150, 0.5],
  [35, 120, 255, 140, 0.68],
  [55, 200, 255, 130, 0.8],
  [72, 255, 120, 215, 0.88],
  [100, 255, 190, 255, 0.95],
];

function rampAt(p: number): [number, number, number, number] {
  for (let i = 1; i < RAMP.length; i++) {
    const b = RAMP[i]!;
    if (p <= b[0]) {
      const a = RAMP[i - 1]!;
      const k = (p - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k, (a[4] + (b[4] - a[4]) * k) * 255];
    }
  }
  const l = RAMP[RAMP.length - 1]!;
  return [l[1], l[2], l[3], l[4] * 255];
}

/** Bilinear sample of the grid (lon -180..180 wraps, lat -90..90). */
function sample(g: AuroraGrid, lon: number, lat: number): number {
  const x = (((lon % 360) + 360) % 360);
  const y = Math.min(g.h - 1.001, Math.max(0, lat + 90));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const x1 = (x0 + 1) % AURORA_W;
  const v = (xx: number, yy: number) => g.probs[yy * AURORA_W + xx]!;
  return (v(x0, y0) * (1 - fx) + v(x1, y0) * fx) * (1 - fy) + (v(x0, y0 + 1) * (1 - fx) + v(x1, y0 + 1) * fx) * fy;
}

/** The OVATION grid is noisy (1° cells with jumps of 20+ %); a few box passes turn it into a soft glow. */
function smooth(g: AuroraGrid, passes = 3): AuroraGrid {
  let a = Float32Array.from(g.probs);
  let b = new Float32Array(a.length);
  const W = AURORA_W;
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < g.h; y++) for (let x = 0; x < W; x++) b[y * W + x] = (a[y * W + (x + W - 1) % W]! + a[y * W + x]! + a[y * W + (x + 1) % W]!) / 3;
    for (let y = 0; y < g.h; y++) for (let x = 0; x < W; x++) a[y * W + x] = (b[Math.max(0, y - 1) * W + x]! + b[y * W + x]! + b[Math.min(g.h - 1, y + 1) * W + x]!) / 3;
  }
  void b;
  return { ...g, probs: a as unknown as Uint8Array };
}

/** RGBA pixels in web-mercator row spacing so MapLibre's image source lines up with the latitudes. */
function render(g: AuroraGrid): Uint8ClampedArray {
  const px = new Uint8ClampedArray(W * H * 4);
  const sm = smooth(g);
  const yMax = Math.log(Math.tan(Math.PI / 4 + (MAX_MERCATOR_LAT * Math.PI) / 360));
  for (let j = 0; j < H; j++) {
    const yy = yMax * (1 - (2 * (j + 0.5)) / H);
    const lat = (2 * Math.atan(Math.exp(yy)) - Math.PI / 2) * (180 / Math.PI);
    for (let i = 0; i < W; i++) {
      const lon = (i + 0.5) / W * 360 - 180;
      const [r, gg, b, a] = rampAt(sample(sm, lon, lat));
      const o = (j * W + i) * 4;
      px[o] = r; px[o + 1] = gg; px[o + 2] = b; px[o + 3] = a;
    }
  }
  return px;
}

function toDataUrl(px: Uint8ClampedArray): string {
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  c.getContext('2d')!.putImageData(new ImageData(px as Uint8ClampedArray<ArrayBuffer>, W, H), 0, 0);
  return c.toDataURL('image/png');
}

export default defineLayer({
  id: 'polarlicht',
  category: 'gefahren',
  title: 'Polarlicht',
  summary: 'Wahrscheinlichkeit für sichtbares Polarlicht, grün bei geringer, magenta bei hoher Wahrscheinlichkeit',
  icon: 'aurora',
  color: '#55FFA0',
  form: 'raster',
  cadence: 'minutes',
  sources: [
    { name: 'NOAA SWPC OVATION Aurora', url: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'space/swpc/ovation_aurora_latest.json' } },
    { name: 'NOAA SWPC Kp-Index', url: 'https://www.swpc.noaa.gov/products/planetary-k-index', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'space/swpc/noaa-planetary-k-index.json' } },
  ],
  legend: () => ({
    type: 'scale',
    unit: 'Wahrscheinlichkeit',
    stops: [[5, '#2DFF96'], [25, '#5BFF8F'], [50, '#B8FF7E'], [70, '#FF78D6'], [100, '#FFBEFF']],
    ticks: [10, 30, 50, 70, 90],
    format: (v) => `${v} %`,
  }),
  keywords: ['polarlicht', 'aurora', 'nordlicht', 'südlicht', 'kp', 'sonnenwind', 'ovation', 'swpc'],

  mount(ctx) {
    const grid = ctx.resource<AuroraGrid>({
      key: 'live:ovation',
      url: bucketUrl('live', 'space/swpc/ovation_aurora_latest.json'),
      parse: 'auroraGrid',
      refresh: 5 * MINUTE,
      timeout: 30_000,
      fallback: async () => auroraGrid((await fetchJson('https://services.swpc.noaa.gov/json/ovation_aurora_latest.json', { timeout: 30_000 })).data),
    });
    const kp = ctx.resource({
      key: 'live:kp',
      url: bucketUrl('live', 'space/swpc/noaa-planetary-k-index.json'),
      parse: latestKp,
      refresh: 15 * MINUTE,
      fallback: async () => latestKp((await fetchJson('https://services.swpc.noaa.gov/products/noaa-planetary-k-index.json')).data),
    });
    const ml = ctx.map.ml;
    const base = idBase(ctx);
    const src = `${base}-src`;
    const layer = `${base}-glow`;
    const clean = new Cleanup();
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [[-180, MAX_MERCATOR_LAT], [180, MAX_MERCATOR_LAT], [180, -MAX_MERCATOR_LAT], [-180, -MAX_MERCATOR_LAT]];
    let current: AuroraGrid | undefined;

    clean.add(
      effect(() => {
        const g = grid.data.value;
        if (!g) return;
        current = g;
        const url = toDataUrl(render(g));
        const existing = ml.getSource(src) as ImageSource | undefined;
        if (existing) existing.updateImage({ url, coordinates });
        else {
          ctx.map.addSource(src, { type: 'image', url, coordinates });
          ctx.map.addLayer({ id: layer, type: 'raster', source: src, paint: { 'raster-opacity': 0.9, 'raster-resampling': 'linear', 'raster-fade-duration': 0 } }, 'raster');
          clean.add(bindOpacity(ctx, ml, [{ layer, prop: 'raster-opacity', base: 0.9 }]));
        }
      }),
    );
    clean.add(
      effect(() => {
        const g = grid.data.value;
        const k = kp.data.value;
        const err = grid.error.value;
        if (!g) {
          ctx.status(err && grid.state.value === 'error' ? { state: 'error', note: err } : { state: 'loading' });
          return;
        }
        const note = [k ? `Kp ${formatNumber(k.kp, k.kp % 1 ? 1 : 0)}` : undefined, `höchste Wahrscheinlichkeit ${formatNumber(g.max)} %`].filter(Boolean).join(' · ');
        ctx.status({ state: 'ready', updatedAt: g.obs || grid.updatedAt.value, note });
      }),
    );

    return {
      probe(at) {
        if (!current) return null;
        const v = Math.round(sample(current, at.lng, at.lat));
        return { label: 'Polarlicht', value: `${v} % Wahrscheinlichkeit${current.obs ? ` (${formatAge(current.obs)})` : ''}` };
      },
      destroy() {
        clean.run();
        ctx.map.remove({ layers: [layer], sources: [src] });
      },
    };
  },
});
