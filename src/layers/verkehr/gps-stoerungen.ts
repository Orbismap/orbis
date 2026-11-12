// GPS interference (jamming/spoofing) indication from the navigation accuracy aircraft report in ADS-B (NIC/NACp,
// readsb `gpsOkBefore`). Aircraft of the viewed areas are tallied per 0.5 degree grid cell over a rolling 30 minutes;
// cells are coloured by the share of affected aircraft (method after gpsjam.org). An indication, no proof.
import { effect, signal } from '@preact/signals';
import type { ExpressionSpecification } from 'maplibre-gl';
import type { FeatureCollection, Point, Polygon } from 'geojson';
import { formatNumber } from '../../core/format';
import { acquireDetail, DETAIL_LOAD_ZOOM } from '../../data/parsers/adsbview';
import { cellsGeoJson, GnssStore, WINDOW_MS } from '../../data/parsers/gnss';
import { areaLayer } from '../../render/areas';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#ffb300';
const HIGH = '#ff3b30';
const MEDIUM = '#ffb300';
const LOW = '#4caf50';
const fill = ['match', ['get', 'level'], 'high', HIGH, 'medium', MEDIUM, LOW] as unknown as ExpressionSpecification;
const TITLE = { high: 'Starke GPS-Störung vermutet', medium: 'GPS-Störung möglich', low: 'Keine Auffälligkeit' } as const;

export default defineLayer({
  id: 'gps-stoerungen',
  category: 'verkehr',
  title: 'GPS-Störungen',
  summary: 'Vermutetes Jamming und Spoofing aus der gemeldeten Navigationsgenauigkeit der Flugzeuge',
  icon: 'satellite',
  color: COLOR,
  form: 'areas',
  cadence: 'live',
  coverage: 'Ausschnitte, die du angesehen hast (sammelt 30 min)',
  sources: [{ name: 'adsb.lol (NIC/NACp), Methode nach gpsjam.org', url: 'https://gpsjam.org/', license: 'ODbL 1.0' }],
  legend: { type: 'classes', items: [{ color: HIGH, label: 'Über 10 % der Flugzeuge betroffen' }, { color: MEDIUM, label: '2–10 %' }, { color: LOW, label: 'Unter 2 % (unauffällig)' }] },
  keywords: ['gps', 'gnss', 'jamming', 'spoofing', 'störung', 'störsender', 'navigation', 'nic', 'nacp'],

  mount(ctx) {
    const ml = ctx.map.ml;
    const detail = acquireDetail(ml);
    const store = new GnssStore();
    const cells = signal<FeatureCollection<Polygon> | undefined>(undefined);
    const bad = signal<FeatureCollection<Point> | undefined>(undefined);
    const stats = signal({ cells: 0, anomalies: 0, badNow: 0 });
    const redraw = () => {
      const c = store.cells();
      cells.value = cellsGeoJson(c);
      stats.value = { ...stats.peek(), cells: c.length, anomalies: c.filter((x) => x.level !== 'low').length };
    };
    const stop = effect(() => {
      const d = detail.res.data.value;
      if (!d) return;
      const b = store.feed(d);
      bad.value = { type: 'FeatureCollection', features: b.map((x) => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [x.lng, x.lat] }, properties: { id: x.id, lost: x.lost } })) };
      stats.value = { ...stats.peek(), badNow: b.length };
      redraw();
    });
    const timer = setInterval(redraw, 30_000);
    // the layer is always "ready": collecting is its job, the note explains the state
    const stopStatus = effect(() => {
      const s = stats.value;
      const note = ml.getZoom() < DETAIL_LOAD_ZOOM && !s.cells ? 'Ab Zoom 5 kommen Messungen dazu' : `${formatNumber(s.badNow)} Flugzeuge melden gerade ungenaue Navigation, Zellen füllen sich über 30 min`;
      ctx.status(detail.res.state.value === 'error' && !s.cells ? { state: 'error', note: detail.res.error.value } : { state: s.cells ? 'ready' : 'empty', count: s.anomalies, updatedAt: detail.res.updatedAt.value, note });
    });
    const areas = areaLayer(ctx, {
      data: cells, fill, fillOpacity: ['match', ['get', 'level'], 'low', 0.18, 0.45] as unknown as ExpressionSpecification, outline: { color: fill, width: 0.8 },
      describe: (f: AnyFeature) => {
        const p = f.properties as { level: 'high' | 'medium' | 'low'; n: number; bad: number; pct: number; lat: number; lng: number };
        return {
          title: TITLE[p.level], subtitle: `${p.bad} von ${p.n} Flugzeugen mit ungenauer Navigation`, color: p.level === 'high' ? HIGH : p.level === 'medium' ? MEDIUM : LOW, icon: 'satellite',
          facts: [
            { label: 'Flugzeuge in der Zelle', value: formatNumber(p.n) },
            { label: 'Mit ungenauer Navigation', value: formatNumber(p.bad) },
            { label: 'Anteil nach Abzug eines Ausreißers', value: `${formatNumber(p.pct, 1)} %`, emphasis: true },
            { label: 'Zeitraum', value: `letzte ${WINDOW_MS / 60_000} min` },
            { label: 'Zellgröße', value: '0,5° × 0,5°' },
          ],
          text: 'Flugzeuge melden per ADS-B, wie genau sie ihre GPS-Position kennen (NIC/NACp). Häufen sich schlechte Werte, deutet das auf Störsender oder Spoofing hin; einzelne Ausreißer können auch Gerätefehler sein.',
          location: [p.lng, p.lat],
        };
      },
    });
    const rings = pointLayer(ctx, {
      data: bad, name: 'ac', radius: ['interpolate', ['linear'], ['zoom'], 5, 7, 10, 13] as unknown as ExpressionSpecification, color: 'rgba(0,0,0,0)',
      stroke: { color: ['case', ['get', 'lost'], HIGH, MEDIUM] as unknown as string, width: 2 },
      describe: (f: AnyFeature) => ({
        title: 'Ungenaue Navigation', subtitle: f.properties.lost ? 'GPS-Empfang verloren (letzte gute Position)' : 'Meldet schlechte Positionsgenauigkeit', color: MEDIUM, icon: 'satellite',
        facts: [{ label: 'Flugzeug (Mode-S)', value: String(f.properties.id).toUpperCase() }],
        text: 'Das Flugzeug meldet per ADS-B eine niedrige Genauigkeit (NACp unter 8 oder NIC unter 7) oder hat den GPS-Empfang verloren.',
      }),
    });
    return {
      destroy() {
        stop(); stopStatus(); clearInterval(timer);
        rings.destroy(); areas.destroy(); detail.release();
      },
    };
  },
});
