import { defineKey } from '../define';

export default defineKey({
  id: 'utah511',
  name: 'UDOT Traffic (Utah)',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Utah live von UDOT Traffic',
  url: 'https://udottraffic.utah.gov',
  steps: ['Kostenloses Konto beim Portal anlegen und anmelden.', 'Im Konto unter „Developers“ einen Entwickler-Schlüssel anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
