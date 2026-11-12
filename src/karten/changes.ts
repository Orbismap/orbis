// What counts as a change of a standard Karte. A standard Karte is a view: switching layers of its own topics,
// choosing a field and layer options are remembered silently and never count. Only a rebuild counts: a foreign
// layer, a changed order, changed opacity, another basemap/labels/terminator, name or icon.
import type { Karte, KarteLayer } from './types';

/** Ids a standard Karte owns: its default layers and every layer of its topics. */
const universeOf = (std: Karte): Set<string> => new Set([...std.layers.map((l) => l.id), ...(std.themes ?? []).flatMap((t) => t.layers)]);
const round2 = (v: number) => Math.round(v * 100) / 100;

/** Stable text of the structural part of `k`, measured against its standard Karte `std`. */
export function structuralSignature(k: Karte, std: Karte): string {
  const own = universeOf(std);
  const defs = std.layers.map((l) => l.id);
  const defSet = new Set(defs);
  const stdOpacity = new Map(std.layers.map((l) => [l.id, l.opacity]));
  const foreign = k.layers.filter((l) => !own.has(l.id)).map((l) => l.id).sort();
  const opacity = k.layers
    .filter((l) => own.has(l.id) && round2(l.opacity) !== round2(stdOpacity.get(l.id) ?? 1))
    .map((l) => [l.id, round2(l.opacity)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  // order of the default layers: missing ones are ignored, only a different relative order counts
  const seq = k.layers.map((l) => l.id).filter((id) => defSet.has(id));
  let at = -1;
  const inOrder = seq.every((id) => {
    const i = defs.indexOf(id);
    const ok = i > at;
    at = i;
    return ok;
  });
  return JSON.stringify([k.name, k.icon, k.color, k.basemap, k.labels, k.terminator, foreign, opacity, inOrder ? null : seq]);
}

/** Whether `k` (the user's version of a standard Karte) differs structurally from `std`. */
export const isModified = (k: Karte, std: Karte): boolean => structuralSignature(k, std) !== structuralSignature(std, std);

/** Removes the rebuild but keeps everything remembered silently (visibility, options, own-topic layers). */
export function discardModifications(k: Karte, std: Karte): Karte {
  const own = universeOf(std);
  const defSet = new Set(std.layers.map((l) => l.id));
  const byId = new Map(k.layers.map((l) => [l.id, l]));
  const extra: KarteLayer[] = k.layers.filter((l) => own.has(l.id) && !defSet.has(l.id)).map((l) => ({ ...l, opacity: 1 }));
  const defs: KarteLayer[] = std.layers.map((s) => {
    const d = byId.get(s.id);
    return d ? { ...d, opacity: s.opacity } : { ...s };
  });
  return { ...k, name: std.name, icon: std.icon, color: std.color, basemap: std.basemap, labels: std.labels, terminator: std.terminator, layers: [...extra, ...defs] };
}
