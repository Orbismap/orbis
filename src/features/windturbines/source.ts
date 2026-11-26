// Channel for extensions (Orbis Pro): the single wind turbines of the loaded power tiles, filtered like the dots of the layer
// `kraftwerke`. Vector tiles carry no events for single features: after a move or new tiles the loaded tiles are queried, and
// only while someone listens (Pro off: nothing happens). Each turbine carries the wind of the selected time (wind.ts). A
// turbine the extension reports as clicked opens the layer's card.
import { effect, type ReadonlySignal } from '@preact/signals';
import type { FilterSpecification } from 'maplibre-gl';
import { describeOsmPlant } from '../../data/oimPlants';
import { WindTurbineStore, type RawWindTurbine } from '../../data/parsers/windturbines';
import { windTurbinesChannel as channel } from '../../ext/channels';
import type { InspectCard, LayerContext } from '../../layers/types';
import { turbineWind } from './wind';

/** From this zoom on the turbines are published: farther out a model is only a few pixels high. */
export const TURBINE_PUBLISH_ZOOM = 12;
/** Wait after new tiles or a camera move before querying the source (ms): one query per gesture, not per tile. */
const SCAN_DELAY_MS = 250;

export function publishWindTurbines(ctx: LayerContext, source: string, plantFilter: ReadonlySignal<FilterSpecification>) {
  const ml = ctx.map.ml;
  const store = new WindTurbineStore();
  const cards = new WeakSet<InspectCard>();
  let shown: InspectCard | null = null;
  let published = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const raw = (): RawWindTurbine[] => {
    const filter = ['all', plantFilter.peek(), ['==', ['get', 'source'], 'wind']] as FilterSpecification;
    const out: RawWindTurbine[] = [];
    for (const f of ml.querySourceFeatures(source, { sourceLayer: 'power_generator', filter })) {
      if (f.geometry.type !== 'Point') continue;
      const [lng, lat] = f.geometry.coordinates as [number, number];
      const props = (f.properties ?? {}) as Record<string, unknown>;
      out.push({ id: String(props.osm_id ?? `${lng},${lat}`), lng, lat, props });
    }
    return out;
  };

  const wind = turbineWind(ctx.signal, () => schedule());

  const scan = () => {
    timer = undefined;
    if (!ml.getSource(source) || !channel.listening) return;
    if (ml.getZoom() < TURBINE_PUBLISH_ZOOM) {
      if (published) { published = false; channel.reset(); }
      store.clear();
      wind.stop();
      return;
    }
    const centre = ml.getCenter();
    store.add(raw());
    store.prune(centre.lng, centre.lat);
    if (store.size) wind.start();
    else wind.stop();
    const t = ctx.time.peek();
    const samples = store.samples(centre.lng).map((s) => {
      const w = wind.at(t, s.lng, s.lat);
      return w ? { ...s, wind: w } : s;
    });
    published = true;
    channel.publish(() => samples);
  };
  const schedule = () => {
    if (timer === undefined) timer = setTimeout(scan, SCAN_DELAY_MS);
  };
  const onSource = (e: { sourceId?: string }) => { if (e.sourceId === source) schedule(); };
  ml.on('sourcedata', onSource as never);
  ml.on('moveend', schedule);
  const stopWatching = channel.onListener(schedule);
  // another filter: what was seen under the old one does not count any more
  const stopFilter = effect(() => {
    plantFilter.value;
    store.clear();
    schedule();
  });

  // another time on the timeline (or the clock moved on): other wind
  const stopTime = effect(() => {
    ctx.time.value;
    schedule();
  });

  const stopSelect = channel.onSelect((id) => {
    const t = id === null ? undefined : store.get(id);
    if (!t) return;
    const card = describeOsmPlant({ type: 'Feature', geometry: { type: 'Point', coordinates: [t.lng, t.lat] }, properties: t.props }, { id: 'osm-erzeuger' });
    card.location = [t.lng, t.lat];
    cards.add(card);
    shown = card;
    ctx.select(card);
    channel.setSelectedId(t.id);
  });
  const stopSelection = effect(() => { if (ctx.selection.value !== shown) channel.setSelectedId(null); });

  return {
    /** Is this the card of a turbine clicked in the extension's presentation? */
    isCard: (card: InspectCard | null): boolean => !!card && cards.has(card),
    destroy() {
      clearTimeout(timer);
      stopWatching();
      stopFilter();
      stopTime();
      wind.stop();
      stopSelect();
      stopSelection();
      store.clear();
      ml.off('sourcedata', onSource as never);
      ml.off('moveend', schedule);
      channel.reset();
    },
  };
}
