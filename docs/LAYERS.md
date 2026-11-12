# Ebene anlegen

Eine Ebene ist eine Datei: `src/layers/<kategorie>/<id>.ts` mit `export default defineLayer({...})`. Die Registry
(`layers/registry.ts`) findet sie per `import.meta.glob` und prüft, dass `id` dem Dateinamen entspricht. Es gibt keine
Liste, in die man die Ebene eintragen müsste. Vorgaben: [ARCHITECTURE.md](ARCHITECTURE.md).

Schritte:

1. Datei anlegen, `defineLayer` mit Metadaten (`category`, `title`, `summary`, `icon`, `color`, `form`, `cadence`,
   `sources`, optional `options`, `legend`, `time`, `keywords`).
2. In `mount(ctx)` Daten über `ctx.resource(...)` laden und mit einem Baustein aus `src/render` auf die Karte bringen.
   Der Baustein liefert das `LayerHandle`.
3. Schwere Module (WebGL, `satellite.js`, `pmtiles`) per `await import(...)` in `mount`.
4. Parser nötig? Reine Funktion in `src/data/parsers/<name>.ts`, eine Zeile in `parsers/index.ts`, Vitest-Test mit kleinem
   Fixture.
5. Soll die Ebene in einer Standardkarte erscheinen: `id` in `src/karten/standard.ts` ergänzen (unbekannte Ids werden
   beim Laden verworfen).
6. `pnpm typecheck && pnpm test`.

Texte: Titel nach dem, was man sieht („Erdbeben“), Zusammenfassung ein Satz ohne Punkt. Zahlen, Daten und Einheiten
immer über `core/format` und `core/units`.

## Beispiel 1: Punkte aus zwei Quellen (`gefahren/erdbeben.ts`)

- Zwei `ctx.resource`: USGS weltweit (Parser `usgsQuakes`, Rückfall auf die Originaladresse) und EMSC Europa
  (`emscQuakes`), Abruf alle 5 min.
- Ein `computed` führt beide mit `mergeQuakes` zusammen und filtert nach Option `minMag` und gewählter Zeit
  (`ctx.time`, Modus `window`). Karte, Feed und Zähler sehen so dieselbe Menge.
- `pointLayer` mit Radius nach Magnitude (Zoom-Kurve), Farbe nach Alter (Signal, hängt an `ctx.time`),
  `describe` für die Inspektor-Karte, `feed` für die Liste „Aktuell“.
- `resources: [usgs, emsc]` sorgt dafür, dass Status, Fehler und Alter der Ebenenzeile stimmen, obwohl `data` ein
  `computed` ist.

## Beispiel 2: Raster (`erde/nachtlichter.ts`)

```ts
mount: (ctx) => gibsLayer(ctx, { layer: 'VIIRS_Black_Marble', format: 'png', matrixSet: 'GoogleMapsCompatible_Level8', date: '2016-01-01' })
```

## Beispiel 3: Linien aus dem Daten-Bucket (`infrastruktur/seekabel.ts`)

`ctx.resource({ key, url: bucketUrl('data', 'osm-cables/cables.json'), parse: 'cableLines' })` (730 KB, wird im Worker
geparst) und `lineLayer` mit Farbe aus der Property `color`, Zoom-abhängiger Breite, Kontur (`casing`) und `describe`.

## Bausteine (`src/render`)

Gemeinsam: Jeder Baustein hat `(ctx: LayerContext, opts) => LayerHandle`, setzt `ctx.status` selbst (Laden, Anzahl,
Alter, Fehler), reagiert auf `ctx.opacity` und räumt in `destroy()` Layer, Quellen und Klick-Handler ab. Optionen, die
als `Dyn<T>` markiert sind, dürfen auch ein `ReadonlySignal<T>` sein und werden bei Änderung neu gesetzt. Features
brauchen `properties.id` (Hover, Auswahl); fehlt es, ergänzt der Baustein es.

