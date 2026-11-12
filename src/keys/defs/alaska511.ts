import { defineKey } from '../define';

export default defineKey({
  id: 'alaska511',
  name: 'Alaska 511',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Alaska live von Alaska 511',
  url: 'https://511.alaska.gov',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
