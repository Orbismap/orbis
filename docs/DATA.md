# Daten

## Buckets

Konfiguration in `src/data/endpoints.ts`, überschreibbar per `.env` (`.env.example`). Alle senden `Access-Control-Allow-Origin: *`.

| Bucket | Standardadresse | Inhalt | Manifest |
|---|---|---|---|
| `live` | `orbis-live.maltee.dev` | Minuten-Snapshots: `events/usgs-2.5_week.geojson`, `events/emsc-europe.json`, GDACS, FIRMS, TLE … | ja |
| `data` | `orbis-data.maltee.dev` | täglich/wöchentlich: `osm-cables/cables.json`, Vulkane, Kraftwerke, Cams, Radio … | ja |
| `osm` | `orbis-osm.maltee.dev` | PMTiles (`cctv`, `blitzer`, `alpr`, `webcam`, `wind`, `resource`) und `heat/` | ja |
| `wetter` | `orbis-wetter.maltee.dev` | ICON-Felder im Format OWX, `v1/latest.json` | nein |
| `assets` | `orbis-assets.maltee.dev` | statische Dateien | nein |

`bucketUrl('data', 'osm-cables/cables.json')` baut die Adresse.

## Manifest

`manifest.json` je Bucket: `{ [key]: { updated, bytes, source, license } }`. `data/manifest.ts` lädt es einmal je Bucket
(Cache 5 min, gleichzeitige Abrufe geteilt): `loadManifest(bucket)`, `manifestEntry(bucket, key)` (Promise) und
`manifestEntrySignal(bucket, key)` (für die Oberfläche: Alter, Quelle, Lizenz einer Ebene, über `SourceRef.manifest`).

## Resource

`createResource(spec)` (`data/resource.ts`) ist der einzige Weg zu Daten. In Ebenen: `ctx.resource(spec)`, entsorgt sich
beim Ausschalten.

- Referenzgezählt je `key`: gleiche Schlüssel teilen Abruf und Signale; geladen wird nur, solange jemand sie hält.
- `refresh` (ms): pausiert bei verstecktem Tab, holt beim Zurückkehren nach, wenn fällig; Neuabrufe revalidieren über
  den HTTP-Cache (ETag).
- Fehler behalten die alten Daten (`state` bleibt `ready`, `error` gesetzt). Wiederholung nach 2 s, 8 s, 30 s;
  Ressourcen mit `refresh` versuchen es danach weiter, einmalige geben auf (`reload()` stößt neu an).
- `fallback`: Originalquelle, wenn der Spiegel ausfällt.
- `updatedAt`: `Last-Modified` der Antwort, sonst Ladezeit.
- `parse`: Name eines Parsers (läuft im Worker, Rohdaten werden als `ArrayBuffer` übergeben) oder eine Funktion
  (Hauptthread, für Kleinkram).

`data/http.ts`: `fetchRaw`/`fetchJson` mit Zeitlimit, Abbruch, `Last-Modified`; Fehler sind `HttpError` mit
`kind: 'timeout' | 'network' | 'http' | 'parse' | 'abort'`, `describeError` liefert den deutschen Text.

## Parser

Reine Funktionen in `src/data/parsers/<name>.ts`, registriert mit einer Zeile in `parsers/index.ts`. `ParserName` wird
aus dem Register abgeleitet, `runParser(name, input, { format, args })` (`data/worker/pool.ts`) ist typisiert. Parser
dürfen `async` sein; Typed Arrays im Ergebnis werden transferiert. Ohne `Worker` (Tests) läuft der Parser inline.

Vorhanden: `usgsQuakes`, `emscQuakes` (beide liefern schlankes GeoJSON `{id, mag, depth, place, time, url, tsunami, src}`),
`mergeQuakes` (USGS gewinnt bei Doppelten: ±2 min, ±1 Magnitude, ≤ 100 km), `cableLines`, `owxDecode`.
Jeder Parser hat einen Vitest-Test mit kleinem Fixture neben sich.

## OWX (Wetterfelder)

