// Aurora oval: NOAA SWPC OVATION nowcast as a soft green-to-magenta glow, drawn from a small canvas image.
import { effect } from '@preact/signals';
import type { ImageSource } from 'maplibre-gl';
import { MAX_MERCATOR_LAT } from '../../core/geo';
import { formatAge, formatNumber } from '../../core/format';
import { MINUTE } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { AURORA_W, auroraGrid, latestKp, type AuroraGrid } from '../../data/parsers/aurora';
import { bzInfo, kpInfo, swXray, windInfo, xrayInfo, type SolarMag, type SolarWind, type XrayFlux } from '../../data/parsers/spaceweather';
import type { FeatureCollection } from 'geojson';
import type { FeedItem, InspectCard } from '../types';
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

const SWPC = 'https://services.swpc.noaa.gov/json';
const DEGRADED = 'Keine Messung';

/** Fill colour (rgba string) of a polar-cap sector. */
const rgba = (p: number): string => {
  const [r, g, b, a] = rampAt(p);
  return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${(a / 255).toFixed(3)})`;
};

/**
 * The image source ends at the web-mercator limit (±85.05°). The caps up to the poles are drawn as 5° sectors of
 * fill polygons (visible on the globe; the mercator projection never shows them), coloured by the smoothed probability.
 */
function polarCaps(g: AuroraGrid): FeatureCollection {
  const sm = smooth(g);
  const features: FeatureCollection['features'] = [];
  const step = 5;
  for (const sign of [1, -1]) {
    for (let lon = -180; lon < 180; lon += step) {
      const lat0 = 85 * sign;
      const lat1 = 89.999 * sign;
      const c = lon + step / 2;
      features.push({
        type: 'Feature',
        properties: { c: rgba(sample(sm, c, 87 * sign)) },
        geometry: { type: 'Polygon', coordinates: [[[lon, lat0], [lon + step, lat0], [lon + step, lat1], [lon, lat1], [lon, lat0]]] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}

// ---- space weather in words ------------------------------------------------------------------------------------
const nf = (v: number, d = 0) => formatNumber(v, d);
const signed = (v: number, d = 1) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${nf(Math.abs(v), d)}`;

function spaceCard(parts: { kp?: { kp: number; time: number }; wind?: SolarWind; mag?: SolarMag; xray?: XrayFlux }): InspectCard {
  const { kp, wind, mag, xray } = parts;
  const k = kp ? kpInfo(kp.kp) : undefined;
  const facts: InspectCard['facts'] = [];
  if (kp && k) facts.push({ label: 'Kp-Index', value: `${nf(kp.kp, kp.kp % 1 ? 1 : 0)} (${k.label})`, emphasis: k.level > 0 });
  if (wind) facts.push({ label: 'Sonnenwind', value: `${nf(wind.speed)} km/s, ${windInfo(wind.speed)}${wind.density !== null ? `, ${nf(wind.density, 1)} Teilchen/cm³` : ''}`, emphasis: wind.speed >= 600 });
  if (mag) facts.push({ label: 'Bz (Magnetfeld)', value: `${signed(mag.bz)} nT, ${bzInfo(mag.bz)}`, emphasis: mag.bz <= -5 });
  if (xray) facts.push({ label: 'Röntgen (GOES)', value: `${xray.cls}, ${xrayInfo(xray.cls)}`, emphasis: xray.cls[0] === 'M' || xray.cls[0] === 'X' });
  if (xray && xray.peakCls !== xray.cls) facts.push({ label: 'Höchstwert 24 h', value: `${xray.peakCls} (${formatAge(xray.peakTime)})` });
  const text = [
    k?.text,
    mag && mag.bzMin30 !== null && mag.bzMin30 <= -5 ? `Bz fiel in den letzten 30 Minuten bis auf ${signed(mag.bzMin30)} nT. Ein anhaltender Südwert ist der wichtigste Auslöser für Polarlicht.` : undefined,
    'Der Sonnenwind braucht vom Messpunkt (L1, 1,5 Mio. km vor der Erde) etwa 30 bis 60 Minuten bis zur Erde.',
  ].filter(Boolean).join('\n\n');
  const time = Math.max(kp?.time ?? 0, wind?.time ?? 0, mag?.time ?? 0, xray?.time ?? 0) || undefined;
  return {
    title: 'Weltraumwetter',
    subtitle: k ? `Geomagnetisch ${k.label}` : undefined,
    time,
    color: k && k.level > 0 ? '#FF78D6' : '#55FFA0',
    icon: 'aurora',
    facts: facts.length ? facts : [{ label: 'Messwerte', value: DEGRADED }],
    text,
    links: [{ label: 'NOAA Space Weather Prediction Center', url: 'https://www.swpc.noaa.gov/' }],
    location: [15, 72],
  };
}

