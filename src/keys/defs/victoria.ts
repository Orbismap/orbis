import { defineKey } from '../define';

export default defineKey({
  id: 'victoria',
  name: 'Transport Victoria',
  group: 'verkehr',
  unlocks: 'Melbourne und Victoria: Züge, Trams und Busse live im Nahverkehr',
  url: 'https://opendata.transport.vic.gov.au',
  steps: ['Kostenloses Konto im Open-Data-Portal von Transport Victoria erstellen.', 'Im Profil einen API-Schlüssel (KeyId) erzeugen.', 'Den Schlüssel hier einfügen und speichern.'],
  placeholder: 'KeyId',
  validate: (v) => v.trim().length >= 16,
});