Format und Pipeline: `docs/WETTERDATEN-FORMAT.md` im alten Orbis-Repo. Kurz: `v1/latest.json` nennt den neuesten Lauf
(`run`, `times`, `vars`); je Variable liegt ein Überblick `o.owx` (0,5°, weltweit) und 32 Kacheln `t<c>_<r>.owx`
(45°, 0,125°). Datei: `OWX1`, Länge des JSON-Headers, Header, gzip-Strom aus zwei Byte-Ebenen von Zickzack-Residuen
(Plane-Prädiktor räumlich, dann Summe über die Zeit). Wert = `q · scale + offset`, `q = −32768` fehlt.

```ts
const latest = await loadLatest();                       // data/owx/index.ts
const { header, data } = await loadField(latest.run, 'temperature_2m', 'o');   // Int16Array [t][y][x], aus dem Worker
const v = owxValue({ header, data }, t, y, x);           // physikalischer Wert oder undefined
```

`data/owx/decode.ts` ist rein (und per Test gegen einen im Test kodierten Mini-Lauf geprüft); `loadField`/`loadOwx` laden
und dekodieren im Worker, die Antwort kommt transferiert zurück. Unbekannte Hauptversion von `latest.json` wirft einen
Fehler, die Wetter-Ebenen fallen dann auf eine andere Quelle zurück.

## CORS-Proxy

Quellen ohne CORS-Header (adsb.lol, adsb.fi, Overpass, NOAA NDBC/CO-OPS) laufen über den Worker von Orbismap/data:
`https://orbis.malte9799.workers.dev/?url=<kodierte URL>`. Der Worker erlaubt die Ursprünge maltee.dev, malte9799.github.io,
localhost:5173 und localhost:4173 und hat eine Host-Whitelist. In `data/endpoints.ts`: `PROXY` (Umgebungsvariable
`VITE_PROXY_URL`, Standard der Worker) und `proxied(url)`. Der Rauchtest startet `vite preview` deshalb auf Port 4173
(sonst 5173; auf einem anderen Port scheitern proxied Ebenen mit CORS).

## Weltraumwetter und Rekonstruktionen (Ebenen `polarlicht`, `rekonstruktionen`)

- NOAA SWPC, alle mit `Access-Control-Allow-Origin: *` (kein Proxy): `json/rtsw/rtsw_wind_1m.json` (Plasma, ≈ 2,7 MB, mehrere Tage, mehrere
  Satelliten, neueste zuerst) und `json/rtsw/rtsw_mag_1m.json` (Magnetfeld, ≈ 1,5 MB). Parser `swWind` / `swMag` nehmen den jüngsten Satz der
  Hauptquelle (`active: true`); Abruf alle 10 min im Worker. Die alten `products/solar-wind/*-2-hour.json` liefern 404. Ein kleiner Snapshot
  im Live-Bucket (Zeitgeber der Daten-Repo) wäre besser. Röntgenfluss: `live: space/swpc/xrays-1-day.json` (Parser `swXray`, Klasse A bis X).
- Rekonstruktionen: Spur, Funk und Videos liegen im assets-Bucket unter `data/incidents/<id>/` (`track.json`, `funk.m4a`, `videos/*.mp4`,
  geprüft: alle erreichbar, CORS offen). Parser `incidentTrack`; Ereignisse sind Dateien in `src/data/incidents/<id>.ts`.

## Meer und Gewässer

| Ebene | Quelle | Zugriff | Lizenz |
|---|---|---|---|
| `meeresstroemung`, `seegang` | Open-Meteo Marine (`current`: Strömung, Wellen, Dünung) | direkt aus dem Browser, CORS offen | CC BY 4.0 |
| `fluesse` | Open-Meteo Flood (GloFAS) + Natural Earth Rivers 50m | direkt, CORS offen; Linien aus `public/data/ne50m_rivers.json` (422 KB) | CC BY 4.0, Natural Earth gemeinfrei |
| `meerestiefe` | Terrarium-Höhenkacheln (`s3.amazonaws.com/elevation-tiles-prod/terrarium`, Meeresboden aus GEBCO/ETOPO1), optional EMODnet WMS | direkt, CORS offen | frei nutzbar (AWS Open Data), EMODnet CC BY 4.0 |
| `schiffsrouten` | Global Shipping Lanes (P. Benden), `raw.githubusercontent.com` (Rückfall jsDelivr), 1,2 MB | direkt, CORS offen | CC BY 4.0 |

