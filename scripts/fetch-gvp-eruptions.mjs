// Smithsonian GVP eruption history -> one compact snapshot for the map (public/data/gvp-eruptions.json).
//
// The GVP WFS sends no CORS headers, so the browser cannot query it directly. This script pulls both
// layers once (eruptions + Holocene volcanoes), groups the eruptions by volcano and writes a small file:
//
//   { u: ISO date, s: source, v: [[lat, lon, volcanoNumber, name, [[year, month, day, vei, confirmed], …]], …] }
//
// year < 0 = BCE, month/day 0 = unknown, vei 0..7, confirmed 1 = confirmed eruption, 0 = uncertain.
//
// Later this belongs in the daily collector of Orbismap/data (same URL, output volcanoes/eruptions.json);
// until then the bundled snapshot is refreshed by hand:
//   node scripts/fetch-gvp-eruptions.mjs
import { writeFileSync } from 'node:fs';

const WFS = 'https://webservices.volcano.si.edu/geoserver/GVP-VOTW/ows';
const UA = { 'User-Agent': 'Orbis/1.0 (+https://github.com/malte9799/orbis)' };
const OUT = new URL('../public/data/gvp-eruptions.json', import.meta.url);

async function layer(typeName) {
  const url = `${WFS}?service=WFS&version=1.1.0&request=GetFeature&typeName=${typeName}&outputFormat=application/json&maxFeatures=50000`;
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(180000) });
  if (!res.ok) throw new Error(`${typeName}: HTTP ${res.status}`);
  return res.json();
}

const [eruptions, volcanoes] = await Promise.all([
  layer('GVP-VOTW:Smithsonian_VOTW_Holocene_Eruptions'),
  layer('GVP-VOTW:Smithsonian_VOTW_Holocene_Volcanoes'),
]);

const r4 = (v) => Math.round(v * 1e4) / 1e4;
const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

/** Volcano geometry as fallback when an eruption has no point. */
const site = new Map();
for (const f of volcanoes.features ?? []) {
  const p = f.properties ?? {};
  const c = f.geometry?.coordinates;
  if (c) site.set(String(p.Volcano_Number), [c[0], c[1]]);
}

const groups = new Map();
for (const f of eruptions.features ?? []) {
  const p = f.properties ?? {};
  const c = f.geometry?.type === 'Point' ? f.geometry.coordinates : undefined;
  const key = String(p.Volcano_Number ?? '');
  const home = c ?? site.get(key);
  if (!home) continue;
  let g = groups.get(key);
  if (!g) groups.set(key, (g = { lat: r4(home[1]), lon: r4(home[0]), num: p.Volcano_Number, name: p.Volcano_Name ?? '', e: [] }));
  g.e.push([
    Math.round(num(p.StartDateYear)),
    Math.round(num(p.StartDateMonth)),
    Math.round(num(p.StartDateDay)),
    p.ExplosivityIndexMax == null ? 0 : Math.round(num(p.ExplosivityIndexMax)),
    p.Activity_Type === 'Confirmed Eruption' ? 1 : 0,
  ]);
}

const v = [...groups.values()].map((g) => [g.lat, g.lon, g.num, g.name, g.e]);
const body = JSON.stringify({ u: new Date().toISOString(), s: 'Smithsonian Global Volcanism Program, Holocene Eruptions (WFS)', v });
writeFileSync(OUT, body);

const n = v.reduce((a, g) => a + g[4].length, 0);
console.log(`${v.length} volcanoes, ${n} eruptions, ${(body.length / 1024).toFixed(0)} KB -> public/data/gvp-eruptions.json`);
