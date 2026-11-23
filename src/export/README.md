# Weather renderer (`src/export/wx-render.ts`)

Wind, Temperatur, Niederschlag und Radar der Wetter-App (`src/wetter`). Das ist die einzige Quelle für Farbskalen,
Partikel-Animation und Radar-Shader; die Karte (`src/render/gl`) nutzt dieselben Bausteine.

- **API:** `mountWeatherLayer(map, { mode, beforeId, opacity, particles, onStatus })` → `{ destroy() }`.
- **Modi:** `wind` (Feld + Partikel), `precip`, `temp`, `radar`.
- **Laden:** Die Wetter-App importiert das Modul dynamisch (`src/wetter/features/forecast/sharedRenderer.ts`). Es ist ein
  eigener Chunk und wird vom Offline-Cache der Wetter-App mit vorgehalten.

Früher wurde das Modul als `/wx-render/v1.js` gebaut und zur Laufzeit zwischen zwei Repos geladen (Versionspin, Proxy).
Seit dem Zusammenlegen der Repos entfällt das alles.
