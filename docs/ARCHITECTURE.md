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
  ext/                  Erweiterungs-Schnittstelle (types, channels, licence, loader), kein three.js
  pro/                  Orbis Pro (3D), optional, eigener Chunk, siehe „Erweiterungen und Orbis Pro“
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
  setPadding(p: Partial<Padding>): void;                // Padding bleibt 0; Paneele/Sheet liegen über der Karte, die Karte verschiebt sich nie
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
Farben aus den Design-Tokens, bewusst ruhig, damit Daten tragen; ab Zoom 13.5 2,5D-Gebäude als `fill-extrusion` mit `fill-extrusion-rounded-corner-distance` (Layout, ab maplibre-gl 6.2) aus Quelllayer `building`, `render_height`/`render_min_height`), `satellite` (Esri World Imagery + eigene
Beschriftung), `terrain` (OpenTopoMap), `bluemarble` (NASA GIBS), dazu `orbis-karte` (Erkunden) und `orbis-fahren` (Fahren, Look wie `orbis-dark`) als eigene Karten der Modi – sie stehen nicht in der Daten-Liste. Der Stil enthält *alle* Grundkarten und
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
export type CategoryId = 'wetter' | 'gefahren' | 'verkehr' | 'infrastruktur' | 'wasser' | 'erde' | 'meer' | 'medien' | 'gesellschaft';
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
*Erde & Meer*. Standardkarten sind ein fester Katalog (kein Speichern, keine andere Grundkarte); Nutzer legen eigene
Karten an. Was auf der Karte liegt, ist allein die Liste der aktiven Ebenen (`karten/active.ts`).

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

`karten/active.ts` hält die Wahrheit: `activeIds` (geordnete Liste der aktiven Ebenen, obenauf zuerst; localStorage `active-layers`, Link `l=`) und `layerPrefs` (Deckkraft/Optionen je Ebene, nur lokal). Die gezeigte Karte (`activeKarte`) wird abgeleitet: die Standardkarte, deren „Universum“ (Standardebenen plus alle Ebenen ihrer Themen) die meisten aktiven Ebenen enthält (bei Gleichstand die geöffnete); liegt eine aktive Ebene in keiner Standardkarte, ist es die ungespeicherte Karte (`scratch`, „Als Karte sichern“ legt daraus eine eigene an). `browsedKarte` ist die im Menü geöffnete Karte (Standardkarte = Katalog mit Schaltern, nicht bearbeitbar); Grundkarte, Ortsnamen und Tag-Nacht-Linie gelten für Standard- und ungespeicherte Karte nur für die Sitzung. Nur eine geöffnete eigene Karte hat ihre eigene Ebenenliste (an Ort und Stelle geändert, sofort persistiert; `activeIds` spiegelt sie). UI: `features/karten-bar/actions.tsx` (`KartenPopover`, `KartenChangeRow` für die ungespeicherte Karte), gemeinsam für Desktop und Mobil. Im Modus Erkunden laufen die Ebenen `baeume` und `strassenmarkierungen` als Hintergrundebenen mit (wie die POIs der Grundkarte): `layers/runtime` mountet sie zusätzlich, ohne sie in die aktiven Ebenen oder in `l=` zu schreiben. Der Link kennt `l=` und `b=` (gezeigte Grundkarte); `k=` aus alten Links wird noch gelesen. Der Kartenmodus (Daten/Erkunden/Fahren/Satellit) ist nicht im Link, wird beim Laden aber aus `b=` abgeleitet: `orbis-karte` → Erkunden, `orbis-fahren` → Fahren, Luftbilder → Satellit, alle anderen → Daten. Weicht `b=` nicht von der Grundkarte der Karte ab, bleibt sie deren Standard und folgt weiteren Ebenenwechseln.

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
- URL: `#/@<lat>,<lng>,<zoom>z[,<bearing>b][,<pitch>p]?k=<karte>&l=<id>,<id>…&b=<basemap>&t=<iso>&g=1` –
  `core/url` liest beim Start und schreibt gedrosselt (`replaceState`, `state/url-sync.ts`). `b=` ist die gezeigte
  Grundkarte und wird beim Laden wiederhergestellt; der Picker-Modus steht nicht im Link, ergibt sich aber aus `b=`. `t` entfällt im Live-Modus,
  `g=1` Globus, `g=0` Mercator. `f=flug:<hex>` / `f=schiff:<mmsi>`: das
  verfolgte Flugzeug oder Schiff (Orbis Pro, Follow-Kamera). Die
  Erweiterung meldet es über `host.follow.report`, die URL fragt es über `host.follow.wanted` an; beim Laden wartet die
  Erweiterung bis zu 90 s, bis das Objekt in den Daten ist, wählt es dann aus und folgt ihm.

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

