import { computed } from '@preact/signals';
import { setLayerVisible } from '../../karten/store';
import { getLayer } from '../../layers/registry';
import { activeKarte, setActiveKarte } from '../../state/session';
import { confirmWarning, settings } from '../../state/settings';
import { DEFAULT_KARTE_ID } from '../../karten/standard';

export interface PendingWarning { key: string; title: string; text: string; cancel(): void }

/** First unconfirmed content warning of the active Karte: the Karte itself, then its visible layers. */
export const pendingWarning = computed<PendingWarning | null>(() => {
  const k = activeKarte.value;
  const done = settings.value.confirmedWarnings;
  if (k.sensitive && !done.includes(`karte:${k.id}`))
    return { key: `karte:${k.id}`, ...k.sensitive, cancel: () => setActiveKarte(DEFAULT_KARTE_ID) };
  for (const l of k.layers) {
    const def = l.visible ? getLayer(l.id) : undefined;
    if (def?.sensitive && !done.includes(`layer:${def.id}`))
      return { key: `layer:${def.id}`, ...def.sensitive, cancel: () => setLayerVisible(k.id, def.id, false) };
  }
  return null;
});

export const confirmPending = (w: PendingWarning) => confirmWarning(w.key);
