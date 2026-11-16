// Power grid from OpenInfraMap tiles: lines and cables (colour = voltage, dashed = underground/underwater) and substations.
import type { ExpressionSpecification, FilterSpecification } from 'maplibre-gl';
import { OIM_ATTRIBUTION, OIM_SOURCE, VOLTAGE_CLASSES, VOLTAGE_UNKNOWN, kv, kvLabel, num, oimTiles, osmUrl, str, voltageColor } from '../../data/openinframap';
import { powerChannel } from '../../ext/channels';
import type { AnyFeature } from '../../render/common';
import { vectorTileLayer, type VtPart } from '../../render/vectortiles';
import { defineLayer } from '../define';
import { PowerGridStore, type RawPowerLine, type RawPowerTower } from '../../data/parsers/powergrid';

const COLOR = '#FF8A1F';
const expr = (e: unknown) => e as ExpressionSpecification;
const flt = (e: unknown) => e as FilterSpecification;

/** The tiles end at zoom 14 and carry the towers from there: the channel publishes from this zoom on (what is shown is the extension's call). */
const PUBLISH_ZOOM = 14;
/** Wait after new tiles or a camera move before querying the source (ms): one query per gesture, not per tile. */
const SCAN_DELAY_MS = 250;

const inUse = ['all', ['!=', ['get', 'disused'], true], ['!=', ['get', 'construction'], true], ['!', ['in', ['get', 'line'], ['literal', ['bay', 'busbar']]]]];
const minor = ['in', ['get', 'type'], ['literal', ['minor_line', 'minor_cable']]];
const buried = ['any', ['in', ['get', 'location'], ['literal', ['underground', 'underwater']]], ['in', ['get', 'type'], ['literal', ['cable', 'minor_cable']]]];

/** Width grows with the zoom and a little with the voltage. */
const lineWidth = (k: number): ExpressionSpecification =>
  expr(['interpolate', ['linear'], ['zoom'], 2, ['*', k, 0.7, ['step', kv, 1, 100, 1.2, 300, 1.6]], 8, ['*', k, 1.4, ['step', kv, 1, 100, 1.3, 300, 1.7]], 14, ['*', k, 3, ['step', kv, 1, 100, 1.2, 300, 1.4]]]);

const subRadius = expr(['interpolate', ['linear'], ['zoom'], 5, 2.5, 9, ['step', kv, 3.5, 200, 5], 14, ['step', kv, 6, 200, 9]]);

const parts: VtPart[] = [
  { id: 'netz', sourceLayer: 'power_line', kind: 'line', filter: flt(['all', inUse, ['!', minor], ['!', buried]]), color: voltageColor, size: lineWidth(1), casing: true, sortKey: expr(kv), minZoom: 2 },
  { id: 'kabel', sourceLayer: 'power_line', kind: 'line', filter: flt(['all', inUse, ['!', minor], buried]), color: voltageColor, size: lineWidth(1), dash: [2, 1.6], sortKey: expr(kv), minZoom: 2 },
  { id: 'verteil', sourceLayer: 'power_line', kind: 'line', filter: flt(['all', inUse, minor, ['!', buried]]), color: voltageColor, size: lineWidth(0.7), opacity: 0.85, minZoom: 8 },
  { id: 'verteil-kabel', sourceLayer: 'power_line', kind: 'line', filter: flt(['all', inUse, minor, buried]), color: voltageColor, size: lineWidth(0.7), dash: [2, 1.6], opacity: 0.85, minZoom: 8 },
  { id: 'umspann-gross', sourceLayer: 'power_substation_point', kind: 'circle', filter: flt(['all', inUse, ['>=', kv, 200]]), color: voltageColor, size: subRadius, sortKey: expr(kv), minZoom: 5 },
  { id: 'umspann', sourceLayer: 'power_substation_point', kind: 'circle', filter: flt(['all', inUse, ['<', kv, 200]]), color: voltageColor, size: subRadius, minZoom: 9 },
  { id: 'masten', sourceLayer: 'power_tower', kind: 'circle', color: '#C9D1DC', size: expr(['interpolate', ['linear'], ['zoom'], 14, 1.6, 18, 4]), pick: false, minZoom: 14 },
];

