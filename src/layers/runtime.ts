// Connects state and map: mounts/unmounts the layers of the active Karte, hands them their signals, collects
// status, legend and feed into state/session, keeps the stack order of the Karte inside the slots.
import { computed, effect, untracked } from '@preact/signals';
import { createResource, type Resource } from '../data/resource';
import { hasKey, keySignal } from '../keys';
import { settings, warningKey } from '../state/settings';
import { scopeEngine, type ScopeRecord } from '../map/scope';
import type { MapEngine, SlotId } from '../map/types';
import { clearLayerSession, activeKarte, setFeed, setLayerStatus, setLegend, activeKarteId } from '../state/session';
import { inspector, selectCard, selectPlace } from '../state/selection';
import { isMobile } from '../state/ui';
import { time, timeSources } from '../state/time';
import { getLayer } from './registry';
import type { InspectCard, LayerContext, LayerDef, LayerHandle, LayerStatus, OptionSpec, OptionValues } from './types';

const SLOTS: SlotId[] = ['field', 'raster', 'areas', 'lines', 'points', 'labels', 'top'];

export const defaultOptions = (specs: OptionSpec[] = []): OptionValues => Object.fromEntries(specs.map((s) => [s.id, s.default]));

const shallowEqual = (a: OptionValues, b: OptionValues) => {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => a[k] === b[k]);
};

interface Mounted {
  def: LayerDef;
  ctl: AbortController;
  rec: ScopeRecord;
  resources: Resource<unknown>[];
  stops: (() => void)[];
  handle?: LayerHandle;
  /** Settles when mount() finished (successfully or not). */
  settled: Promise<void>;
  /** Settles when the layer is completely torn down. */
  torn?: Promise<void>;
}

export interface ProbeResult { layerId: string; label: string; value: string; numeric?: number }
let activeProbe: ((lng: number, lat: number) => ProbeResult[]) | undefined;

/** Values of all mounted layers that implement `probe` at a point (sync, cheap). Empty without a running runtime. */
export function probeAt(lng: number, lat: number): { layerId: string; label: string; value: string }[] {
  return activeProbe?.(lng, lat) ?? [];
}

