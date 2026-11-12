import { defineKey } from '../define';

export default defineKey({
  id: 'georgia511',
  name: 'Georgia 511',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Georgia live von Georgia 511',
  url: 'https://511ga.org',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
