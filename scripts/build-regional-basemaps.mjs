// Regional basemaps from the OSM editor-layer-index (the imagery list of the iD editor) -> committed data files.
//
//   node scripts/build-regional-basemaps.mjs [path/to/imagery.geojson]
//
// Without an argument the current index is downloaded from github.com/osmlab/editor-layer-index (gh-pages).
// Writes:
//   src/map/basemaps/regional.generated.json   all entries (lazy-loaded by the app only when a regional map is needed)
//   src/map/basemaps/regional.ids.generated.ts  id list only (synchronous id validation: URL `b=`, saved Karten)
//
// Kept: plain XYZ/TMS tile templates and WMS endpoints that can serve EPSG:3857 (MapLibre fills {bbox-epsg-3857}).
// Skipped: keys/tokens/custom headers, terms-of-use restrictions, overlays/transparent layers, categories other/qa,
// non-https, entries without valid georeference, unsupported placeholders, global entries we ship ourselves.
// Shapes are reduced to their bounding box. No tile endpoint is contacted by this script.
//
// Series: ELI lists many orthophoto products once per year (same provider, same name apart from the year). Entries
// with the same country, class (photo / map / elevation), tile host and name stem (year, year range or "(2019)"
// removed) are merged into ONE entry with an ordered member list `m` (newest first). The newest year draws on top,
// older years show through where it has no tiles (the app stacks them, see map/basemaps/regional.ts). A group is merged
// only when it has no worldwide extent, at least two members, and at most one member without a year (the "current"
// layer, ordered first). Everything else stays separate. The old ids of the members live on as aliases.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const SRC = 'https://raw.githubusercontent.com/osmlab/editor-layer-index/gh-pages/imagery.geojson';
const OUT_JSON = new URL('../src/map/basemaps/regional.generated.json', import.meta.url);
const OUT_IDS = new URL('../src/map/basemaps/regional.ids.generated.ts', import.meta.url);

/** ELI entries that exist as hand-written basemaps already, need a key, or are known dead (OpenAerialMapMosaic: Kontur delivers no tiles). */
const OWN = new Set(['EsriWorldImagery', 'EsriWorldImageryClarity', 'MAPNIK', 'OpenTopoMap', 'OpenAerialMapMosaic', 'swisstopo_swissimage', 'swisstopo_swissalti3d', 'swisstopo_swisssurface3d', 'osmim-imagicode-S2A_R065_N47_20160929T102022', 'Bing', 'Mapbox']);
/**
 * ELI entries that are worldwide and now live in the basemap picker as hand-written basemaps (src/map/basemaps/raster.ts), or are
 * dead / doubles of those. Key: our generated id; value: the static basemap id that saved links and Karten with the old id map to.
 */
const STATIC_ALIASES = {
  'r-cyclosm': 'cyclosm', 'r-osmfr': 'osm-fr', 'r-osm-mapnik-german-style': 'osm-de', 'r-public-transport-oepnv': 'oepnv', 'r-wikimedia-map': 'wikimedia',
  ...Object.fromEntries([2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025].map((y) => [`r-eoxat${y}cloudless`, `eox-${y}`])),
  // dead (no answer / 503) or doubles of Orbis basemaps
  'r-hdm-hot': 'osm-hot', 'r-osm-mapnik-no-labels': 'osm', 'r-skobbler': 'osm', 'r-stamen-terrain-background': 'terrain',
};

