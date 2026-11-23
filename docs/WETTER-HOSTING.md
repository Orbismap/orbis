# Wetter-App: Hosting und PWA

Ein Build, zwei Origins (`src/entry.ts` wählt die App nach Hostname; lokal `?mode=wetter` / `?mode=map`):

| Origin | App | Manifest | Service Worker |
|---|---|---|---|
| `maps.maltee.dev` | Orbis Map | `manifest.webmanifest` | keiner |
| `wetter.maltee.dev` | Orbis Wetter | `wetter/manifest.webmanifest` (`id`/`start_url`/`scope` = `/`) | `wetter-sw.js` |

Beide Domains hängen als Custom Domains am selben Worker (`wrangler.jsonc`). Weil es zwei Origins sind, erkennt Chrome
zwei getrennte Apps; ihre `localStorage`-Daten (z. B. das Wetter-Layout) sind ebenfalls getrennt.

## Offline-Cache der Wetter-App

`vite.wetter-pwa.ts` schreibt beim Build `wetter-precache.json` und `wetter-sw.js` (mit Versionskommentar). Vorgehalten wird
nur, was die Wetter-App braucht: der Einstieg, der Wetter-Chunk samt statischen Imports, CSS und MapLibre-Worker,
`index.html` und `public/wetter/` (Icons, Mondbilder). Karten-Chunks (3D, Regionen, Pro) landen nicht im Wetter-Cache.

- Der Service Worker wird nur registriert, wenn der Hostname mit `wetter.` beginnt (`src/wetter/pwa/register.ts`).
  Ein Worker mit Scope `/` auf der Karten-Origin würde sonst die Karte übernehmen.
- Same-Origin-Dateien: cache-first. Ausnahme `/wx-render/` (bleibt frisch). Alles andere (Wetterdaten, Kacheln):
  network-first mit Cache als Offline-Fallback; große Binärdaten (`octet-stream`, OWX) werden nicht gecacht.

## Umstellung (Livegang)

1. Deploy: legt DNS und Zertifikat für `wetter.maltee.dev` an (Custom Domain, wie bei `maps.maltee.dev`).
2. Altes Wetter-Repo: Der Worker mit der Route `maps.maltee.dev/wetter*` wird zu einer reinen Weiterleitung auf
   `https://wetter.maltee.dev/` (301), statt Dateien auszuliefern. Bereits installierte PWAs der alten Adresse werden so
   auf die neue Origin geführt.
3. Wetter-Layouts fangen unter der neuen Origin neu an (andere Origin = anderer `localStorage`).
