import { defineKey } from '../define';

export default defineKey({
  id: 'nevada511',
  name: 'NVRoads (Nevada)',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Nevada live von NVRoads',
  url: 'https://nvroads.com',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
