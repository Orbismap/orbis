// Automatic licence plate readers (ALPR, e.g. Flock Safety) from OpenStreetMap, as in the DeFlock community map.
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { pmtilesLayer } from '../../render/pmtiles';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#FF5D5D';
const OTHER = '#FF9F43';
const MIN_ZOOM = 6;
const ZONE: Record<string, string> = { traffic: 'Verkehr', parking: 'Parkplatz', town: 'Ortschaft', building: 'Gebäude', public: 'Öffentlich', shop: 'Geschäft' };
const MOUNT: Record<string, string> = { pole: 'Mast', wall: 'Wand', street_lamp: 'Laterne', ceiling: 'Decke', bridge: 'Brücke', traffic_signals: 'Ampel', building: 'Gebäude' };
const compass = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];

export default defineLayer({
  id: 'kennzeichen',
  category: 'medien',
  title: 'Kennzeichenleser',
  summary: 'Kameras zur automatischen Kennzeichenerfassung (ALPR) aus OpenStreetMap, ab Zoomstufe 6',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  minZoom: MIN_ZOOM,
  sources: [
    { name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'alpr.pmtiles' } },
    { name: 'DeFlock', url: 'https://deflock.org/', license: 'Community-Projekt (Verweis, keine Daten übernommen)' },
  ],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Flock Safety' }, { color: OTHER, label: 'Anderer Hersteller' }] },
  keywords: ['alpr', 'flock', 'kennzeichen', 'lpr', 'anpr', 'nummernschild', 'deflock', 'überwachung'],

  mount(ctx) {
    return pmtilesLayer(ctx, {
      url: bucketUrl('osm', 'alpr.pmtiles'),
      sourceLayer: 'alpr',
      minZoom: MIN_ZOOM,
      radius: ['interpolate', ['linear'], ['zoom'], MIN_ZOOM, 1.8, 10, 3.2, 14, 6.5] as ExpressionSpecification,
      color: ['case', ['==', ['get', 'flock'], 1], COLOR, OTHER] as ExpressionSpecification,
      stroke: { color: 'rgba(40, 8, 8, 0.85)', width: 0.8 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { id: number; brand?: string; flock?: number; operator?: string; dir?: number; mount?: string; zone?: string; since?: string; ref?: string };
        const [lng, lat] = f.geometry.type === 'Point' ? f.geometry.coordinates : [0, 0];
        return {
          title: p.flock ? 'Flock-Kamera (ALPR)' : 'Kennzeichenleser (ALPR)',
          subtitle: [p.brand, p.operator].filter(Boolean).join(' · ') || 'OpenStreetMap',
          color: p.flock ? COLOR : OTHER,
          icon: 'camera',
          facts: [
            ...(p.brand ? [{ label: 'Hersteller', value: p.brand }] : []),
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(p.zone ? [{ label: 'Bereich', value: ZONE[p.zone] ?? p.zone }] : []),
            ...(p.mount ? [{ label: 'Montage', value: MOUNT[p.mount] ?? p.mount }] : []),
            ...(p.dir != null && p.dir >= 0 ? [{ label: 'Blickrichtung', value: `${formatInt(p.dir)}° (${compass[Math.round(p.dir / 45) % 8]})` }] : []),
            ...(p.since ? [{ label: 'Seit', value: p.since }] : []),
            ...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []),
          ],
          links: [
            { label: 'Auf DeFlock ansehen', url: `https://maps.deflock.org/?lat=${Number(lat).toFixed(5)}&lng=${Number(lng).toFixed(5)}&zoom=17` },
            { label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` },
          ],
        };
      },
    });
  },
});
