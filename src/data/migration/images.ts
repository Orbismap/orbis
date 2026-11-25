// Bilder der Arten: Titelbild des Wikipedia-Artikels (Wikimedia Commons, freie Lizenzen), zur Laufzeit geholt und im Speicher gemerkt.
import { signal } from '@preact/signals';
import type { Species } from './species';

/** Art -> Adresse des Bildes; fehlt der Eintrag, ist es noch nicht da, '' = es gibt keins. */
export const speciesImages = signal<Record<string, string>>({});
const asked = new Set<string>();

export function loadSpeciesImage(sp: Species): void {
  if (asked.has(sp.id)) return;
  asked.add(sp.id);
  const [lang, title] = sp.wiki.includes(':') ? (sp.wiki.split(':') as [string, string]) : ['de', sp.wiki];
  fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { thumbnail?: { source?: string } }) => {
      speciesImages.value = { ...speciesImages.peek(), [sp.id]: d.thumbnail?.source ?? '' };
    })
    .catch(() => {
      asked.delete(sp.id);
      speciesImages.value = { ...speciesImages.peek(), [sp.id]: '' };
    });
}
