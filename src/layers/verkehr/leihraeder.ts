// Bike sharing stations from the operators' open GBFS feeds (61 systems, list ported from the old Orbis): free bikes and
// free docks per station, loaded per system when its service area meets the view (from zoom 11), refreshed every
// minute while visible. Below zoom 11 one dot per system. All feeds are keyless and send CORS headers.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { Feature, FeatureCollection, Point } from 'geojson';
import { formatAge, formatDateTime } from '../../core/format';
import { bboxIntersects, type BBox } from '../../core/geo';
import { MINUTE } from '../../core/time';
import { fetchRaw } from '../../data/http';
import { BIKE_SYSTEMS, type BikeSystem } from '../../data/parsers/bikesystems';
import { gbfsStations, type BikeStationProps } from '../../data/parsers/gbfs';
import { liveResource } from '../../data/parsers/liveresource';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { defineLayer } from '../define';
import type { InspectCard } from '../types';

const COLOR = '#58d68d';
const STATION_ZOOM = 11;
const COLORS = { ok: '#58d68d', few: '#fb8c00', none: '#e53935', off: '#8b93a3' };

const headersFor = (url: string): Record<string, string> | undefined =>
  url.includes('gbfs.urbansharing.com') ? { 'Client-Identifier': 'orbis-map' } : url.includes('api.entur.io') ? { 'ET-Client-Name': 'orbis-map' } : undefined;

/** Service area box of a system. */
export const systemBox = ([, , , lat, lon, km]: BikeSystem): BBox => {
  const dLat = km / 111.32;
  const dLon = km / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
};

const infoCache = new Map<string, { at: number; doc: unknown }>();
async function loadSystem(sys: BikeSystem, signal: AbortSignal): Promise<FeatureCollection<Point, BikeStationProps>> {
  const [id, city, provider, , , , url] = sys;
  const headers = headersFor(url);
  const cached = infoCache.get(id);
  const info = cached && Date.now() - cached.at < 12 * 60 * MINUTE
    ? cached.doc
    : (await fetchRaw<unknown>(url, { signal, headers, timeout: 25_000 })).data;
  if (info !== cached?.doc) infoCache.set(id, { at: Date.now(), doc: info });
  const status = (await fetchRaw<unknown>(url.replace('station_information', 'station_status'), { signal, headers, timeout: 25_000, revalidate: true })).data;
  return gbfsStations({ info, status, sys: `${provider} · ${city}`, sysId: id });
}

const describe = (f: AnyFeature): InspectCard => {
  const p = f.properties as unknown as BikeStationProps;
  return {
    title: p.name, subtitle: p.sys, color: p.off ? COLORS.off : COLORS.ok, icon: 'pin', time: p.updated || undefined,
    facts: [
      { label: 'Freie Räder', value: p.off ? 'Station außer Betrieb' : `${p.bikes}${p.ebikes >= 0 ? ` (davon ${p.ebikes} E-Bikes)` : ''}`, emphasis: true },
      ...(p.docks >= 0 ? [{ label: 'Freie Plätze', value: String(p.docks) }] : []),
      ...(p.capacity > 0 ? [{ label: 'Stellplätze', value: String(p.capacity) }] : []),
      ...(p.updated ? [{ label: 'Stand', value: `${formatDateTime(p.updated)} (${formatAge(p.updated)})` }] : []),
    ],
    location: f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : undefined,
  };
};

