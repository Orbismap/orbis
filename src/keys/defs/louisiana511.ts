import { defineKey } from '../define';

export default defineKey({
  id: 'louisiana511',
  name: 'Louisiana 511',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Louisiana live von 511 Louisiana',
  url: 'https://511la.org',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
