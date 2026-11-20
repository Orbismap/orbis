import { defineKey } from '../define';

export default defineKey({
  id: 'maptiler',
  name: 'MapTiler',
  group: 'karte',
  unlocks: 'Grundkarten von MapTiler: Straßen, Outdoor, Topografie, Satellit, Hybrid u. a.',
  url: 'https://cloud.maptiler.com/account/keys/',
  steps: ['Kostenlos bei MapTiler Cloud registrieren (der Free-Plan gilt nur für nicht-kommerzielle Nutzung).', 'Unter „API-Schlüssel“ den Standardschlüssel kopieren.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{16,}$/.test(v.trim()),
});
