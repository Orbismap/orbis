# Plan: 3D Tiles, Phase 1 (Plateau-MVP)

Stand: 16.11.2026. Detailplan zu Phase 1 aus [PLAN-3D-TILES.md](PLAN-3D-TILES.md) (Gesamtplan, Architekturentscheidung,
spätere Phasen). **Stand 16.11.2026: Schritte 0–5 gebaut und abgenommen** (siehe „Umsetzungsstand“ unten). Mit „prüfen“ markierte Punkte sind Annahmen.

**Ziel:** Mit Pro an, auf Globus und flacher Karte, fliegt man zu Tokyo und sieht das Plateau-3D-Stadtmodell mit
LOD-Streaming. Ohne Pro sieht man nur die Umrisse der verfügbaren Stadtmodelle. Noch kein Picking, kein Katalog mit mehreren
Städten, kein Terrain-Abgleich.

## Schritt 0: Spike (Daten und Kamera), 1–2 Tage

1. **Plateau-Tokyo-Tileset:** URL, Format (b3dm oder 3D Tiles 1.1/glTF), Draco oder KTX2, CORS-Header, Lizenztext. Aus der
   offiziellen MLIT-Plateau-Doku holen, keine URL aus dem Gedächtnis.
2. **Höhenbezug:** Ellipsoid oder Geoid? In Tokyo ca. 36–40 m Unterschied; entscheidet über `heightOffsetM` im Katalog.
3. **Kompatibilität:** `3d-tiles-renderer` mit three 0.183 und der Proxy-Kamera der Stage. Wegwerf-Prototyp im Scratch:
   ein Tileset laden, LOD-Entscheidung mit der Stage-Projektionsmatrix prüfen. Geht das nicht, ändert sich Schritt 3.
4. Terrain-Anbindung im Code nachsehen (für Phase 2).

### Spike-Ergebnisse (16.11.2026, gemessen)

- **Katalog-API:** `https://api.plateauview.mlit.go.jp/datacatalog/plateau-datasets` (JSON, `access-control-allow-origin: *`).
  Felder u. a. `city_code`, `type_en` (`bldg`), `lod`, `texture`, `url`, `composite_url`, `file_size`. Tokyo-23-Bezirke:
  `city_code` 13101–13123, pro Bezirk ein Tileset; LOD2 aller 46 Einträge ca. 4,7 GB.
- **Tileset-URL:** `composite_url` (z. B. `…/datacatalog/3dtiles/13101-bldg-lod2-texture-2025/tileset.json`) verweist per
  `content.uri` auf das Asset-Tileset bei `assets.cms.plateau.reearth.io`. Beide mit CORS `*`. URLs können sich ändern; die
  Ebene soll `composite_url` aus dem Katalog lesen oder den Eintrag fest hinterlegen und beim Fehler zurückfallen.
- **Format:** 3D Tiles 1.0, `.b3dm` (glTF 2 mit `KHR_draco_mesh_compression`, `EXT_texture_webp`, `CESIUM_RTC`), `refine:
  REPLACE`, `boundingVolume.region`. Draco-Decoder ist nötig (aus `three/examples/jsm/libs/draco/` kopierbar); KTX2 nicht.
- **Höhenbezug:** Region-Höhen in Chiyoda 35–252 m, Boden bei ca. 36–44 m, also **Ellipsoidhöhen**. Gegenüber MapLibre-
  Gelände (Meereshöhe) sind ca. 37 m Versatz zu berücksichtigen (Parameter `heightOffsetM`, Phase 2).
- **Bibliothek:** `3d-tiles-renderer` 0.5.4, Apache-2.0, Peer `three >= 0.167` (passt zu 0.183.2). Installiert. Lauffähigkeit
  mit der Proxy-Kamera ist noch zu prüfen (Schritt 3).
- **Lizenz:** Plateau steht unter den Nutzungsbedingungen der Regierung Japans (Government Standard Terms of Use v2.0, CC BY 4.0
  kompatibel); Quelle „3D都市モデル Project PLATEAU (MLIT)“ nennen.

## Schritt 1: Vertrag und Kanal in der Basis

Regel bleibt: Die Basis importiert weder `three` noch `3d-tiles-renderer` noch `pro/` (`src/ext/ext.test.ts`).

- `src/ext/types.ts`: `TilesetSample` (`id`, `name`, `url`, `bbox`, `center`, `attribution`, `license`, optional
  `heightOffsetM`) und `ExtensionHost.tilesets: TracksChannel<TilesetSample>`. Der generische Kanal wird wiederverwendet,
  wie beim Stromnetz.
- `src/ext/channels.ts`: `tilesetsChannel` (Publisher). `src/ext/loader.ts`: Eintrag in `makeHost`.

