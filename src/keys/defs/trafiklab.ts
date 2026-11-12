import { defineKey } from '../define';

export default defineKey({
  id: 'trafiklab',
  name: 'Trafiklab',
  group: 'verkehr',
  unlocks: 'Schweden: Busse und Bahnen live im Nahverkehr',
  url: 'https://www.trafiklab.se/signup',
  steps: [
    'Kostenloses Konto bei Trafiklab erstellen.',
    'Ein Projekt anlegen, die API „GTFS Regional Realtime“ hinzufügen und den Schlüssel kopieren.',
    'Den Schlüssel hier einfügen und speichern.',
  ],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{16,}$/.test(v.trim()),
});