## Erweiterungen und Orbis Pro

Die Basis-App ist vollständig und läuft ohne Erweiterung. **Orbis Pro** ist die erste: eine 3D-Darstellung für
ausgewählte Ebenen (Flugzeuge und Schiffe). Pro liegt in `src/pro/`, wird nur bei eingeschaltetem Pro nachgeladen und kennt die
Basis ausschließlich über eine schmale Schnittstelle. Der Ordner kann später ohne Umbau in ein eigenes Repo wandern.

### Was die Basis garantiert

- **Pro ist optional im Build.** `src/ext/loader.ts` lädt per `import.meta.glob('../pro/index.ts')` (lazy). Ohne `src/pro`
  ist der Glob leer: Build und App laufen unverändert, `proAvailable` ist falsch, die Einstellungen zeigen keinen Schalter.
  Mit dem Ordner landet three.js samt allem Pro-Code in **einem** eigenen Chunk (`pro-*.js`), der erst lädt, wenn Pro
  einschaltet wird. Er steckt nicht im Start-Bundle.
- **Kein statischer Import von Pro.** Außerhalb von `src/pro` importiert nichts aus `/pro/`, außer dem Glob im Loader, und
  nichts importiert `three`. `src/ext/ext.test.ts` prüft beides per Textsuche über `src`. Derselbe Test sorgt dafür, dass
  `src/pro` selbst nur sich, Pakete und die Typen aus `ext/types` (nur `import type`) importiert: nur so bleibt der Ordner
  verschiebbar.
- **Freischaltung an einer Stelle.** `ext/licence.ts` exportiert `proEnabled` (Signal). Heute ist es nur der lokale Schalter
  `settings.pro` („Einstellungen → Orbis Pro“); dort kommt später die Prüfung von Konto/Lizenz hin. Niemand liest
  `settings.pro` direkt.
- **Lebenszyklus.** `startExtensions()` (einmal in `main.tsx`) startet die Erweiterung, sobald `proEnabled` wahr ist und eine
  Karte existiert, und ruft deren Aufräumfunktion bei Pro aus (oder wenn die Karte verschwindet). Ein-/Ausschalten ist
  beliebig oft möglich; nach dem Ausschalten ist die 2D-Darstellung sofort zurück und kein Layer, Listener oder Timer bleibt.
- **Daten bleiben der Basis.** Eine Ebene lädt, pollt, filtert und beschreibt ihre Objekte weiter selbst. Die Erweiterung
  bekommt nur eine Sicht darauf, nie die Ebene.

### Vertrag (`src/ext/types.ts`)

```ts
interface OrbisExtension { id: string; start(host: ExtensionHost): () => void }   // Rückgabe: stoppt und räumt auf
interface ExtensionHost {
  map: MlMap;                                   // MapLibre (nur Typ aus dem Paket)
  addCustomLayer(layer, slot: 'points' | 'labels' | 'top'): void;   removeLayer(id): void;
  projection: ReadonlySignal<'globe' | 'mercator'>;
  tracks: TracksChannel;                        // Kanal für bewegte Objekte: Flugzeuge (TrackSample)
  ships: TracksChannel<ShipSample>;             // dasselbe für Schiffe
  power: TracksChannel<PowerGridSample>;        // dasselbe für Strommasten und Freileitungen (Stromnetz)
  trees: TracksChannel<TreeSample>;             // dasselbe für Einzelbäume (Bäume)
  windTurbines: TracksChannel<WindTurbineSample>; // dasselbe für einzelne Windräder (Kraftwerke)
  balloons: TracksChannel<BalloonSample>;       // dasselbe für Wetterballons
  tilesets: TracksChannel<TilesetSample>;       // gestreamte 3D-Stadtmodelle (3D Tiles), Quelle `features/buildings3d/tiles-source.ts`
  reportTilesets(state: TilesetsState): void;   // Laden/Fehler der Tilesets zurück an die Ebene
  reducedMotion(): boolean;
}
```

