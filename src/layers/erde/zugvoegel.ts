// Tierzüge im Jahreslauf: Vögel, Wale und Schmetterlinge ziehen zwischen Sommer- und Winterquartier. Die Zeitleiste läuft vom 1. Januar bis 31. Dezember.
// Die Tiere sind simuliert (data/migration): Zugwege und Zugzeiten nach der Literatur, keine Messdaten einzelner Tiere.
// Je Art und Zugweg steht ein Bild der Art auf der Karte: in der Mitte der Gruppe, solange sie ruht, und vorn an der Spitze, wenn sie zieht.
import { computed, effect } from '@preact/signals';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { DAY } from '../../core/time';
import { dayOfYear, makeFlock, moveShare, positionAt, PHASE_LABEL, type Bird, type Phase } from '../../data/migration/flock';
import { roundKm, speciesFacts } from '../../data/migration/facts';
import { loadSpeciesImage, speciesImages } from '../../data/migration/images';
import { SPECIES, SPECIES_BY_ID, type LngLat, type Species } from '../../data/migration/species';
import { formatIsoDay } from '../../data/parsers/gibsdaily';
import { isoDate } from '../../core/time';
import { EMPTY_FC, bindOpacity, Cleanup } from '../../render/common';
import { setTimeTracks, type TimeSpan } from '../../state/time-tracks';
import { defineLayer } from '../define';
import { MULTI_ALL, multiValues } from '../multi';
import type { InspectCard } from '../types';

const KIND_LABEL = { vogel: 'Vogel', meer: 'Meeressäuger', insekt: 'Insekt' } as const;
/** Bildrate der Bewegung; die Zeitleiste springt in Tagen, die Tiere gleiten dazwischen. */
const FRAME_MS = 1000 / 30;
/** Zeit in ms, in der die gezeigte Zeit auf die gewählte zuläuft. */
const EASE_MS = 240;
/** Ab diesem Anteil ziehender Tiere gilt eine Art als "unterwegs" (Zeitleiste). */
const MOVING_SHARE = 0.05;
/** Ab diesem Anteil sitzt das Bild an der Spitze des Zuges statt in der Mitte der Ruhenden. */
const LEAD_SHARE = 0.3;

interface Flock { sp: Species; birds: Bird[] }

const iconName = (id: string) => `zv-${id}`;

/** Rundes Bild der Art mit Rand in der Farbe der Art; ohne Foto ein farbiger Kreis mit Anfangsbuchstaben. */
function drawIcon(sp: Species, img?: HTMLImageElement): ImageData | undefined {
  const S = 96;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (!g) return undefined;
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 3, 0, Math.PI * 2);
  g.fillStyle = sp.color;
  g.fill();
  g.save();
  g.beginPath();
  g.arc(S / 2, S / 2, S / 2 - 7, 0, Math.PI * 2);
  g.clip();
  if (img && img.naturalWidth) {
    const k = Math.max(S / img.naturalWidth, S / img.naturalHeight);
    g.drawImage(img, (S - img.naturalWidth * k) / 2, (S - img.naturalHeight * k) / 2, img.naturalWidth * k, img.naturalHeight * k);
  } else {
    g.fillStyle = 'rgba(10,15,24,0.55)';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#fff';
    g.font = '600 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(sp.name[0]!, S / 2, S / 2 + 2);
  }
  g.restore();
  try {
    return g.getImageData(0, 0, S, S);
  } catch {
    return undefined; // Bild ohne CORS: der Canvas ist gesperrt, es bleibt beim Kreis
  }
}

