// Channel for extensions (Orbis Pro): the weather balloons of the layer `wetterballons`, filtered like its icons. The cards
// are the layer's own, so a click in the extension's presentation and one on the 2D icon open the same card, with the
// extension's buttons (follow camera).
import { effect, untracked, type ReadonlySignal } from '@preact/signals';
import { sondeSample, type SondeProps } from '../../data/parsers/sondes';
import { balloonsChannel as channel } from '../../ext/channels';
import type { InspectCard, LayerContext } from '../../layers/types';
import { extrapolate, type TrackObject } from '../../render/tracks';

export function publishBalloons(
  ctx: LayerContext,
  o: { tracks: ReadonlySignal<TrackObject[] | undefined>; color(altM: number): string; describe(t: TrackObject, now: number): InspectCard; maxExtrapolateMs: number },
) {
  const ids = new WeakMap<InspectCard, string>();

  const describe = (t: TrackObject, now: number): InspectCard => {
    const actions = channel.actionsFor(t.id);
    const card = { ...o.describe(t, now), ...(actions.length ? { actions } : {}) };
    ids.set(card, t.id);
    return card;
  };
  const open = (id: string) => {
    const t = o.tracks.peek()?.find((x) => x.id === id);
    if (!t) return;
    const now = Date.now();
    const card = describe(t, now);
    card.location ??= extrapolate(t, now, o.maxExtrapolateMs);
    ctx.select(card);
  };

  const stops = [
    effect(() => {
      o.tracks.value;
      channel.publish(() => (o.tracks.peek() ?? []).map((t) => sondeSample(t, o.color((t.props as unknown as SondeProps).alt))));
    }),
    effect(() => {
      const card = ctx.selection.value;
      channel.setSelectedId(card ? (ids.get(card) ?? null) : null);
    }),
    // an extension changed its card buttons: the open card is built anew
    effect(() => {
      channel.actionsVersion.value;
      untracked(() => {
        const id = channel.selectedId.peek();
        if (id) open(id);
      });
    }),
    channel.onSelect((id) => {
      if (id !== null) open(id);
      else if (channel.selectedId.peek()) ctx.select(null);
    }),
  ];

  return {
    describe,
    destroy() {
      for (const stop of stops) stop();
      channel.reset();
    },
  };
}
