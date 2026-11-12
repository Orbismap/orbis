# Orbis Map: Architektur

Orbis Map ist der Kartenbetrachter von Orbis, von Grund auf neu gebaut. Er zeigt, was auf der Erde gerade
passiert: Wetter, Gefahren, Verkehr, Infrastruktur, Umwelt. Die Daten kommen aus den Buckets von
[Orbismap/data](https://github.com/Orbismap/data), ergänzt um wenige Live-Quellen mit CORS.

Dieses Dokument ist verbindlich. Wer Code schreibt, hält sich an Ordner, Verträge und Regeln hier. Abweichungen
werden hier zuerst geändert, dann im Code.

## Leitlinien

1. **Die Karte ist das Produkt.** UI ist Instrument, nicht Dekoration.
2. **Eine Ebene = eine Datei.** Deklarativ, ohne gemeinsame Listen. Das Gerüst kennt keine einzelne Ebene.
3. **Daten sind erstklassig.** Jede Ebene nennt Quelle, Lizenz, Takt und zeigt ihr Alter an.
4. **Nichts lädt, was nicht sichtbar ist.** Ebenen werden erst beim Einschalten montiert, schwere Module per
   `import()` nachgeladen, Abrufe pausieren bei verstecktem Tab und ausgeschalteter Ebene.
5. **Der Hauptthread gehört der Interaktion.** Parsen und Dekodieren ab ~50 KB laufen im Worker.
6. **Zustand ist serialisierbar.** Ansicht, Karte, Ebenen, Zeit stehen in der URL und sind teilbar.

## Technik

| Bereich | Wahl | Grund |
|---|---|---|
| Sprache/Build | TypeScript strict, Vite, pnpm | wie Orbis, schnell |
| Karte | MapLibre GL JS 6 (Globus + Mercator) | Vektor-, Raster-, Custom-Layer mit `projectTile` |
| UI | Preact + `@preact/signals` | klein (≈5 KB), feingranulare Updates ohne Re-Render der Karte |
| Styles | reines CSS mit Tokens (`@layer`), keine Utility-Bibliothek | volle Kontrolle, kein Laufzeit-CSS |
| Kacheln | `pmtiles` für OSM-Punktdaten | Range-Requests direkt auf R2 |
| Tests | Vitest (Einheiten), Playwright-Core mit System-Chrome (Rauchtest) | Parser und Zustand sind rein und testbar |

Keine weiteren Laufzeit-Abhängigkeiten ohne Grund. `satellite.js` nur dynamisch in der Satelliten-Ebene.

## Ordner

```
src/
  main.tsx              Start: Einstellungen, URL, Karte, UI
  app/                  App-Hülle (Layout Desktop/Mobil), Startsequenz
  core/                 rein, ohne DOM-/Karten-Abhängigkeit: geo, units, format (de-DE), time, color, storage, url, scheduler
  data/                 endpoints, http, resource, manifest, worker-Pool, parsers/ (rein, getestet), owx/
  map/                  MapEngine (MapLibre-Hülle), basemaps/, slots, picking, camera, terminator
  render/               Bausteine für Ebenen: points, lines, areas, raster, pmtiles, gl/ (Feld-Renderer, Partikel, Farbskalen)
  layers/               types.ts, define.ts, registry.ts, categories.ts, runtime.ts, <kategorie>/<id>.ts
  karten/               Karten-Modell, Standardkarten, Persistenz
  state/                Signale: view, session, time, selection, ui, settings
  ui/                   Designsystem: tokens.css, base.css, Primitive, icons/
  features/             zusammengesetzte Oberfläche: karten-bar, layers-panel, catalog, timeline, legend, inspector, probe, search, settings, attribution, toasts
test/                   Rauchtest (Playwright)
docs/                   ARCHITECTURE, DESIGN, LAYERS (Ebene anlegen), DATA (Quellen)
```

Abhängigkeitsrichtung (nie rückwärts): `core` ← `data` ← `map`/`render` ← `layers` ← `state`(nur Typen von layers) ← `features` ← `app`.
`ui/` hängt nur von `core` ab. `layers/*` importieren nie aus `features/`.

## Daten (`src/data`)

### Endpunkte

```ts
// data/endpoints.ts – per .env überschreibbar (VITE_LIVE_BASE …), Standard sind die R2-Hosts
export const BASE = {
  live:   'https://orbis-live.maltee.dev/',    // Minuten-Snapshots (Erdbeben, GDACS, FIRMS, TLE …)
  data:   'https://orbis-data.maltee.dev/',    // täglich/wöchentlich (Vulkane, Kraftwerke, Kabel, Cams, Radio …)
  osm:    'https://orbis-osm.maltee.dev/',     // PMTiles (cctv, blitzer, alpr, webcam, wind, resource) + heat/
  wetter: 'https://orbis-wetter.maltee.dev/',  // ICON-Felder (OWX), v1/latest.json
  assets: 'https://orbis-assets.maltee.dev/',
} as const;
export type Bucket = keyof typeof BASE;
export const bucketUrl = (b: Bucket, key: string) => BASE[b] + key;
```

Alle Buckets liefern `Access-Control-Allow-Origin: *`. `live`, `data`, `osm` haben eine `manifest.json`
(`{ [key]: { updated, bytes, source, license } }`). `data/manifest.ts` lädt sie einmal je Bucket (Cache 5 min) und
liefert `manifestEntry(bucket, key)`, damit die Oberfläche Alter, Quelle und Lizenz je Ebene zeigen kann.

### Resource

Einziger Weg, wie Ebenen Daten laden.

```ts
export interface ResourceSpec<T> {
  key: string;                       // eindeutig, dedupliziert gleiche Abrufe
  url: string | (() => string);
  format?: 'json' | 'text' | 'arraybuffer';      // Standard json
  parse?: ParserName | ((raw: unknown) => T);    // ParserName = Funktion im Worker (data/parsers/index.ts)
  parseArgs?: unknown;
  refresh?: number;                  // ms; ohne: einmal laden
  timeout?: number;                  // Standard 20 s
  fallback?: () => Promise<T>;       // Originalquelle, wenn der Spiegel ausfällt
}
export interface Resource<T> {
  readonly data: ReadonlySignal<T | undefined>;
  readonly state: ReadonlySignal<'idle' | 'loading' | 'ready' | 'error'>;
  readonly error: ReadonlySignal<string | undefined>;
  readonly updatedAt: ReadonlySignal<number | undefined>;   // Last-Modified bzw. Ladezeit
  reload(): void;
  dispose(): void;
}
export function createResource<T>(spec: ResourceSpec<T>): Resource<T>;
```

Verhalten: referenzgezählt je `key`; lädt nur, solange mindestens ein Nutzer existiert; `refresh` pausiert bei
`document.hidden` und holt beim Zurückkehren nach, wenn fällig; bedingte Abrufe über den HTTP-Cache; Fehler
behalten die alten Daten (`state` bleibt `ready`, `error` gesetzt); Wiederholung mit Backoff (2 s, 8 s, 30 s);
`AbortController` beim `dispose`.

### Worker

`data/worker/pool.ts`: ein Pool (Größe `min(4, hardwareConcurrency − 1)`, mindestens 1), Aufruf
`runParser(name, input, args)` mit Transferables. `data/parsers/*.ts` sind reine Funktionen
(Eingabe roh → kompakte Ausgabe, bevorzugt GeoJSON mit schlanken Properties oder Typed Arrays), jede mit
Vitest-Test gegen ein kleines Fixture. `data/owx/` dekodiert das OWX-Format (siehe `DATA.md`) im Worker.

## Karte (`src/map`)

`MapEngine` kapselt MapLibre. Außerhalb von `map/` und `render/` ruft niemand MapLibre direkt auf.

```ts
// map/types.ts (Typen ohne MapLibre-Laufzeit, überall importierbar); Implementierung: map/engine.ts
export type SlotId = 'field' | 'raster' | 'areas' | 'lines' | 'points' | 'labels' | 'top';
export interface MapEngine {
  readonly ml: maplibregl.Map;                  // nur für render/-Bausteine
  ready: Promise<void>;
  setBasemap(id: BasemapId): void;              // tauscht Grundkarte, Ebenen bleiben erhalten
  setProjection(p: 'globe' | 'mercator'): void;
  setLabels(on: boolean): void;
  setTerminator(mode: 'off' | 'auto'): void;    // Tag/Nacht-Schatten
  addSource(id: string, spec: SourceSpecification): void;      // idempotent
  addLayer(spec: LayerSpecification, slot: SlotId): void;      // ordnet in den Slot ein
  addCustomLayer(layer: CustomLayerInterface, slot: SlotId): void;
  remove(ids: { layers?: string[]; sources?: string[] }): void;
  onPick(layerIds: string[], h: PickHandler): () => void;      // Klick/Hover, eine Stelle für alle Ebenen
  flyTo(target: CameraTarget): void;
  requestRender(): void;
  // Ergänzungen zum Fundament
  moveToSlotTop(layerId: string, slot: SlotId): void;   // Reihenfolge innerhalb eines Slots (runtime)
  setPadding(p: Partial<Padding>): void;                // Paneele/Sheet verdecken Kartenfläche
  getBasemap(): BasemapId;
  locate(): Promise<{ lng: number; lat: number; accuracy: number }>;   // Geolocation + flyTo
}
```

**Kameragrenzen** (`map/camera.ts`, `map/limits.ts`): `tiltLimit(zoom)` ist die einzige Neigungsgrenze: 0° bis Zoom 2, dann
`70 * smoothstep(t^0.75)` mit `t = (zoom - 2) / 10.5`, ab Zoom 12,5 der Engine-Maximalwert 70° (z3 5,5°, z5 23,7°, z8 51°).
Die Engine führt das Maximum der MapLibre-Transform bei jedem `move` nach (ohne laufende Animationen zu stoppen): Gesten,
Slider, URL, `flyTo` und `jumpTo` sind damit gleich begrenzt, eine zu steile Neigung wird beim Auszoomen mitgenommen und
kommt beim Einzoomen nicht von selbst zurück; unter 1° ist Touch-Pitch aus. Unter Zoom 5 ist die Karte nordgerichtet: eine
Drehung läuft nach Gestenende bzw. beim Auszoomen in ca. 450 ms auf 0° zurück. URL/Zustand werden beim Laden geklemmt
(`clampCamera`). `Tilt.tsx` nutzt dieselbe Funktion. Während einer Geste (Maus, Touch) darf die Neigung über `tiltLimit` und die Drehung unter Zoom 5 über Norden hinaus gezogen werden (Gummiband `rubberBand`: Überschuss exponentiell gedämpft, höchstens 3 bis 12° bzw. 30° darüber); beim Loslassen federt die Kamera in ca. 400 ms (ease-out) auf die Grenze zurück, bei `prefers-reduced-motion` sofort. Ohne Geste (Rad, Tasten, URL, `flyTo`) gelten die harten Grenzen.

**Slots** sind leere Marker-Layer im Stil, in fester Reihenfolge: `field` (Wetterfelder, unter allem) → `raster`
→ `areas` → `lines` → *Beschriftung der Grundkarte* → `points` → `labels` (eigene Beschriftung) → `top`.
Dadurch ist die Stapelreihenfolge unabhängig von der Einschalt-Reihenfolge und Beschriftungen bleiben lesbar.
Innerhalb eines Slots bestimmt die Reihenfolge der Ebenen in der Karte (Nutzer kann sortieren); `layers/runtime`
ordnet nach jedem Einschalten und jeder Umsortierung per `moveToSlotTop` neu. Technisch ist jeder Slot der Bereich
direkt *unter* seinem Marker-Layer (`slot:<name>`, `beforeId` beim Einfügen); zusätzlich gibt es die internen Marker
`terminator` (zwischen `raster` und `areas`, Tag/Nacht-Schatten) und `basemap-labels` (zwischen `lines` und `points`).
`ctx.map` ist je Ebene ein eingegrenzter Blick auf die Engine (`map/scope.ts`), der merkt, welche Layer und Quellen
die Ebene angelegt hat (für Umsortierung und Aufräumen nach fehlgeschlagenem `mount`).

**Grundkarten** (`map/basemaps/`): `orbis-dark`, `orbis-light` (eigene Stile auf OpenFreeMap-Vektorkacheln,
Farben aus den Design-Tokens, bewusst ruhig, damit Daten tragen), `satellite` (Esri World Imagery + eigene
Beschriftung), `terrain` (OpenTopoMap), `bluemarble` (NASA GIBS). Der Stil enthält *alle* Grundkarten und
Beschriftungsvarianten gleichzeitig (unsichtbar bis auf die gewählte), der Wechsel schaltet nur `visibility`. Es gibt
kein `setStyle`, daher gehen weder Quellen noch Layer, Custom-Layer oder Bilder beim Wechsel verloren.

**Picking** (`map/picking.ts`): ein einziger Klick-/Hover-Handler auf der Karte. `queryRenderedFeatures` über alle
angemeldeten Layer mit Toleranz (6 px Maus, 14 px Touch), oberstes Feature gewinnt, Cluster zoomen hinein. Kein
Treffer → Punktabfrage (`probe`).

## Render-Bausteine (`src/render`)

Ebenen bauen nie rohe MapLibre-Layer von Hand, wenn ein Baustein passt:

| Baustein | Zweck |
|---|---|
| `pointLayer` | GeoJSON-Punkte: Kreise oder Symbole, datengetriebene Größe/Farbe, optional Cluster, Hover-Zustand, Auswahlring |
| `lineLayer`, `areaLayer` | Linien/Flächen aus GeoJSON |
| `rasterLayer` | XYZ/WMTS/WMS-Kacheln, `gibsLayer` (NASA GIBS mit Datum) |
| `pmtilesLayer` | Vektor-PMTiles aus `orbis-osm` |
| `trackLayer` | bewegte Objekte (Flugzeuge, Schiffe, Satelliten): Position + Kurs, Interpolation zwischen Abrufen |
| `gl/fieldLayer` | Wetterfeld als WebGL2-Custom-Layer |
| `gl/particleLayer` | Windpartikel |

Jeder Baustein liefert ein `LayerHandle` (siehe unten) und räumt in `destroy()` alles ab. Signaturen und Optionen:
[LAYERS.md](LAYERS.md). `pmtilesLayer` fügt Quelle und Layer asynchron hinzu (die pmtiles-Bibliothek lädt bei Bedarf),
das Handle kommt trotzdem sofort zurück.

### Feld-Renderer (`render/gl/field.ts`)

- Custom-Layer mit `projectTile` aus MapLibres Shader-Prelude: ein unterteiltes Welt-Gitter in Mercator-Koordinaten,
  funktioniert in Globus, Mercator und der Überblendung.
- Daten als `TEXTURE_2D_ARRAY` (RG8, int16 in zwei Bytes, `NEAREST`), eine Schicht je Zeitschritt. Der Fragment-Shader
  rekonstruiert die Werte, interpoliert bilinear im Raum (4 Abrufe) und linear in der Zeit (2 Schichten), behandelt
  `nodata` exakt und färbt über eine 1D-LUT (256×1, aus `ColorScale`). Zeit-Scrubbing kostet damit nur ein Uniform.
- Auflösung: Überblick 0,5° weltweit sofort; ab Zoom ≥ 4 werden die 45°-Kacheln (0,125°) im Ausschnitt nachgeladen
  und im Shader bevorzugt. LRU über Kacheln (Standard 6).
- Abgeleitete Felder im Shader: Windgeschwindigkeit aus `u`,`v`; relative Feuchte aus `T`,`Td` (Magnus).
- `probe(lngLat)` liest denselben Wert auf der CPU (für Punktabfrage und Mauszeiger).

### Partikel (`render/gl/particles.ts`)

CPU-Advektion in Typed Arrays gegen das Überblicksfeld (u, v), GPU projiziert mit `projectTile`. Jede Spur ist ein
kurzer Polylinien-Schweif mit Alpha-Verlauf, kein Framebuffer-Feedback, daher stabil beim Verschieben und im Globus.
Anzahl passt sich an Fläche, Zoom und gemessene Bildrate an (Desktop bis 12 000, Mobil bis 4 000);
`prefers-reduced-motion` schaltet sie ab.

## Ebenen (`src/layers`)

```ts
export type CategoryId = 'wetter' | 'gefahren' | 'verkehr' | 'infrastruktur' | 'erde' | 'meer' | 'medien' | 'gesellschaft';
export type LayerForm = 'field' | 'raster' | 'points' | 'lines' | 'areas' | 'tracks';
export type Cadence = 'live' | 'minutes' | 'hourly' | 'daily' | 'static';

export interface SourceRef {
  name: string; url: string; license: string;
  manifest?: { bucket: Bucket; key: string };   // für die Altersanzeige
}

export type OptionSpec =
  | { id: string; label: string; type: 'range'; min: number; max: number; step: number; default: number; unit?: string }
  | { id: string; label: string; type: 'select'; choices: { value: string; label: string }[]; default: string }
  | { id: string; label: string; type: 'toggle'; default: boolean };
export type OptionValues = Record<string, number | string | boolean>;

export type LegendSpec =
  | { type: 'scale'; unit: string; stops: [value: number, color: string][]; ticks: number[]; format?: (v: number) => string }
  | { type: 'classes'; items: { color: string; label: string; shape?: 'dot' | 'line' | 'square' }[] }
  | { type: 'size'; unit: string; items: { size: number; label: string }[]; color: string };

export interface TimeSpec {
  /** Bereich relativ zu jetzt in ms, z. B. Radar [-2 h, +0.5 h], Vorhersage [0, +72 h], Erdbeben [-7 d, 0] */
  range(): { start: number; end: number; step?: number; frames?: number[] };
  /** 'frames': diskrete/interpolierte Zeitschritte; 'window': zeigt Ereignisse bis zur gewählten Zeit */
  mode: 'frames' | 'window';
}

export interface LayerStatus { state: 'loading' | 'ready' | 'empty' | 'error'; count?: number; updatedAt?: number; note?: string }

export interface InspectCard {
  title: string; subtitle?: string; time?: number; color?: string; icon?: IconName;
  facts: { label: string; value: string; emphasis?: boolean }[];
  text?: string;
  media?: { type: 'image' | 'video' | 'audio' | 'hls'; url: string; poster?: string; refresh?: number };
  links?: { label: string; url: string }[];
  location?: [lng: number, lat: number];
}

export interface FeedItem {
  id: string; title: string; subtitle?: string; time?: number; magnitude?: number; color?: string; location: [number, number];
  card?: InspectCard;   // was ein Klick auf die Feed-Zeile öffnet; die Bausteine hängen sie lazy aus `describe` an (render/common withCards)
}

export interface LayerContext {
  id: string;
  map: MapEngine;
  signal: AbortSignal;                           // abgebrochen beim Ausschalten
  opacity: ReadonlySignal<number>;               // 0..1
  options: ReadonlySignal<OptionValues>;
  time: ReadonlySignal<number>;                  // gewählte Zeit (ms); Date.now(), wenn „live“
  status(s: LayerStatus): void;
  resource<T>(spec: ResourceSpec<T>): Resource<T>;   // wird beim Ausschalten automatisch entsorgt
  feed(items: FeedItem[]): void;                 // Liste „Aktuell“ + Marken auf der Zeitleiste
  select(card: InspectCard | null): void;        // öffnet den Inspektor
  selection: ReadonlySignal<InspectCard | null>; // Karte, die der Inspektor gerade zeigt (Bausteine zeichnen daran ihren Auswahlring)
}

export interface LayerHandle {
  probe?(at: { lng: number; lat: number }): { label: string; value: string } | null;
  destroy(): void;
}

export interface LayerDef {
  id: string;                    // = Dateiname
  category: CategoryId;
  title: string;                 // „Erdbeben“
  summary: string;               // ein Satz, was man sieht
  icon: IconName;
  color: string;                 // Leitfarbe der Ebene in Liste und Karte
  form: LayerForm;
  cadence: Cadence;
  coverage?: string;             // 'Welt' (Standard), 'Europa', 'DE', 'USA' …
  sources: SourceRef[];
  exclusive?: 'field';           // höchstens eine Feld-Ebene gleichzeitig
  time?: TimeSpec;
  minZoom?: number;              // darunter Hinweis „näher heranzoomen“
  options?: OptionSpec[];
  legend?: LegendSpec | ((o: OptionValues) => LegendSpec);
  keywords?: string[];           // für die Suche
  mount(ctx: LayerContext): LayerHandle | Promise<LayerHandle>;
}
export const defineLayer = (d: LayerDef): LayerDef => d;
```

Regeln für Ebenen-Dateien:

- Pfad `src/layers/<kategorie>/<id>.ts`, `export default defineLayer({...})`. `registry.ts` sammelt per
  `import.meta.glob('./*/*.ts', { eager: true })` und prüft `id === Dateiname`.
- Keine schweren statischen Importe (WebGL, satellite.js, pmtiles): in `mount` per `await import(...)`.
- Reaktivität über `effect()` auf `ctx.opacity`, `ctx.options`, `ctx.time`; die Bausteine übernehmen das meist.
- Kein Modulzustand. Alles hängt am `LayerHandle`.
- Beschriftung, Einheiten, Datum immer über `core/format` und `core/units` (Einstellungen des Nutzers).

`layers/runtime.ts` verbindet Zustand und Karte: beobachtet die aktive Karte, montiert/demontiert Ebenen, reicht
Deckkraft/Optionen/Zeit als Signale durch, sammelt Status, Feeds und Legenden in `state/session`.

## Schlüssel („Boost“) und Inhaltshinweise

Quellen, die einen eigenen kostenlosen Schlüssel des Nutzers brauchen oder damit besser werden, hängen an einer **Schlüsseldefinition**
`src/keys/defs/<id>.ts` (`defineKey`, `id` = Dateiname, gesammelt per `import.meta.glob`, Registry wie bei Ebenen):

```ts
export interface KeyDef {
  id: string; name: string;
  group: 'verkehr' | 'kameras' | 'wetter' | 'karte' | 'dienste';
  unlocks: string;            // ein Satz: was der Nutzer gewinnt
  url: string; steps: string[];   // Anbieterseite, nummerierte Anleitung (ohne Nummern)
  placeholder?: string; validate?: (v: string) => boolean; kind?: 'key' | 'url';
}
```

- Speicher: `settings.keys` (localStorage, nur in diesem Browser). Nie in der URL (`currentUrlState` kennt sie nicht), nie im Log.
  API: `keySignal(id)`, `setKey(id, value | undefined)`, `hasKey(id)` aus `src/keys`.
- Ebene: `LayerDef.keys?: { id, required }[]` (`required`: ohne Schlüssel keine Funktion; sonst „Boost“) und
  `LayerDef.sensitive?: { title, text }` (Inhaltshinweis). Im Mount: `ctx.key(id)` (reaktives Signal).
- Runtime: fehlt ein Pflicht-Schlüssel, wird die Ebene nicht montiert; Status `{ state: 'empty', note: 'Schlüssel nötig', needsKey: id }`.
  Wird der Schlüssel gesetzt, montiert sie ohne Neuladen (und umgekehrt). Sensitive Ebenen und Karten (`Karte.sensitive`) werden
  erst nach Bestätigung montiert (`settings.confirmedWarnings`: `layer:<id>` / `karte:<id>`); Status bis dahin `needsConfirm: true`.
- Oberfläche: Einstellungen > „Boost“ (Schlüssel gruppiert, Anleitung, Eingabe), Hinweis-Dialog beim ersten Anzeigen, Katalog-Chips
  „mit Schlüssel“ / „Boost möglich“, Zeilenaktion „Schlüssel eintragen“. Suchbegriffe „Schlüssel“ und „Boost“ finden diese Ebenen.

## Karten (`src/karten`)

Eine **Karte** ist eine gespeicherte Zusammenstellung: Grundkarte, Projektion, geordnete Ebenen mit Deckkraft und
Optionen, optional eine Startansicht. Standardkarten: *Wetter*, *Gefahren*, *Verkehr*, *Infrastruktur*,
*Erde & Meer*. Nutzer ändern jede Karte frei (Änderung = Entwurf je Karte, „Zurücksetzen“ stellt den Standard her)
und speichern eigene.

```ts
export interface KarteLayer { id: string; visible: boolean; opacity: number; options?: OptionValues }
export interface Karte {
  id: string; name: string; icon: IconName; color: string; builtin?: boolean;
  basemap: BasemapId; labels: boolean; terminator: boolean;
  layers: KarteLayer[];             // Reihenfolge = Stapel innerhalb der Slots, oberste zuerst
  view?: { center: [number, number]; zoom: number };
}
```

### Karten: Ansichten und eigene Karten

`karten/changes.ts` ist rein: `structuralSignature(karte, standard)`, `isModified`, `discardModifications`. Das „Universum“ einer Standardkarte sind ihre Standardebenen plus alle Ebenen ihrer Themen. Der Entwurf (`drafts[id]`) einer Standardkarte ist der still gemerkte Stand; `isDirty(id)` ist nur wahr, wenn er sich strukturell unterscheidet. Eigene Karten werden an Ort und Stelle geändert und sofort persistiert. Migration beim Laden (`validatePersisted`): Entwurf einer eigenen Karte wird ihr Stand, Entwürfe unbekannter Karten entfallen, Entwürfe von Standardkarten bleiben ganz (Umbau wird daraus erkannt). UI: `features/karten-bar/actions.tsx` (`KartenPopover`, `KartenChangeRow`), gemeinsam für Desktop und Mobil.

## Zustand (`src/state`)

Signale, keine Klassen. Module: `view` (Mitte, Zoom, Peilung, Neigung, Projektion), `session` (Karten, aktive
Karte, Ebenen-Status, Legenden, Feeds), `time` (gewählte Zeit, `live`-Flag, Abspielen, Bereich = Vereinigung der
`TimeSpec` aller sichtbaren Ebenen), `selection` (Inspektor-Karte, Punktabfrage), `ui` (Paneele, Sheet-Stufe,
Breakpoint), `settings` (Einheiten, Thema, Bewegung, Schlüssel).

- `state/time` kennt `layers/` nicht: `layers/runtime` schreibt die `TimeSpec` der sichtbaren Ebenen in
  `timeSources`, `range` ist deren Vereinigung (Standard ohne Ebenen: −24 h … +72 h).
- Signale, die von Ebenen aus Effekten heraus geschrieben werden (`setLayerStatus` …), lesen intern mit `peek()`,
  sonst entstünde ein Zyklus.
- Persistenz: `core/storage` (localStorage, versioniert, jede geladene Struktur wird validiert).
- URL: `#/@<lat>,<lng>,<zoom>z[,<bearing>b][,<pitch>p]?k=<karte>&l=<id>,<id>…&t=<iso>&g=1` – `core/url` liest beim
  Start und schreibt gedrosselt (`replaceState`, `state/url-sync.ts`). `t` entfällt im Live-Modus, `g=1` Globus,
  `g=0` Mercator.

### Ergänzungen des Fundaments

- Einheiten: Basiseinheiten aller Werte in der App sind °C, km/h, hPa, mm, km (`core/units`); umgerechnet wird erst
  bei der Anzeige. Farbskalen (`core/color`) stehen in diesen Basiseinheiten.
- `Resource` mit benanntem Parser: die Rohdaten gehen als `ArrayBuffer` in den Worker, dort wird JSON dekodiert und
  geparst; Parser dürfen `async` sein, Typed Arrays im Ergebnis werden transferiert.
- Basiskarten-Ebenen-Ids beginnen mit `bm-`, Beschriftungen mit `lbl-`, Slot-Marker mit `slot:`, Terminator mit
  `terminator-`. Ebenen-Layer heißen `<ebenen-id>[.<name>]-<suffix>`, Quellen `<ebenen-id>[.<name>]-src`.
- Custom-Layer: MapLibre ruft `onRemove` beim Entfernen; dieselbe Instanz kann erneut `onAdd` bekommen, GL-Zustand
  also immer in `onAdd` aufbauen.
- Typen: `layers/types.ts` (Ebenen), `map/types.ts` (Engine, Slots, Kamera), `karten/types.ts` (Karte).

## Leistung

- Startbudget: erstes Bild der Karte < 1,5 s (Kabel), JS initial < 180 KB gzip ohne MapLibre. MapLibre und
  Feld-Renderer liegen in eigenen Chunks.
- GeoJSON-Quellen über 5 000 Punkte: Cluster oder `pmtiles`. Properties auf das beschränken, was Stil und
  Inspektor brauchen.
- Bewegte Ebenen aktualisieren Quellen höchstens mit 10 Hz (Interpolation im Baustein), nie pro Frame `setData`
  mit großen Sammlungen.
- Kein Layout-Thrashing: UI liest Kartenwerte aus Signalen, die `map/` gedrosselt setzt.
- `content-visibility`, virtuelle Listen ab 200 Einträgen (Katalog, Feed).

## Qualität

`pnpm typecheck`, `pnpm test`, `pnpm build` müssen grün sein. `pnpm smoke` startet die gebaute App im Headless-Chrome
und prüft: Karte lädt, keine Konsolenfehler, jede Standardkarte schaltet, jede Ebene montiert ohne Ausnahme.

### Ergänzungen der Integrationsrunde

- **Thema und Grundkarte**: Standard-Thema ist `dark`; `auto` ist eine ausdrückliche Wahl (`state/settings.effectiveTheme`).
  `layers/runtime.basemapForTheme` tauscht `orbis-dark` ↔ `orbis-light` passend zum Thema, Bildkarten bleiben.
- **Punktabfrage**: `layers/runtime.probeAt(lng, lat)` ruft `LayerHandle.probe` aller montierten Ebenen auf (sync, billig);
  `probe` darf zusätzlich `numeric` (Basiseinheit) liefern, die Legende zeichnet daraus ihre Marke.
- **Terminator**: ein eigener WebGL-Layer (`map/terminator.ts`) berechnet die Sonnenhöhe je Pixel und blendet von +2° bis −14°
  weich aus: keine Polygone, keine Stufen, Globus und Mercator gleich.
- **Auswahlring**: `LayerContext.ownSelection(card)` ist wahr für Karten, die die Ebene selbst per `select` gesetzt hat
  (auch spätere Aktualisierungen derselben Karte); die Bausteine behalten dann ihren Ring.
- **Wetterfelder, Speicher**: Mobil (`isMobile` oder `deviceMemory <= 4`) höchstens 2 Kacheln, CPU-Kopie einer Kachel wird nach
  dem GPU-Upload verworfen (Probe fällt auf die Übersicht zurück); Wind dann ≈ 52 MB GPU + 26 MB CPU statt 156 MB.
  `latest.json` wird alle 10 min geprüft (`render/gl/latest.followLatest`), ein neuer Lauf lädt im Hintergrund und ersetzt den
  alten, sobald seine Übersicht da ist.
- **Rasterbilder** (`rasterFrames`): fallen die Kacheln einer Quelle mehrfach aus, meldet die Ebene `error` mit einer deutschen Notiz.
  `map/clean-raster-protocol.ts` (`orbis-clean://`) entfernt die Dekoration des DWD-Standardstils (graue Fläche, magentafarbener Rand).
- **Icons**: zusätzlich `rocket`, `satellite`, `balloon`, `turbine`, `mast`. `trackLayer` kennt `stroke`.
