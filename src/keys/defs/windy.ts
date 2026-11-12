import { defineKey } from '../define';

export default defineKey({
  id: 'windy',
  name: 'Windy Webcams',
  group: 'kameras',
  unlocks: 'Webcams weltweit aus dem Windy-Verzeichnis für den Kartenausschnitt',
  url: 'https://api.windy.com/keys',
  steps: ['Kostenloses Windy-Konto anlegen.', 'Auf api.windy.com/keys einen Schlüssel für die „Webcams API“ anfordern.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{20,}$/.test(v.trim()),
});
