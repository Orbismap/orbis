import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDef } from './types';

const calls: string[] = [];
let releaseSlow: (() => void) | undefined;

const mk = (id: string, extra: Partial<LayerDef> = {}): LayerDef => ({
  id, category: 'wetter', title: id, summary: '', icon: 'cloud', color: '#fff', form: 'points', cadence: 'live', sources: [],
  mount: (ctx) => {
    calls.push(`mount:${id}`);
    ctx.map.addSource(`${id}-src`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    ctx.map.addLayer({ id: `${id}-l`, type: 'circle', source: `${id}-src` }, 'points');
    ctx.status({ state: 'ready', count: 3 });
    return { destroy: () => void calls.push(`destroy:${id}`) };
  },
  ...extra,
});

const fakes: Record<string, LayerDef> = {};
vi.mock('./registry', () => ({
  getLayer: (id: string) => fakes[id],
  hasLayer: (id: string) => id in fakes,
  allLayers: () => Object.values(fakes),
}));

const engine = () => ({
  ready: Promise.resolve(),
  ml: {},
  added: [] as string[],
  moved: [] as string[],
  addSource() {},
  addLayer(spec: { id: string }) { this.added.push(spec.id); },
  addCustomLayer() {},
  remove(ids: { layers?: string[] }) { calls.push(`remove:${(ids.layers ?? []).join(',')}`); },
  moveToSlotTop(id: string) { this.moved.push(id); },
  setBasemap() {}, setLabels() {}, setTerminator() {}, setProjection() {}, onPick: () => () => {}, flyTo() {}, requestRender() {},
  setPadding() {}, getBasemap: () => 'orbis-dark', locate: async () => ({ lng: 0, lat: 0, accuracy: 1 }),
});

const testKarte = (id: string, layers: { id: string; visible: boolean; opacity: number }[]) =>
  ({ id, name: id, icon: 'map', color: '#fff', basemap: 'orbis-dark', labels: true, terminator: false, layers }) as never;

const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe('runtime', () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(fakes)) delete fakes[k];
    Object.assign(fakes, {
      temperatur: mk('temperatur', { exclusive: 'field', time: { mode: 'frames', range: () => ({ start: 0, end: 3600_000 }) } }),
      wind: mk('wind', { exclusive: 'field' }),
      erdbeben: mk('erdbeben', { legend: { type: 'classes', items: [] } }),
      unwetter: mk('unwetter', { mount: () => { throw new Error('kaputt'); } }),
      langsam: mk('langsam', { mount: async (ctx) => { await new Promise<void>((r) => (releaseSlow = r)); ctx.map.addLayer({ id: 'langsam-l', type: 'circle', source: 's' }, 'points'); return { destroy: () => void calls.push('destroy:langsam') }; } }),
    });
    vi.resetModules();
  });
  afterEach(() => vi.restoreAllMocks());

  it('mounts visible layers, enforces exclusive fields, handles errors and races', async () => {
    const store = await import('../karten/store');
    const active = await import('../karten/active');
    const session = await import('../state/session');
    const { startRuntime } = await import('./runtime');
    store.customKarten.value = [testKarte('t', [{ id: 'temperatur', visible: true, opacity: 1 }, { id: 'wind', visible: false, opacity: 1 }, { id: 'erdbeben', visible: false, opacity: 1 }])];
    session.setActiveKarte('t');
    const { timeSources } = await import('../state/time');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const e = engine();
    const stop = startRuntime(e as never);
    await tick();
    // temperatur visible (wind, others off)
    expect(calls).toContain('mount:temperatur');
    expect(session.layerStatus.value.temperatur?.state).toBe('ready');
    expect(timeSources.value).toHaveLength(1);

    // switching wind on switches temperatur off (store) and the runtime swaps them
    active.setLayerVisible('t', 'wind', true);
    await tick();
    expect(store.getKarte('t')!.layers.find((l) => l.id === 'temperatur')!.visible).toBe(false);
    expect(calls).toEqual(expect.arrayContaining(['destroy:temperatur', 'mount:wind']));
    expect(timeSources.value).toHaveLength(0);

    // even if both were visible, only the topmost field layer mounts
    store.editKarte('t', (k) => ({ ...k, layers: k.layers.map((l) => (l.id === 'temperatur' ? { ...l, visible: true } : l)) }));
    await tick();
    expect(calls.filter((c) => c === 'mount:temperatur')).toHaveLength(2);
    store.editKarte('t', (k) => ({ ...k, layers: k.layers.map((l) => (l.id === 'wind' ? { ...l, visible: true } : l)) }));
    await tick();
    expect(session.layerStatus.value.wind).toBeUndefined();

    // mount error -> status error, cleaned up
    store.editKarte('t', (k) => ({ ...k, layers: [{ id: 'unwetter', visible: true, opacity: 1 }, ...k.layers] }));
    await tick();
    expect(session.layerStatus.value.unwetter?.state).toBe('error');

    // async mount switched off before it finishes: destroyed right after resolving
    store.editKarte('t', (k) => ({ ...k, layers: [{ id: 'langsam', visible: true, opacity: 1 }, ...k.layers] }));
    await tick();
    active.setLayerVisible('t', 'langsam', false);
    await tick();
    releaseSlow?.();
    await tick();
    expect(calls).toContain('destroy:langsam');
    expect(session.layerStatus.value.langsam).toBeUndefined();

    stop();
    await tick();
    expect(session.layerStatus.value).toEqual({});
  });

  it('reorders layers inside a slot to the order of the Karte', async () => {
    const store = await import('../karten/store');
    const active = await import('../karten/active');
    const { startRuntime } = await import('./runtime');
    const e = engine();
    const session = await import('../state/session');
    store.customKarten.value = [testKarte('t', [{ id: 'erdbeben', visible: true, opacity: 1 }, { id: 'unwetter', visible: false, opacity: 1 }])];
    session.setActiveKarte('t');
    fakes.zweite = mk('zweite');
    const stop = startRuntime(e as never);
    await tick();
    store.editKarte('t', (k) => ({ ...k, layers: [{ id: 'erdbeben', visible: true, opacity: 1 }, { id: 'zweite', visible: true, opacity: 1 }, ...k.layers.filter((l) => l.id !== 'erdbeben')] }));
    await tick();
    e.moved.length = 0;
    active.moveLayer('t', 'zweite', 0);
    await tick();
    // bottom to top: erdbeben first, then zweite (zweite is now the top layer)
    expect(e.moved.slice(-2)).toEqual(['erdbeben-l', 'zweite-l']);
    stop();
  });

  it('mounts the Erkunden background layers without activating them or writing l=', async () => {
    const store = await import('../karten/store');
    const active = await import('../karten/active');
    const session = await import('../state/session');
    const view = await import('../state/view');
    const { currentUrlState } = await import('../state/url-sync');
    const { serializeHash } = await import('../core/url');
    const { startRuntime } = await import('./runtime');
    fakes.baeume = mk('baeume');
    fakes.strassenmarkierungen = mk('strassenmarkierungen');
    store.customKarten.value = [testKarte('t', [])];
    session.setActiveKarte('t');
    view.karteMode.value = 'daten';
    const stop = startRuntime(engine() as never);
    await tick();
    expect(calls).not.toContain('mount:baeume');

    view.karteMode.value = 'erkunden';
    await tick();
    expect(calls).toContain('mount:baeume');
    expect(calls).toContain('mount:strassenmarkierungen');
    expect(active.activeIds.value).toEqual([]);
    expect(serializeHash(currentUrlState())).not.toContain('l=');

    view.karteMode.value = 'fahren';
    await tick();
    expect(calls).toContain('destroy:baeume');
    expect(calls).toContain('destroy:strassenmarkierungen');
    stop();
    view.karteMode.value = 'erkunden';
  });

  it('probeAt collects the probes of mounted layers', async () => {
    const store = await import('../karten/store');
    const session = await import('../state/session');
    const { startRuntime, probeAt } = await import('./runtime');
    fakes.messwert = mk('messwert', { mount: () => ({ probe: () => ({ label: 'Wert', value: '5 mm', numeric: 5 }), destroy() {} }) });
    store.customKarten.value = [testKarte('t', [{ id: 'messwert', visible: true, opacity: 1 }, { id: 'erdbeben', visible: true, opacity: 1 }])];
    session.setActiveKarte('t');
    const stop = startRuntime(engine() as never);
    await tick();
    expect(probeAt(1, 2)).toEqual([{ layerId: 'messwert', label: 'Wert', value: '5 mm', numeric: 5 }]);
    stop();
    expect(probeAt(1, 2)).toEqual([]);
  });
});