const CATEGORIES = new Set(['photo', 'historicphoto', 'historicmap', 'map', 'elevation', 'osmbasedmap']);
const KEY = /(token|api_?key|[?&#/]key[=/]|appid|secret|passw|credential|signature|[?&]auth)/i;

const stats = {};
const skip = (why) => (stats[why] = (stats[why] ?? 0) + 1);

const src = process.argv[2] ? readFileSync(process.argv[2], 'utf8') : await (await fetch(SRC, { signal: AbortSignal.timeout(120000) })).text();
const features = JSON.parse(src).features;

function bbox(geometry) {
  // an area on both sides of the antimeridian (Alaska with the Aleutians) would become a worldwide box: take its biggest part
  if (geometry.type === 'MultiPolygon' && geometry.coordinates.length > 1) {
    const parts = geometry.coordinates.map((c) => bbox({ type: 'Polygon', coordinates: c }));
    const whole = bbox({ type: 'Polygon', coordinates: geometry.coordinates.flat() });
    if (whole[2] - whole[0] >= 359) return parts.reduce((a, b) => ((b[2] - b[0]) * (b[3] - b[1]) > (a[2] - a[0]) * (a[3] - a[1]) ? b : a));
  }
  let w = 180, s = 90, e = -180, n = -90;
  const walk = (c) => {
    if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk);
  };
  walk(geometry.coordinates);
  const r = (v) => Math.round(v * 1000) / 1000;
  return [r(w), r(Math.max(s, -85.051)), r(e), r(Math.min(n, 85.051))];
}

/** ELI template -> MapLibre tile URLs (array) + scheme, or a reason to skip. */
function tiles(p) {
  let u = p.url;
  if (!u.startsWith('https://')) return { why: 'not https' };
  if (KEY.test(u)) return { why: 'needs key/token' };
  let scheme = 'xyz';
  if (p.type === 'tms') {
    if (u.includes('{-y}')) { scheme = 'tms'; u = u.replaceAll('{-y}', '{y}'); }
    u = u.replaceAll('{zoom}', '{z}');
  } else if (p.type === 'wms') {
    if (!(p.available_projections ?? []).includes('EPSG:3857')) return { why: 'WMS without EPSG:3857' };
    u = u.replaceAll('{proj}', 'EPSG:3857').replaceAll('{wkid}', '3857').replaceAll('{bbox}', '{bbox-epsg-3857}').replaceAll('{width}', '256').replaceAll('{height}', '256');
  } else return { why: `type ${p.type}` };
  // stacked layers need transparent no-data areas: ask for it where the service delivers PNG (ignored if unsupported)
  if (p.type === 'wms' && /format=(image(\/|%2f))?png8?(&|$)/i.test(u) && !/transparent=/i.test(u)) u += '&TRANSPARENT=TRUE';
  const m = u.match(/\{switch:([^}]*)\}/);
  const urls = m ? m[1].split(',').map((s) => u.replace(m[0], s)) : [u];
  for (const x of urls) {
    const left = x.match(/\{[^}]*\}/g)?.filter((t) => !['{z}', '{x}', '{y}', '{bbox-epsg-3857}'].includes(t));
    if (left?.length) return { why: 'unknown placeholder' };
    if (p.type === 'tms' && !(x.includes('{z}') && x.includes('{x}') && x.includes('{y}'))) return { why: 'incomplete template' };
    if (p.type === 'wms' && !x.includes('{bbox-epsg-3857}')) return { why: 'WMS template' };
  }
  return { urls, scheme };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const used = new Set();
function makeId(eli, hashSource = eli) {
  const h = createHash('sha1').update(hashSource).digest('hex');
  let id = `r-${slug(eli)}`;
  if (id.length > 32) id = `r-${slug(eli).slice(0, 24).replace(/-+$/, '')}-${h.slice(0, 5)}`;
  for (let i = 0; used.has(id); i++) id = `r-${slug(eli).slice(0, 22).replace(/-+$/, '')}-${h.slice(i, i + 6)}`;
  used.add(id);
  return id;
}

const kept = []; // { e: entry, p: ELI properties }
for (const f of features.sort((a, b) => a.properties.id.localeCompare(b.properties.id))) {
  const p = f.properties;
  if (OWN.has(p.id)) { skip('already included (own basemap) or keyed'); continue; }
  if (p.overlay || p.transparent) { skip('overlay / transparent'); continue; }
  if (!CATEGORIES.has(p.category)) { skip(`category ${p.category ?? 'none'}`); continue; }
  if (p['custom-http-headers']) { skip('needs custom HTTP headers'); continue; }
  if (p['terms-of-use-text'] || p.permission_osm === 'no') { skip('restrictive terms'); continue; }
  if (p['valid-georeference'] === false) { skip('not georeferenced'); continue; }
  if (p['tile-size'] && p['tile-size'] !== 256) { skip('tile size'); continue; }
  const t = tiles(p);
  if (t.why) { skip(t.why); continue; }
  const year = String(p.end_date ?? p.start_date ?? '').slice(0, 4);
  const attr = p.attribution ?? {};
  const id = makeId(p.id);
  if (id in STATIC_ALIASES) { skip('promoted to a static basemap, dead or double'); continue; }
  const e = {
    i: id,
    n: p.name,
    ...(p.country_code ? { c: p.country_code } : {}),
    k: p.category,
    u: t.urls.length === 1 ? t.urls[0] : t.urls,
    ...(t.scheme === 'tms' ? { s: 'tms' } : {}),
    ...(p.min_zoom ? { z0: p.min_zoom } : {}),
    z1: Math.min(p.max_zoom ?? 19, 22),
    b: f.geometry ? bbox(f.geometry) : [-180, -85.051, 180, 85.051],
    ...(attr.text ? { a: attr.text.replaceAll('<YEAR>', year).replace(/\s+/g, ' ').trim() } : {}),
    ...(attr.url ? { r: attr.url } : {}),
    ...(p.license_url ? { l: p.license_url } : {}),
  };
  kept.push({ e, p });
}

// ---- series ------------------------------------------------------------------------------------------------------
const YEAR = '(?:19|20)\\d\\d';
const YEAR_RE = new RegExp(`\\(?\\s*\\b${YEAR}(?:\\s*[-\u2013/]\\s*(?:${YEAR}|\\d\\d))?\\b\\s*\\)?`, 'g');
const CLASS = { photo: 'photo', historicphoto: 'photo', map: 'map', historicmap: 'map', osmbasedmap: 'map', elevation: 'elevation' };

