import { haversine } from '@/core/geo';
import type { ModeGroup, Stop } from './types';

/**
 * Die Haltestellensuche von Transitous sortiert nach Textähnlichkeit: Bahnsteige ("Bad Kleinen Gl. 4"), Bushaltestellen
 * und Nachbarorte kommen vor dem Hauptbahnhof. Hier wird nachsortiert: erst Treffer, die mit der Eingabe beginnen, dann
 * nach Gewicht der Haltestelle (Hauptbahnhöfe vorne). Bahnsteige derselben Station werden zu einer Zeile.
 */

/** " Gl. 4", " Gleis 7", ", Bstg. B", " Steig C" am Ende des Namens: Bahnsteig, nicht Haltestelle. */
const PLATFORM_SUFFIX = /[\s,]+(?:Gl\.?|Gleis|Bstg\.?|Bussteig|Steig)\s*[\w\-/]+$/i;

export const cleanStopName = (name: string): string => name.replace(PLATFORM_SUFFIX, '').trim() || name;

const MODE_ORDER: ModeGroup[] = ['fern', 'regio', 'sbahn', 'ubahn', 'tram', 'bus', 'fernbus', 'faehre'];

/** Bahnsteige zu einer Station zusammenfassen: Name ohne Gleis, Verkehrsmittel vereint, Gewicht der größten Zeile. Reihenfolge bleibt. */
export function dedupeStops(stops: Stop[]): Stop[] {
  const out: Stop[] = [];
  const seen = new Map<string, number>();
  for (const s of stops) {
    const name = cleanStopName(s.name);
    const key = `${name.toLowerCase()}|${s.area ?? ''}`;
    const at = seen.get(key);
    if (at === undefined) {
      seen.set(key, out.length);
      out.push({ ...s, name });
      continue;
    }
    const kept = out[at]!;
    const modes = [...new Set([...(kept.modes ?? []), ...(s.modes ?? [])])].sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
    const better = (s.importance ?? 0) > (kept.importance ?? 0);
    out[at] = { ...(better ? s : kept), name, modes: modes.length ? modes : undefined, importance: Math.max(s.importance ?? 0, kept.importance ?? 0) };
  }
  return out;
}

/** Gleichnamige Halte so nah beieinander (m) sind auf der Karte eine Haltestelle. */
const SAME_PLACE_M = 400;

/**
 * Für die Karte: Bahnsteige und die Einträge mehrerer Fahrplanquellen zu einer Haltestelle zusammenfassen. Anders als
 * `dedupeStops` ohne Ortsangabe, deshalb zählt die Entfernung. Lage und ID kommen vom gewichtigsten Eintrag.
 */
export function clusterStops(stops: Stop[]): Stop[] {
  const byName = new Map<string, Stop[]>();
  const out: Stop[] = [];
  for (const s of [...stops].sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0))) {
    const name = cleanStopName(s.name);
    const key = norm(name).join(' ');
    const near = byName.get(key)?.find((o) => haversine([o.lng, o.lat], [s.lng, s.lat]) * 1000 <= SAME_PLACE_M);
    if (near) {
      const modes = [...new Set([...(near.modes ?? []), ...(s.modes ?? [])])].sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b));
      near.modes = modes.length ? modes : undefined;
      continue;
    }
    const kept = { ...s, name, modes: s.modes && [...s.modes].sort((a, b) => MODE_ORDER.indexOf(a) - MODE_ORDER.indexOf(b)) };
    out.push(kept);
    (byName.get(key) ?? byName.set(key, []).get(key)!).push(kept);
  }
  return out;
}

/** Kleinbuchstaben, ohne Akzente, ß = ss; "Hauptbahnhof" = "Hbf". Nur zum Vergleichen. */
const norm = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/hauptbahnhof/g, 'hbf')
    .replace(/bahnhof/g, 'bf')
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** 2 = Name beginnt mit der Eingabe, 1 = jedes Eingabewort beginnt irgendein Namenswort, 0 = sonst. */
function match(name: string, query: string[]): 0 | 1 | 2 {
  const words = norm(name);
  if (!query.length) return 0;
  if (!query.every((q) => words.some((w) => w.startsWith(q)))) return 0;
  return query.every((q, i) => words[i]?.startsWith(q)) ? 2 : 1;
}

/** Passt der Name zur Eingabe (beginnt mit ihr oder enthält ihre Wörter)? */
export const matchesQuery = (name: string, query: string): boolean => match(name, norm(query)) > 0;

export function rankStops(stops: Stop[], query: string): Stop[] {
  const q = norm(query);
  return dedupeStops(stops)
    .map((s, i) => ({ s, i, m: match(s.name, q) }))
    .sort((a, b) => b.m - a.m || (b.s.importance ?? 0) - (a.s.importance ?? 0) || a.i - b.i)
    .map((x) => x.s);
}