export function startRuntime(engine: MapEngine): () => void {
  const mounted = new Map<string, Mounted>();
  const tearing = new Map<string, Promise<void>>();
  let lastOrder = '';
  /** Layers the gates keep from mounting (missing key, unconfirmed warning) and the status they show instead. */
  const gated = new Map<string, LayerStatus>();

  const karteLayer = (id: string) => activeKarte.value.layers.find((l) => l.id === id);

  function makeContext(def: LayerDef, m: Pick<Mounted, 'ctl' | 'rec' | 'resources'>): LayerContext {
    const id = def.id;
    const opacity = computed(() => karteLayer(id)?.opacity ?? 1);
    let prev: OptionValues | undefined;
    const options = computed<OptionValues>(() => {
      const next = { ...defaultOptions(def.options), ...(karteLayer(id)?.options ?? {}) };
      if (prev && shallowEqual(prev, next)) return prev;
      return (prev = next);
    });
    const alive = () => !m.ctl.signal.aborted;
    const own = new WeakSet<InspectCard>();
    return {
      id,
      map: scopeEngine(engine, m.rec),
      signal: m.ctl.signal,
      opacity,
      options,
      time,
      status: (s) => alive() && setLayerStatus(id, s),
      resource: <T,>(spec: Parameters<typeof createResource<T>>[0]) => {
        const r = createResource(spec);
        m.resources.push(r as Resource<unknown>);
        return r;
      },
      feed: (items) => alive() && setFeed(id, items),
      key: keySignal,
      select: (card) => {
        if (card) own.add(card);
        if (alive() && card?.asPlace && card.location && !isMobile.peek()) {
          selectPlace({ id: `${id}:${card.title}`, title: card.title, subtitle: '', lng: card.location[0], lat: card.location[1], category: card.subtitle });
          return;
        }
        return alive() && selectCard(id, card);
      },
      ownSelection: (card) => !!card && own.has(card),
      selection: computed<InspectCard | null>(() => inspector.value?.card ?? null),
    } as LayerContext;
  }

  function cleanupMap(m: Mounted) {
    const layers = [...m.rec.layers].reverse().map((l) => l.id);
    engine.remove({ layers, sources: m.rec.sources });
    m.rec.layers = [];
    m.rec.sources = [];
  }

  function mount(def: LayerDef): void {
    const id = def.id;
    const ctl = new AbortController();
    const m: Mounted = { def, ctl, rec: { layers: [], sources: [] }, resources: [], stops: [], settled: Promise.resolve() };
    mounted.set(id, m);
    setLayerStatus(id, { state: 'loading' });
    const ctx = makeContext(def, m);
    m.stops.push(
      effect(() => {
        const lg = typeof def.legend === 'function' ? def.legend(ctx.options.value) : def.legend;
        setLegend(id, lg);
      }),
    );
    m.settled = (async () => {
      await tearing.get(id); // a previous instance of the same layer is still being removed
      if (ctl.signal.aborted) return;
      try {
        await engine.ready;
        const handle = await def.mount(ctx);
        if (ctl.signal.aborted) {
          try { handle.destroy(); } catch { /* ignore */ }
          return;
        }
        m.handle = handle;
        reorder(true);
      } catch (e) {
        console.error(`[layers] ${id}: mount fehlgeschlagen`, e);
        if (!ctl.signal.aborted) setLayerStatus(id, { state: 'error', note: 'Ebene konnte nicht geladen werden' });
        try { cleanupMap(m); } catch { /* ignore */ }
      }
    })();
  }

  function unmount(id: string): void {
    const m = mounted.get(id);
    if (!m) return;
    mounted.delete(id);
    m.ctl.abort();
    m.stops.forEach((s) => s());
    const done = (async () => {
      await m.settled;
      try { m.handle?.destroy(); } catch (e) { console.error(`[layers] ${id}: destroy`, e); }
      m.resources.forEach((r) => r.dispose());
      cleanupMap(m);
      clearLayerSession(id);
      const g = gated.get(id);
      if (g) setLayerStatus(id, g);
    })().finally(() => tearing.delete(id));
    tearing.set(id, done);
  }

  /** Puts the mounted layers into the order of the Karte inside each slot (topmost first in the Karte). */
  function reorder(force = false) {
    const order = activeKarte.peek().layers.filter((l) => l.visible && mounted.has(l.id)).map((l) => l.id);
    const key = order.join('|') + '#' + order.map((id) => mounted.get(id)!.rec.layers.length).join(',');
    if (!force && key === lastOrder) return;
    lastOrder = key;
    if (order.length < 2) return;
    for (const slot of SLOTS) {
      for (const id of [...order].reverse()) {
        for (const l of mounted.get(id)!.rec.layers) if (l.slot === slot) engine.moveToSlotTop(l.id, slot);
      }
    }
  }

  const stops: (() => void)[] = [];
  activeProbe = (lng, lat) => {
    const out: ProbeResult[] = [];
    for (const [layerId, m] of mounted) {
      if (!m.handle?.probe) continue;
      try {
        const r = m.handle.probe({ lng, lat });
        if (r) out.push({ layerId, ...r });
      } catch { /* a probe must never break the pointer */ }
    }
    return out;
  };

  // 1. mount/unmount to match the visible layers of the active Karte
  stops.push(
    effect(() => {
      const k = activeKarte.value;
      const wanted: string[] = [];
      const exclusive = new Set<string>();
      const confirmed = settings.value.confirmedWarnings;
      const karteBlocked = !!k.sensitive && !confirmed.includes(warningKey(k.sensitive)) && !confirmed.includes(`karte:${k.id}`);
      gated.clear();
      for (const l of k.layers) {
        const def = l.visible ? getLayer(l.id) : undefined;
        if (!def) continue;
        if (karteBlocked) {
          gated.set(def.id, { state: 'empty', note: 'Bestätigung nötig', needsConfirm: true });
          continue;
        }
        const missing = def.keys?.find((r) => r.required && !hasKey(r.id));
        if (missing) {
          gated.set(def.id, { state: 'empty', note: 'Schlüssel nötig', needsKey: missing.id });
          continue;
        }
        if (def.sensitive && !confirmed.includes(warningKey(def.sensitive)) && !confirmed.includes(`layer:${def.id}`)) {
          gated.set(def.id, { state: 'empty', note: 'Bestätigung nötig', needsConfirm: true });
          continue;
        }
        if (def.exclusive) {
          if (exclusive.has(def.exclusive)) continue; // only the topmost field layer is mounted
          exclusive.add(def.exclusive);
        }
        wanted.push(l.id);
      }
      timeSources.value = wanted.map((id) => getLayer(id)!.time).filter((t): t is NonNullable<typeof t> => !!t);
      untracked(() => {
        for (const id of [...mounted.keys()]) if (!wanted.includes(id)) unmount(id);
        for (const id of wanted) if (!mounted.has(id)) mount(getLayer(id)!);
        for (const [id, st] of gated) if (!tearing.has(id)) setLayerStatus(id, st);
        reorder();
      });
    }),
  );

  // 2. basemap, labels, terminator of the Karte
  stops.push(
    effect(() => {
      const k = activeKarte.value;
      void engine.ready.then(() => {
        engine.setBasemap(k.basemap);
        engine.setLabels(k.labels);
        engine.setTerminator(k.terminator ? 'auto' : 'off');
      });
    }),
  );

  // 3. start view when switching Karten
  let lastKarte = activeKarteId.peek();
  stops.push(
    effect(() => {
      const id = activeKarteId.value;
      if (id === lastKarte) return;
      lastKarte = id;
      const v = untracked(() => activeKarte.value.view);
      if (v) engine.flyTo({ center: v.center, zoom: v.zoom });
    }),
  );

  return () => {
    activeProbe = undefined;
    stops.forEach((s) => s());
    for (const id of [...mounted.keys()]) unmount(id);
    timeSources.value = [];
  };
}
