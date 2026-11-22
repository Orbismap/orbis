// Points of interest (shops, food, sights, transport, services) from the OpenFreeMap vector tiles (OpenMapTiles layer `poi`,
// source `ofm` shared with the basemap, so no extra download). The same places the Erkunden map shows by default (map/poi.ts:
// icon per group, importance by zoom); as a layer they can be narrowed to groups and work on every map. A click opens the card.
import { effect } from '@preact/signals';
import type { InspectCard } from '../types';
import { defineLayer } from '../define';
import { POI_GROUPS as GROUPS, POI_OTHER, poiFilter, poiDotsId, poiGroupOf, poiLayers, poiOpacity } from '../../map/poi';
import { landmarkMask } from '../../data/landmarks';
import { poiLayerOn } from '../../state/view';

const OTHER = POI_OTHER.color;
const labelOf = (v: unknown): string => String(v ?? '').replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase());

export default defineLayer({
  id: 'orte',
  category: 'gesellschaft',
  title: 'Orte und Läden',
  summary: 'Restaurants, Geschäfte, Sehenswürdigkeiten, Haltestellen und Einrichtungen mit Namen',
  icon: 'pin',
  color: '#FF9A3D',
  form: 'points',
  cadence: 'static',
  coverage: 'Welt',
  minZoom: 12,
  sources: [{ name: 'OpenFreeMap / OpenStreetMap-Mitwirkende', url: 'https://openfreemap.org/', license: 'ODbL 1.0' }],
  options: [
    { id: 'gruppe', label: 'Art', type: 'multi', default: 'all', choices: [{ value: 'all', label: 'Alle' }, ...GROUPS.map((g) => ({ value: g.id, label: g.label }))] },
  ],
  legend: { type: 'classes', items: GROUPS.map((g) => ({ color: g.color, label: g.label, shape: 'dot' as const })) },
  keywords: ['poi', 'points of interest', 'orte', 'läden', 'geschäfte', 'shops', 'restaurant', 'café', 'cafe', 'bar', 'hotel', 'sehenswürdigkeit', 'museum', 'supermarkt', 'apotheke', 'tankstelle', 'google maps', 'apple maps'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const places = `${ctx.id}.places`;
    const dots = poiDotsId(places);
    const [dotLayer, symbolLayer] = poiLayers(places);
    ctx.map.addLayer(dotLayer!, 'labels'); // the 3D models of the points slot must not cover the places
    ctx.map.addLayer(symbolLayer!, 'labels');
    poiLayerOn.value = true;

    const off = ctx.map.onPick([places], {
      click(f) {
        const p = (f.properties ?? {}) as Record<string, unknown>;
        const group = poiGroupOf(p.class);
        const kind = labelOf(p.subclass && p.subclass !== p.class ? p.subclass : p.class);
        const card: InspectCard = {
          title: String(p['name:latin'] ?? p.name ?? kind),
          subtitle: kind,
          color: group?.color ?? OTHER,
          asPlace: true,
          facts: [{ label: 'Art', value: kind, emphasis: true }, ...(p['name'] && p['name:latin'] && p.name !== p['name:latin'] ? [{ label: 'Name vor Ort', value: String(p.name) }] : [])],
          links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/#map=19/${(f.geometry as GeoJSON.Point).coordinates[1]}/${(f.geometry as GeoJSON.Point).coordinates[0]}` }],
        };
        if (f.geometry.type === 'Point') card.location = f.geometry.coordinates.slice(0, 2) as [number, number];
        ctx.select(card);
      },
    });

    const stop = effect(() => {
      const o = ctx.opacity.value;
      if (!ml.getLayer(places)) return;
      const groups = String(ctx.options.value.gruppe ?? 'all');
      const hide = landmarkMask.value.boxes;
      ml.setFilter(places, poiFilter(groups, 0, hide));
      ml.setFilter(dots, poiFilter(groups, 1, hide));
      ml.setPaintProperty(dots, 'icon-opacity', poiOpacity(o));
      ml.setPaintProperty(places, 'icon-opacity', poiOpacity(o));
      ml.setPaintProperty(places, 'text-opacity', poiOpacity(o));
    });
    ctx.status({ state: 'ready', note: 'Wichtiges ab Zoom 12, Läden und Details beim Hineinzoomen' });
    return { destroy: () => { off(); stop(); poiLayerOn.value = false; ctx.map.remove({ layers: [places, dots] }); } };
  },
});
