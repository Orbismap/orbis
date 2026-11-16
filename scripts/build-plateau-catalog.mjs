// Builds src/data/plateau-catalog.json from the Plateau data catalogue (MLIT, Project PLATEAU).
// Per ward (or city) the best building model: LOD2 with textures, else LOD1 with textures; the newest year wins.
// The box comes from the root region of the tileset (the catalogue has none). Run: node scripts/build-plateau-catalog.mjs
import { writeFileSync } from 'node:fs';

const CATALOGUE = 'https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets';
const OUT = new URL('../src/data/plateau-catalog.json', import.meta.url);
const deg = (r) => Math.round((r * 180) / Math.PI * 1e4) / 1e4;

const { datasets } = await (await fetch(CATALOGUE)).json();
const best = new Map();
for (const d of datasets) {
  if (d.type_en !== 'bldg' || !d.texture || !d.composite_url || (d.lod !== '1' && d.lod !== '2')) continue;
  const key = d.ward_code ?? d.city_code;
  const rank = (x) => Number(x.lod) * 10000 + x.year;
  if (!best.has(key) || rank(d) > rank(best.get(key))) best.set(key, d);
}
console.log(`${best.size} models`);

const rows = [];
const queue = [...best.values()];
const worker = async () => {
  for (let d; (d = queue.pop()); ) {
    try {
      // The composite tileset of some models is an empty stub (Hamamatsu: whole Japan, no children): then the model's own tileset serves.
      let url = d.composite_url;
      let root = (await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).json()).root;
      if (!root.children?.length || !root.boundingVolume.region) {
        url = d.url;
        root = (await (await fetch(url, { signal: AbortSignal.timeout(60_000) })).json()).root;
      }
      const region = root.boundingVolume.region;
      const [w, s, e, n] = [region[0], region[1], region[2], region[3]].map(deg);
      if (e - w > 1.5 || n - s > 1.5) throw new Error(`box too large (${e - w} x ${n - s} degrees)`);
      rows.push({ code: d.ward_code ?? d.city_code, pref: d.pref, city: d.city, ward: d.ward, lod: Number(d.lod), year: d.year, mb: Math.round((d.file_size ?? 0) / 1e6), url, bbox: [w, s, e, n] });
    } catch (err) {
      console.warn('skipped', d.id, String(err));
    }
  }
};
await Promise.all(Array.from({ length: 8 }, worker));
rows.sort((a, b) => a.code.localeCompare(b.code));
writeFileSync(OUT, JSON.stringify(rows));
console.log(`${rows.length} written, ${(rows.reduce((a, r) => a + r.mb, 0) / 1000).toFixed(1)} GB`);