Gemeinsame Dateien: `public/data/ne50m_land.json` (975 KB) und `ne50m_lakes.json` (308 KB) sind Natural Earth 50m (gemeinfrei),
auf 0,01° gerundet, Inseln unter 0,2° Ausdehnung entfernt; daraus rastert `render/ocean/landmask.ts` die Meeresmaske (3600x1800), mit der Partikel das Wasser nie
verlassen und das Farbfeld an der Küste abgeschnitten wird.

### Open-Meteo-Budget

Open-Meteo erlaubt ohne Schlüssel 600 Abrufe/min, 5 000/h und 10 000/Tag je IP; jeder Ort einer Mehrfachanfrage zählt als Abruf
(30 Tage Vorhersage ungefähr doppelt). Alle Ozean-Ebenen laufen durch `render/ocean/budget.ts`: eine Warteschlange hält 450
Orte/min, ein Tageszähler in `localStorage` stoppt bei 8 000, bei 429 gibt es 10 min Pause.

- Global: 5°-Gitter, nur Ozeanpunkte nach Maske, etwa 1 600 Orte (`current` mit 8 Variablen zählt je Ort einmal). Strömung und Seegang
  teilen sich dieselben Abrufe und denselben Zwischenspeicher (3 h in `localStorage`): ein Neuladen kostet 0, ein dauerhaft offener
  Tab etwa 8 Ladungen am Tag.
- Regional: ab Zoom 3,6 Blöcke von 10° mit 1°-Gitter, ab 6,2 Blöcke von 5° mit 0,5°-Gitter, je höchstens 4 Blöcke pro Ansicht,
  erst nach 1,5 s Ruhe, je Block einmal in 6 h.
- Flüsse: 110 Stationen x 5 Messpunkte = 550 Orte (30 Tage), Zwischenspeicher 6 h.

`render/ocean/store.ts` hält Gitter und Blöcke (`OceanStore`, referenzgezählt), `grid.ts` fügt sie zu einem 0,5°-Gitter zusammen.

## Wetter-Ebenen: Gelände, Städte, Luftqualität

- **Geländekorrektur** (`temperatur`, `taupunkt`, `feuchte`, `gefuehlt`, Option „Geländekorrektur“): `render/gl/terrain.ts`. ΔT = 0,0065 K/m · (hsurf − Gelände),
  ±15 K, Taupunkt mit Faktor 0,31 und nie über der Temperatur. `hsurf` aus dem Wetter-Bucket (`v1/<lauf>/hsurf/…`, statisch), Geländehöhen von
  Mapterhorn (`tiles.mapterhorn.com/{z}/{x}/{y}.webp`, Terrarium-Kodierung, CORS offen). Der Bucket-Pfad `v1/static/dem/` ist
  (Stand 11.11.2026) nicht veröffentlicht (404); sobald der Daten-Job `wetter.yml` mit `dem = true` läuft, könnte er Mapterhorn ersetzen.
  Ab Zoom 5 entsteht ein Float-Raster (≤ 1024 × 768) um die Ansicht, der Shader addiert es; der Mauszeiger liest dasselbe Raster.
- **Gefühlte Temperatur**: aus T, Taupunkt, u, v im Shader (zwei gepackte Texturfelder), Formel Steadman wie im alten Orbis (`t + 0,33·e − 0,7·v − 4`).
- **Städtewetter** (`staedte`): liest die bereits geladenen ICON-Übersichten (T, Wolken, Niederschlag, u, v) an den Stadtkoordinaten (`parsers/cities.ts`),
  keine zusätzliche API. 3-Tage-Ausblick je Stadt aus denselben Feldern.
- **Luftqualität & Pollen** (`luftqualitaet`): Open-Meteo Air Quality (Copernicus CAMS), `current` mit 11 Variablen auf einem 3°-Gitter über Europa
  (24 × 14 = 336 Orte, 4 Abrufe à 100 Orte), direkt aus dem Browser (CORS offen), 3 h Zwischenspeicher in `localStorage`, gemeinsamer Tageszähler und
  Pacing mit den Ozean-Ebenen (`render/ocean/budget.ts`). Pflichtsatz: „Generated using Copernicus Atmosphere Monitoring Service information 2026“ steht in
  der Lizenzangabe der Ebene. Klassen: EEA-Grenzwerte wie bei Open-Meteo; Pollen in Körnern/m³ (nur Europa, saisonabhängig, außerhalb der Saison 0).