const LOCATION: Record<string, string> = { overhead: 'Freileitung', underground: 'Erdkabel', underwater: 'Seekabel', overground: 'Oberirdisch', surface: 'Oberirdisch', outdoor: 'Freiluft', indoor: 'In Gebäuden' };
const SUBSTATION: Record<string, string> = {
  transmission: 'Umspannwerk (Übertragungsnetz)', distribution: 'Umspannwerk (Verteilnetz)', industrial: 'Industrie-Umspannwerk', traction: 'Bahnstrom-Unterwerk',
  converter: 'Konverterstation (HGÜ)', transition: 'Übergabestation', generation: 'Kraftwerks-Umspannwerk', compensation: 'Kompensationsanlage', minor_distribution: 'Ortsnetzstation',
};

export default defineLayer({
  id: 'stromnetz',
  category: 'infrastruktur',
  title: 'Stromnetz',
  summary: 'Hochspannungsleitungen, Erdkabel und Umspannwerke weltweit, Farbe nach Spannung',
  icon: 'bolt',
  color: COLOR,
  form: 'lines',
  cadence: 'daily',
  minZoom: 2,
  sources: [OIM_SOURCE],
  legend: {
    type: 'classes',
    items: [
      ...VOLTAGE_CLASSES.map(([, color, label]) => ({ color, label, shape: 'line' as const })),
      { color: VOLTAGE_UNKNOWN, label: 'Spannung unbekannt', shape: 'line' as const },
      { color: '#C9D1DC', label: 'Gestrichelt: Erd- oder Seekabel, Punkte: Umspannwerke', shape: 'dot' as const },
    ],
  },
  keywords: ['strom', 'stromleitung', 'hochspannung', 'stromkabel', 'kabel', 'umspannwerk', 'trasse', 'netz', 'power line', 'substation', 'grid', 'openinframap', 'hgü', 'freileitung', 'erdkabel'],

  mount(ctx) {
    const handle = vectorTileLayer(ctx, {
      tiles: oimTiles('power'),
      attribution: OIM_ATTRIBUTION,
      minzoom: 0,
      maxzoom: 14,
      parts,
      // Orbis Pro draws towers and overhead lines in 3D: then their 2D dots and lines disappear (underground cables and substations stay).
      hideWhenPresented: { when: powerChannel.presented, parts: ['masten', 'netz', 'verteil'] },
      describe(f: AnyFeature, part) {
        const p = f.properties as Record<string, unknown>;
        const volt = kvLabel(p.voltage);
        const operator = str(p.operator);
        const name = str(p.name);
        const links = [{ label: 'OpenStreetMap', url: osmUrl(p) }];
        if (part.kind === 'circle') {
          const kind = SUBSTATION[str(p.substation)] ?? 'Umspannwerk';
          return {
            title: name || `${kind}${volt ? ` ${volt}` : ''}`, subtitle: kind, icon: 'power', color: volt ? undefined : VOLTAGE_UNKNOWN,
            facts: [
              ...(volt ? [{ label: 'Spannung', value: volt, emphasis: true }] : []),
              ...(operator ? [{ label: 'Betreiber', value: operator }] : []),
              ...(str(p.frequency) ? [{ label: 'Frequenz', value: `${str(p.frequency)} Hz` }] : []),
              ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : []),
            ],
            links,
          };
        }
        const loc = LOCATION[str(p.location)] ?? (str(p.type).includes('cable') ? 'Kabel' : 'Freileitung');
        const circuits = num(p.circuits);
        const freq = str(p.frequency);
        return {
          title: name || (str(p.ref) ? `Leitung ${str(p.ref)}` : `${loc}${volt ? ` ${volt}` : ''}`), subtitle: `Stromleitung · ${loc}`, icon: 'bolt',
          facts: [
            ...(volt ? [{ label: 'Spannung', value: volt, emphasis: true }] : []),
            ...(num(p.voltage_2) ? [{ label: 'Zweite Spannung', value: kvLabel(p.voltage_2) }] : []),
            ...(circuits ? [{ label: 'Stromkreise', value: String(circuits) }] : []),
            ...(freq ? [{ label: 'Frequenz', value: freq === '0' ? 'Gleichstrom' : `${freq} Hz` }] : []),
            ...(operator ? [{ label: 'Betreiber', value: operator }] : []),
            ...(str(p.ref) ? [{ label: 'Kennung', value: str(p.ref) }] : []),
            ...(str(p.start_date) ? [{ label: 'In Betrieb seit', value: str(p.start_date) }] : []),
          ],
          links,
        };
      },
    });

    // --- channel for extensions (Orbis Pro): the towers and overhead lines of the loaded tiles ---
    // Vector tiles carry no events for single features: after a move or new tiles the loaded tiles are queried, and only
    // while someone listens (Pro off: nothing happens). Which model a tower gets and how the lines connect is up to the
    // extension; here the tiles are only cleaned up (data/parsers/powergrid.ts).
    const ml = ctx.map.ml;
    const src = `${ctx.id}-src`;
    let published = false;
    // the loaded tiles come and go with every move: keep what was seen, so that a wire stays while its towers are in view
    const store = new PowerGridStore();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const rawTowers = (): RawPowerTower[] => {
      const out: RawPowerTower[] = [];
      for (const f of ml.querySourceFeatures(src, { sourceLayer: 'power_tower' })) {
        const g = f.geometry;
        if (g.type !== 'Point') continue;
        const [lng, lat] = g.coordinates;
        if (typeof lng !== 'number' || typeof lat !== 'number') continue;
        const props = (f.properties ?? {}) as Record<string, unknown>;
        out.push({ id: String(props.osm_id ?? f.id ?? `${lng},${lat}`), lng, lat, props });
      }
      return out;
    };
    const rawLines = (): RawPowerLine[] => {
      const out: RawPowerLine[] = [];
      for (const f of ml.querySourceFeatures(src, { sourceLayer: 'power_line' })) {
        const g = f.geometry;
        const parts = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
        const props = (f.properties ?? {}) as Record<string, unknown>;
        const id = String(props.osm_id ?? f.id ?? 'line');
        for (const coords of parts) {
          if (coords.length < 2) continue;
          out.push({ id, points: coords.map(([lng, lat]) => [lng ?? 0, lat ?? 0] as [number, number]), props });
        }
      }
      return out;
    };

    const scan = () => {
      timer = undefined;
      if (!ml.getSource(src) || !powerChannel.listening) return;
      if (ml.getZoom() < PUBLISH_ZOOM) {
        if (published) { published = false; powerChannel.reset(); }
        store.clear();
        return;
      }
      const centre = ml.getCenter();
      store.add(rawTowers(), rawLines());
      store.prune(centre.lng, centre.lat);
      const samples = store.samples(centre.lng);
      published = true;
      powerChannel.publish(() => samples);
    };
    const schedule = () => {
      if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS);
    };
    const onSource = (e: { sourceId?: string }) => { if (e.sourceId === src) schedule(); };
    ml.on('sourcedata', onSource as never);
    ml.on('moveend', schedule);
    const stopWatching = powerChannel.onListener(schedule);
    schedule();

    return {
      destroy() {
        clearTimeout(timer);
        stopWatching();
        store.clear();
        ml.off('sourcedata', onSource as never);
        ml.off('moveend', schedule);
        powerChannel.reset();
        handle.destroy();
      },
    };
  },
});
