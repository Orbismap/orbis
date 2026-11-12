import { defineKey } from '../define';

export default defineKey({
  id: 'cta',
  name: 'CTA Train Tracker',
  group: 'verkehr',
  unlocks: 'Chicago: die „L“-Züge live im Nahverkehr',
  url: 'https://www.transitchicago.com/developers/traintrackerapply/',
  steps: ['Das Antragsformular der CTA ausfüllen (kostenlos, wird kurz geprüft).', 'Den Schlüssel per E-Mail erhalten.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{16,}$/.test(v.trim()),
});
