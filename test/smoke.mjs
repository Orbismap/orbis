// Headless smoke test: builds nothing itself (pnpm smoke does), serves dist via `vite preview` (or SMOKE_URL) and
// drives the app in the system Chrome through window.__orbis (see src/main.tsx).
//
//   pnpm smoke                          build + all checks
//   node test/smoke.mjs --only-core     skip the per-layer loop
//   node test/smoke.mjs --layer erdbeben
//   node test/smoke.mjs --shot foo --url-hash '#/@50,10,5z?k=gefahren' --wait 4000 [--width 390 --height 844] [--basemap orbis-light] [--terminator off]
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'test', 'out');
mkdirSync(OUT, { recursive: true });

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(`--${n}`);
const opt = (n, d) => { const i = argv.indexOf(`--${n}`); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const BASEMAPS = ['orbis-dark', 'orbis-light', 'satellite', 'terrain', 'bluemarble'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const freePort = () => new Promise((res, rej) => { const s = net.createServer(); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); s.on('error', rej); });

async function startServer() {
  if (process.env.SMOKE_URL) return { url: process.env.SMOKE_URL.replace(/\/$/, ''), stop() {} };
  // the proxy worker only allows localhost:4173 and :5173 as origins
  const isFree = (p) => new Promise((res) => { const t = net.createServer(); t.once('error', () => res(false)); t.listen(p, '127.0.0.1', () => t.close(() => res(true))); });
  let port = 0;
  for (const p of [4173, 5173]) if (!port && (await isFree(p))) port = p;
  if (!port) { port = await freePort(); console.log(`warning: ports 4173 and 5173 are busy, serving on ${port}: proxied layers (flugzeuge, ...) will fail with CORS`); }
  const child = spawn('pnpm', ['exec', 'vite', 'preview', '--outDir', 'dist-smoke', '--port', String(port), '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const stop = () => { try { child.kill('SIGTERM'); } catch {} };
  process.on('exit', stop);
  const url = `http://localhost:${port}`; // the proxy worker allows the origins localhost:4173 / :5173 only
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url + '/')).ok) return { url, stop }; } catch {}
    await sleep(150);
  }
  stop();
  throw new Error('vite preview did not start:\n' + log);
}

const GPU_ARGS = [
  ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'],
  ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'],
];

async function launch() {
  let lastErr;
  for (const args of GPU_ARGS) {
    let browser;
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true, args });
      const p = await browser.newPage();
      const info = await p.evaluate(() => {
        const gl = document.createElement('canvas').getContext('webgl2');
        if (!gl) return null;
        const e = gl.getExtension('WEBGL_debug_renderer_info');
        return e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'webgl2';
      });
      await p.close();
      if (info) return { browser, gl: `${info} [${args[0]}]` };
      await browser.close();
    } catch (e) { lastErr = e; try { await browser?.close(); } catch {} }
  }
  throw new Error('No WebGL2 in system Chrome' + (lastErr ? `: ${lastErr.message}` : ''));
}

// ---- reporting -------------------------------------------------------------
let failed = 0;
const report = (ok, name, detail = '') => { if (!ok) failed++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };
const info = (msg) => console.log(`      ${msg}`);

const errors = [];
const warnings = [];
function watchPage(page) {
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}${process.env.SMOKE_STACK ? '\n' + e.stack : ''}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    const loc = m.location()?.url ?? '';
    if (/Failed to load resource|net::ERR|AJAXError|Failed to fetch|HTTP 4\d\d|HTTP 5\d\d|NetworkError|blocked by CORS policy/i.test(t)) warnings.push(`console.error (network): ${t.slice(0, 200)} ${loc}`);
    else errors.push(`console.error: ${t.slice(0, 400)}`);
  });
  page.on('requestfailed', (r) => r.failure()?.errorText !== 'net::ERR_ABORTED' && warnings.push(`requestfailed: ${r.url().slice(0, 120)} ${r.failure()?.errorText ?? ''}`));
}

async function openApp(browser, base, { hash = '', width = 1280, height = 800 } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, locale: 'de-DE' });
  const page = await ctx.newPage();
  watchPage(page);
  await page.goto(`${base}/?smoke${hash}`, { waitUntil: 'load' });
  return { page, ctx };
}