Diese Datei ist das Einzige, was eine Erweiterung aus der Basis importieren darf, und nur als Typ. Sie ist bewusst klein
und dokumentiert: beim Umzug in ein eigenes Repo wird sie kopiert oder als Typenpaket veröffentlicht. Neue Fähigkeiten
kommen als neue Felder am Host oder als neuer Kanal dazu, nie als Import von Basis-Internem.

### Kanäle (`src/ext/channels.ts`)

Neutrale Datenkanäle: Basis-Ebenen **veröffentlichen**, was eine Erweiterung anders darstellen darf, Erweiterungen **hören zu**.
Heute gibt es zwei, gleich gebaut (`createTracksChannel<T>()`, `TracksChannel<T>`): `tracksChannel` (Ebene `flugzeuge`, `TrackSample`) und `shipsChannel` (Ebene `schiffe`, `ShipSample`). Die Tabelle gilt für beide:

| Seite | Was |
|---|---|
| Ebene → Kanal | `publish(build)`: aktuelle `TrackSample[]` (id, lng, lat, Höhe m, Kurs, Geschwindigkeit, Steigrate, Boden, Hubschrauber, Kategorie, Notfall, Militär, Farbe des 2D-Symbols (`aircraftColor`, eine Quelle für Karte, Legende und 3D), Rufzeichen, Zeit der Meldung), gefiltert wie die 2D-Symbole (nur die Detailansicht ab Zoom 5). `build` läuft nur, wenn jemand zuhört: **ohne Zuhörer kostet Veröffentlichen eine Zuweisung.** |
| Ebene → Kanal | `setSelectedId`, `onSelect(handler)`: welche Karte die Ebene gerade zeigt, und wie ein `select(id)` der Erweiterung ihre echte Karte (Route, Foto) öffnet |
| Ebene ← Kanal | `presented`: wahr, solange eine Erweiterung die Darstellung übernommen hat. `trackLayer` (Option `hidden`) blendet dann Symbole und Ring aus; Daten, Polling, Status und Feed laufen weiter |
| Ebene ← Kanal | `actionsFor(id)`, `actionsVersion`: Schaltflächen, die Erweiterungen zur Karte beisteuern; die Ebene baut ihre Karte bei jeder Änderung neu (`InspectCard.actions`, der Inspektor zeigt sie als normale Schaltflächen) |
| Erweiterung | `subscribe(fn)` (bekommt sofort die letzte Liste), `selectedId`, `select(id)`, `present()` (Rückgabe: gibt die Darstellung zurück; Aufrufe zählen, 2D kommt zurück, wenn der letzte losgelassen hat), `contributeActions(provider)` |

Beim Abschalten der Ebene sendet `reset()` eine leere Liste und vergisst die Auswahl.

`ShipSample` (Ebene `schiffe`): MMSI als `id`, Position, Kurs über Grund und wahre Peilung (je `undefined`, wenn AIS „nicht verfügbar“ meldet), Geschwindigkeit m/s, `moving` (ab 0,5 kn), Klasse (`cls`) samt Klassenfarbe (`SHIP_CLASSES`, eine Quelle für Symbol, Legende und 3D), Name oder `MMSI …`, Länge und Breite aus den AIS-Stammdaten (wenn bekannt) und Zeit der Meldung. Gefiltert wie die 2D-Symbole (Optionen „Nur fahrende Schiffe“ und „Schiffstyp“); Digitraffic, BarentsWatch (Norwegen) und Stream sind schon zu einer Liste zusammengeführt.

