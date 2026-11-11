// Speed and red-light cameras mapped in OpenStreetMap (monthly extract as PMTiles in the osm bucket).
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatNumber } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { compass } from '../../data/parsers/traffic';
import { pmtilesLayer } from '../../render/pmtiles';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#ff5d5d';
const KINDS: Record<string, { label: string; color: string; legend: string }> = {
  cam: { label: 'Ortsfester Blitzer', color: '#ff5d5d', legend: 'Geschwindigkeit' },
  section: { label: 'Abschnittskontrolle', color: '#ffa13d', legend: 'Abschnittskontrolle' },
  signals: { label: 'Rotlicht-Blitzer', color: '#d66bff', legend: 'Rotlicht' },
};
const color = ['match', ['get', 'kind'], 'section', KINDS.section!.color, 'signals', KINDS.signals!.color, KINDS.cam!.color] as unknown as ExpressionSpecification;
const iconSize = ['interpolate', ['linear'], ['zoom'], 7, 0.3, 11, 0.42, 15, 0.6] as unknown as ExpressionSpecification;

export default defineLayer({
  id: 'blitzer',
  category: 'verkehr',
  title: 'Blitzer',
  summary: 'Ortsfeste Geschwindigkeits- und Rotlichtkameras nach OpenStreetMap, ab Zoomstufe 7',
  icon: 'camera',
  color: COLOR,
  form: 'points',
  cadence: 'static',
  minZoom: 7,
  sources: [{ name: 'OpenStreetMap-Mitwirkende (Monatsauszug)', url: 'https://www.openstreetmap.org/copyright', license: 'ODbL 1.0', manifest: { bucket: 'osm', key: 'blitzer.pmtiles' } }],
  legend: { type: 'classes', items: Object.values(KINDS).map((k) => ({ color: k.color, label: k.legend })) },
  keywords: ['blitzer', 'radar', 'tempo', 'geschwindigkeit', 'rotlicht', 'speed camera', 'section control', 'traffipax'],

  mount(ctx) {
    return pmtilesLayer(ctx, {
      url: bucketUrl('osm', 'blitzer.pmtiles'),
      sourceLayer: 'blitzer',
      idKey: 'id',
      attribution: '© OpenStreetMap-Mitwirkende (ODbL)',
      minZoom: 7,
      radius: 5,
      color,
      symbol: { icon: 'camera', size: iconSize, rotate: 0 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { kind?: string; speed?: string; dir?: number; operator?: string; ref?: string; id?: number };
        const k = KINDS[p.kind ?? 'cam'] ?? KINDS.cam!;
        const dir = Number(p.dir);
        return {
          title: k.label,
          subtitle: 'Lageplan, keine Fahrwarnung',
          color: k.color,
          icon: 'camera',
          facts: [
            ...(p.speed ? [{ label: 'Erlaubt', value: /^\d+$/.test(p.speed) ? `${formatNumber(Number(p.speed))} km/h` : p.speed, emphasis: true }] : []),
            ...(Number.isFinite(dir) && dir >= 0 ? [{ label: 'Blickrichtung', value: `${compass(dir)} (${formatNumber(dir)}°)` }] : []),
            ...(p.operator ? [{ label: 'Betreiber', value: p.operator }] : []),
            ...(p.ref ? [{ label: 'Kennung', value: p.ref }] : []),
          ],
          text: 'Nach OpenStreetMap erfasst, unvollständig und ohne mobile Kontrollen. In Deutschland ist die Nutzung solcher Hinweise während der Fahrt verboten.',
          ...(p.id ? { links: [{ label: 'OpenStreetMap', url: `https://www.openstreetmap.org/node/${p.id}` }] } : {}),
        };
      },
    });
  },
});
