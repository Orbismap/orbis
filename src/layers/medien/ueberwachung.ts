// Surveillance cameras (OpenStreetMap, cctv.pmtiles) in the shared camera look (render/cameras.ts). The archive carries
// thinned tiles from zoom 0 (73,899 of 438,165 cameras at z0, all of them from z5), so the dots are visible from the world view.
import { bucketUrl } from '../../data/endpoints';
import { cameraLayer, directionFact, osmNodeLink, osmSetCount } from '../../render/cameras';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#B388FF';
const AREA: Record<string, string> = { public: 'Öffentlicher Raum', outdoor: 'Außen (privat)', indoor: 'Innenraum', webcam: 'Webcam' };
const TYPE: Record<string, string> = { fixed: 'fest', dome: 'Kuppel', panning: 'Schwenkkamera', ptz: 'PTZ-Kamera' };
const MOUNT: Record<string, string> = { pole: 'Mast', wall: 'Wand', street_lamp: 'Laterne', ceiling: 'Decke', bridge: 'Brücke', traffic_signals: 'Ampel', building: 'Gebäude', roof: 'Dach' };

export default defineLayer({
  id: 'ueberwachung',
  category: 'medien',
  title: 'Überwachungskameras',
  summary: 'Kameras der Videoüberwachung weltweit, in Städten auch Montage und Blickrichtung',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  sources: [
    { name: 'OpenStreetMap-Mitwirkende (Geofabrik-Auszüge, Kameras)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'cctv.pmtiles' } },
  ],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Überwachungskamera' }] },
  keywords: ['cctv', 'kamera', 'überwachung', 'video', 'sicherheit', 'surveillance', 'osm'],

  mount(ctx) {
    const { count, resource } = osmSetCount(ctx, 'cctv');
    return cameraLayer(ctx, {
      color: COLOR,
      count,
      softResources: [resource],
      detail: {
        name: 'cctv',
        data: { kind: 'pmtiles', url: bucketUrl('osm', 'cctv.pmtiles'), sourceLayer: 'cctv', attribution: '© OpenStreetMap-Mitwirkende (ODbL)' },
        describe: (f: AnyFeature) => {
          const p = f.properties as { id: number; surveillance?: string; ctype?: string; mount?: string; guard?: number; operator?: string; dir?: number };
          return {
            title: p.guard ? 'Wachpersonal / Sicherheitsdienst' : 'Überwachungskamera',
            subtitle: [p.ctype && (TYPE[p.ctype] ?? p.ctype), p.operator].filter(Boolean).join(' · ') || 'OpenStreetMap',
            facts: [
              ...(p.surveillance ? [{ label: 'Überwachter Bereich', value: AREA[p.surveillance] ?? p.surveillance }] : []),
              ...(p.ctype ? [{ label: 'Bauart', value: TYPE[p.ctype] ?? p.ctype }] : []),
              ...(p.mount ? [{ label: 'Montage', value: MOUNT[p.mount] ?? p.mount }] : []),
              ...directionFact(p.dir),
              ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ],
            links: osmNodeLink(p.id),
          };
        },
      },
    });
  },
});
