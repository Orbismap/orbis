// Automatic licence plate readers (ALPR, e.g. Flock Safety) from OpenStreetMap, as in the DeFlock community map, in the
// shared camera look (render/cameras.ts). alpr.pmtiles carries thinned tiles from zoom 0 (66,347 of 157,243 at z0, all from z3).
import { bucketUrl } from '../../data/endpoints';
import { cameraLayer, directionFact, osmNodeLink, osmSetCount } from '../../render/cameras';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#FF5D5D';
const ZONE: Record<string, string> = { traffic: 'Verkehr', parking: 'Parkplatz', town: 'Ortschaft', building: 'Gebäude', public: 'Öffentlich', shop: 'Geschäft' };
const MOUNT: Record<string, string> = { pole: 'Mast', wall: 'Wand', street_lamp: 'Laterne', ceiling: 'Decke', bridge: 'Brücke', traffic_signals: 'Ampel', building: 'Gebäude' };

export default defineLayer({
  id: 'kennzeichen',
  category: 'medien',
  title: 'Kennzeichenleser',
  summary: 'Kameras zur automatischen Kennzeichenerfassung (ALPR) aus OpenStreetMap, vor allem in den USA',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'OpenStreetMap-Mitwirkende', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'alpr.pmtiles' } },
    { name: 'DeFlock', url: 'https://deflock.org/', license: 'Community-Projekt (Verweis, keine Daten übernommen)' },
  ],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Kennzeichenleser (ALPR)' }] },
  keywords: ['alpr', 'flock', 'kennzeichen', 'lpr', 'anpr', 'nummernschild', 'deflock', 'überwachung'],

  mount(ctx) {
    const { count, resource } = osmSetCount(ctx, 'alpr');
    return cameraLayer(ctx, {
      color: COLOR,
      count,
      softResources: [resource],
      detail: {
        name: 'alpr',
        data: { kind: 'pmtiles', url: bucketUrl('osm', 'alpr.pmtiles'), sourceLayer: 'alpr', attribution: '© OpenStreetMap-Mitwirkende (ODbL)' },
        describe: (f: AnyFeature) => {
          const p = f.properties as { id: number; brand?: string; flock?: number; operator?: string; dir?: number; mount?: string; zone?: string; since?: string; ref?: string };
          const [lng, lat] = f.geometry.type === 'Point' ? f.geometry.coordinates : [0, 0];
          return {
            title: p.flock ? 'Flock-Kamera (ALPR)' : 'Kennzeichenleser (ALPR)',
            subtitle: [p.brand, p.operator].filter(Boolean).join(' · ') || 'OpenStreetMap',
            facts: [
              ...(p.brand ? [{ label: 'Hersteller', value: p.brand }] : []),
              ...(p.zone ? [{ label: 'Bereich', value: ZONE[p.zone] ?? p.zone }] : []),
              ...(p.mount ? [{ label: 'Montage', value: MOUNT[p.mount] ?? p.mount }] : []),
              ...directionFact(p.dir),
              ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
              ...(p.since ? [{ label: 'Seit', value: p.since }] : []),
              ...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []),
            ],
            links: [
              { label: 'Auf DeFlock ansehen', url: `https://maps.deflock.org/?lat=${Number(lat).toFixed(5)}&lng=${Number(lng).toFixed(5)}&zoom=17` },
              ...osmNodeLink(p.id),
            ],
          };
        },
      },
    });
  },
});