`TilesetSample` (Quelle `features/buildings3d/tiles-source.ts`, kein Layer): der Schalter „3D-Gebäude“ im Grundkarten-Popover entscheidet. Auf Orbis dunkel/hell und kartenähnlichen Grundkarten zeigt die Karte 2.5D-Gebäude, auf Luftbildern (`hasTiles3d`) streamt Orbis Pro 3D Tiles: mit dem eigenen Cesium-ion-Token (Boost-Schlüssel `cesiumion`) Google Photorealistic weltweit (`ion`, `global`, Anker folgt der Kartenmitte), ohne Token die Plateau-Modelle Japans (`data/plateau.ts`, 446 Modelle, erzeugt von `scripts/build-plateau-catalog.mjs`). Felder: `id`, Name, `url` der `tileset.json`, bbox, Mittelpunkt, Quelle, Lizenz, `heightOffsetM` (Plateau liefert Ellipsoidhöhen, die Karte Meereshöhe: in Tokio -37 m, sonst grobe Näherung `geoidHeight`). Mehrere Quellen teilen sich den Kanal (`setTilesetSource`). Die Erweiterung (`pro/tiles3d/`) lädt pro Tileset ein `TilesRenderer` (`3d-tiles-renderer`), höchstens 12 gleichzeitig gezeichnet, die nächsten zur Kartenmitte (mobil 4; ungenutzte werden ab 32 bzw. 8 freigegeben): das ECEF-System des Tilesets wird einmal in das lokale ENU-System am Mittelpunkt gelegt und mit `frame.place` platziert (Globus, Karte und Übergang wie bei Flugzeugen); eine Proxy-Kamera aus `frame.proj` (`mapping.ts`) steuert das LOD; ein Vertex-Shader hebt die Gebäude auf der flachen Karte auf die Kartenebene (Erdkrümmung, ca. 8 m bei 10 km); Draco-Decoder liegt in `public/draco/`; die Materialien sind `DoubleSide`, weil der Mercator-Raum gespiegelt ist. Fehler (429, Token) und der Abrufzähler des Monats gehen über `reportTilesets` in den Hinweis unter dem Schalter. Die Bühne meldet `tilesets`, `tilesVisible` und `tilesLoading`.

`PowerGridSample` (Ebene `stromnetz`): die Masten (`kind: 'tower'`, OSM-Tags unverändert) und Freileitungen (`kind: 'line'`, Polylinie, Spannung in kV, Stromkreise) der geladenen Kacheln, nur bereinigt (außer Betrieb, Erdkabel, Doppelte aus überlappenden Kacheln; `data/parsers/powergrid.ts`). Veröffentlicht ab Zoom 14 (dem Ende der Kacheln), nur solange jemand zuhört (`onListener` weckt die Ebene). Welches Modell ein Mast bekommt und wie die Leitungen verbunden sind, entscheidet die Erweiterung. `present()` blendet die 2D-Mastenpunkte und die 2D-Freileitungen aus (Erdkabel und Umspannwerke bleiben).

`WindTurbineSample` (Ebene `kraftwerke`, Quelle `features/windturbines/source.ts`): die einzelnen Windräder der OpenInfraMap-Kacheln (`power_generator`, `source=wind`) mit OSM-ID, Position, Nennleistung (Naben- und Rotormaße stehen nicht in den Kacheln) und dem Wind zur gewählten Zeit (10 m über Grund, ICON-Überblick 0,5°, `features/windturbines/wind.ts`; dieselben `u`/`v`-Gitter wie die Windströmung, rund 7 MB je Lauf, nur geladen, solange Windräder veröffentlicht werden, unabhängig davon, ob die Ebene `stroemung` an ist), gefiltert wie die 2D-Punkte (Optionen „Energieträger“ und „Mindestleistung“). Veröffentlicht ab Zoom 12, nur solange jemand zuhört; `data/parsers/windturbines.ts` behält Gesehenes (höchstens 6000, die dem Zentrum nächsten). `present()` blendet die 2D-Punkte der Windräder aus (andere Erzeuger und Windpark-Flächen bleiben); `select(id)` öffnet die Karte der Ebene, `selectedId` nennt das hervorzuhebende Rad.

`BalloonSample` (Ebene `wetterballons`, Quelle `features/balloons/source.ts`): Seriennummer, Position, Höhe über Meer, Drift, Steigrate, Zustand (`balloon`, `chute`, `landed`; `sondeStage`), Farbe der Höhe (wie 2D-Symbol und Legende) und Zeit der Meldung, gefiltert wie die 2D-Symbole. Wie bei Flugzeugen öffnet `select(id)` die Karte der Ebene samt den Knöpfen der Erweiterung (Folgen, `f=ballon:<Seriennummer>`); `present()` blendet die 2D-Symbole aus.

