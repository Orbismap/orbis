import { defineKey } from '../define';

export default defineKey({
  id: 'here',
  name: 'HERE',
  group: 'karte',
  unlocks: 'Grundkarten von HERE: Explore Tag und Nacht, Satellit',
  url: 'https://platform.here.com/admin/apps',
  steps: ['Kostenlos bei HERE Platform registrieren (Freemium-Plan).', 'Eine App anlegen und unter „API Keys“ einen Schlüssel erzeugen.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{30,}$/.test(v.trim()),
});