const ready = (page, ms = 20000) =>
  page.evaluate(async (ms) => {
    const t0 = performance.now();
    while (!window.__orbis?.engine) { if (performance.now() - t0 > ms) throw new Error('engine hook missing'); await new Promise((r) => setTimeout(r, 50)); }
    await Promise.race([window.__orbis.engine.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('ready timeout')), ms))]);
    return true;
  }, ms);

/** Resolves when the map has no pending tile/source loads (or after `ms`). */
const settle = (page, ms = 8000) =>
  page.evaluate(async (ms) => {
    const ml = window.__orbis.engine.ml;
    const t0 = performance.now();
    await new Promise((r) => setTimeout(r, 400));
    while (performance.now() - t0 < ms && !(ml.loaded() && ml.areTilesLoaded())) await new Promise((r) => setTimeout(r, 150));
    await new Promise((r) => setTimeout(r, 500));
  }, ms);

const shot = (page, name) => page.screenshot({ path: join(OUT, `${name}.png`) });

// ---- --shot mode -------------------------------------------------------------
async function shotMode(browser, base) {
  const name = opt('shot');
  const hash = opt('url-hash', '');
  const { page, ctx } = await openApp(browser, base, { hash: hash && !hash.startsWith('#') ? '#' + hash : hash, width: +opt('width', 1280), height: +opt('height', 800) });
  try { await ready(page); } catch (e) { console.log('warn: ' + e.message); }
  const bm = opt('basemap'), term = opt('terminator');
  if (bm || term) await page.evaluate(([bm, term]) => { const o = window.__orbis; if (bm) o.settings.updateSettings({ theme: bm === 'orbis-light' ? 'light' : 'dark' }); o.karten.editKarte(o.session.activeKarteId.peek(), (k) => ({ ...k, ...(bm ? { basemap: bm } : {}), ...(term ? { terminator: term === 'on' } : {}) })); }, [bm, term]);
  await sleep(+opt('wait', 3000));
  if (opt('eval')) console.log(JSON.stringify(await page.evaluate(`(async () => { ${opt('eval')} })()`), null, 1));
  await shot(page, name);
  console.log(join(OUT, `${name}.png`));
  for (const e of errors) console.log('error: ' + e);
  await ctx.close();
}

// ---- helpers inside the page ------------------------------------------------
const useScratch = (page) =>
  page.evaluate(() => {
    const o = window.__orbis;
    const id = o.karten.saveAs('gefahren', 'scratch');
    o.karten.editKarte(id, (k) => ({ ...k, layers: [], basemap: 'orbis-dark', terminator: true }));
    o.session.setActiveKarte(id);
    return id;
  });

const runLayer = (page, scratch, id, timeout) =>
  page.evaluate(async ({ scratch, id, timeout }) => {
    const o = window.__orbis;
    const t0 = performance.now();
    const status = () => o.session.layerStatus.peek()[id];
    o.karten.editKarte(scratch, (k) => ({ ...k, layers: [{ id, visible: true, opacity: 1 }] }));
    let s;
    for (;;) {
      s = status();
      if (s && s.state !== 'loading') break;
      if (performance.now() - t0 > timeout) { s = { state: 'timeout', note: `still ${s?.state ?? 'unmounted'}` }; break; }
      await new Promise((r) => setTimeout(r, 100));
    }
    const ms = Math.round(performance.now() - t0);
    o.karten.editKarte(scratch, (k) => ({ ...k, layers: [] }));
    const t1 = performance.now();
    while (o.session.layerStatus.peek()[id] && performance.now() - t1 < 5000) await new Promise((r) => setTimeout(r, 50));
    const left = o.engine.ml.getStyle().layers.filter((l) => l.id.startsWith(id + '-') || l.id.startsWith(id + '.')).map((l) => l.id);
    return { ...s, ms, leftover: left };
  }, { scratch, id, timeout });