export default defineLayer({
  id: 'polarlicht',
  category: 'gefahren',
  title: 'Polarlicht & Weltraumwetter',
  summary: 'Wahrscheinlichkeit für sichtbares Polarlicht, dazu Kp, Sonnenwind, Magnetfeld (Bz) und Röntgenklasse der Sonne',
  icon: 'aurora',
  color: '#55FFA0',
  form: 'raster',
  cadence: 'minutes',
  sources: [
    { name: 'NOAA SWPC OVATION Aurora', url: 'https://www.swpc.noaa.gov/products/aurora-30-minute-forecast', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'space/swpc/ovation_aurora_latest.json' } },
    { name: 'NOAA SWPC Kp-Index', url: 'https://www.swpc.noaa.gov/products/planetary-k-index', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'space/swpc/noaa-planetary-k-index.json' } },
    { name: 'NOAA SWPC Sonnenwind (Plasma und Magnetfeld, DSCOVR/ACE/IMAP)', url: 'https://www.swpc.noaa.gov/products/real-time-solar-wind', license: 'gemeinfrei (US-Regierung)' },
    { name: 'NOAA SWPC GOES-Röntgenfluss', url: 'https://www.swpc.noaa.gov/products/goes-x-ray-flux', license: 'gemeinfrei (US-Regierung)', manifest: { bucket: 'live', key: 'space/swpc/xrays-1-day.json' } },
  ],
  legend: () => ({
    type: 'scale',
    unit: 'Wahrscheinlichkeit',
    stops: [[5, '#2DFF96'], [25, '#5BFF8F'], [50, '#B8FF7E'], [70, '#FF78D6'], [100, '#FFBEFF']],
    ticks: [10, 30, 50, 70, 90],
    format: (v) => `${v} %`,
  }),
  keywords: ['polarlicht', 'aurora', 'nordlicht', 'südlicht', 'kp', 'sonnenwind', 'ovation', 'swpc', 'weltraumwetter', 'bz', 'röntgen', 'flare', 'sonneneruption', 'solar wind', 'geomagnetisch', 'sturm'],

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
    // solar wind and magnetic field: CORS-open, but ~1.5-2.7 MB each (several days, three spacecraft) -> every 10 min, parsed in the worker
    const wind = ctx.resource<SolarWind | undefined>({ key: 'swpc:rtsw-wind', url: `${SWPC}/rtsw/rtsw_wind_1m.json`, parse: 'swWind', refresh: 10 * MINUTE, timeout: 45_000 });
    const mag = ctx.resource<SolarMag | undefined>({ key: 'swpc:rtsw-mag', url: `${SWPC}/rtsw/rtsw_mag_1m.json`, parse: 'swMag', refresh: 10 * MINUTE, timeout: 45_000 });
    const xray = ctx.resource<XrayFlux | undefined>({
      key: 'live:xrays',
      url: bucketUrl('live', 'space/swpc/xrays-1-day.json'),
      parse: 'swXray',
      refresh: 5 * MINUTE,
      timeout: 30_000,
      fallback: async () => swXray((await fetchJson(`${SWPC}/goes/primary/xrays-1-day.json`, { timeout: 30_000 })).data),
    });
    const ml = ctx.map.ml;
    const base = idBase(ctx);
    const capSrc = `${base}-cap-src`;
    const capLayer = `${base}-cap`;
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
        if (existing) {
          existing.updateImage({ url, coordinates });
          (ml.getSource(capSrc) as { setData(d: unknown): void } | undefined)?.setData(polarCaps(g));
        }
        else {
          ctx.map.addSource(src, { type: 'image', url, coordinates });
          ctx.map.addSource(capSrc, { type: 'geojson', data: polarCaps(g) });
          ctx.map.addLayer({ id: capLayer, type: 'fill', source: capSrc, paint: { 'fill-color': ['get', 'c'], 'fill-opacity': 0.9, 'fill-antialias': false } }, 'raster');
          clean.add(bindOpacity(ctx, ml, [{ layer: capLayer, prop: 'fill-opacity', base: 0.9 }]));
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
        const w = wind.data.value;
        const m = mag.data.value;
        const x = xray.data.value;
        const note = [
          k ? `Kp ${formatNumber(k.kp, k.kp % 1 ? 1 : 0)}` : undefined,
          w ? `Wind ${formatNumber(w.speed)} km/s` : undefined,
          m ? `Bz ${signed(m.bz)} nT` : undefined,
          x ? `Röntgen ${x.cls}` : undefined,
          `Polarlicht bis ${formatNumber(g.max)} %`,
        ].filter(Boolean).join(' · ');
        ctx.status({ state: 'ready', updatedAt: g.obs || grid.updatedAt.value, note });
      }),
    );

    clean.add(
      effect(() => {
        const parts = { kp: kp.data.value, wind: wind.data.value, mag: mag.data.value, xray: xray.data.value };
        if (!parts.kp && !parts.wind && !parts.mag && !parts.xray) return;
        const card = spaceCard(parts);
        const k = parts.kp ? kpInfo(parts.kp.kp) : undefined;
        const item: FeedItem = {
          id: 'weltraumwetter',
          title: 'Weltraumwetter jetzt',
          subtitle: [parts.kp ? `Kp ${formatNumber(parts.kp.kp, parts.kp.kp % 1 ? 1 : 0)}` : undefined, k?.label].filter(Boolean).join(' · '),
          time: card.time,
          magnitude: parts.kp?.kp,
          color: card.color,
          location: card.location!,
          card,
        };
        ctx.feed([item]);
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
        ctx.map.remove({ layers: [capLayer, layer], sources: [capSrc, src] });
      },
    };
  },
});