export default defineLayer({
  id: 'zugvoegel',
  category: 'erde',
  title: 'Tierzüge',
  summary: 'Vögel, Wale und Falter auf ihren Zugwegen im Lauf eines Jahres',
  icon: 'navigate',
  color: '#FF9F6B',
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'Zugwege und Zugzeiten nach der Literatur (BirdLife International, Vogelwarten, NOAA), vereinfacht nachgebildet', url: 'https://datazone.birdlife.org/', license: 'eigene Simulation, keine Messdaten' },
  ],
  // das Kalenderjahr: 1. Januar bis 31. Dezember (UTC), relativ zu jetzt
  time: {
    mode: 'frames',
    range: () => {
      const y = new Date().getUTCFullYear();
      const n = Date.now();
      return { start: Date.UTC(y, 0, 1) - n, end: Date.UTC(y, 11, 31, 23) - n, step: DAY };
    },
  },
  options: [{ id: 'arten', label: 'Arten', type: 'multi', default: MULTI_ALL, choices: [{ value: MULTI_ALL, label: 'Alle' }, ...SPECIES.map((s) => ({ value: s.id, label: s.name }))] }],
  legend: (o) => {
    const list = multiValues(o.arten);
    return { type: 'classes', items: SPECIES.filter((s) => !list || list.includes(s.id)).map((s) => ({ color: s.color, label: s.name, shape: 'dot' as const })) };
  },
  keywords: ['zugvögel', 'vogelzug', 'zug', 'migration', 'storch', 'weißstorch', 'kranich', 'schwalbe', 'wal', 'buckelwal', 'monarch', 'tierwanderung', 'jahr'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const src = `${ctx.id}-src`;
    const lineId = `${ctx.id}-spur`;
    const dotId = `${ctx.id}-tiere`;
    const markId = `${ctx.id}-bild`;
    const clean = new Cleanup();

    ctx.map.addSource(src, { type: 'geojson', data: EMPTY_FC });
    ctx.map.addLayer(
      {
        id: lineId, type: 'line', source: src, filter: ['==', ['geometry-type'], 'LineString'],
        layout: { 'line-cap': 'round' },
        paint: { 'line-color': ['get', 'c'], 'line-opacity': 0.5, 'line-width': ['interpolate', ['linear'], ['zoom'], 0, 0.8, 6, 1.6] },
      },
      'lines',
    );
    ctx.map.addLayer(
      {
        id: dotId, type: 'circle', source: src, filter: ['all', ['==', ['geometry-type'], 'Point'], ['!', ['has', 'm']]],
        paint: {
          'circle-color': ['get', 'c'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 0, 1.7, 4, 2.6, 8, 4],
          'circle-opacity': 0.92,
          'circle-stroke-color': 'rgba(10,15,24,0.55)',
          'circle-stroke-width': 0.6,
          'circle-stroke-opacity': 0.8,
        },
      },
      'points',
    );
    ctx.map.addLayer(
      {
        id: markId, type: 'symbol', source: src, filter: ['has', 'm'],
        layout: { 'icon-image': ['get', 'img'], 'icon-size': ['interpolate', ['linear'], ['zoom'], 0, 0.42, 5, 0.6, 9, 0.8], 'icon-allow-overlap': true, 'icon-ignore-placement': true },
      },
      'points',
    );
    clean.add(bindOpacity(ctx, ml, [
      { layer: lineId, prop: 'line-opacity', base: 0.5 },
      { layer: dotId, prop: 'circle-opacity', base: 0.92 },
      { layer: markId, prop: 'icon-opacity', base: 1 },
    ]));

    // Bilder der Arten: erst der farbige Kreis, das Foto ersetzt ihn, sobald es da ist
    const iconsOf = new Set<string>();
    const setIcon = (sp: Species, img?: HTMLImageElement) => {
      const data = drawIcon(sp, img);
      if (!data) return;
      const name = iconName(sp.id);
      if (ml.hasImage(name)) ml.removeImage(name);
      ml.addImage(name, data, { pixelRatio: 2 });
      iconsOf.add(name);
    };
    SPECIES.forEach((sp) => (setIcon(sp), loadSpeciesImage(sp)));
    const loaded = new Set<string>();
    clean.add(effect(() => {
      for (const [id, url] of Object.entries(speciesImages.value)) {
        if (!url || loaded.has(id) || !SPECIES_BY_ID[id]) continue;
        loaded.add(id);
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { setIcon(SPECIES_BY_ID[id]!, img); ctx.map.requestRender(); };
        img.src = url;
      }
    }));

    // Tiere der gewählten Arten; neu gewürfelt nur beim ersten Mal je Art
    const cache = new Map<string, Bird[]>();
    const flocks = computed<Flock[]>(() => {
      const list = multiValues(ctx.options.value.arten);
      return SPECIES.filter((s) => !list || list.includes(s.id)).map((sp) => {
        let birds = cache.get(sp.id);
        if (!birds) cache.set(sp.id, (birds = makeFlock(sp)));
        return { sp, birds };
      });
    });

    const target = computed(() => dayOfYear(ctx.time.value));
    let shown = target.peek();
    let dirty = true;
    const tmp: LngLat = [0, 0];
    const back: LngLat = [0, 0];
    const prog = { p: 0 };

    interface Group { n: number; moving: number; lead: { p: number; at: LngLat } | undefined; rest: Record<'brut' | 'winter', { n: number; x: number; y: number; x0: number }> }
    const marker = (sp: Species, fw: number, g: Group): Feature<Point> | undefined => {
      const lead = g.moving / g.n >= LEAD_SHARE && g.lead;
      let at: LngLat | undefined;
      let phase: Phase = 'brut';
      if (lead) {
        at = lead.at;
        phase = g.moving ? 'herbst' : 'brut';
      } else {
        const r = g.rest.brut.n >= g.rest.winter.n ? g.rest.brut : g.rest.winter;
        phase = g.rest.brut.n >= g.rest.winter.n ? 'brut' : 'winter';
        if (!r.n) return g.lead ? { type: 'Feature', properties: { m: 1, sp: sp.id, ph: 'herbst', c: sp.color, img: iconName(sp.id), k: `${sp.id}${fw}` }, geometry: { type: 'Point', coordinates: g.lead.at } } : undefined;
        at = [r.x0 + r.x / r.n, r.y / r.n];
      }
      return { type: 'Feature', properties: { m: 1, sp: sp.id, ph: phase, c: sp.color, img: iconName(sp.id), k: `${sp.id}${fw}` }, geometry: { type: 'Point', coordinates: [at[0], at[1]] } };
    };

    function render(doy: number): void {
      const feats: Feature<Point | LineString>[] = [];
      for (const { sp, birds } of flocks.peek()) {
        const groups: Group[] = sp.flyways.map(() => ({ n: 0, moving: 0, lead: undefined, rest: { brut: { n: 0, x: 0, y: 0, x0: 0 }, winter: { n: 0, x: 0, y: 0, x0: 0 } } }));
        for (const b of birds) {
          const phase = positionAt(b, doy, tmp, prog);
          const props = { c: sp.color, sp: sp.id, ph: phase };
          feats.push({ type: 'Feature', properties: props, geometry: { type: 'Point', coordinates: [tmp[0], tmp[1]] } });
          const g = groups[b.fw]!;
          g.n++;
          if (phase === 'herbst' || phase === 'fruehjahr') {
            g.moving++;
            if (!g.lead || prog.p > g.lead.p) g.lead = { p: prog.p, at: [tmp[0], tmp[1]] };
            const days = Math.max(1, Math.min(6, (b.a1 - b.a0) * 0.12));
            positionAt(b, doy - days, back);
            // eine Spur über den Datumsrand würde quer um die Karte laufen
            if (Math.abs(back[0] - tmp[0]) < 90) feats.push({ type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: [[back[0], back[1]], [tmp[0], tmp[1]]] } });
          } else {
            const r = g.rest[phase === 'brut' ? 'brut' : 'winter'];
            if (!r.n) r.x0 = tmp[0];
            let dx = tmp[0] - r.x0;
            if (dx > 180) dx -= 360;
            else if (dx < -180) dx += 360;
            r.n++;
            r.x += dx;
            r.y += tmp[1];
          }
        }
        groups.forEach((g, fw) => {
          if (!g.n) return;
          const m = marker(sp, fw, g);
          if (m) feats.push(m);
        });
      }
      (ml.getSource(src) as { setData?(d: FeatureCollection): void } | undefined)?.setData?.({ type: 'FeatureCollection', features: feats });
    }

    // Die Zeitleiste springt tageweise: die gezeigte Zeit gleitet auf die gewählte zu, so fliegen die Tiere statt zu springen.
    let raf = 0;
    let last = performance.now();
    let lastFrame = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = now - last;
      last = now;
      const want = target.peek();
      let diff = want - shown;
      // bei weiten Sprüngen (Wiedergabe von vorn, Überspringen der Ruhe): nicht durchs ganze Jahr gleiten
      if (Math.abs(diff) > 40) { shown = want; diff = 0; dirty = true; }
      else if (Math.abs(diff) > 0.003) { shown += diff * (1 - Math.exp(-dt / EASE_MS)); dirty = true; }
      else if (diff !== 0) { shown = want; dirty = true; }
      if (!dirty || now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      dirty = false;
      render(shown);
    };
    raf = requestAnimationFrame(tick);
    clean.add(() => cancelAnimationFrame(raf));
    clean.add(effect(() => { flocks.value; dirty = true; }));

    // Spuren unter der Zeitleiste: wann zieht welche Art, wann ruht sie
    clean.add(effect(() => {
      const y = new Date().getUTCFullYear();
      const day0 = Date.UTC(y, 0, 1);
      const tracks = flocks.value.map(({ sp, birds }) => {
        const share = moveShare(birds);
        const active: TimeSpan[] = [];
        let from = -1;
        for (let d = 1; d <= 366; d++) {
          const on = d <= 365 && share[d]! >= MOVING_SHARE;
          if (on && from < 0) from = d;
          if (!on && from >= 0) { active.push({ start: day0 + (from - 1) * DAY, end: day0 + (d - 1) * DAY }); from = -1; }
        }
        return { id: sp.id, label: sp.name, color: sp.color, active };
      });
      setTimeTracks(ctx.id, tracks);
    }));
    clean.add(() => setTimeTracks(ctx.id, null));

    clean.add(effect(() => {
      const total = flocks.value.reduce((n, f) => n + f.birds.length, 0);
      ctx.status({ state: 'ready', count: total, note: `${formatIsoDay(isoDate(ctx.time.value))} · simuliert nach Zugwegen aus der Literatur` });
    }));

    const describe = (id: string, phase: Phase): InspectCard => {
      const sp = SPECIES_BY_ID[id]!;
      const f = speciesFacts(sp, phase);
      const photo = speciesImages.peek()[id];
      const wiki = sp.wiki.includes(':') ? sp.wiki.split(':') as [string, string] : ['de', sp.wiki] as [string, string];
      return {
        title: sp.name,
        subtitle: `${sp.latin} · ${KIND_LABEL[sp.kind]}`,
        color: sp.color,
        icon: 'navigate',
        media: photo ? { type: 'image', url: photo } : undefined,
        facts: [
          { label: `Am ${formatIsoDay(isoDate(ctx.time.peek()))}`, value: PHASE_LABEL[phase], emphasis: true },
          { label: f.next.label, value: f.next.value },
          { label: 'Sommer', value: sp.breedIn },
          { label: 'Winter', value: sp.winterIn },
          { label: 'Strecke', value: `etwa ${roundKm(f.km)} km einfach${f.ways > 1 ? ` (häufigster von ${f.ways} Zugwegen)` : ''}` },
          { label: 'Tempo', value: `etwa ${Math.round(f.kmPerDay / 10) * 10} km pro Tag` },
          { label: 'Herbstzug', value: f.autumn },
          { label: 'Frühjahrszug', value: f.spring },
          { label: 'Größe', value: sp.size },
        ],
        text: `${sp.note}.\n\nDie Punkte sind simulierte Einzeltiere nach den bekannten Zugwegen und -zeiten der Art, keine Messdaten.`,
        links: [{ label: 'Mehr bei Wikipedia', url: `https://${wiki[0]}.wikipedia.org/wiki/${encodeURIComponent(wiki[1])}` }],
      };
    };
    clean.add(ctx.map.onPick([dotId, markId], {
      click(f) {
        const p = f.properties as { sp?: string; ph?: Phase };
        if (p.sp && SPECIES_BY_ID[p.sp] && p.ph) ctx.select(describe(p.sp, p.ph));
      },
    }));

    return {
      destroy() {
        clean.run();
        ctx.map.remove({ layers: [lineId, dotId, markId], sources: [src] });
        for (const n of iconsOf) if (ml.hasImage(n)) ml.removeImage(n);
      },
    };
  },
});
