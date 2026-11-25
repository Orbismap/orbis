// Zustand der Datenzeilen in der Zeitleiste: welche Zeilen es gibt, ob sie eingeklappt sind und wie groß sie sind.
import { computed, signal } from '@preact/signals';
import { getLayer } from '../../layers/registry';
import { feeds, markTimes } from '../../state/session';
import { timeTracks } from '../../state/time-tracks';
import type { BandRow } from './draw';

/** Eingeklappt: Ebenen sind noch weiter zusammengefasst (eine Spur für alles, eine für alle Zeiträume). */
export const collapsed = signal(false);
/** Größe der Zeilen, am oberen Rand der Zeitleiste ziehbar: 1 = Normalgröße. */
export const rowScale = signal(1);
export const ROW_SCALE_MIN = 0.35;
export const ROW_SCALE_MAX = 1.5;

/** Die Zeilen der Leiste: je Ebene mit Ereignissen eine Kurve (aus feed und marks), darunter je Spur eine Balkenzeile. Ohne beides bleibt die dünne Leiste. */
const densityRows = computed<BandRow[]>(() => {
  const out: BandRow[] = [];
  const mine = markTimes.value;
  for (const [id, items] of Object.entries(feeds.value)) {
    if (id in mine) continue;
    const def = getLayer(id);
    const color = def?.color ?? '#72C8F0';
    const timed = items.filter((it) => it.time !== undefined);
    if (!timed.length) continue;
    out.push({ kind: 'density', id, label: def?.title ?? id, color, times: timed.map((it) => it.time!), colors: timed.map((it) => it.color ?? color) });
  }
  for (const [id, m] of Object.entries(mine)) {
    if (!m.times.length) continue;
    const def = getLayer(id);
    out.push({ kind: 'density', id, label: def?.title ?? id, color: def?.color ?? '#72C8F0', times: m.times, colors: m.colors });
  }
  return out;
});
export const rows = computed<BandRow[]>(() => [...densityRows.value, ...timeTracks.value.map((t): BandRow => ({ kind: 'bars', id: t.id, label: t.label, color: t.color, active: t.active }))]);
