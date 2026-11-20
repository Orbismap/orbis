import { defineKey } from '../define';

export default defineKey({
  id: 'mapbox',
  name: 'Mapbox',
  group: 'karte',
  unlocks: 'Grundkarten von Mapbox: Streets, Outdoors, Light, Dark, Satellit',
  url: 'https://account.mapbox.com/access-tokens/',
  steps: ['Kostenlos bei Mapbox registrieren (Kreditkarte nötig, bis 200.000 Kacheln pro Monat kostenlos).', 'Unter „Access tokens“ einen öffentlichen Token (pk.…) erzeugen oder den Standard-Token kopieren.', 'Den Token hier einfügen und speichern.'],
  placeholder: 'Public Token (pk.…)',
  validate: (v) => /^pk\.[A-Za-z0-9._-]{20,}$/.test(v.trim()),
});