`TreeSample` (Ebene `baeume`): Einzelbäume aus `trees.pmtiles` (OSM `natural=tree`, 35 Mio. Punkte, nur Kachelzoom 15) mit Art, Höhe, Stammumfang, Laub-/Nadelbaum und Laubzyklus, ohne OSM-ID (die Position ist die Kennung). Zweite Ebene `tree_lines` derselben Datei (`natural=tree_row`, `barrier=hedge`, Felder `kind`, `species`, `height`, `leaf_type`, `leaf_cycle`): `data/parsers/trees.ts` setzt daraus Bäume alle 10 m (Reihe) bzw. kleine Büsche dicht an dicht (Hecke, `hedge: true`), Orbis Pro zeichnet sie mit denselben Modellen. Die 2D-Karte zeigt nur die Einzelbäume. Veröffentlicht ab Zoom 15 (wie die 2D-Punkte, mit Pro sieht man die Punkte nie), nur solange jemand zuhört; bereinigt von `data/parsers/trees.ts` (Doppelte aus überlappenden Kacheln, nur Blickfeld mit Rand, höchstens 25 000, die dem Zentrum nächsten). `present()` blendet die 2D-Punkte aus. Welches Modell ein Baum bekommt, entscheidet die Erweiterung.

### Pro-Paket (`src/pro/`)

```
index.ts            OrbisExtension: Bühne, Flugzeuge, Schiffe, Folgekamera, Umschalten 2D <-> 3D (je Kanal)
world3d/            die Bühne: EIN MapLibre-Custom-Layer 'orbis-stage' mit EINEM three.js-Renderer für alles 3D
  frame.ts          Koordinaten und Matrizen (Globus, Mercator, Übergang), place/position/toScreen/occluded
  stage.ts          Custom-Layer, Teile (StagePart), Picking/Hover/Klick, Neuzeichnen nur bei Bedarf
  instances.ts      Instanzen: tausende gleiche Modelle in einem Aufruf
  mesh.ts           flach schattierte prozedurale Geometrie mit Vertexfarben (Masten, Windräder)
  drops.ts          dünne Lote zum Boden, in einem Aufruf (Flugzeuge, Ballons)
  follow.ts, follow-math.ts   Folgekamera: folgt jedem Teil mit positionOf, Klick auf anderes Objekt wechselt das Ziel
  size.ts           Größenkurve (lesbare Mindestgröße, Wachsen der Auswahl), outline.ts: Kontur per umgestülpter Hülle
  hit.ts            Treffertests am Bildschirm (Segmentabstand, Dreieck, Viereck)
  line.ts, wall.ts  Linie konstanter Pixelbreite und „Vorhang“ zum Boden, mit Globus-Verdeckung
planes/             Teil „Flugzeuge“
  smoothing.ts      Zustand zwischen Meldungen (Koppelnavigation + Angleichen), rein und getestet
  models.ts         prozedurale Modelle: light, narrow, wide, heli
  trail.ts          Spur in echter Höhe + Wand
  planes.ts         der StagePart: Modelle, Schatten, Fallinie, Spuren, Beschriftung, Picking
ships/              Teil „Schiffe“
  smoothing.ts      Zustand zwischen Meldungen (Koppelnavigation nur bei Fahrt, bis 10 min), rein und getestet
  models.ts         prozedurale Modelle je Klasse: cargo, tanker, passenger, fishing, tug, pleasure, other; Hilfsattribut `aLight`
  ships.ts          der StagePart: Modelle auf der Wasserlinie, Kontur der Auswahl, Beschriftung, Picking
stromnetz/          Teil „Stromnetz“
  designs.ts        die neun Mastentwürfe als Daten (Maße, Traversen, Befestigungspunkte der Drähte), rein
  models.ts         Geometrie je Entwurf aus diesen Daten (Gitterwerk, Rohre, Isolatoren), Vertexfarben
  network.ts        Masten und Leitungen verbinden, Entwurf und Ausrichtung wählen, Drähte zwischen Isolatoren (rein, getestet)
  sag.ts            Durchhang (rein, getestet)
  wires.ts          alle Drähte in einer Mesh
  stromnetz.ts      der StagePart: Masten auf dem Gelände, Drähte, Blickfeldauswahl, Statistik
balloons/           Teil „Wetterballons“
  motion.ts         Zustand zwischen Meldungen (Drift und Steigrate, höchstens 5 min, fallende halten am Boden), rein und getestet
  models.ts         Sonde, Schnur, Hülle, Fallschirm, Bodenmarke
  balloons.ts       der StagePart: Ballons in echter Höhe, Lot zum Boden, Picking
windkraft/          Teil „Windräder“
  models.ts         Maße aus der Leistung (rein, getestet) und prozedurale Modelle: Turm, Gondel, Rotor
  motion.ts         Wind in Nabenhöhe, Drehzahlkennlinie, Nachführen der Gondel (rein, getestet)
  windkraft.ts      der StagePart: Räder auf dem Gelände, drehende Rotoren, Blickfeldauswahl, Picking, Statistik
```

