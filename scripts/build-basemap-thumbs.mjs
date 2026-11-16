// Renders real basemap previews for the picker popover into public/basemaps/<id>.webp and <id>-globe.webp
// (216x144 = 3x of 72x48). Needs playwright-core + system Chrome with WebGL. Usage: pnpm thumbs
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = 'dist-thumbs';
const OUT = join(ROOT, 'public', 'basemaps');
const IDS = process.env.THUMBS_IDS ? process.env.THUMBS_IDS.split(',') : ['orbis-dark', 'orbis-light', 'satellite', 'terrain', 'bluemarble', 'esri-clarity', 'osm'];
const CENTER = [10, 46];
const VARIANTS = [
  { suffix: '', projection: 'mercator', zoom: 3.3 },
  { suffix: '-globe', projection: 'globe', zoom: 1.3 },
];
const W = 648, H = 432, TW = 216, TH = 144, MAX_BYTES = 15000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (cmd, args) => new Promise((res, rej) => {
  const c = spawn(cmd, args, { cwd: ROOT, stdio: 'inherit' });
  c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`${cmd} ${args.join(' ')} exited ${code}`))));
});
const isFree = (p) => new Promise((res) => { const t = net.createServer(); t.once('error', () => res(false)); t.listen(p, '127.0.0.1', () => t.close(() => res(true))); });

// the proxy worker only allows localhost:4173 and :5173 as origins; THUMBS_URL uses an already running server
let url = (process.env.THUMBS_URL || '').replace(/\/$/, '');
let server;
const cleanup = () => { try { server?.kill('SIGTERM'); } catch {} rmSync(join(ROOT, DIST), { recursive: true, force: true }); };
process.on('exit', cleanup);
if (!url) {
  if (!(await isFree(4173))) throw new Error('port 4173 is busy: stop that server or pass THUMBS_URL=http://localhost:5173 (running dev server)');
  await run('pnpm', ['exec', 'vite', 'build', '--outDir', DIST, '--emptyOutDir']);
  server = spawn('pnpm', ['exec', 'vite', 'preview', '--outDir', DIST, '--port', '4173', '--strictPort', '--host', '127.0.0.1'], { cwd: ROOT, stdio: 'ignore' });
  url = 'http://localhost:4173';
}

let browser;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url + '/')).ok) break; } catch {} await sleep(150); }
  const GPU = [['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'], ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl']];
  for (const args of GPU) {
    try {
      browser = await chromium.launch({ channel: 'chrome', headless: true, args });
      const p = await browser.newPage();
      const ok = await p.evaluate(() => !!document.createElement('canvas').getContext('webgl2'));
      await p.close();
      if (ok) break;
      await browser.close(); browser = undefined;
    } catch { browser = undefined; }
  }
  if (!browser) throw new Error('No WebGL2 in system Chrome');

  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'de-DE' });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.clear(); } catch {} });
  await page.goto(`${url}/?smoke`, { waitUntil: 'load' });
  await page.addStyleTag({ content: '.app > :not(.map){display:none!important} .maplibregl-control-container{display:none!important}' });
  await page.evaluate(async () => {
    const t0 = performance.now();
    while (!window.__orbis?.engine) { if (performance.now() - t0 > 20000) throw new Error('engine hook missing'); await new Promise((r) => setTimeout(r, 50)); }
    await window.__orbis.engine.ready;
  });

  mkdirSync(OUT, { recursive: true });
  const report = [];
  for (const id of IDS) {
    for (const v of VARIANTS) {
      await page.evaluate(([id, v, center]) => {
        const o = window.__orbis;
        o.settings.updateSettings({ theme: id === 'orbis-light' ? 'light' : 'dark' });
        o.karten.editKarte(o.session.activeKarteId.peek(), (k) => ({ ...k, basemap: id, layers: [], labels: false, terminator: false }));
        o.view.setProjection(v.projection);
        o.engine.ml.jumpTo({ center, zoom: v.zoom, bearing: 0, pitch: 0 });
      }, [id, v, CENTER]);
      await sleep(800);
      await page.evaluate(async () => {
        const ml = window.__orbis.engine.ml;
        const t0 = performance.now();
        while (performance.now() - t0 < 15000 && !(ml.loaded() && ml.areTilesLoaded())) await new Promise((r) => setTimeout(r, 150));
        await new Promise((r) => setTimeout(r, 700));
      });
      const png = await page.screenshot({ type: 'png' });
      const bytes = await encode(ctx, png);
      const file = `${id}${v.suffix}.webp`;
      writeFileSync(join(OUT, file), bytes);
      report.push([file, bytes.length]);
      console.log(`${file}  ${bytes.length} B`);
    }
  }
  const big = report.filter(([, n]) => n > MAX_BYTES);
  if (big.length) console.warn('over budget:', big.map(([f]) => f).join(', '));
} finally {
  await browser?.close();
  cleanup();
}

/** PNG screenshot -> 216x144 WebP, quality lowered until it fits the byte budget. */
async function encode(ctx, png) {
  const p = await ctx.newPage();
  try {
    await p.setContent('<canvas></canvas>');
    const b64 = await p.evaluate(async ([src, tw, th, max]) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.querySelector('canvas');
      c.width = tw; c.height = th;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, tw, th);
      let q = 0.85, url = '';
      for (; q >= 0.3; q -= 0.1) {
        url = c.toDataURL('image/webp', q);
        if (!url.startsWith('data:image/webp')) throw new Error('Chrome produced no WebP');
        if ((url.length - 23) * 0.75 < max) break;
      }
      return url.slice(url.indexOf(',') + 1);
    }, ['data:image/png;base64,' + png.toString('base64'), TW, TH, MAX_BYTES]);
    return Buffer.from(b64, 'base64');
  } finally { await p.close(); }
}
