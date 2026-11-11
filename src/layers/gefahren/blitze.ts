// Live lightning from the Blitzortung community network (public WebSocket, no key, no proxy).
// Strikes stay on the map for 15 minutes and fade from white-yellow to dark red; every arrival flashes a ring.
import { effect } from '@preact/signals';
import type { ExpressionSpecification, MapGeoJSONFeature } from 'maplibre-gl';
import { formatAge, formatCoord, formatDateTime, formatInt, formatNumber, withUnit } from '../../core/format';
import { MINUTE, SECOND } from '../../core/time';
import { parseStrike, type Strike } from '../../data/parsers/blitzortung';
import { Cleanup, EMPTY_FC, bindOpacity, idBase } from '../../render/common';
import { defineLayer } from '../define';

const WINDOW = 15 * MINUTE;
const MAX_STRIKES = 20_000;
const FLASH_MS = 2_500;
const HOSTS = ['ws8', 'ws1', 'ws7', 'ws3', 'ws5', 'ws6'].map((h) => `wss://${h}.blitzortung.org:443/`);
const ex = (e: unknown) => e as ExpressionSpecification;

/** Colour/opacity/size by age (ms) against `now`. */
const age = (now: number) => ['-', now, ['get', 't']];
const colorAt = (now: number) => ex(['interpolate', ['linear'], age(now), 0, '#FFFFFF', 45_000, '#FFF176', 5 * MINUTE, '#FFB028', 10 * MINUTE, '#F0541E', WINDOW, '#7A2418']);
const opacityAt = (now: number) => ex(['interpolate', ['linear'], age(now), 0, 1, 5 * MINUTE, 0.85, WINDOW, 0.3]);
const radiusAt = (now: number) =>
  ex(['interpolate', ['linear'], ['zoom'], 1, ['interpolate', ['linear'], age(now), 0, 2.6, WINDOW, 1.3], 8, ['interpolate', ['linear'], age(now), 0, 6, WINDOW, 3.2]]);