// ---- --tour mode: screenshots of layers at named views ------------------------------------
//   node test/smoke.mjs --tour temperatur,wind --views globe,eu,reg [--wait 4000] [--time +24] [--basemap id] [--width 1440 --height 900]
//   views: globe (z1.8), eu (mercator z4.5 Europe), reg (z7 Germany), or "name=lng,lat,zoom,globe|merc" (comma list uses ';' between views)
const VIEWS = { globe: [10, 25, 1.8, 'globe'], eu: [12, 49, 4.5, 'merc'], reg: [10.5, 50.5, 7, 'merc'] };
async function tourMode(browser, base) {
  const { page, ctx } = await openApp(browser, base, { width: +opt('width', 1280), height: +opt('height', 800) });
  await ready(page);
  const scratch = await useScratch(page);
  const bm = opt('basemap'); const wait = +opt('wait', 4000);
  const ids = opt('tour') === 'all' ? await page.evaluate(() => window.__orbis.registry.allLayers().map((d) => d.id)) : opt('tour').split(',');
  const views = opt('views', 'globe,eu,reg').split(opt('views', '').includes('=') ? ';' : ',').map((v) => {
    if (VIEWS[v]) return [v, ...VIEWS[v]];
    const [n, rest] = v.split('='); const [lng, lat, z, pr] = rest.split(','); return [n, +lng, +lat, +z, pr];
  });
  const dt = opt('time');
  for (const id of ids) {
    await page.evaluate(([s, id, bm]) => { const o = window.__orbis; o.karten.editKarte(s, (k) => ({ ...k, ...(bm ? { basemap: bm } : {}), layers: [{ id, visible: true, opacity: 1 }] })); }, [scratch, id, bm]);
    if (dt) await page.evaluate((h) => { const o = window.__orbis; o.time.setTime(Date.now() + h * 3600e3); }, +dt).catch(() => {});
    for (const [name, lng, lat, z, pr] of views) {
      await page.evaluate(([lng, lat, z, pr]) => { const o = window.__orbis; o.view.setProjection(pr === 'globe' ? 'globe' : 'mercator'); o.engine.ml.jumpTo({ center: [lng, lat], zoom: z, bearing: 0, pitch: 0 }); }, [lng, lat, z, pr]);
      await sleep(wait);
      const st = await page.evaluate((id) => window.__orbis.session.layerStatus.peek()[id], id);
      await shot(page, `L-${id}-${name}${dt ? '-t' + dt : ''}`);
      console.log(`${id} ${name}: ${st?.state ?? '-'}${st?.count !== undefined ? ' n=' + st.count : ''}${st?.note ? ' "' + st.note + '"' : ''}`);
    }
  }
  for (const e of [...new Set(errors)]) console.log('error: ' + e);
  await ctx.close();
}