**Bühne.** Auf der flachen Karte zeichnet die Bühne direkt in die Karte (Tiefentest gegen die 2,5D-Gebäude). Auf dem
Globus geht das nicht: MapLibres Tiefenpuffer enthält dort die Entfernung zur Horizontebene statt echter Tiefe. Deshalb
bekommt die Szene dort einen eigenen Framebuffer mit eigenem Tiefenpuffer (4× MSAA, Halbfloat) und wird danach über die Karte
gelegt (Komposit-Shader, sRGB-kodiert); der Globus selbst verdeckt per Strahltest (`GeoFrame.occluded`, Fragment-Shader der
Linien) und per unsichtbarer Erdkugel im Tiefenpuffer. Alles wird relativ zur Kartenmitte in doppelter Genauigkeit gerechnet,
die GPU sieht nur kleine Zahlen. Vor dem Zeichnen setzt die Bühne den GL-Zustand von three.js zurück (`resetState`);
MapLibre setzt seinen eigenen nach Custom-Layern zurück. Zuordnung im Layerstapel: Slot `points` (über 2,5D-Gebäuden und
Bodenlayern, unter den eigenen Beschriftungen).

**Nur rendern, wenn sich etwas ändert.** MapLibre ruft `render` bei Kamera- und Stiländerungen. Ein Teil, der sich bewegt,
antwortet in `update` mit `true`; die Bühne plant dann das nächste Bild: volle Rate, solange die Kamera sich bewegt,
sonst alle 50 ms (≈ 20 fps), nie bei verstecktem Tab. Ohne Flugzeuge in Sicht oder ohne eingeschaltete Ebene rendert nichts.

**Nächsten 3D-Teil ergänzen.** (1) Die Basis-Ebene bekommt einen Kanal in `ext/channels.ts` (neuer Typ in `ext/types.ts`,
`publish`, `present`-Anbindung wie bei `trackLayer.hidden`). (2) In `src/pro/<teil>/` ein `StagePart` schreiben
(`object`, `update(frame, now)`, optional `pick`, `click`, `hover`, `stats`, `dispose`); Platzierung nur mit
`frame.place/position`, Linien mit `GeoLine`/`GeoWall`, Massen mit `GeoInstances`. (3) In `pro/index.ts`: `stage.add(part)`,
Kanal abonnieren, Umschaltschwelle (mit Hysterese) wählen, `present()` rufen, wenn der Teil zeichnet. Nichts davon darf
three.js oder Pro-Code in die Basis ziehen.

**Flugzeuge.** Immer und nur 3D, sobald die Ebene Flugzeuge meldet: die Ebene veröffentlicht die Detailansicht und den Rest der Weltübersicht (`preferFirst`: bei gleicher Hex-Kennung gewinnt die Detailansicht), `present()` blendet beide 2D-Ebenen aus (Detail und Übersicht, auch unter Zoom 5). Übersichtsflugzeuge kommen aus dem OpenSky-Schnappschuss im Bucket `orbis-live` (`aircraft/opensky-states.json`, zentral alle 90 s abgerufen, von der App alle 75 s gelesen, älter als 10 min = Rückfall auf Hub-Abfragen) und werden bis zu 5 min fortgeschrieben; ältere Meldungen als die bekannte werden ignoriert. Modellfarbe wie das 2D-Symbol (Militär rosa, Notfall rot, sonst gelb), Auswahl behält die Farbe und bekommt eine weiße Kontur (umgestülpte Hülle, ~1,25 px); Größe fällt unter Zoom 9 sanft bis auf 0,35 (`planes/size.ts`). Modelle
in echter Höhe, zwischen Meldungen per Koppelnavigation bewegt und an jede neue Meldung angeglichen (kein Zurückziehen
entlang des Kurses, Hüpfen ausgeschlossen); Spur in echter Höhe mit schwacher Wand zum Boden (nur tief, wie in der alten
App), Fallinie und Bodenschatten; höchstens 60 Spuren plus die der Auswahl (die nächsten zur Kartenmitte). Klick oder
Tipp auf Modell, Schatten, Fallinie, Spur oder Wand → `tracks.select(id)` → die bestehende Karte der Ebene `flugzeuge` (Route, Foto). Das gewählte
Flugzeug ist hervorgehoben.