export default defineLayer({
  id: 'blitze',
  category: 'gefahren',
  title: 'Blitze live',
  summary: 'Einschläge der letzten 15 Minuten, neu = hell, alt = dunkelrot, Echtzeit-Datenstrom von Blitzortung',
  icon: 'bolt',
  color: '#FFE14D',
  form: 'points',
  cadence: 'live',
  sources: [{ name: 'Blitzortung.org (Community-Netzwerk)', url: 'https://www.blitzortung.org/', license: 'nicht kommerziell, Quellenangabe' }],
  legend: () => ({
    type: 'scale',
    unit: 'Alter des Blitzes',
    stops: [[0, '#FFFFFF'], [1, '#FFF176'], [5, '#FFB028'], [10, '#F0541E'], [15, '#7A2418']],
    ticks: [0, 5, 10, 15],
    format: (v) => `${v} min`,
  }),
  keywords: ['blitz', 'gewitter', 'lightning', 'thunderstorm', 'einschlag', 'blitzortung', 'live'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const base = idBase(ctx);
    const src = `${base}-src`;
    const flashSrc = `${base}-flash-src`;
    const dots = `${base}-dots`;
    const rings = `${base}-flash`;
    const clean = new Cleanup();

    let strikes: Strike[] = [];
    const seen = new Set<string>();
    let dirty = false;
    let lastRecv = 0;
    let ws: WebSocket | undefined;
    let closed = false;
    let connected = false;
    let everConnected = false;
    let failures = 0;
    let host = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let flashTimer: ReturnType<typeof setInterval> | undefined;

    ctx.map.addSource(src, { type: 'geojson', data: EMPTY_FC });
    ctx.map.addSource(flashSrc, { type: 'geojson', data: EMPTY_FC });
    ctx.map.addLayer(
      {
        id: dots, type: 'circle', source: src,
        paint: {
          'circle-radius': radiusAt(Date.now()), 'circle-color': colorAt(Date.now()), 'circle-opacity': opacityAt(Date.now()),
          'circle-stroke-width': 0, 'circle-pitch-alignment': 'map', 'circle-blur': 0.15,
        },
      },
      'points',
    );
    ctx.map.addLayer(
      {
        id: rings, type: 'circle', source: flashSrc, minzoom: 2,
        paint: {
          'circle-radius': ex(['interpolate', ['linear'], ['get', 'p'], 0, 4, 1, 30]),
          'circle-color': 'rgba(255,255,255,0)',
          'circle-stroke-color': '#FFFFFF',
          'circle-stroke-width': 2,
          'circle-stroke-opacity': ex(['-', 0.9, ['*', 0.9, ['get', 'p']]]),
          'circle-pitch-alignment': 'map',
        },
      },
      'points',
    );

    const toFc = (list: Strike[]) => ({
      type: 'FeatureCollection' as const,
      features: list.map((s) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] }, properties: { t: Math.round(s.t), d: Math.max(0, Math.round((s.recv - s.t) / 1000)) } })),
    });
    const prune = (now: number) => {
      const min = now - WINDOW;
      let i = 0;
      while (i < strikes.length && strikes[i]!.t < min) i++;
      if (i) { strikes = strikes.slice(i); dirty = true; }
    };
    const count = () => {
      const min = Date.now() - WINDOW;
      let n = 0;
      for (let i = strikes.length - 1; i >= 0 && strikes[i]!.t >= min; i--) n++;
      return n;
    };

    function report() {
      const n = count();
      if (!connected && !everConnected && failures >= 2) ctx.status({ state: 'error', note: 'Blitzortung nicht erreichbar, neuer Versuch läuft' });
      else if (!connected && !everConnected) ctx.status({ state: 'loading' });
      else if (n === 0) ctx.status({ state: 'empty', updatedAt: lastRecv || undefined, note: connected ? 'Verbunden, derzeit keine Blitze' : 'Verbindung unterbrochen, verbinde neu …' });
      else ctx.status({ state: 'ready', count: n, updatedAt: lastRecv || undefined, note: connected ? undefined : 'Verbindung unterbrochen, verbinde neu …' });
    }

    function startFlashTimer() {
      if (flashTimer) return;
      flashTimer = setInterval(() => {
        const now = Date.now();
        const fresh: Strike[] = [];
        for (let i = strikes.length - 1; i >= 0 && now - strikes[i]!.recv < FLASH_MS; i--) fresh.push(strikes[i]!);
        const fc = { type: 'FeatureCollection' as const, features: fresh.map((s) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [s.lon, s.lat] }, properties: { p: Math.min(1, (now - s.recv) / FLASH_MS) } })) };
        (ml.getSource(flashSrc) as { setData(d: unknown): void } | undefined)?.setData(fc);
        if (!fresh.length) { clearInterval(flashTimer); flashTimer = undefined; }
      }, 120);
    }

    function onMessage(raw: string) {
      const r = parseStrike(raw);
      if (!r || seen.has(r.key)) return;
      seen.add(r.key);
      if (seen.size > 60_000) seen.clear();
      strikes.push(r.strike);
      if (strikes.length > MAX_STRIKES) strikes = strikes.slice(strikes.length - MAX_STRIKES);
      lastRecv = r.strike.recv;
      dirty = true;
      if (!document.hidden && r.strike.recv - r.strike.t < 60_000) startFlashTimer();
    }

    function connect() {
      if (closed) return;
      let sock: WebSocket;
      try {
        sock = new WebSocket(HOSTS[host % HOSTS.length]!);
      } catch {
        failures++;
        schedule();
        return;
      }
      ws = sock;
      sock.onopen = () => {
        connected = everConnected = true;
        failures = 0;
        sock.send(JSON.stringify({ a: 111 })); // all regions
        report();
      };
      sock.onmessage = (e) => { if (typeof e.data === 'string') onMessage(e.data); };
      sock.onerror = () => { /* followed by close */ };
      sock.onclose = () => {
        if (ws === sock) ws = undefined;
        connected = false;
        if (closed) return;
        failures++;
        host++;
        report();
        schedule();
      };
    }
    function schedule() {
      if (closed || retryTimer) return;
      retryTimer = setTimeout(() => { retryTimer = undefined; connect(); }, Math.min(60_000, 1_500 * 2 ** Math.min(failures, 6)));
    }

    // map updates: data every 2 s when changed, age styling every 5 s
    const tickData = setInterval(() => {
      prune(Date.now());
      if (!dirty) return;
      dirty = false;
      (ml.getSource(src) as { setData(d: unknown): void } | undefined)?.setData(toFc(strikes));
    }, 2 * SECOND);
    const tickAge = setInterval(() => {
      const now = Date.now();
      if (ml.getLayer(dots)) {
        ml.setPaintProperty(dots, 'circle-color', colorAt(now));
        ml.setPaintProperty(dots, 'circle-radius', radiusAt(now));
        setOpacity(now);
      }
      report();
    }, 5 * SECOND);
    let userOpacity = 1;
    const setOpacity = (now: number) => {
      const o = ex(['*', opacityAt(now), userOpacity]);
      if (ml.getLayer(dots)) ml.setPaintProperty(dots, 'circle-opacity', o);
    };
    clean.add(effect(() => { userOpacity = ctx.opacity.value; if (ml.getLayer(dots)) setOpacity(Date.now()); }));
    clean.add(bindOpacity(ctx, ml, [{ layer: rings, prop: 'circle-stroke-opacity', base: ex(['-', 0.9, ['*', 0.9, ['get', 'p']]]) }]));

    clean.add(
      ctx.map.onPick([dots], {
        click(f: MapGeoJSONFeature) {
          const p = f.properties as { t: number; d: number };
          const c = (f.geometry as unknown as { coordinates: number[] }).coordinates;
          ctx.select({
            title: 'Blitzeinschlag',
            subtitle: formatAge(p.t),
            time: p.t,
            color: '#FFE14D',
            icon: 'bolt',
            facts: [
              { label: 'Zeit', value: formatDateTime(p.t) },
              { label: 'Ort', value: formatCoord(c[1]!, c[0]!, 3) },
              { label: 'Übertragung', value: `${withUnit(formatNumber(p.d), 's')} Verzögerung` },
              { label: 'Blitze in 15 min', value: formatInt(count()) },
            ],
            text: 'Ortung aus Laufzeitunterschieden der Messstationen des Blitzortung-Netzwerks, Genauigkeit meist wenige Kilometer.',
            links: [{ label: 'Blitzortung.org', url: 'https://www.blitzortung.org/' }],
            location: [c[0]!, c[1]!],
          });
        },
      }),
    );

    report();
    connect();

    return {
      destroy() {
        closed = true;
        clearInterval(tickData);
        clearInterval(tickAge);
        if (flashTimer) clearInterval(flashTimer);
        if (retryTimer) clearTimeout(retryTimer);
        const s = ws;
        ws = undefined;
        if (s) { s.onopen = s.onmessage = s.onerror = s.onclose = null; try { s.close(); } catch { /* already closed */ } }
        clean.run();
        ctx.map.remove({ layers: [rings, dots], sources: [flashSrc, src] });
      },
    };
  },
});
