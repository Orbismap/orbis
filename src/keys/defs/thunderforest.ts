import { defineKey } from '../define';

export default defineKey({
  id: 'thunderforest',
  name: 'Thunderforest',
  group: 'karte',
  unlocks: 'Grundkarten von Thunderforest: Landscape, Outdoors, OpenCycleMap, Verkehr u. a.',
  url: 'https://manage.thunderforest.com/users/sign_up',
  steps: ['Kostenlos bei Thunderforest registrieren (Hobby-Plan: 150.000 Kacheln pro Monat, nur für nicht-kommerzielle Nutzung).', 'Im Dashboard unter „API Keys“ den Schlüssel kopieren.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{16,}$/.test(v.trim()),
});