**Schiffe.** Genauso immer und nur 3D, sobald die Ebene `schiffe` Schiffe meldet (Stream, Digitraffic und BarentsWatch, bis zu 8000 aus dem Stream), auf jedem Zoom; `present()` des Schiffskanals blendet Symbole und Ring aus, die Spur und die Routenlinie des gewählten Schiffs zeichnet weiter die Basis (Kartenlinie, funktioniert auch unter 3D). Je Klasse ein Low-Poly-Modell (Fracht mit Containerstapeln, Tanker mit Deckleitung und Luken, Passagierschiff mit gestaffelten Decks und Schornstein, Fischer, Schlepper/Spezial, Segelboot mit Mast und Segel, Sonstige) als **eine** zusammengeführte Geometrie mit Zusatzattribut `aLight`: ein Material mischt die Klassenfarbe (wie Legende und 2D-Symbol) je Vertex zu Weiß (Rumpf 0, Aufbauten und Segel hell), sodass Details in jeder Klassenfarbe lesbar bleiben. Länge aus den AIS-Stammdaten (8–400 m), sonst typisch je Klasse; nie kürzer als ~22 px auf dem Bildschirm (fällt unter Zoom 9 sanft wie bei den Flugzeugen). Koppelnavigation nur, solange das Schiff fährt, höchstens 10 min (wie die 2D-Ebene), angeglichen an jede neue Meldung (kein Zurückziehen, Sprung nach langer Pause); der Bug folgt der wahren Peilung, sonst dem Kurs, ein liegendes Schiff behält seine Drehung. Schiffe, die 90 s nicht in der Liste sind, verschwinden (die Liste kommt etwa jede Sekunde, das einzelne Schiff meldet selten). Klick → `ships.select(id)` → die echte Karte der Ebene (Foto, Ziel, ETA) mit der Schaltfläche „Folgen“; das gewählte Schiff wächst und bekommt eine weiße Kontur, Name über Zeiger, Auswahl und Folgeziel. Klick auf ein Schiff während man einem Flugzeug folgt (oder umgekehrt) wechselt das Ziel. Schiffe liegen unter den Flugzeugen (Reihenfolge der Bühne). Die Bühne meldet `ships` und `shipsDrawn`.

**Bäume.** `baeume/` (`models.ts`, `baeume.ts`) stellt jeden Baum des Channels als glattes 3D-Modell auf das Gelände: Stamm und gewölbte Krone mit weichen Normalen und Vertexfarben, drei Laubkronen (rund, oval, breit) und ein Nadelbaum, je in hoher und niedriger Auflösung (nah bzw. unter 22 px Bildhöhe). Form, Drehung und Helligkeit folgen der OSM-Id (stabil), die Höhe dem Tag `height`, sonst dem Stammumfang, sonst einem typischen Wert. Die Bühne meldet `trees` und `treesDrawn`.

**Wetterballons.** Auf jeder Zoomstufe, sobald die Ebene `wetterballons` Sonden hat: in echter Höhe als Ballon (die Hülle wächst mit der Höhe) beim Steigen und Schweben, am Fallschirm beim Sinken, als Kästchen mit liegendem Schirm nach der Landung. Die Modelle behalten eine lesbare Bildschirmgröße (34 px, weiter draußen kleiner), ein Lot und eine Marke zeigen den Ort am Boden; die ausgewählte Sonde ist größer. Neu gezeichnet wird nur, solange sich eine auf dem Bildschirm merklich bewegt. Die Bühne meldet `balloons` und `balloonsDrawn`.

**Windräder.** Sobald die Ebene `kraftwerke` ab Zoom 12 Windräder veröffentlicht, zeichnet die Erweiterung je Rad Turm, Gondel und Rotor als Instanzen. Nabenhöhe und Rotordurchmesser kommen aus der Nennleistung (typische Anlagen, ohne Angabe 2 MW). Jede Gondel zeigt dorthin, woher der Wind zur gewählten Zeit kommt. Die Drehzahl folgt dem Wind in Nabenhöhe (aus dem 10-m-Wind mit dem 1/7-Potenzgesetz): unter 3 m/s und ab 25 m/s Stillstand, dazwischen steigend bis zur Nenndrehzahl bei 11 m/s (große Rotoren langsamer); Änderungen laufen weich ein. Ohne Winddaten: 250° und 8 m/s. Außerhalb des Modellzeitraums gilt der erste bzw. letzte Schritt (wie bei der Windströmung). Anfangswinkel sind versetzt; die Karte wird dafür nur neu gezeichnet, wenn ein Rotor mindestens 6 px breit ist und „Bewegung reduzieren“ aus ist. Weil dann nach jedem Bild `idle` feuert, lesen alle Teile das Gelände gedrosselt (`idleThrottle`). Die Bühne meldet `windTurbines` und `windDrawn`.

