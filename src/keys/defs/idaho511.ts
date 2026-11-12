import { defineKey } from '../define';

export default defineKey({
  id: 'idaho511',
  name: 'Idaho 511',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Idaho live von Idaho 511',
  url: 'https://511.idaho.gov',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
