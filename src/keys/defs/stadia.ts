import { defineKey } from '../define';

export default defineKey({
  id: 'stadia',
  name: 'Stadia Maps',
  group: 'karte',
  unlocks: 'Grundkarten von Stadia Maps: Alidade, Stamen Toner, Terrain und Watercolor, Satellit',
  url: 'https://client.stadiamaps.com/signup/',
  steps: ['Kostenlos bei Stadia Maps registrieren (der kostenlose Plan gilt nur für nicht-kommerzielle Nutzung).', 'Eine Property anlegen und dort einen API-Schlüssel erzeugen.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9-]{16,}$/.test(v.trim()),
});