## Schritt 2: Basisebene `stadtmodelle3d`

`src/layers/infrastruktur/stadtmodelle3d.ts` (`defineLayer`, Kategorie „infrastruktur“) plus Katalogdatei mit dem
Plateau-Tokyo-Eintrag.

- **Ohne Pro:** Umrisse (bbox) mit Namen und Hinweis „3D-Darstellung mit Orbis Pro“.
- **Mit Pro:** `tilesetsChannel.publish(...)`; `present()` blendet die Umrisse aus (`hideWhenPresented`, wie
  `src/layers/infrastruktur/stromnetz.ts`). Beim Entfernen `reset()`.
- `sources` (Plateau/MLIT, Lizenz), Legende, Schlagwörter (`tokyo`, `plateau`, `3d`, `stadtmodell`).
- Registrierung in `src/layers/registry.ts` prüfen (vermutlich Glob).

## Schritt 3: `TilesetPart` in Pro

Neuer Ordner `src/pro/tiles3d/`:

- **`mapping.ts` (reine Mathematik, testbar):** Pro Tileset ein Anker (Mitte der bbox). Matrix = `frame.place(anchor)` mal
  ECEF→ENU; Globus, flache Karte und Übergang laufen über denselben Mechanismus wie bei Flugzeugen und Stromnetz.
  **Krümmungskorrektur:** ein starres ENU-Frame hängt auf der flachen Karte bei 10 km um ca. 8 m durch (Tokyo-23-Bezirke
  ca. 25 km breit). Korrektur im Vertex-Shader (`onBeforeCompile`), nur im Mercator-Anteil (`frame.t`); auf dem Globus
  null. Rückfall: Per-Kachel-Anker (Phase 4 im Gesamtplan).
- **`tileset.ts`:** `TilesetPart implements StagePart`. Pro Tileset ein `TilesRenderer`, Proxy-Kamera aus `frame.proj`,
  Auflösung aus der Kartengröße, `update()` pro Frame. `update()` gibt `true` zurück, solange Kacheln laden (Stage
  zeichnet weiter). Cache- und Parse-Limits, Fade-In.
- **Decoder:** Draco und KTX2 (falls nötig) selbst gehostet in `public/`; Kopierskript in `scripts/` (Vorbild
  `build-brand.mjs`).
- **`src/pro/index.ts`:** `bind` für den neuen Kanal wie bei `power`: aktiv, sobald der Kanal Tilesets meldet;
  `stage.add(tiles)` ganz unten in der Reihenfolge.
- **Anzeige:** Mesh im `points`-Slot. Auf der flachen Karte teilt es sich den Tiefenpuffer mit den 2.5D-Gebäuden. Bis
  Phase 2: `polygonOffset` auf den Materialien und der Hinweis, `gebaeude3d` auszuschalten oder eine Satellitenkarte zu
  nehmen.

## Schritt 4: Attribution und UI

- Eine Zeile Quelle am Kartenrand, solange das Tileset sichtbar ist (`sources` der Ebene).
- Ladezustand per `ctx.status`; Fehlerzustand bei CORS oder 404.

## Schritt 5: Tests und Abnahme

- **Vitest:** `mapping.test.ts` (ECEF→ENU, Anker auf Globus und Mercator, Krümmungskorrektur, Übergangsblend; Vorbild
  `src/pro/world3d/frame.test.ts`), Katalogtest (bbox gültig, Lizenz vorhanden). `ext.test.ts` bleibt grün.
- **Typecheck und Build:** `pnpm typecheck`, `pnpm build`; `3d-tiles-renderer` nur im Pro-Chunk, nicht im Start-Bundle.
  `stats()`-Hook meldet geladene und ladende Kacheln.
- **Visuell prüft der Nutzer** (keine Browser-Screenshot-Tests durch Claude): Checkliste für Globus und flach, Neigung und
  Rotation, Übergang Globus↔flach, Zoomen, Pro an und aus ohne Reste.

## Abhängigkeiten

- `pnpm add 3d-tiles-renderer` (Lizenz und Bundlegröße beim Hinzufügen prüfen).

## Aufwand und Risiken

- **Gesamt:** ca. 1–2 Wochen, Spike 1–2 Tage, Mathematik und Part etwa die Hälfte.
- **Größtes Risiko:** Proxy-Kamera für das LOD (Spike entscheidet).
- **Zweites Risiko:** Krümmungskorrektur und Höhenbezug; bei falschem Versatz schweben oder versinken die Gebäude, sofort
  sichtbar, die Korrektur ist ein Parameter.
- **Bewusst nicht dabei:** Picking, Terrain-Abgleich, automatisches Ausblenden der OSM-Gebäude, mehrere Städte, Auth.

## Offene Entscheidungen

