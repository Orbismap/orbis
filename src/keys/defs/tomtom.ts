import { defineKey } from '../define';

export default defineKey({
  id: 'tomtom',
  name: 'TomTom Traffic',
  group: 'verkehr',
  unlocks: 'Verkehrslage live (Straßen nach Verkehrsfluss) und die TomTom-Grundkarten',
  url: 'https://developer.tomtom.com/user/register',
  steps: [
    'Kostenloses Konto bei TomTom Developer anlegen.',
    'Unter „Keys“ einen API-Schlüssel mit „Traffic API“ kopieren (kostenlos: 2.500 Anfragen pro Tag).',
    'Den Schlüssel hier einfügen und speichern.',
  ],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{20,}$/.test(v.trim()),
});
