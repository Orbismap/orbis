import { defineKey } from '../define';

export default defineKey({
  id: 'ohgo',
  name: 'OHGO (Ohio)',
  group: 'kameras',
  unlocks: 'Verkehrskameras in Ohio live von OHGO',
  url: 'https://publicapi.ohgo.com/docs/registration',
  steps: ['Kostenloses Konto bei OHGO anlegen.', 'Den API-Schlüssel abrufen.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'API-Schlüssel',
  validate: (v) => v.trim().length >= 16,
});
