import { defineKey } from '../define';

export default defineKey({
  id: 'cesiumion',
  name: 'Cesium ion',
  group: 'karte',
  unlocks: '3D-Gebäude und fotorealistische 3D-Städte weltweit (mit Orbis Pro)',
  url: 'https://ion.cesium.com/tokens',
  steps: [
    'Kostenlos bei cesium.com/ion registrieren (der Community-Plan gilt nur für nicht-kommerzielle Nutzung).',
    'Unter „Access Tokens“ einen neuen Token mit Leserechten auf Assets erstellen.',
    'Unter „Asset Depot“ „Cesium OSM Buildings“ und „Google Photorealistic 3D Tiles“ zu „My Assets“ hinzufügen.',
    'Den Token hier einfügen und speichern.',
  ],
  placeholder: 'Access Token (eyJ…)',
  validate: (v) => /^[A-Za-z0-9._-]{40,}$/.test(v.trim()),
});
