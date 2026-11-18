// Speed and red-light cameras mapped in OpenStreetMap (monthly extract as PMTiles in the osm bucket), in the shared
// camera look (render/cameras.ts). blitzer.pmtiles holds all 93,049 objects in every tile from zoom 0 on.
import { computed, effect } from '@preact/signals';
import type { FeatureCollection } from 'geojson';
import { formatAge, formatNumber } from '../../core/format';
import { MINUTE } from '../../core/time';
import { proxied } from '../../data/endpoints';
import { osmPmtilesUrl } from '../../data/osmfiles';
import { fetchRaw } from '../../data/http';
import { blitzerdeMarkers, blitzerdeUrl, type MobileProps } from '../../data/parsers/blitzerde';
import { liveResource } from '../../data/parsers/liveresource';
import { cameraLayer, directionFact, osmNodeLink, osmSetCount } from '../../render/cameras';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#FFB020';
const MOBILE_ZOOM = 12;
const GRID = 0.15; // degrees; fixed tiles so that overlapping views share the proxy's 60 s cache

/** Mobile checks for the view (tile grid, cached 60 s), only from zoom 12 and only while the option is on. */
function mobileReports(ml: { getZoom(): number; getBounds(): { getWest(): number; getEast(): number; getSouth(): number; getNorth(): number }; on(t: 'moveend', f: () => void): unknown; off(t: 'moveend', f: () => void): unknown }, enabled: () => boolean) {
  const tiles = new Map<string, { at: number; fc: FeatureCollection }>();
  const res = liveResource<FeatureCollection<import('geojson').Point, MobileProps>>({
    every: MINUTE,
    async load(signal) {
      const empty = { type: 'FeatureCollection', features: [] } as FeatureCollection<import('geojson').Point, MobileProps>;
      if (!enabled() || ml.getZoom() < MOBILE_ZOOM - 0.05) return empty;
      const b = ml.getBounds();
      const x0 = Math.floor(b.getWest() / GRID), x1 = Math.floor(b.getEast() / GRID), y0 = Math.floor(b.getSouth() / GRID), y1 = Math.floor(b.getNorth() / GRID);
      const jobs: [number, number][] = [];
      for (let x = x0; x <= x1 && jobs.length < 12; x++) for (let y = y0; y <= y1 && jobs.length < 12; y++) jobs.push([x, y]);
      let failed = 0;
      await Promise.all(jobs.map(async ([x, y]) => {
        const key = `${x},${y}`;
        const hit = tiles.get(key);
        if (hit && Date.now() - hit.at < MINUTE) return;
        try {
          const r = await fetchRaw<unknown>(proxied(blitzerdeUrl(y * GRID, x * GRID, (y + 1) * GRID, (x + 1) * GRID)), { signal, timeout: 15_000 });
          tiles.set(key, { at: Date.now(), fc: blitzerdeMarkers(r.data) });
        } catch { if (!signal.aborted) failed++; }
      }));
      if (signal.aborted) throw new DOMException('aborted', 'AbortError');
      if (failed === jobs.length && jobs.length) throw new Error('Blitzer.de nicht erreichbar (inoffizielle Quelle)');
      const seen = new Set<string>();
      const features = jobs.flatMap(([x, y]) => (tiles.get(`${x},${y}`)?.fc.features ?? []) as FeatureCollection<import('geojson').Point, MobileProps>['features']).filter((f) => !seen.has(f.properties.id) && !!seen.add(f.properties.id));
      return { type: 'FeatureCollection', features };
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const onMove = () => { clearTimeout(timer); timer = setTimeout(() => res.trigger(true), 500); };
  ml.on('moveend', onMove);
  const dispose = res.dispose;
  res.dispose = () => { clearTimeout(timer); ml.off('moveend', onMove); dispose(); };
  return res;
}

const KINDS: Record<string, string> = { cam: 'Ortsfester Blitzer', section: 'Abschnittskontrolle', signals: 'Rotlicht-Blitzer' };

export default defineLayer({
  id: 'blitzer',
  category: 'verkehr',
  title: 'Blitzer',
  summary: 'Ortsfeste Geschwindigkeits- und Rotlichtkameras nach OpenStreetMap, dazu gemeldete mobile Kontrollen',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'minutes',
  sources: [
    { name: 'OpenStreetMap-Mitwirkende (Monatsauszug)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'blitzer.pmtiles' } },
    { name: 'Blitzer.de – Community-Meldungen mobiler Kontrollen (inoffiziell, über Proxy)', url: 'https://www.blitzer.de/', license: 'inoffizielle Schnittstelle, ohne Lizenzaussage' },
  ],
  options: [{ id: 'mobile', label: 'Mobile Blitzer', type: 'toggle', default: true }],
  legend: { type: 'classes', items: [
    { color: COLOR, label: 'Ortsfeste Blitzer mit Blickkegel (Geschwindigkeit, Abschnitt, Rotlicht)' },
    { color: COLOR, label: 'Mobile Kontrolle (ohne Blickkegel, ab Zoomstufe 12, Community-Meldung)' },
  ] },
  keywords: ['blitzer', 'radar', 'tempo', 'geschwindigkeit', 'rotlicht', 'speed camera', 'section control', 'traffipax', 'mobil', 'blitzer.de'],

  mount(ctx) {
    const { count: fixedCount, resource } = osmSetCount(ctx, 'blitzer');
    const mobile = mobileReports(ctx.map.ml, () => ctx.options.value.mobile !== false);
    const stopOpt = effect(() => { void ctx.options.value.mobile; mobile.trigger(true); });
    const count = computed(() => (fixedCount.value === undefined ? undefined : fixedCount.value + (mobile.data.value?.features.length ?? 0)));
    const handle = cameraLayer(ctx, {
      color: COLOR,
      count,
      softResources: [resource],
      detail: [{
        name: 'blitzer',
        data: { kind: 'pmtiles', url: osmPmtilesUrl('blitzer'), sourceLayer: 'blitzer', attribution: '© OpenStreetMap-Mitwirkende (ODbL)' },
        describe: (f: AnyFeature) => {
          const p = f.properties as { kind?: string; speed?: string; dir?: number; operator?: string; ref?: string; id?: number };
          return {
            title: KINDS[p.kind ?? 'cam'] ?? KINDS.cam!,
            subtitle: 'Lageplan, keine Fahrwarnung',
            facts: [
              ...(p.speed ? [{ label: 'Erlaubt', value: /^\d+$/.test(p.speed) ? `${formatNumber(Number(p.speed))} km/h` : p.speed, emphasis: true }] : []),
              ...directionFact(p.dir),
              ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
              ...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []),
            ],
            text: 'Nach OpenStreetMap erfasst, unvollständig und ohne mobile Kontrollen. In Deutschland ist die Nutzung solcher Hinweise während der Fahrt verboten.',
            links: osmNodeLink(p.id),
          };
        },
      }, {
        name: 'mobil',
        minZoom: MOBILE_ZOOM,
        data: { kind: 'geojson', data: mobile },
        describe: (f: AnyFeature) => {
          const p = f.properties as unknown as MobileProps;
          return {
            title: p.title, subtitle: 'Mobile Kontrolle, Meldung von Autofahrern', time: p.reported || undefined,
            facts: [
              ...(p.where ? [{ label: 'Ort', value: p.where }] : []),
              ...(p.speed > 0 ? [{ label: 'Erlaubt', value: `${formatNumber(p.speed)} km/h`, emphasis: true }] : []),
              ...(p.reported ? [{ label: 'Gemeldet', value: formatAge(p.reported) }] : []),
              ...(p.votes > 0 ? [{ label: 'Bestätigungen', value: String(p.votes) }] : []),
            ],
            text: `${p.desc ? `${p.desc}. ` : ''}Mobile Kontrollen kommen aus einer inoffiziellen Community-Quelle (Blitzer.de) und sind oft schon vorbei. Keine Fahrwarnung: In Deutschland ist die Nutzung solcher Hinweise während der Fahrt verboten (§ 23 StVO).`,
          };
        },
      }],
    });
    return { destroy: () => { stopOpt(); handle.destroy(); mobile.dispose(); } };
  },
});
