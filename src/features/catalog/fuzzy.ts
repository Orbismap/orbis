import { categoryById } from '../../layers/categories';
import type { Cadence, LayerDef } from '../../layers/types';

export const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/ß/g, 'ss');

export const CADENCE_LABEL: Record<Cadence, string> = { live: 'live', minutes: 'minütlich', hourly: 'stündlich', daily: 'täglich', static: 'statisch' };

interface Fields { title: string; words: string[]; keywords: string[]; summary: string; category: string }
const cache = new WeakMap<LayerDef, Fields>();
const fields = (d: LayerDef): Fields => {
  let f = cache.get(d);
  if (!f) {
    const title = norm(d.title);
    f = { title, words: title.split(/[\s&/-]+/), keywords: [...(d.keywords ?? []), ...(d.keys?.length ? ['schlüssel', 'boost', 'api key', 'key'] : [])].map(norm), summary: norm(d.summary), category: norm(categoryById(d.category).title) };
    cache.set(d, f);
  }
  return f;
};

const subsequence = (needle: string, hay: string) => {
  let i = 0;
  for (const c of hay) if (c === needle[i] && ++i === needle.length) return true;
  return false;
};

function tokenScore(t: string, f: Fields): number {
  if (f.title.startsWith(t)) return 100;
  if (f.words.some((w) => w.startsWith(t))) return 80;
  if (f.title.includes(t)) return 60;
  if (f.keywords.some((k) => k.startsWith(t))) return 50;
  if (f.keywords.some((k) => k.includes(t))) return 35;
  if (f.category.startsWith(t)) return 30;
  if (f.summary.split(/\s+/).some((w) => w.startsWith(t))) return 22;
  if (f.summary.includes(t)) return 15;
  if (t.length >= 3 && subsequence(t, f.title)) return 8;
  return 0;
}

/** Match score of a layer for a query (0 = no match). Every token must match somewhere. */
export function scoreLayer(d: LayerDef, query: string): number {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const f = fields(d);
  let sum = 0;
  for (const t of tokens) {
    const s = tokenScore(t, f);
    if (!s) return 0;
    sum += s;
  }
  return sum;
}

/** Generic label scoring for the global search (commands, Karten). */
export function scoreText(label: string, query: string, extra: string[] = []): number {
  const tokens = norm(query).split(/\s+/).filter(Boolean);
  if (!tokens.length) return 1;
  const l = norm(label);
  const words = l.split(/\s+/);
  const ex = extra.map(norm);
  let sum = 0;
  for (const t of tokens) {
    const s = l.startsWith(t) ? 100 : words.some((w) => w.startsWith(t)) ? 80 : l.includes(t) ? 60 : ex.some((e) => e.includes(t)) ? 40 : t.length >= 3 && subsequence(t, l) ? 8 : 0;
    if (!s) return 0;
    sum += s;
  }
  return sum;
}
