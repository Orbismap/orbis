import { computed } from '@preact/signals';
import { setLayerVisible } from '../../karten/active';
import { guardOf } from '../../karten/standard';
import { getLayer } from '../../layers/registry';
import { activeKarte } from '../../state/session';
import { confirmWarning, settings, warningKey } from '../../state/settings';

export interface PendingWarning { key: string; title: string; text: string; cancel(): void }

/** First unconfirmed content warning among the visible layers: the one of the Karte that holds them, then the layer's own. */
export const pendingWarning = computed<PendingWarning | null>(() => {
  const k = activeKarte.value;
  const done = settings.value.confirmedWarnings;
  for (const l of k.layers) {
    const def = l.visible ? getLayer(l.id) : undefined;
    if (!def) continue;
    const g = guardOf(k, def.id);
    if (g && !done.includes(warningKey(g)) && !done.includes(`karte:${g.karteId}`)) return { key: warningKey(g), title: g.title, text: g.text, cancel: () => k.layers.forEach((x) => x.visible && guardOf(k, x.id)?.karteId === g.karteId && setLayerVisible(k.id, x.id, false)) };
    if (def.sensitive && !done.includes(warningKey(def.sensitive)) && !done.includes(`layer:${def.id}`))
      return { key: warningKey(def.sensitive), ...def.sensitive, cancel: () => setLayerVisible(k.id, def.id, false) };
  }
  return null;
});

export const confirmPending = (w: PendingWarning) => confirmWarning(w.key);
