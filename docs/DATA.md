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
