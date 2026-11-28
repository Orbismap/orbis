import { useState } from 'preact/hooks';
import type { Note } from '../data/types';
import { Icon, type IconName } from './icons';

/** Das Symbol je Meldungsnummer der DB; unbekannte Nummern bekommen das allgemeine Hinweiszeichen. */
const BY_CODE: Record<number, IconName> = {
  29: 'ersatz', 78: 'ersatz', 70: 'wlanNein', 71: 'wlanSchwach', 72: 'anzeige', 73: 'wagenreihung', 74: 'wagenreihung',
  75: 'wagenreihung', 76: 'wagenreihung', 77: 'ersteKlasse', 79: 'abteil', 80: 'wagenreihung', 81: 'swap', 82: 'wagenFehlt',
  83: 'barriere', 85: 'wagenFehlt', 86: 'reservierung', 87: 'reservierung', 90: 'essenNein', 91: 'radNein', 92: 'radUnsicher',
  93: 'barriere', 94: 'essenErsatz', 95: 'toilette', 96: 'zustieg', 97: 'auslastung',
};

export const noteIcon = (code: number): IconName => BY_CODE[code] ?? 'hinweis';

/** Nur Symbole, für die Verbindungsliste: die Karte selbst ist schon der Knopf. Gleiche Symbole erscheinen einmal. */
export function NoteIcons({ notes }: { notes: Note[] }) {
  const byIcon = new Map<IconName, string[]>();
  for (const n of notes) byIcon.set(noteIcon(n.code), [...(byIcon.get(noteIcon(n.code)) ?? []), n.text]);
  return (
    <span class="bn-conn-notes">
      {[...byIcon].map(([icon, texts]) => (
        <span key={icon} class="bn-note-ic" role="img" aria-label={texts.join(', ')} title={texts.join(', ')}><Icon name={icon} size={18} /></span>
      ))}
    </span>
  );
}

/** Symbole zum Antippen, in den Verbindungsdetails: der Text der angetippten Meldung steht darunter. */
export function NoteButtons({ notes }: { notes: Note[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = notes.find((n) => n.code === open);
  return (
    <div class="bn-notes" role="group" aria-label="Meldungen der DB zu diesem Zug">
      {notes.map((n) => (
        <button key={n.code} type="button" class="bn-note-btn" aria-label={n.text} aria-expanded={open === n.code} title={n.text} onClick={() => setOpen(open === n.code ? null : n.code)}>
          <span class="bn-note-ic"><Icon name={noteIcon(n.code)} size={20} /></span>
        </button>
      ))}
      <p class="bn-note-text" aria-live="polite">{shown?.text}</p>
    </div>
  );
}
