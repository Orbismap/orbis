// Safecast bGeigie mobile measurement drives -> one compact snapshot for the map (public/data/safecast-tracks.json).
//
// Safecast serves the drive metadata through api.safecast.org (CORS only for safecast.org) and the raw
// bGeigie log through S3. The browser therefore cannot load either directly; this script pulls the 50
// newest imports, downloads their logs, parses the NMEA-style records into a track and writes a small file:
//
//   { u: ISO date, s: source, tracks: [ { id, source, credits, created_at, n, min, max, avg, coords: [[lon, lat], ...] }, ... ] }
//
// Values are converted from cpm to µSv/h with the LND 7318 factor (1 µSv/h ≈ 334 cpm).
// Later this belongs in the daily collector of Orbismap/data; until then refresh by hand:
//   node scripts/fetch-safecast-tracks.mjs
import { writeFileSync } from 'node:fs';

const API = 'https://api.safecast.org/bgeigie_imports.json?order=created_at+desc';
const UA = { 'User-Agent': 'Orbis/1.0 (+https://github.com/malte9799/orbis)' };
const OUT = new URL('../public/data/safecast-tracks.json', import.meta.url);
const MAX_IMPORTS = 50;
const MAX_POINTS = 200;
const CPM_TO_USVH = 1 / 334;

async function fetchJson(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: UA, signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.text();
}

function nmeaToDeg(raw, hemi) {
  if (!raw || !hemi) return null;
  const v = Number(raw);
  if (!Number.isFinite(v)) return null;
  const deg = Math.floor(v / 100);
  const min = v - deg * 100;
  const d = deg + min / 60;
  if (hemi === 'S' || hemi === 'W') return -d;
  return d;
}

function parseLog(text) {
  const pts = []; // { cpm, lat, lon }
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s.startsWith('$')) continue;
    const star = s.indexOf('*');
    const body = star >= 0 ? s.slice(0, star) : s;
    const f = body.split(',');
    // $BMRDD / $BNRDD / $BXRDD style: field 2 timestamp, 3 cpm, 6 validity, 7 lat, 8 hemi, 9 lon, 10 hemi
    if (f.length < 11) continue;
    const ts = f[2];
    if (!/T/.test(ts)) continue;
    const cpm = Number(f[3]);
    if (!Number.isFinite(cpm) || cpm < 0) continue;
    const lat = nmeaToDeg(f[7], f[8]);
    const lon = nmeaToDeg(f[9], f[10]);
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    // validity flag (field 6) — accept V or A or empty, but skip explicit invalid
    const flag = f[6];
    if (flag && flag !== 'V' && flag !== 'A' && flag !== 'v' && flag !== 'a') continue;
    pts.push({ cpm, lat, lon });
  }
  return pts;
}

function basename(url) {
  try { return new URL(url).pathname.split('/').pop() || url; } catch { return String(url).split('/').pop() || String(url); }
}

function r4(v) { return Math.round(v * 1e4) / 1e4; }
function r6(v) { return Math.round(v * 1e6) / 1e6; }

async function main() {
  const tracks = [];
  let imports = [];
  for (let page = 1; page <= 2 && imports.length < MAX_IMPORTS; page++) {
    const batch = await fetchJson(`${API}&page=${page}`);
    if (!Array.isArray(batch) || !batch.length) break;
    imports = imports.concat(batch);
  }
  imports = imports.slice(0, MAX_IMPORTS);

  for (const imp of imports) {
    if (!imp || imp.status !== 'done') continue;
    const url = imp?.source?.url;
    if (!url) continue;
    let text;
    try { text = await fetchText(url); } catch (e) { console.warn(`skip ${imp.id}: ${e.message}`); continue; }
    const pts = parseLog(text);
    if (pts.length < 2) continue;

    const cpms = pts.map((p) => p.cpm);
    const minCpm = Math.min(...cpms);
    const maxCpm = Math.max(...cpms);
    const avgCpm = cpms.reduce((a, b) => a + b, 0) / cpms.length;

    // downsample
    let sampled = pts;
    if (pts.length > MAX_POINTS) {
      const step = Math.ceil(pts.length / MAX_POINTS);
      sampled = pts.filter((_, i) => i % step === 0);
      if (sampled[sampled.length - 1] !== pts[pts.length - 1]) sampled.push(pts[pts.length - 1]);
    }
    const coords = sampled.map((p) => [r6(p.lon), r6(p.lat)]);

    tracks.push({
      id: imp.id,
      source: basename(url),
      credits: imp.credits ?? null,
      created_at: imp.created_at,
      n: pts.length,
      min: r4(minCpm * CPM_TO_USVH),
      max: r4(maxCpm * CPM_TO_USVH),
      avg: r4(avgCpm * CPM_TO_USVH),
      coords,
    });
    console.log(`import ${imp.id}: ${pts.length} pts -> ${coords.length}`);
  }

  const body = JSON.stringify({ u: new Date().toISOString(), s: 'Safecast bGeigie imports (CC0), top newest 50', tracks });
  writeFileSync(OUT, body);
  console.log(`${tracks.length} tracks, ${(body.length / 1024).toFixed(0)} KB -> public/data/safecast-tracks.json`);
}

main().catch((e) => { console.error(e); process.exit(1); });
