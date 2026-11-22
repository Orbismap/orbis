# Shared weather renderer (`/wx-render/v1.js`)

orbis-wetter lädt die Wetter-Renderer diese Repos zur Laufzeit von derselben Origin. Das ist die
einzige Quelle für Farbskalen, Partikel-Animation und Radar-Shader – es gibt absichtlich keine
Kopie im Wetter-Repo.

## Vertrag

- **Entry:** `src/export/wx-render.ts` → gebaut als `v1.js` (ESM).
- **URL:** `https://maps.maltee.dev/wx-render/v1.js` (`base: '/wx-render/'` im Render-Build).
- **API:** `mountWeatherLayer(map, { mode, beforeId, opacity, particles, onStatus })`
  → `{ destroy() }`. `WX_RENDER_VERSION` ist die Versionsnummer.
- **Modi:** `wind` (Feld + Partikel), `precip`, `temp`, `radar`.

Ein **breaking change** muss als neue Datei `v2.js` gebaut und wetterseitig umgestellt werden.
Solange `v1` existiert, darf sich die API nicht ändern.

## Bauen

`pnpm build:render` schreibt nach `public/wx-render/` (von `vite.render.config.ts`). Das ist
gitignore'd. Sowohl `pnpm dev` als auch `pnpm build` rufen den Render-Build automatisch auf;
der normale Build kopiert das Verzeichnis nach `dist/wx-render/`.

Der Worker wird mit `base: '/wx-render/'` als absoluter Pfad `/wx-render/assets/worker-*.js`
referenziert. Das muss beim lokalen Dev-Server von wetter über den Vite-Proxy `/wx-render`
erreichbar sein.