**Stromnetz.** Sobald die Ebene `stromnetz` ab Zoom 14 Masten veröffentlicht, zeichnet die Erweiterung das Netz in 3D. `network.ts` verbindet es aus den Kachelfeatures: eine Leitung läuft durch die Masten, auf denen sie liegt (Abstand zur Linie bis 12 m, der nächstgelegene Weg gewinnt; die Kacheln vereinfachen die Geometrie, Stützpunkte dürfen fehlen), geordnet nach der Lage entlang der Linie; an Kachelrändern zerschnittene Wege werden über ihre Schnittenden wieder zusammengesetzt, Kopien aus überlappenden Kacheln zählen einmal, mehrere Wege auf denselben Masten addieren ihre Stromkreise. Jeder Mast bekommt Ausrichtung (Winkelhalbierende der stärksten Leitungen), Entwurf (OSM `design`/`structure`/`material`, sonst nach Spannung und Stromkreisen mit Abwechslung nach OSM-Id) und Höhe (OSM `height`, sonst typisch). Neun Entwürfe (`designs.ts`, als Daten): Donau-, Tannen-, Tonnen- und Portalmast als Gitterwerk, Stahlrohrmast mit drei Traversen und mit einer, Beton-, Holz- und Holz-H-Mast. Die Drähte beginnen und enden an den Isolatoren genau dieser Modelle (`slotPosition`), je Stromkreis drei Leiter plus Erdseil, bei verschiedenen Entwürfen nach Lage quer zur Spannfeldrichtung gepaart, mit parabelförmigem Durchhang je Spannung (`sag.ts`). Masten und Drähte stehen auf dem 3D-Gelände (`queryTerrainElevation`, bei neuem Relief neu aufgebaut). Alle Drähte sind eine Mesh (`wires.ts`, Farbe nach Spannung, Erdseil grau). Die Bühne meldet `powerTowers`, `powerSpans`, `powerWires` und `powerDrawn`.

**Folgekamera.** Schaltfläche „Folgen“ / „Folgen beenden“ auf der Karte. Sie verschiebt nur die Kartenmitte (auf der flachen
Karte samt Mittenhöhe, sodass das Flugzeug mittig bleibt; auf dem Globus über `focusCentre`) und lässt Zoom, Drehung und Neigung
unberührt: `map/limits.ts` (Neigungsgrenze nach Zoom, Gummiband, Nord-Rückstellung) greift also wie ohne Folgen, und Rad/
Pinch zoomen um die Mitte. Folgen endet beim Ziehen der Karte, bei jeder anderen Kamerafahrt (Suche, „Hierhin fliegen“), bei
Abwahl der Karte, beim Verschwinden des Objekts und mit Esc. Die Folgekamera ist für alle Teile mit `positionOf` gleich; ein Schiff liegt auf Höhe 0 (Wasserlinie), dort entfällt die Mindestentfernung, die für Flugzeuge aus der Flughöhe folgt. Solange gefolgt wird, bleibt 3D auch unter Zoom 8,7 an.

### Prüfung

`src/ext/ext.test.ts` (Kanal, kein statischer Import), `src/pro/world3d/frame.test.ts` (Rahmen-Mathematik),
`src/pro/planes/smoothing.test.ts` und `ships/smoothing.test.ts` (Glättung), `world3d/size.test.ts`, `follow-math.test.ts` (Folgekamera). Rauchtest Punkt 8: Pro an, `flugzeuge`
an, Frankfurt auf Zoom 9,6 → die Bühne meldet Flugzeuge, die 2D-Symbole sind ausgeblendet, keine Seitenfehler; Pro aus →
Symbole zurück, Bühne entfernt. `window.__orbis.ext` (nur `?smoke`/Dev) liefert dafür `status()`, `tracks`, `ships` und `stage()`. Schiffe hat der Rauchtest nicht (die AIS-Daten brauchen den Proxy).

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
