// Radio stations (Radio Browser, mirrored daily): the most listened ones worldwide in the overview,
// all stations of the 10° cells in view from zoom 6. Streams play in the inspector.
import { computed, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import { formatInt } from '../../core/format';
import { bucketUrl } from '../../data/endpoints';
import { fetchRaw, HttpError } from '../../data/http';
import type { StationCollection, StationProps } from '../../data/parsers/radio';
import { runParser } from '../../data/worker/pool';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#FF4F9A';
const DIM = '#B98AA3';
const CELL_ZOOM = 6;
const MAX_CELLS = 12;

const cellKey = (lat: number, lon: number) => `${Math.floor(lat / 10) * 10}_${Math.floor(lon / 10) * 10}`;

export default defineLayer({
  id: 'radio',
  category: 'medien',
  title: 'Radiosender',
  summary: 'Radiosender weltweit zum Anhören, Größe nach Beliebtheit, alle Sender der Region ab Zoomstufe 6',
  icon: 'radio',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  sources: [{ name: 'Radio Browser', url: 'https://www.radio-browser.info/', license: 'Community-Datenbank, freie Nutzung', manifest: { bucket: 'data', key: 'radio/top.json' } }],
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Direkt abspielbar (https)' }, { color: DIM, label: 'Nur Link (unverschlüsselter Stream)' }] },
  keywords: ['radio', 'sender', 'musik', 'stream', 'fm', 'webradio', 'nachrichten'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const top = ctx.resource<StationCollection>({ key: 'data:radio-top', url: bucketUrl('data', 'radio/top.json'), parse: 'radioStations', timeout: 40_000 });

    // 10° cells of the viewport (a cell without stations has no file: 404 = empty)
    const cells = signal<Map<string, StationCollection>>(new Map());
    const requested = new Set<string>();
    const loadCells = () => {
      if (ctx.signal.aborted || ml.getZoom() < CELL_ZOOM) return;
      const b = ml.getBounds();
      const keys: string[] = [];
      for (let lat = Math.floor(b.getSouth() / 10) * 10; lat <= b.getNorth(); lat += 10) {
        for (let lon = Math.floor(b.getWest() / 10) * 10; lon <= b.getEast(); lon += 10) keys.push(cellKey(lat, lon));
      }
      for (const key of keys.slice(0, MAX_CELLS)) {
        if (requested.has(key)) continue;
        requested.add(key);
        fetchRaw<ArrayBuffer>(bucketUrl('data', `radio/cells/${key}.json`), { format: 'arraybuffer', timeout: 40_000, signal: ctx.signal })
          .then((r) => runParser('radioStations', r.data, { format: 'json', signal: ctx.signal }))
          .catch((e) => (e instanceof HttpError && e.status === 404 ? ({ type: 'FeatureCollection', features: [] } as StationCollection) : (requested.delete(key), undefined)))
          .then((fc) => { if (fc && !ctx.signal.aborted) cells.value = new Map(cells.peek()).set(key, fc); });
      }
    };
    ml.on('moveend', loadCells);
    loadCells();

    const data = computed<StationCollection | undefined>(() => {
      const t = top.data.value;
      if (!t) return undefined;
      if (!cells.value.size) return t;
      const seen = new Set(t.features.map((f) => f.properties.id));
      const extra = [...cells.value.values()].flatMap((c) => c.features).filter((f) => !seen.has(f.properties.id) && seen.add(f.properties.id));
      return { type: 'FeatureCollection', features: [...t.features, ...extra] };
    });

    const size = (lo: number, hi: number): ExpressionSpecification => ['interpolate', ['linear'], ['get', 'clicks'], 0, lo, 300, (lo + hi) / 2, 3000, hi] as ExpressionSpecification;
    const handle = pointLayer(ctx, {
      data,
      resources: [top],
      radius: ['interpolate', ['linear'], ['zoom'], 1, size(1.6, 5), 8, size(3.5, 9), 13, size(5, 11)] as ExpressionSpecification,
      symbol: { icon: 'mast', size: ['interpolate', ['linear'], ['zoom'], 1, 0.22, 8, 0.34, 13, 0.5] as ExpressionSpecification },
      color: ['case', ['!=', ['get', 'stream'], ''], COLOR, DIM] as ExpressionSpecification,
      stroke: { color: 'rgba(40, 8, 24, 0.85)', width: 0.8 },
      sortKey: ['get', 'clicks'] as ExpressionSpecification,
      describe: (f: AnyFeature) => {
        const p = f.properties as StationProps;
        const quality = [p.codec, p.bitrate ? `${formatInt(p.bitrate)} kbit/s` : ''].filter(Boolean).join(' · ');
        return {
          title: p.name,
          subtitle: [p.state, p.country].filter(Boolean).join(', ') || 'Radiosender',
          color: p.stream ? COLOR : DIM,
          icon: 'radio',
          facts: [
            ...(p.tags ? [{ label: 'Genre', value: p.tags }] : []),
            ...(p.country ? [{ label: 'Land', value: p.country }] : []),
            ...(p.language ? [{ label: 'Sprache', value: p.language }] : []),
            ...(quality ? [{ label: 'Stream', value: quality }] : []),
            ...(p.clicks ? [{ label: 'Hörer-Klicks', value: formatInt(p.clicks) }] : []),
          ],
          media: p.stream ? { type: p.hls ? 'hls' : 'audio', url: p.stream } : undefined,
          text: !p.stream && p.streamHttp ? 'Der Stream ist unverschlüsselt (http) und kann im Browser nicht eingebettet werden.' : undefined,
          links: [
            ...(p.homepage ? [{ label: 'Webseite des Senders', url: p.homepage }] : []),
            ...(!p.stream && p.streamHttp ? [{ label: 'Stream in neuem Tab öffnen', url: p.streamHttp }] : []),
          ],
        };
      },
    });
    return { destroy() { ml.off('moveend', loadCells); handle.destroy(); } };
  },
});
