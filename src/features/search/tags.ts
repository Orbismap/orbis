// Tag search in the command menu: "ort:Berlin", "ebene:wind", "karte:", "cmd:", or the name of a Karte ("wetter:", "gefahren:wind").
// A tag limits the search to one kind of result; what follows the colon is the query.
import { builtinKarten, universeOf } from '../../karten/standard';
import { listedKarten } from '../../karten/store';
import type { Karte } from '../../karten/types';
import { norm } from '../catalog/fuzzy';

export type Tag = 'orte' | 'ebenen' | 'karten' | 'befehle' | { karte: Karte };

const WORDS: Record<string, Tag> = {
  ort: 'orte', orte: 'orte', place: 'orte', places: 'orte',
  ebene: 'ebenen', ebenen: 'ebenen', layer: 'ebenen', layers: 'ebenen',
  karte: 'karten', karten: 'karten',
  cmd: 'befehle', befehl: 'befehle', befehle: 'befehle', command: 'befehle',
};
const key = (s: string) => norm(s).replace(/[^a-z0-9]+/g, '');

/** The Karte a tag word names (id, whole name or its first word), if any. */
function karteByWord(word: string): Karte | undefined {
  const w = key(word);
  return listedKarten.peek().find((k) => key(k.id) === w || key(k.name) === w || key(k.name.split(/[\s&/-]+/)[0] ?? '') === w);
}

export interface Parsed { tag?: Tag; rest: string }

/** "ort:Berlin" -> { tag: 'orte', rest: 'Berlin' }. Anything else (also unknown words before a colon) is a plain query. */
export function parseTag(q: string): Parsed {
  const m = /^\s*([\p{L}][\p{L}\p{N}-]*)\s*:\s*(.*)$/u.exec(q);
  if (!m) return { rest: q.trim() };
  const word = m[1]!;
  const tag = WORDS[norm(word)] ?? (() => { const k = karteByWord(word); return k ? { karte: k } : undefined; })();
  return tag ? { tag, rest: m[2]!.trim() } : { rest: q.trim() };
}

/** The text to search places for: nothing when the tag names another kind of result. */
export function placeQuery(q: string): string {
  const { tag, rest } = parseTag(q);
  return !tag || tag === 'orte' ? rest : '';
}

/** Layer ids of a Karte tag: the layers of a standard Karte (with its topics) or of an own Karte. */
export const karteLayerIds = (k: Karte): Set<string> => {
  const std = builtinKarten().find((b) => b.id === k.id);
  return std ? universeOf(std) : new Set(k.layers.map((l) => l.id));
};
