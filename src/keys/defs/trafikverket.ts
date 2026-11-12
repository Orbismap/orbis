import { defineKey } from '../define';

export default defineKey({
  id: 'trafikverket',
  name: 'Trafikverket (Schweden)',
  group: 'kameras',
  unlocks: 'Straßenkameras in Schweden live von Trafikverket',
  url: 'https://api.trafikinfo.trafikverket.se/Account/Register',
  steps: ['Kostenloses Konto bei Trafikverket anlegen.', 'Den Autorisierungsschlüssel (Authentication key) kopieren.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'Autorisierungsschlüssel',
  validate: (v) => /^[A-Za-z0-9_-]{16,}$/.test(v.trim()),
});
