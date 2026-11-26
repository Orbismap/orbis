// "Landmarks": every 3D model of the landmarks dataset (data/landmarks.ts) as a point, clustered from the whole globe on, so one
// sees where models are. Close up the models themselves appear (features/landmarks/source.ts, drawn by Orbis Pro) on every basemap.
import { computed } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { LANDMARKS_BASE, LANDMARKS_CREDIT, LANDMARKS_LICENSE, LANDMARKS_SITE, reloadCatalogue } from '../../data/landmarks';
import { LANDMARK_GROUPS, type LandmarkPointCollection, type LandmarkPointProps } from '../../data/parsers/landmarks';
import { proEnabled } from '../../ext/licence';
import { proAvailable } from '../../ext/loader';
import type { AnyFeature } from '../../render/common';
import { pointLayer } from '../../render/points';
import { landmarksLayerOn } from '../../state/view';
import { defineLayer } from '../define';
import { multiValues } from '../multi';

const COLOR = '#E8C27A';

/** The closest the flight to a model goes: the taller it is, the farther the camera stays so that all of it is in view. */
export const viewZoom = (heightM: number): number => Math.min(17.2, Math.max(14, 17.2 - Math.log2(Math.max(heightM, 80) / 80)));

export default defineLayer({
  id: 'landmarks',
  category: 'infrastruktur',
  title: 'Landmarks',
  summary: 'Wahrzeichen weltweit, die es als 3D-Modell gibt: gebündelt auf dem Globus, aus der Nähe als Modell (mit Orbis Pro)',
  icon: 'building',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  coverage: 'Welt',
  sources: [{ name: LANDMARKS_CREDIT, url: LANDMARKS_SITE, license: LANDMARKS_LICENSE }],
  options: [
    { id: 'art', label: 'Art', type: 'multi', default: 'all', choices: [{ value: 'all', label: 'Alle' }, ...LANDMARK_GROUPS.map((g) => ({ value: g.id, label: g.label }))] },
  ],
  legend: { type: 'classes', items: LANDMARK_GROUPS.map((g) => ({ color: g.color, label: g.label, shape: 'dot' as const })) },
  keywords: ['landmarks', 'wahrzeichen', '3d', 'modell', 'modelle', 'sehenswürdigkeiten', 'gebäude', 'turm', 'brücke', 'stadion', 'denkmal', 'eiffelturm', 'empire state building', 'barrelman'],

  async mount(ctx) {
    const cat = await reloadCatalogue();
    if (!cat.assets) throw new Error('landmarks: no asset list');
    const all = ctx.resource<LandmarkPointCollection>({ key: `landmarks:${cat.release}`, url: LANDMARKS_BASE + cat.assets, parse: 'landmarkPoints', timeout: 60_000 });
    // filtered here, not on the map: the clusters have to count only what is shown
    const shown = computed<LandmarkPointCollection | undefined>(() => {
      const d = all.data.value;
      const picked = multiValues(String(ctx.options.value.art ?? 'all'));
      if (!d || !picked) return d;
      return { type: 'FeatureCollection', features: d.features.filter((f) => picked.includes(f.properties.group)) };
    });

    const points = pointLayer({
      ...ctx,
      status: (s) => ctx.status(s.state === 'ready' && !s.note
        ? { ...s, note: proAvailable && proEnabled.value ? 'Ab Zoom 13 als 3D-Modell' : 'Die 3D-Modelle zeichnet Orbis Pro' }
        : s),
    }, {
      data: shown,
      resources: [all],
      cluster: { radius: 44, maxZoom: 12 },
      radius: ['interpolate', ['linear'], ['zoom'], 0, 3, 5, 4.2, 11, 6.5, 16, 4.5] as ExpressionSpecification,
      color: ['match', ['get', 'group'], ...LANDMARK_GROUPS.slice(0, -1).flatMap((g) => [g.id, g.color]), LANDMARK_GROUPS.at(-1)!.color] as unknown as ExpressionSpecification,
      stroke: { color: 'rgba(30, 22, 8, 0.9)', width: 1 },
      sortKey: ['get', 'heightM'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as LandmarkPointProps;
        const [w, s, e, n] = p.bounds.split(',').map(Number) as [number, number, number, number];
        return {
          title: p.name,
          subtitle: [p.kind, p.place].filter(Boolean).join(' · '),
          color: LANDMARK_GROUPS.find((g) => g.id === p.group)?.color ?? COLOR,
          icon: 'building',
          facts: [
            ...(p.heightM ? [{ label: 'Höhe', value: `${formatInt(p.heightM)} m`, emphasis: true }] : []),
            { label: 'Art', value: p.kind },
            ...(p.place ? [{ label: 'Gegend', value: p.place }] : []),
          ],
          text: p.description || undefined,
          links: [
            ...(p.osm ? [{ label: 'OpenStreetMap', url: p.osm }] : []),
            ...(p.wikidata ? [{ label: 'Wikidata', url: `https://www.wikidata.org/wiki/${p.wikidata}` }] : []),
            { label: 'Landmarks-Projekt', url: LANDMARKS_SITE },
          ],
          actions: [{ id: '3d', label: 'In 3D ansehen', icon: 'building', run: () => ctx.map.flyTo({ bounds: [w, s, e, n], maxZoom: viewZoom(p.heightM), pitch: 60, duration: 1800 }) }],
        };
      },
    });

    landmarksLayerOn.value = true;
    return { destroy: () => { landmarksLayerOn.value = false; points.destroy(); } };
  },
});