| Baustein | Optionen (Auswahl) |
|---|---|
| `pointLayer(ctx, o)` | `data: Resource<FC> \| ReadonlySignal<FC \| undefined>`, `resources?`, `slot?` (`points`), `name?`, `idKey?`, `cluster?: boolean \| {radius, maxZoom}`, `radius: Dyn<number \| Expr>`, `color: Dyn<string \| Expr>`, `stroke?: {color, width}`, `symbol?: {icon, size, rotate?}`, `sortKey?`, `filter?: ReadonlySignal<FilterSpecification \| undefined>`, `describe(feature) → InspectCard`, `feed?(features) → FeedItem[]`, `minZoom?`, `count?` |
| `lineLayer(ctx, o)` | `data`, `resources?`, `slot?` (`lines`), `name?`, `idKey?`, `color: Dyn`, `width: Dyn<number \| Expr>`, `dash?`, `casing?: boolean \| {color, extra}`, `opacity?`, `filter?`, `describe?`, `feed?`, `minZoom?`, `count?` |
| `areaLayer(ctx, o)` | `data`, `resources?`, `slot?` (`areas`), `name?`, `idKey?`, `fill: Dyn`, `fillOpacity?`, `outline?: false \| {color, width}`, `filter?`, `describe?`, `feed?`, `minZoom?`, `count?` |
| `rasterLayer(ctx, o)` | `tiles?: Dyn<string[]>` oder `wms?: {url, layers, version?, format?, styles?, params?: Dyn<Record>}`, `tileSize?`, `minzoom?`, `maxzoom?`, `bounds?`, `attribution` (Pflicht), `slot?` (`raster`), `name?`, `paint?: {brightness, contrast, saturation, hueRotate, resampling}`, `updatedAt?` |
| `radarLayer(ctx, o)` | WebGL-Radar (`render/gl/radarLayer.ts`): `frames: ReadonlySignal<{time, url}[]>` (URL-Vorlage `{z}/{x}/{y}` der RainViewer-PNG-Kacheln, Farbschema 2), `attribution` (Pflicht), `maxzoom`, `maxGap?` (20 min), `sourceName?`, `failure?`, `name?`. Liest die Kachelfarben im Worker in Regenraten (mm/h) zurück, schätzt je Kachel die Verschiebung zwischen zwei Zeitschritten, mischt im Shader und färbt danach nach einer Skala (`radar-values.ts`); Globus und Mercator, `probe` liefert mm/h |
| `gibsLayer(ctx, o)` | `layer`, `format: 'png' \| 'jpg'`, `matrixSet` (z. B. `GoogleMapsCompatible_Level8`, bestimmt Maximalzoom), `date?: 'yesterday' \| 'YYYY-MM-DD' \| ReadonlySignal<string>` (ohne: Layer ohne Zeitdimension), `product?`, `attribution?`, `slot?`, `name?` |
| `pmtilesLayer(ctx, o)` | `url`, `sourceLayer`, `slot?`, `name?`, `idKey?`, `radius`, `color`, `stroke?`, `symbol?`, `sortKey?`, `filter?`, `describe`, `minZoom?`, `maxZoom?`, `attribution?` |
| `trackLayer(ctx, o)` | `data: Resource<TrackObject[]> \| ReadonlySignal<TrackObject[] \| undefined>` mit `TrackObject = {id, lng, lat, heading?, speed? (m/s), t, props?}`, `resources?`, `symbol: {icon, size, rotate?}`, `color: Dyn`, `ringRadius?`, `maxExtrapolateMs?` (2 min), `tickMs?` (100), `filter?`, `describe(track, now)`, `feed?(tracks)`, `minZoom?`, `count?` |
| `cameraLayer(ctx, o)` | `color` (einzige Farbe), `detail: CameraSource \| CameraSource[]`, `overview?: CameraSource`, `count?`, `resources?` (hart: Fehler/Laden), `softResources?` (nur Anzahl/Alter), `slot?`; `CameraSource = {name, data: {kind:'pmtiles', url, sourceLayer, attribution?} \| {kind:'geojson', data}, minZoom?, describe?, idKey?, dirKey?}` |

### Kamera-Ebenen (`render/cameras.ts`)

Alle Kamera-Ebenen (`webcams`, `ueberwachung`, `kennzeichen`, `blitzer`) nutzen `cameraLayer` und sehen gleich aus,
nur `color` unterscheidet sich (Webcams `#19C7B0`, Überwachung `#B388FF`, Kennzeichen `#FF5D5D`, Blitzer `#FFB020`):

- Punkte ab der Weltansicht (Radius `CAMERA_RADIUS`: 1,4 px bei Zoom 0, 3,8 px bei 9, 6,2 px bei 12), dunkler Rand, Hover ×1,3 mit weißem
  Rand, Auswahlring; ab Zoom 12 (`CAMERA_DETAIL_ZOOM`) Kamera-Symbol im Punkt und, wenn das Feld `dirKey` (Standard `dir`, Grad ab Nord)
  vorhanden ist, ein Blickkegel (Icon `fov`). Keine Heatmap, keine Cluster, kein `minZoom`-Hinweis.
- `detail`: Quellen mit Karte (`describe`), in Zeichenreihenfolge. `overview`: dekorative Positionen (kein Hover, keine Karte, kein Symbol),
  liegt darunter (Webcams: `cams/world.json`). Eine Quelle mit `minZoom` (z. B. Feeds ab 5) übernimmt die Details, der Überblick bleibt darunter.
- Karten: Hilfsfunktionen `directionFact(dir)` ("Blickrichtung") und `osmNodeLink(id)`; Reihenfolge der Fakten: Objektmerkmale,
  Blickrichtung, Betreiber, Kennung; Icon `camera` und Farbe setzt der Baustein.
