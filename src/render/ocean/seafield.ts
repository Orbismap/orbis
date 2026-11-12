// Building block of Meeresströmung and Seegang: a smooth sea-state field (baked colours, clipped by the ocean mask)
// with optional flow particles, fed by the shared OceanStore. Reports status (model time, refinement) and answers
// point queries from the same grid.
import { effect } from '@preact/signals';
import { scaleRange, type ColorScale } from '../../core/color';
import type { LayerContext, LayerHandle } from '../../layers/types';
import { Cleanup } from '../common';
import { bakeScalar, premultipliedLut } from './bake';
import { flowLayer, type FlowHandle } from './flow';
import { flowField, sampleScalar, scalarField, type FlowKind, type ScalarKind } from './grid';
import { oceanFieldLayer } from './fieldimage';
import { isOcean } from './landmask';
import { acquireOceanStore } from './store';

export interface SeaConfig {
  scalar: ScalarKind;
  scale: ColorScale;
  showField: boolean;
  /** trail colours follow the scale of the field (t = value ÷ end of the scale) */
  particles: { kind: FlowKind; speedPx?: (s: number) => number } | null;
}

export interface SeaFieldOptions {
  config(o: Record<string, number | string | boolean>): SeaConfig;
  /** probe text for the scalar value of the current config */
  probe(v: number, cfg: SeaConfig): { label: string; value: string };
  /** extra status note */
  note?: string;
}

export function seaFieldLayer(ctx: LayerContext, o: SeaFieldOptions): LayerHandle {
  const hold = acquireOceanStore();
  const store = hold.store;
  const clean = new Cleanup();
  const field = oceanFieldLayer(ctx);
  let flow: FlowHandle | undefined;
  let flowKey = '';
  let scalar: Float32Array | undefined;
  let cfg: SeaConfig | undefined;
  let maskSent = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let destroyed = false;

  const apply = () => {
    timer = undefined;
    const mask = store.mask.value;
    if (destroyed || !mask || !cfg) return;
    if (!maskSent) { field.setMask(mask); maskSent = true; }
    scalar = scalarField(store.grid, cfg.scalar);
    if (cfg.showField) field.setImage(bakeScalar(scalar, cfg.scale), 1440, 720);
    else field.setImage(new Uint8Array(4), 1, 1);
    const p = cfg.particles;
    if (!p) {
      flow?.destroy();
      flow = undefined;
      flowKey = '';
    } else {
      const key = `${p.kind}`;
      if (!flow || key !== flowKey) {
        flow?.destroy();
        const scale = cfg.scale;
        flow = flowLayer(ctx, { speedPx: p.speedPx, lut: () => premultipliedLut(scale, 256), alpha: 0.85 });
        flowKey = key;
        flow.setMask(mask);
      }
      flow.setField(flowField(store.grid, p.kind, { max: scaleRange(cfg.scale)[1] }));
      flow.recolor();
    }
    ctx.map.requestRender();
  };
  const schedule = () => { if (!timer) timer = setTimeout(apply, 30); };

  clean.add(effect(() => {
    cfg = o.config(ctx.options.value);
    store.version.value;
    store.mask.value;
    schedule();
  }));
  clean.add(effect(() => {
    const s = hold.state.value;
    if (s.state === 'error') ctx.status({ state: 'error', note: s.note });
    else if (s.state === 'loading') ctx.status({ state: 'loading' });
    else ctx.status({ state: 'ready', updatedAt: s.modelTime ?? s.fetchedAt, note: [s.note, s.refining ? 'Ausschnitt wird verfeinert' : undefined, o.note].filter(Boolean).join(' · ') || undefined });
  }));
  clean.add(store.watchView(ctx.map.ml));

  return {
    probe(at) {
      if (!scalar || !cfg) return null;
      const m = store.mask.value;
      const v = sampleScalar(scalar, at.lng, at.lat);
      if (!m || v !== v || !isOcean(m, at.lng, at.lat)) return null;
      const r = o.probe(v, cfg);
      return { ...r, numeric: v } as { label: string; value: string };
    },
    destroy() {
      destroyed = true;
      if (timer) clearTimeout(timer);
      clean.run();
      flow?.destroy();
      field.destroy();
      hold.release();
    },
  };
}