1. **Tokyo-Umfang:** alle 23 Bezirke oder zunächst ein Bezirk (z. B. Chiyoda/Minato)? Ein Bezirk lädt schneller und mildert
   die Krümmungsfrage.
2. **Texturiert oder untexturiert:** Plateau bietet beides; texturiert ist schwerer, wirkt aber wie Photomesh.
3. **Ohne Pro:** nur Umrisse und Hinweis, oder die Ebene ganz ausblenden?

## Umsetzungsstand (16.11.2026)

**Phase 1 abgenommen am 16.11.2026.** Typecheck, 559 Tests und Build grün. Vom Nutzer bestätigt: Gebäude stehen mit und ohne 3D-Gelände auf dem Boden, Pro aus räumt alles auf, großer Abstand und Wechsel zum Globus sauber. LOD wirkt richtig, ist wegen des langsamen Hosts aber nicht eindeutig prüfbar.

- `src/ext/`: `TilesetSample`, `tilesetsChannel`, `host.tilesets`, `host.reportTilesets(state)` (`TilesetsState`: bedeckte Kacheln als Boxen, Laden, Fehler).
- `src/data/plateau-tokyo.ts` (in Phase 2 durch `plateau.ts` ersetzt): 23 Bezirke, LOD2 texturiert, `composite_url`, bbox, `heightOffsetM = -37`.
- `src/layers/infrastruktur/stadtmodelle3d.ts`: Umrisse ohne Pro (weg, solange ein Modell im Bild ist); Ladestatus/Fehler über `ctx.status`; Quellenzeile (Attribution) in der Kartenecke über eine Hilfsquelle; in `src/karten/standard.ts` (Thema „Gebäude“).
- `src/pro/tiles3d/mapping.ts` (+ Test): WGS84→ECEF→ENU, Krümmungsmaß, Proxy-Kamera aus `frame.proj` (spiegelsicher, Mercator ist gespiegelt).
- `src/pro/tiles3d/tileset.ts`: `TilesetPart`, ein `TilesRenderer` pro Bezirk, ab Zoom 11 und nur im Ausschnitt; Draco aus `public/draco/`; `DoubleSide` (gespiegelter Raum dreht die Dreiecke); Krümmungskorrektur im Vertex-Shader; `errorTarget = 24`.
- **Kein Hybrid (Entscheidung 16.11.):** 2.5D-Gebäude und echte Modelle werden nicht gemischt. Die Orbis-Grundkarten (dunkel/hell) zeigen ihre 2.5D-Gebäude, die Plateau-Modelle erscheinen nur auf Grundkarten ohne eigene Gebäude (Luftbilder, OSM, Gelände). Die Ebene veröffentlicht die Tilesets nur dort (`hasOwnBuildings`, `src/map/basemaps/index.ts`). Ein Ausblenden einzelner Häuser (per Feature-ID, Kacheln) wurde ausprobiert und verworfen. **Umbau 16.11.:** Die Ebene `gebaeude3d` ist entfallen; die OSM-2.5D-Gebäude sind jetzt ein Schalter „3D-Gebäude“ im Grundkarten-Popover (`buildings3d` in `state/view.ts`, wie „3D-Gelände“), der für jede Grundkarte gilt (Orbis: eigene Ebene, sonst `bm-buildings`). Wo Pro die echten Modelle zeichnet (`tilesetsChannel.presented`), ist `bm-buildings` aus. Die Plateau-Ebene heißt „3D-Gebäude“.

**Messungen:** Der Plateau-Host (Google Cloud Storage, kein CDN) braucht 0,4–2,2 s pro Kachel (250–770 kB), `tileset.json` je Bezirk 375 kB. Langsam, aber fehlerfrei. Eigener Cache/Mirror ist Thema für später (R2 oder Pull-through-Worker; Google/ion dürfen nicht gespiegelt werden).

**Bewusst offen / Folgephasen:** Kachel-genaues Ausblenden pro Haus (bräuchte Grundrisse aus dem BatchTable), `polygonOffset` (vermutlich unnötig durch das Ausblenden), Terrain-Abgleich, Picking, unterstützte Ebene ohne Texturen als Option.

**Prüfliste:** Pro an, Ebene „3D-Stadtmodelle“ an, nach Tokio (Chiyoda, 139.75/35.69) auf Zoom 14–17, kippen. Prüfen: Gebäude stehen auf dem Boden (sonst `TOKYO_GEOID_M`), Modelle nur auf Luftbild-/OSM-/Gelände-Karte, auf Orbis dunkel/hell Umrisse und Hinweis, LOD wird feiner, kein Versatz bei 10 km, Globus↔Karte, Pro aus entfernt alles inkl. wieder sichtbare 2.5D-Gebäude und Umrisse, Quellenzeile sichtbar.