export default defineLayer({
  id: 'leihraeder',
  category: 'verkehr',
  title: 'Leihräder',
  summary: 'Stationen mit freien Rädern und Plätzen, live, ab Zoomstufe 11',
  icon: 'pin',
  color: COLOR,
  form: 'points',
  cadence: 'live',
  coverage: 'Nord- und Südamerika, Norwegen, Spanien',
  minZoom: STATION_ZOOM,
  sources: [{ name: 'Offene GBFS-Feeds der Betreiber (Lyft, BCycle, PBSC, Tembici, Urban Sharing, nextbike, JCDecaux u. a.)', url: 'https://gbfs.org/', license: 'Betreiber-Lizenzen, Nutzung mit Nennung' }],
  legend: { type: 'classes', items: [
    { color: COLORS.ok, label: '3 oder mehr freie Räder' }, { color: COLORS.few, label: '1 bis 2 freie Räder' },
    { color: COLORS.none, label: 'keine freien Räder' }, { color: COLORS.off, label: 'außer Betrieb' },
  ] },
  keywords: ['leihrad', 'bikesharing', 'bike share', 'citi bike', 'bicing', 'bicimad', 'divvy', 'bluebikes', 'gbfs', 'fahrrad', 'nextbike', 'bysykkel'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const stationsById = new Map<string, { at: number; fc: FeatureCollection<Point, BikeStationProps> }>();
    const res = liveResource<FeatureCollection<Point, BikeStationProps>>({
      every: MINUTE,
      async load(signal) {
        const empty = { type: 'FeatureCollection', features: [] } as FeatureCollection<Point, BikeStationProps>;
        if (ml.getZoom() < STATION_ZOOM - 0.05) return empty;
        const b = ml.getBounds();
        const view: BBox = [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()];
        const inView = BIKE_SYSTEMS.filter((s) => bboxIntersects(systemBox(s), view));
        let failed = 0;
        await Promise.all(inView.map(async (s) => {
          const old = stationsById.get(s[0]);
          if (old && Date.now() - old.at < 45_000) return;
          try { stationsById.set(s[0], { at: Date.now(), fc: await loadSystem(s, signal) }); } catch { if (!signal.aborted) failed++; }
        }));
        if (signal.aborted) throw new DOMException('aborted', 'AbortError');
        if (inView.length && failed === inView.length) throw new Error('Betreiber-Feeds nicht erreichbar');
        const features = inView.flatMap((s) => stationsById.get(s[0])?.fc.features ?? []);
        return { type: 'FeatureCollection', features } as FeatureCollection<Point, BikeStationProps>;
      },
    });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const onMove = () => { clearTimeout(timer); timer = setTimeout(() => res.trigger(true), 500); };
    ml.on('moveend', onMove);

    const systems = {
      type: 'FeatureCollection',
      features: BIKE_SYSTEMS.map(([id, city, provider, lat, lon]): Feature<Point> => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] }, properties: { id, city, provider } })),
    } as FeatureCollection;
    const overview = pointLayer(ctx, {
      name: 'systems', data: computed(() => systems), color: COLOR, radius: 5, stroke: { color: '#0b1a0b', width: 1 },
      describe: (f) => ({ title: String(f.properties.provider), subtitle: String(f.properties.city), icon: 'pin', facts: [{ label: 'Hinweis', value: 'Näher heranzoomen für Stationen mit freien Rädern' }], location: f.geometry.type === 'Point' ? (f.geometry.coordinates as [number, number]) : undefined }),
    });
    for (const suffix of ['circles', 'ring']) if (ml.getLayer(`${ctx.id}.systems-${suffix}`)) ml.setLayerZoomRange(`${ctx.id}.systems-${suffix}`, 0, STATION_ZOOM);

    const radius = ['interpolate', ['linear'], ['zoom'],
      STATION_ZOOM, ['interpolate', ['linear'], ['get', 'bikes'], 0, 2.5, 5, 3.5, 20, 5],
      14, ['interpolate', ['linear'], ['get', 'bikes'], 0, 4, 5, 6, 20, 9],
      17, ['interpolate', ['linear'], ['get', 'bikes'], 0, 7, 5, 10, 20, 14]] as unknown as ExpressionSpecification;
    const color = ['case', ['get', 'off'], COLORS.off, ['==', ['get', 'bikes'], 0], COLORS.none, ['<', ['get', 'bikes'], 3], COLORS.few, COLORS.ok] as unknown as ExpressionSpecification;
    const stations = pointLayer(ctx, {
      name: 'stations', data: res, color, radius, stroke: { color: '#0b1a0b', width: 1 }, minZoom: STATION_ZOOM, describe,
      count: computed(() => res.data.value?.features.length),
    });
    return {
      destroy() { clearTimeout(timer); ml.off('moveend', onMove); stations.destroy(); overview.destroy(); res.dispose(); },
    };
  },
});
