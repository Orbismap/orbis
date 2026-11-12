import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LayerDef } from './types';

const calls: string[] = [];
const mk = (id: string, extra: Partial<LayerDef> = {}): LayerDef => ({
  id, category: 'verkehr', title: id, summary: '', icon: 'ship', color: '#fff', form: 'points', cadence: 'live', sources: [],
  mount: (ctx) => { calls.push(`mount:${id}`); ctx.status({ state: 'ready', count: 1 }); return { destroy: () => void calls.push(`destroy:${id}`) }; },
  ...extra,
});
const fakes: Record<string, LayerDef> = {};
vi.mock('./registry', () => ({ getLayer: (id: string) => fakes[id], hasLayer: (id: string) => id in fakes, allLayers: () => Object.values(fakes) }));

const engine = () => ({
  ready: Promise.resolve(), ml: {}, addSource() {}, addLayer() {}, addCustomLayer() {}, remove() {}, moveToSlotTop() {}, setBasemap() {}, setLabels() {},
  setTerminator() {}, setProjection() {}, onPick: () => () => {}, flyTo() {}, requestRender() {}, setPadding() {}, getBasemap: () => 'orbis-dark',
});
const karte = (id: string, layers: string[], extra: object = {}) =>
  ({ id, name: id, icon: 'map', color: '#fff', basemap: 'orbis-dark', labels: true, terminator: false, layers: layers.map((l) => ({ id: l, visible: true, opacity: 1 })), ...extra }) as never;
const tick = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); await new Promise((r) => setTimeout(r, 0)); };

describe('runtime gates: keys and content warnings', () => {
  beforeEach(() => {
    calls.length = 0;
    for (const k of Object.keys(fakes)) delete fakes[k];
    Object.assign(fakes, {
      schiffe: mk('schiffe', { keys: [{ id: 'aisstream', required: true }] }),
      kameras: mk('kameras', { keys: [{ id: 'camkey', required: false }] }),
      heikel: mk('heikel', { sensitive: { title: 'Hinweis', text: 'Inhalt kann verstören.' } }),
    });
    vi.resetModules();
  });

  it('does not mount a layer without its required key and mounts it as soon as the key is set', async () => {
    const store = await import('../karten/store');
    const session = await import('../state/session');
    const keys = await import('../keys');
    const { startRuntime } = await import('./runtime');
    store.customKarten.value = [karte('t', ['schiffe', 'kameras'])];
    session.setActiveKarte('t');
    const stop = startRuntime(engine() as never);
    await tick();
    expect(calls).not.toContain('mount:schiffe');
    expect(session.layerStatus.value.schiffe).toMatchObject({ state: 'empty', note: 'Schlüssel nötig', needsKey: 'aisstream' });
    // optional key: mounts, boost is only a hint
    expect(calls).toContain('mount:kameras');

    keys.setKey('aisstream', 'abcdefghijklmnop');
    await tick();
    expect(calls).toContain('mount:schiffe');
    expect(session.layerStatus.value.schiffe?.needsKey).toBeUndefined();

    // removing the key unmounts it again and restores the hint
    keys.setKey('aisstream', undefined);
    await tick();
    expect(calls).toContain('destroy:schiffe');
    expect(session.layerStatus.value.schiffe?.needsKey).toBe('aisstream');
    stop();
  });

  it('keeps sensitive layers and Karten unmounted until confirmed', async () => {
    const store = await import('../karten/store');
    const session = await import('../state/session');
    const settings = await import('../state/settings');
    const { startRuntime } = await import('./runtime');
    store.customKarten.value = [karte('t', ['heikel']), karte('s', ['kameras'], { sensitive: { title: 'Achtung', text: 'Kameras.' } })];
    session.setActiveKarte('t');
    const stop = startRuntime(engine() as never);
    await tick();
    expect(calls).not.toContain('mount:heikel');
    expect(session.layerStatus.value.heikel).toMatchObject({ state: 'empty', needsConfirm: true });
    settings.confirmWarning('layer:heikel');
    await tick();
    expect(calls).toContain('mount:heikel');
    expect(settings.settings.value.confirmedWarnings).toEqual(['layer:heikel']);

    session.setActiveKarte('s');
    await tick();
    expect(calls).not.toContain('mount:kameras');
    settings.confirmWarning('karte:s');
    await tick();
    expect(calls).toContain('mount:kameras');
    stop();
  });
});