/** Name without its year / year range / "(2019)". */
function stemOf(name) {
  let s = name.replace(YEAR_RE, ' ').replace(/\s+([,;:])/g, '$1').replace(/([,;:])\s*(?=[,;:])/g, '').replace(/\s+/g, ' ').replace(/^[\s,;:\u2013/-]+|[\s,;:\u2013/-]+$/g, '');
  const open = (s.match(/\(/g) ?? []).length - (s.match(/\)/g) ?? []).length;
  if (open > 0) return s + ')'.repeat(open);
  return open < 0 ? s.replace(new RegExp(`\\){1,${-open}}$`), '').trim() : s;
}
/** Latest year named in the name; undefined when it has none. */
const yearOf = (name) => {
  const ys = [...name.matchAll(new RegExp(`\\b(${YEAR})\\b(?:\\s*[-\u2013/]\\s*(${YEAR}|\\d\\d))?`, 'g'))].flatMap((m) => [Number(m[1]), m[2] ? (m[2].length === 2 ? Number(m[1].slice(0, 2) + m[2]) : Number(m[2])) : 0]);
  return ys.length ? Math.max(...ys) : undefined;
};
const hostOf = (e) => { try { return new URL([e.u].flat()[0]).host; } catch { return ''; } };

const groups = new Map();
for (const k of kept) {
  const cls = CLASS[k.p.category];
  const stem = stemOf(k.p.name);
  const worldwide = k.e.b[2] - k.e.b[0] >= 359;
  if (!k.e.c || worldwide || stem.length < 6) continue;
  const key = `${k.e.c}|${cls}|${hostOf(k.e)}|${stem.toLowerCase()}`;
  (groups.get(key) ?? groups.set(key, { stem, list: [] }).get(key)).list.push(k);
}

const aliases = {};
const staticAliases = STATIC_ALIASES;
const merged = new Set();
const series = [];
for (const [key, g] of groups) {
  const dated = g.list.filter((k) => yearOf(k.p.name) !== undefined);
  const current = g.list.length - dated.length;
  if (g.list.length < 2 || dated.length < 1 || current > 1) continue; // not confident: keep the entries separate
  const rank = (k) => yearOf(k.p.name) ?? 9999;
  g.list.sort((a, b) => rank(b) - rank(a) || b.p.name.localeCompare(a.p.name));
  const members = g.list.map((k) => {
    const { i, n, c, k: _k, ...rest } = k.e;
    const y = yearOf(k.p.name);
    return { ...rest, ...(y ? { y } : {}) };
  });
  const bs = members.map((m) => m.b);
  const years = members.map((m) => m.y).filter(Boolean);
  series.push({ list: g.list, key, stem: g.stem, entry: { n: g.stem, c: g.list[0].e.c, k: g.list[0].e.k, b: [Math.min(...bs.map((b) => b[0])), Math.min(...bs.map((b) => b[1])), Math.max(...bs.map((b) => b[2])), Math.max(...bs.map((b) => b[3]))], m: members, ...(years.length ? { y: [Math.min(...years), Math.max(...years)] } : {}) } });
  for (const k of g.list) merged.add(k.e.i);
}
// series ids are allocated after all member ids, so existing ids never change
series.sort((a, b) => a.key.localeCompare(b.key));
for (const s of series) {
  const id = makeId(s.stem, s.key);
  s.entry = { i: id, ...s.entry };
  for (const k of s.list) aliases[k.e.i] = id;
}
const out = [...kept.filter((k) => !merged.has(k.e.i)).map((k) => k.e), ...series.map((s) => s.entry)].sort((a, b) => a.i.localeCompare(b.i));
stats['IMPORTED (dropdown entries)'] = out.length;
stats[`  of which series (${series.length}, merging ${merged.size} ELI entries)`] = series.length;
stats['  ELI entries kept before merging'] = kept.length;

writeFileSync(OUT_JSON, JSON.stringify(out));
writeFileSync(OUT_IDS, `// Generated by scripts/build-regional-basemaps.mjs. Do not edit.
export const REGIONAL_IDS: readonly string[] = '${out.map((e) => e.i).join(' ')}'.split(' ');
/** Ids of yearly entries that were merged into a series -> id of the series. */
export const REGIONAL_ALIASES: Readonly<Record<string, string>> = Object.fromEntries('${Object.entries(aliases).map(([a, b]) => `${a}>${b}`).join(' ')}'.split(' ').map((x) => x.split('>')));
/** Old ids of worldwide entries that are static basemaps now (or were dead) -> id of that static basemap. */
export const REGIONAL_STATIC_ALIASES: Readonly<Record<string, string>> = Object.fromEntries('${Object.entries(staticAliases).map(([a, b]) => `${a}>${b}`).join(' ')}'.split(' ').map((x) => x.split('>')));
`);
console.log(Object.entries(stats).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${String(v).padStart(5)}  ${k}`).join('\n'));
