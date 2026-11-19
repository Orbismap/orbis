import { defineKey } from '../define';

export default defineKey({
  id: 'jawg',
  name: 'Jawg Maps',
  group: 'karte',
  unlocks: 'Grundkarten von Jawg: Streets, Terrain, Sunny, Lagoon, Light und Dark',
  url: 'https://www.jawg.io/lab/access-tokens',
  steps: ['Kostenlos bei Jawg Lab registrieren.', 'Unter „Access Tokens“ den Standard-Token kopieren.', 'Den Token hier einfügen und speichern.'],
  placeholder: 'Access Token',
  validate: (v) => /^[A-Za-z0-9]{16,}$/.test(v.trim()),
});