- Status: `count` (undefined = unbekannt) und `resources`/`softResources`. `osmSetCount(ctx, 'cctv')` liefert die Anzahl aus
  `osm/meta.json` (1,4 KB, `sets.<name>.features`).
- Die PMTiles `cctv`, `alpr`, `blitzer`, `webcam` enthalten ab Zoom 0 ausgedünnte Kacheln (cctv 73.899 von 438.165 Objekten bei z0,
  alpr 66.347 von 157.243, blitzer und webcam alle); die Weltansicht lädt deshalb nur die Kacheln z0/z1 (je ca. 1-3 MB).
- Neue Kamera-Art (z. B. mobile Blitzer, Richtungen aus anderen Feeds): weitere `CameraSource` in `detail`, nichts im Baustein ändern.

Hinweise:

- `Expr` ist ein MapLibre-Ausdruck. Hover vergrößert Kreise um 30 % (Linien um 60 %); bei Symbolen färbt sich der Rand
  weiß, weil `icon-size` kein Feature-State kennt.
- `cluster` wirkt nur auf `pointLayer`. Der Filter gilt nicht für Cluster.
- Icons für `symbol.icon`: `dot`, `triangle`, `arrow`, `plane`, `ship`, `diamond`, `square`, `star`, `bolt`, `flame`,
  `volcano`, `tower`, `camera`, `rocket`, `satellite`, `balloon`, `turbine`, `mast` (`render/icons.ts`, SDF, Größe 1 = 32 px, Farbe per `icon-color`).
- Feld-Renderer und Partikel (`render/gl`) kommen von einem anderen Agenten.
- Eigene Layer ohne Baustein: `ctx.map.addSource`, `ctx.map.addLayer(spec, slot)`, in `destroy()` `ctx.map.remove(...)`.
  Klicks über `ctx.map.onPick([layerIds], { click, hover })`.

## Zeit

`time: { mode: 'window', range: () => ({ start: -7 * DAY, end: 0 }) }` (relativ zu jetzt). `ctx.time` ist die gewählte
Zeit, im Live-Modus `Date.now()` mit 30-s-Takt. `window`: Ereignisse bis zur gewählten Zeit zeigen. `frames`: Zeitschritte
(`frames: [offsets]` oder `step`).

## Optionen und Legende

`options: [{ id: 'minMag', type: 'range', ... }]`, gelesen über `ctx.options.value.minMag`. `legend` ist eine feste
`LegendSpec` oder eine Funktion der Optionen; die Runtime schreibt sie nach `state/session`.

## Feed, Punktabfrage, Auswahl

- `feed` der Bausteine liefert `FeedItem`s; die Bausteine ergänzen `card` lazy aus `describe` (Item-`id` = `properties.id`
  bzw. Track-`id`), ein Klick in der Liste „Aktuell“ öffnet so die echte Karte der Ebene.
- `LayerHandle.probe(at)` darf `numeric` (Basiseinheit) mitliefern. `layers/runtime.probeAt(lng, lat)` sammelt alle Werte.
- Aktualisiert eine Ebene ihre Karte per `ctx.select(card)` (z. B. Gezeitenkurve, Zugposition), bleibt der Auswahlring stehen
  (`ctx.ownSelection`).

## Schlüssel und Inhaltshinweise

Neuen Schlüssel anlegen: eine Datei `src/keys/defs/<id>.ts` (id = Dateiname), `export default defineKey({ id, name, group, unlocks, url, steps, placeholder?, validate? })`.
`unlocks` ist ein Satz („Schiffe weltweit statt nur Ostsee“), `steps` die Anleitung in Sätzen ohne Nummern. Keine weitere Liste.

Ebene daran hängen:

```ts
export default defineLayer({
  id: 'schiffe', /* … */
  keys: [{ id: 'aisstream', required: true }],      // required: false = „Boost“, die Ebene läuft auch ohne
  sensitive: { title: 'Hinweis', text: 'Die Ebene zeigt Kameras an öffentlichen Orten.' }, // optional, einmal bestätigen
  mount(ctx) {
    const key = ctx.key('aisstream');                // ReadonlySignal<string | undefined>, reaktiv
    // bei required: true läuft mount nur mit Schlüssel; bei optional: key.value prüfen und die bessere Quelle wählen
  },
});
```

Fehlt ein Pflicht-Schlüssel, ruft die Runtime `mount` nicht auf; die Oberfläche zeigt „Schlüssel nötig“. Schlüssel nie loggen und nie in
Abruf-URLs von Spiegeln oder Fehlermeldungen schreiben. Standardkarten können `sensitive` ebenfalls tragen (`karten/standard.ts`).