async function main() {
  const server = await startServer();
  let browser;
  try {
    const l = await launch();
    browser = l.browser;
    console.log(`app: ${server.url}   webgl: ${l.gl}`);

    if (opt('shot')) { await shotMode(browser, server.url); return; }
    if (opt('tour')) { await tourMode(browser, server.url); return; }

    // 1. load
    const { page, ctx } = await openApp(browser, server.url);
    let okReady = false;
    try { okReady = await ready(page); } catch (e) { report(false, '1 map ready', e.message); }
    if (!okReady) throw new Error('map never became ready');
    await page.evaluate(() => {
      const ml = window.__orbis.engine.ml; window.__mlErr = []; window.__missing = [];
      ml.on('error', (e) => window.__mlErr.push(String(e.error?.message ?? e.message ?? e).slice(0, 300) + (e.sourceId ? ` [source ${e.sourceId}]` : '')));
      ml.on('styleimagemissing', (e) => window.__missing.push(e.id));
    });
    await settle(page);
    const env = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      const gl = document.createElement('canvas').getContext('webgl2');
      return { canvas: c ? [c.clientWidth, c.clientHeight] : null, webgl2: !!gl, mlGl2: !!window.__orbis.engine.ml.painter?.context?.gl && window.__orbis.engine.ml.painter.context.gl instanceof WebGL2RenderingContext };
    });
    report(!!env.canvas && env.canvas[0] > 0 && env.canvas[1] > 0 && env.webgl2, '1 page loads, map ready, canvas + WebGL2', `canvas ${env.canvas?.join('x')} maplibre-webgl2=${env.mlGl2}`);
    await shot(page, '01-globe-default');

    // idle render count (before anything is added)
    const scratch = await useScratch(page);
    await settle(page);
    const idle = await page.evaluate(async () => {
      window.__replace = 0; const rs = history.replaceState.bind(history); history.replaceState = (...a) => { window.__replace++; return rs(...a); };
      const ml = window.__orbis.engine.ml; let n = 0; const f = () => n++; ml.on('render', f);
      await new Promise((r) => setTimeout(r, 3000)); ml.off('render', f); return n;
    });
    report(idle <= 5, '7 idle: no continuous rendering', `${idle} render events in 3 s`);
    const rep = await page.evaluate(() => window.__replace);
    report(rep <= 1, '7 idle: URL hash not rewritten in a loop', `${rep} replaceState calls in 3 s`);

    // camera signal throttle
    const camWrites = await page.evaluate(async () => {
      const o = window.__orbis; let n = 0; const un = o.view.camera.subscribe(() => n++);
      n = 0; o.engine.ml.jumpTo({ center: [5, 40], zoom: 3 });
      await new Promise((r) => setTimeout(r, 300)); n = 0;
      o.engine.ml.easeTo({ center: [30, 50], zoom: 5, duration: 1500 });
      await new Promise((r) => setTimeout(r, 1900)); un(); return n;
    });
    report(camWrites <= 25, '7 camera signal writes throttled', `${camWrites} writes during 1.5 s ease`);

    // 3. basemaps + projection
    const errBefore = errors.length;
    const bmFail = [];
    for (const id of BASEMAPS) {
      try {
        const vis = await page.evaluate(async (id) => {
          const o = window.__orbis;
          o.settings.updateSettings({ theme: id === 'orbis-light' ? 'light' : 'dark' }); // vector basemaps follow the theme
          o.karten.editKarte(o.session.activeKarteId.peek(), (k) => ({ ...k, basemap: id }));
          await new Promise((r) => setTimeout(r, 300));
          const ml = o.engine.ml;
          return ml.getStyle().layers.filter((l) => l.id.startsWith('bm-') && l.layout?.visibility !== 'none').map((l) => l.id);
        }, id);
        const wrong = vis.filter((x) => !x.startsWith(`bm-${id}-`));
        if (!vis.length || wrong.length) bmFail.push(`${id}: visible=${vis.join(',')}`);
      } catch (e) { bmFail.push(`${id}: ${e.message}`); }
    }
    report(!bmFail.length && errors.length === errBefore, '3 every basemap switches', bmFail.join('; ') || BASEMAPS.length + ' basemaps');
    await page.evaluate(() => window.__orbis.settings.updateSettings({ theme: 'dark' }));
    for (const p of ['mercator', 'globe', 'mercator', 'globe']) {
      await page.evaluate((p) => window.__orbis.view.setProjection(p), p);
      await sleep(300);
    }
    const proj = await page.evaluate(() => window.__orbis.engine.ml.getProjection()?.type);
    report(proj === 'globe' && errors.length === errBefore, '3 projection globe <-> mercator', `final ${proj}`);

    // 6. basemap screenshots (mercator Europe, terminator off so the basemap itself is judged)
    await page.evaluate(() => { const o = window.__orbis; o.view.setProjection('mercator'); o.engine.ml.jumpTo({ center: [10, 48], zoom: 4.6 }); o.karten.editKarte(o.session.activeKarteId.peek(), (k) => ({ ...k, terminator: false })); });
    for (const id of BASEMAPS) {
      await page.evaluate((id) => window.__orbis.karten.editKarte(window.__orbis.session.activeKarteId.peek(), (k) => ({ ...k, basemap: id })), id);
      await settle(page, 10000);
      await shot(page, `basemap-${id}`);
    }
    // zoom ladder for the two own styles: globe 1.5, Europe 5, region 10, city 15
    for (const id of ['orbis-dark', 'orbis-light']) {
      await page.evaluate((id) => window.__orbis.karten.editKarte(window.__orbis.session.activeKarteId.peek(), (k) => ({ ...k, basemap: id, terminator: false })), id);
      await page.evaluate((id) => window.__orbis.settings.updateSettings({ theme: id === 'orbis-light' ? 'light' : 'dark' }), id);
      for (const [name, proj, c, z] of [['z1.5-globe', 'globe', [10, 30], 1.5], ['z5', 'mercator', [10, 50], 5], ['z10', 'mercator', [11.6, 48.14], 10], ['z15', 'mercator', [11.5755, 48.1374], 15]]) {
        await page.evaluate(([proj, c, z]) => { const o = window.__orbis; o.view.setProjection(proj); o.engine.ml.jumpTo({ center: c, zoom: z }); }, [proj, c, z]);
        await sleep(300); await settle(page, 10000);
        await shot(page, `style-${id}-${name}`);
      }
    }
    await page.evaluate(() => { window.__orbis.settings.updateSettings({ theme: 'dark' }); window.__orbis.karten.editKarte(window.__orbis.session.activeKarteId.peek(), (k) => ({ ...k, basemap: 'orbis-dark', terminator: true })); });
    await page.evaluate(() => window.__orbis.view.setProjection('mercator'));

    // 4. per-layer
    const ids = await page.evaluate(() => window.__orbis.registry.allLayers().map((d) => d.id));
    if (!flag('only-core')) {
      const only = opt('layer');
      const run = only ? ids.filter((x) => x === only) : ids;
      if (only && !run.length) report(false, `4 layer ${only}`, 'unknown id');
      console.log(`--- layers (${run.length}) ---`);
      for (const id of run) {
        const e0 = errors.length;
        const r = await runLayer(page, scratch, id, 25000);
        const bad = r.state === 'error' || r.state === 'timeout';
        const newErr = errors.slice(e0).filter((e) => e.includes(id) || e.includes('[layers]'));
        const leak = r.leftover.length ? ` LEAK:${r.leftover.join(',')}` : '';
        if (bad && /\b429\b/.test(r.note ?? '')) { console.log(`WARN  4 layer ${id}  upstream rate limit (429), not counted: ${r.note}`); continue; }
        report(!bad && !newErr.length && !leak, `4 layer ${id}`, `${r.state}${r.count !== undefined ? ' n=' + r.count : ''} ${r.ms} ms${r.note ? ' note="' + r.note + '"' : ''}${leak}${newErr.length ? ' ' + newErr[0] : ''}`);
      }
    }

    // idle with data layers on
    {
      const withLayers = ids.filter((x) => ['erdbeben', 'seekabel', 'vulkane'].includes(x));
      if (withLayers.length) {
        await page.evaluate(([s, l]) => window.__orbis.karten.editKarte(s, (k) => ({ ...k, layers: l.map((id) => ({ id, visible: true, opacity: 1 })) })), [scratch, withLayers]);
        await sleep(3000); await settle(page);
        const n = await page.evaluate(async () => { const ml = window.__orbis.engine.ml; let n = 0; const f = () => n++; ml.on('render', f); await new Promise((r) => setTimeout(r, 3000)); ml.off('render', f); return n; });
        report(n <= 5, `7 idle with ${withLayers.join('+')}: no continuous rendering`, `${n} render events in 3 s`);
        await page.evaluate((s) => window.__orbis.karten.editKarte(s, (k) => ({ ...k, layers: [] })), scratch);
      }
    }

    // every builtin Karte activates and all its visible layers settle
    if (!flag('only-core') || true) {
      const kids = await page.evaluate(() => window.__orbis.karten.karten.peek().filter((k) => k.builtin).map((k) => k.id));
      for (const kid of kids) {
        const r = await page.evaluate(async (kid) => {
          const o = window.__orbis; const t0 = performance.now();
          o.session.setActiveKarte(kid);
          await new Promise((r) => setTimeout(r, 500));
          const want = o.session.activeKarte.peek().layers.filter((l) => l.visible).map((l) => l.id);
          let bad = [];
          while (performance.now() - t0 < 25000) {
            const st = o.session.layerStatus.peek();
            if (want.every((id) => st[id] && st[id].state !== 'loading')) break;
            await new Promise((r) => setTimeout(r, 200));
          }
          const st = o.session.layerStatus.peek();
          bad = want.filter((id) => !st[id] || st[id].state === 'loading' || st[id].state === 'error').map((id) => `${id}:${st[id]?.state ?? 'unmounted'}`);
          return { n: want.length, bad, ms: Math.round(performance.now() - t0) };
        }, kid);
        report(!r.bad.length, `4 Karte ${kid} (${r.n} layers)`, `${r.ms} ms${r.bad.length ? ' bad: ' + r.bad.join(', ') : ''}`);
      }
      await page.evaluate((s) => window.__orbis.session.setActiveKarte(s), scratch);
    }

    // 5. picking erdbeben
    if (ids.includes('erdbeben') && (!opt('layer') || opt('layer') === 'erdbeben')) {
      await page.evaluate(() => { const o = window.__orbis; o.view.setProjection('mercator'); o.engine.ml.jumpTo({ center: [10, 25], zoom: 2.2 }); });
      await page.evaluate((s) => window.__orbis.karten.editKarte(s, (k) => ({ ...k, layers: [{ id: 'erdbeben', visible: true, opacity: 1 }] })), scratch);
      const st = await page.evaluate(async () => {
        const o = window.__orbis; const t0 = performance.now();
        while (performance.now() - t0 < 25000) { const s = o.session.layerStatus.peek().erdbeben; if (s && s.state !== 'loading') return s; await new Promise((r) => setTimeout(r, 100)); }
        return { state: 'timeout' };
      });
      await settle(page, 8000);
      const target = await page.evaluate(() => {
        const ml = window.__orbis.engine.ml;
        const ids = ml.getStyle().layers.filter((l) => l.id.startsWith('erdbeben') && l.type === 'circle').map((l) => l.id);
        const box = ml.getCanvas().getBoundingClientRect();
        const feats = ml.queryRenderedFeatures({ layers: ids }).filter((f) => f.geometry.type === 'Point');
        for (const f of feats) {
          const p = ml.project(f.geometry.coordinates);
          if (p.x > 40 && p.y > 40 && p.x < box.width - 40 && p.y < box.height - 40) return { x: box.left + p.x, y: box.top + p.y, n: feats.length, ids };
        }
        return { n: feats.length, ids };
      });
      if (target.x === undefined) report(false, '5 picking erdbeben', `status=${st.state}, no rendered feature (layers ${target.ids.join(',')}, ${target.n} features)`);
      else {
        await page.mouse.move(target.x - 30, target.y - 30);
        await page.mouse.move(target.x, target.y, { steps: 4 });
        await sleep(400);
        const hov = await page.evaluate(([x, y]) => {
          const ml = window.__orbis.engine.ml; const box = ml.getCanvas().getBoundingClientRect();
          const f = ml.queryRenderedFeatures([x - box.left, y - box.top])[0];
          return { cursor: ml.getCanvas().style.cursor, state: f && f.id !== undefined ? ml.getFeatureState({ source: f.source, sourceLayer: f.sourceLayer, id: f.id }) : 'no-id' };
        }, [target.x, target.y]);
        report(hov.cursor === 'pointer' && hov.state?.hover === true, '5 hover sets cursor + feature-state', `cursor=${hov.cursor} state=${JSON.stringify(hov.state)}`);
        await page.mouse.click(target.x, target.y);
        await sleep(500);
        const insp = await page.evaluate(() => window.__orbis.selection.inspector.peek()?.card?.title ?? null);
        report(!!insp, '5 picking erdbeben opens inspector', insp ? `"${insp}"` : 'inspector stayed null');
        await shot(page, 'picking-erdbeben');
      }
      await page.evaluate(() => window.__orbis.selection.clearSelection());
    }

    // 6. screenshots
    await page.evaluate((s) => {
      const o = window.__orbis;
      o.view.setProjection('mercator');
      o.engine.ml.jumpTo({ center: [12, 47], zoom: 3.8 });
      o.karten.editKarte(s, (k) => ({ ...k, layers: ['erdbeben', 'seekabel'].filter((x) => o.registry.getLayer(x)).map((id) => ({ id, visible: true, opacity: 1 })) }));
    }, scratch);
    await sleep(2500); await settle(page, 12000);
    await shot(page, '02-mercator-europe-erdbeben-seekabel');
    await page.evaluate((s) => window.__orbis.karten.editKarte(s, (k) => ({ ...k, layers: [] })), scratch);

    // 2. errors
    const mlInfo = await page.evaluate(() => ({ err: window.__mlErr, missing: [...new Set(window.__missing)] }));
    for (const m of mlInfo.err) (/AJAXError|Failed to fetch|NetworkError|HTTP|Load failed|abort/i.test(m) ? warnings : errors).push(`maplibre error: ${m}`);
    if (mlInfo.missing.length) errors.push(`missing style images: ${mlInfo.missing.join(', ')}`);
    const uniq = [...new Set(errors)];
    report(uniq.length === 0, '2 no page errors / console.error', uniq.length ? `${uniq.length} error(s)` : '');
    uniq.forEach((e) => info(e));
    const w = [...new Set(warnings)];
    if (w.length) { console.log(`--- warnings (${w.length}, network, not failing) ---`); w.slice(0, 15).forEach(info); if (w.length > 15) info(`... ${w.length - 15} more`); }
    await ctx.close();
  } catch (e) {
    report(false, 'smoke run aborted', e.stack ?? e.message);
  } finally {
    await browser?.close().catch(() => {});
    server.stop();
  }
}

await main();
console.log(failed ? `\n${failed} check(s) FAILED. Screenshots in ${OUT}` : `\nAll checks passed. Screenshots in ${OUT}`);
process.exit(failed ? 1 : 0);
