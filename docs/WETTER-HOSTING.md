# Wetter-App: Hosting und PWA (Offline auch für Bahn)

Ein Build, zwei Origins (`src/entry.ts` wählt die App nach Hostname; lokal `?mode=wetter` / `?mode=map`):

| Origin | App | Manifest | Service Worker |
|---|---|---|---|
| `maps.maltee.dev` | Orbis Map | `manifest.webmanifest` | keiner |
| `wetter.maltee.dev` | Orbis Wetter | `wetter/manifest.webmanifest` (`id`/`start_url`/`scope` = `/`) | `wetter-sw.js` |

Beide Domains hängen als Custom Domains am selben Worker (`wrangler.jsonc`). Weil es zwei Origins sind, erkennt Chrome
zwei getrennte Apps; ihre `localStorage`-Daten (z. B. das Wetter-Layout) sind ebenfalls getrennt.

## Offline (Wetter und Bahn)

Beide Apps starten ohne Netz und zeigen die zuletzt bekannten Daten.

**App-Shell** (`vite.pwa.ts`, Vorlage `src/pwa/sw.js`): Der Build schreibt je App `wetter-sw.js` und `bahn-sw.js` mit der
Dateiliste und Version darin. Vorgehalten wird nur, was die jeweilige App braucht: der Einstieg, ihr Chunk samt Imports,
CSS, eigene Worker, MapLibre-Worker, die Seite (`/`) und `public/<app>/`. Die Karten-App (Chunk `boot`) bleibt draußen.
Fehlt beim Install eine App-Datei, bleibt die alte Version aktiv.

- Registriert wird nur auf der eigenen Origin (`wetter.` bzw. `bahn.`, `src/pwa/register.ts`). Ein Worker mit Scope `/`
  auf der Karten-Origin würde sonst die Karte übernehmen.
- Seite: aus dem Netz, nach 4 s ohne Antwort die vorgehaltene. Same-Origin-Dateien: cache-first.
- Kacheln, Schriften, Radar: network-first, bis 500 Einträge (`orbis-<app>-runtime`). ICON-Felder (`.owx`, Pfad mit
  Modelllauf, unveränderlich): cache-first, bis 16 Dateien (`orbis-<app>-fields`). Beide bleiben über Updates erhalten.
- Live-Daten (Open-Meteo-Vorhersage und Luftqualität, DWD-Warnungen, Transitous) fasst der Worker nicht an: Aus seinem
  Cache gäben sie sich als aktuell aus.

**Daten** (die Apps selbst, `localStorage` über `src/core/lastKnown.ts`; begrenzt, die ältesten Einträge weichen). Sie
stehen sofort da, werden durch die neue Antwort ersetzt und tragen bis dahin ihr Alter.

- Wetter (`src/wetter/data/saved.ts`): Vorhersage je Ort (20 Orte). Vergangene Tage und abgelaufene Warnungen fallen heraus,
  die Quellenzeile sagt „Gespeichert · vor …“. Ohne Netz startet die App mit dem zuletzt gewählten Ort.
- Bahn (`src/bahn/data/offline.ts`): Abfahrten je Haltestelle (40, abgefahrene fallen heraus), Verbindungen je Strecke (20;
  für „Jetzt“ die noch kommenden, sonst alle; für eine gewählte Zeit nur nahe daran), dazu alle gesehenen Haltestellen
  (300) für Suche und „In der Nähe“ ohne Netz.

## Umstellung (Livegang)

1. Deploy: legt DNS und Zertifikat für `wetter.maltee.dev` an (Custom Domain, wie bei `maps.maltee.dev`).
2. Altes Wetter-Repo: Der Worker mit der Route `maps.maltee.dev/wetter*` wird zu einer reinen Weiterleitung auf
   `https://wetter.maltee.dev/` (301), statt Dateien auszuliefern. Bereits installierte PWAs der alten Adresse werden so
   auf die neue Origin geführt.
3. Wetter-Layouts fangen unter der neuen Origin neu an (andere Origin = anderer `localStorage`).
