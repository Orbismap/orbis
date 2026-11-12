import { defineKey } from '../define';

export default defineKey({
  id: 'nps',
  name: 'US National Park Service',
  group: 'kameras',
  unlocks: 'Webcams der US-Nationalparks live vom NPS',
  url: 'https://www.nps.gov/subjects/developer/get-started.htm',
  steps: ['Das Formular beim NPS ausfüllen, der Schlüssel kommt sofort per E-Mail.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => /^[A-Za-z0-9]{20,}$/.test(v.trim()),
});
