import { defineKey } from '../define';

export default defineKey({
  id: 'aisstream',
  name: 'aisstream.io',
  group: 'verkehr',
  unlocks: 'Schiffe weltweit live statt nur in ausgewählten Gebieten',
  url: 'https://aisstream.io',
  steps: ['Kostenlos bei aisstream.io registrieren.', 'Im Dashboard unter „API Keys“ einen neuen Schlüssel erstellen.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
