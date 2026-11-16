# Plan: 3D Tiles in Orbis Pro (Photomesh, LOD, MLIT Plateau, später Google und Cesium ion)

Stand: 16.11.2026. Reiner Plan, **nichts davon ist gebaut**. Entstanden aus einem Gespräch; alle mit „prüfen“ markierten
Punkte sind Annahmen, die vor dem Bau gegen die Originaldoku bestätigt werden müssen.

## Ziel

Orbis Pro zeigt echte 3D Tiles (Photogrammetrie-Meshes, LOD-Stadtmodelle) als Pro-Feature. Alles Bestehende (Grundkarten,
Ebenen, Labels, Marker, Globus und flache Karte) bleibt unverändert nutzbar.

## Architekturentscheidung

**Weg A: `TilesetPart` in der bestehenden Pro-`Stage`** (`src/pro/world3d/stage.ts`), gerendert mit three.js und
`3d-tiles-renderer` (NASA-AMMOS).

Verworfen:

- **CesiumJS als eigener Viewer:** alle Ebenen, Grundkarten und UI müssten neu angeschlossen werden, dazu 3–4 MB.
- **Eigenes three.js-Canvas über oder unter MapLibre:** keine gemeinsame Tiefe. Über der Karte verdeckt das Mesh Labels,
  darunter verdeckt die Grundkarte das Mesh.

„Getrennt von MapLibre“ heißt hier: Der Tileset-Code kennt nur `GeoFrame` und `Stage`, nie MapLibre-Interna. Er ist
unabhängig und kann mit `src/pro` ausziehen. MapLibre bleibt Besitzer von Kamera und Grundkarte.

Regeln, die gelten bleiben (`docs/ARCHITECTURE.md`, „Erweiterungen und Orbis Pro“, geprüft von `src/ext/ext.test.ts`):
Die Basis importiert weder `three` noch `3d-tiles-renderer` noch `pro/`. `src/pro` importiert nur sich selbst, Pakete und
Typen aus `ext/types` (`import type`). Freischaltung nur über `proEnabled` (`src/ext/licence.ts`).

## Befund: `vertical-perspective` (getestet 16.11.2026, wieder entfernt)

Idee war, den Globus bis zum Boden zu halten (kein Umschalten auf Mercator ab ca. Zoom 12), damit die Tiles ohne
Krümmungskorrektur und Übergangsblend passen. Im Test rendert MapLibres 3D-Gelände mit `vertical-perspective` falsch; ohne
Gelände macht die Variante für die Grundkarte wenig Sinn. Verworfen. Es bleibt bei `globe` mit dem automatischen Wechsel;
die flache Karte (Mercator) ist für nahe Stadtansichten der Hauptfall, die Krümmungskorrektur im Shader bleibt Teil von
Phase 1. Die „Verschiebung“ beim Übergang Globus→flach ist ein bekanntes Problem, das die Tiles dort sichtbar machen könnten
(Spike prüfen).

## Technische Kernpunkte

1. **Koordinaten.** 3D Tiles liegen in ECEF-Metern. Pro Tileset ein Anker (Mitte der bbox); Matrix = `frame.place(anchor)`
   mal ECEF→ENU. `GeoFrame.place` löst Globus, flache Karte und den Übergang dazwischen schon (wie bei Flugzeugen und
   Stromnetz). Alles relativ zum Kartenzentrum in Double, damit Float32 nicht springt.
2. **Krümmung auf der flachen Karte.** Ein starres ENU-Frame hängt bei 10 km Abstand um ca. 8 m durch (d²/2R). Korrektur im
   Vertex-Shader (`onBeforeCompile`), nur im Mercator-Anteil (`frame.t`), auf dem Globus null. Für weltweite Tilesets reicht
   das nicht: dort Per-Kachel-Anker (Phase 4).
3. **LOD.** `TilesRenderer` braucht Kamera, Auflösung und `update()` pro Frame. Die Stage-Kamera ist nur eine Matrix
   (`frame.proj`); daraus eine Proxy-Kamera im Tileset-Raum bauen. Technisch größte Unsicherheit, im Spike klären.
4. **Repaint.** Die Stage zeichnet nur bei Änderung. `update()` gibt `true` zurück, solange Kacheln laden.
5. **Terrain und Tiefe.** Photomeshes bringen ihren Boden mit: Konflikt mit dem MapLibre-Terrain (prüfen, wie Terrain im
   Code eingebunden ist). Auf der flachen Karte teilt sich das Mesh den Tiefenpuffer mit den 2.5D-Gebäuden. Gelöst durch
   Trennung statt Mischung: Plateau-Modelle erscheinen nur auf Grundkarten ohne eigene Gebäude (Luftbild, OSM, Gelände);
   Orbis dunkel/hell behalten ihre 2.5D-Gebäude (Schalter „3D-Gebäude“, folgt der Grundkarte).
6. **Höhenbezug.** Plateau/CityGML: Geoid oder Ellipsoid? In Tokyo ca. 36–40 m Unterschied. Prüfen, ggf. `heightOffsetM`.
7. **Formate und Decoder.** b3dm und 3D Tiles 1.1 (glTF), Draco, KTX2, Meshopt. Decoder selbst gehostet in `public/`,
   Kopierskript in `scripts/` (Vorbild `build-brand.mjs`).
8. **Picking.** Die Stage pickt im Bildschirmraum; für Meshes zusätzlich Raycast.
9. **Speicher.** LRU-Cache, Parse- und Download-Limits, Pause bei verstecktem Tab, Gerätelimit auf Mobil.
10. **CORS.** Fremde Tileset-Hosts setzen evtl. kein CORS: Proxy über Cloudflare (`wrangler.jsonc` existiert).

## Phasen

### Phase 0: Spike (1–2 Tage)

- Plateau-Tokyo-Tileset: URL, Format, Draco/KTX2, CORS, Lizenztext (offizielle MLIT-Plateau-Doku).
- Höhenbezug klären (Punkt 6).
- Wegwerf-Prototyp: `3d-tiles-renderer` mit three 0.183 und der Stage-Projektionsmatrix, LOD-Entscheidung prüfen.
- Terrain-Anbindung im Code nachsehen.

### Phase 1: MVP Plateau (ca. 1–2 Wochen) — FERTIG, abgenommen 16.11.2026 (Details: [PLAN-3D-TILES-PHASE-1.md](PLAN-3D-TILES-PHASE-1.md))

Ziel: Mit Pro auf Globus und flacher Karte sieht man das Plateau-Stadtmodell mit LOD-Streaming. Ohne Pro nur Umrisse.

1. **Vertrag und Kanal.** `TilesetSample` (`id`, `name`, `url`, `bbox`, `center`, `attribution`, `license`, optional
   `heightOffsetM`) in `src/ext/types.ts`; `ExtensionHost.tilesets: TracksChannel<TilesetSample>`; `tilesetsChannel` in
   `src/ext/channels.ts`; Eintrag in `makeHost` (`src/ext/loader.ts`). Gleiches Muster wie `powerChannel`.
2. **Basisebene** `src/layers/infrastruktur/stadtmodelle3d.ts` plus Katalog. Ohne Pro: Umrisse (bbox) mit Namen und Hinweis
   „3D mit Orbis Pro“. Mit Pro: `tilesetsChannel.publish`; `present()` blendet die Umrisse aus (`hideWhenPresented`).
   `sources` mit Plateau/MLIT und Lizenz, Legende, Schlagwörter. Registrierung in `src/layers/registry.ts` prüfen.
3. **Pro-Part** `src/pro/tiles3d/`: `mapping.ts` (reine Mathematik: ECEF→ENU, Anker, Krümmungskorrektur, Übergangsblend),
   `tileset.ts` (`TilesetPart implements StagePart`: `TilesRenderer`, Proxy-Kamera, `update()`, Cache-Limits, Fade-In),
   Decoder in `public/`. Einbindung in `src/pro/index.ts` per `bind` wie `power`.
4. **Attribution und Status.** Quellzeile am Kartenrand, `ctx.status` für Laden und Fehler (CORS, 404).
5. **Tests.** `mapping.test.ts` (Vorbild `frame.test.ts`), Katalogtest, `ext.test.ts` bleibt grün, `pnpm typecheck`,
   `pnpm build` (3d-tiles-renderer nur im Pro-Chunk), `stats()`-Hook. Visuelle Abnahme macht der Nutzer.

Bewusst nicht in Phase 1: Picking, Terrain-Abgleich, mehrere Städte, Auth. `polygonOffset` und Ausblenden einzelner OSM-Häuser waren geplant und entfielen durch die Trennung nach Grundkarte (ein Ausblenden pro Haus per Feature-ID wurde probiert und verworfen).

Abhängigkeit: `pnpm add 3d-tiles-renderer` (Lizenz und Bundlegröße beim Hinzufügen prüfen).

### Phase 2: Katalog und Qualität (ca. 1–2 Wochen)

Stand: Katalog (446 Plateau-Modelle, `scripts/build-plateau-catalog.mjs`), Karte mit „Hinfliegen“, Limits für Mobil und Geoid-Näherung umgesetzt, noch nicht abgenommen. Die Geoid-Näherung (±3 m) ist zu prüfen, etwa in Osaka und Sapporo. Kein eigener URL-Parameter: Position und Ebene genügen.

- Mehrere Tilesets (weitere Plateau-Städte, weitere offene Photomeshes), Flug zum Tileset, Auswahl in der Ebene.
- Terrain-Abgleich: MapLibre-Terrain unter aktivem Mesh auf 0 oder absetzen, Plateau-DEM-Tileset nutzen.
- Attribution pro Tileset, Ladeanzeige, Fehlerbehandlung, Limits für Mobil.
- URL-Zustand für das gewählte Tileset (vgl. Abschnitt zum URL-Zustand in `docs/ARCHITECTURE.md`).

### Phase 3: Interaktion (ca. 1 Woche)

- Raycast-Picking in der Stage, Hover und Klick auf Gebäude.
- Plateau-Gebäudeattribute (Name, Nutzung, Höhe) aus `EXT_structural_metadata` in der Karte anzeigen.
- Zusammenspiel mit der Follow-Kamera (`src/pro/world3d/follow.ts`).

### Phase 4: Google Photorealistic und Cesium ion (ca. 2 Wochen)

**Entscheidung (16.11.2026):** Cesium ion hat Vorrang vor weiterem Plateau-Ausbau; Orbis ist öffentlich, jeder Nutzer bringt seinen eigenen ion-Token mit (Boost-Schlüssel `cesiumion`), also kein Worker und keine eigenen Kosten. Google Photorealistic läuft über denselben Token (ion-Asset 2275207), Cesium OSM Buildings als Asset 96188.

**Umbau (16.11.2026):** Es gibt keine Ebenen `stadtmodelle3d` und `cesium3d` mehr. Der Schalter „3D-Gebäude“ im Grundkarten-Popover steuert beides: 2.5D auf Orbis dunkel/hell und kartenähnlichen Grundkarten, 3D Tiles auf Luftbildern (`features/buildings3d/tiles-source.ts`). Mit Token Google Photorealistic, ohne Token die Plateau-Modelle Japans; der Datensatz „OSM Buildings“ entfällt. Frühere Beschreibung: Ebene `cesium3d` („3D-Welt“, Option Gebäude/Fotorealistisch), Schlüssel `cesiumion`, `TilesetSample.ion` und `global`, `setTilesetSource` (mehrere Ebenen teilen den Kanal), `CesiumIonAuthPlugin` in `TilesetPart`; Anker folgt der Kartenmitte (Raster 0,05°), ab Zoom 12. Noch nicht mit echtem Token geprüft. Offen: Höhenbezug (Google/ion liefern Ellipsoidhöhen, `heightOffsetM` ist hier 0: erwartet wird ein Schweben um die Geoidhöhe, Abhilfe EGM96-Raster), Attribution aus den Tiles (`getAttributions`) statt fester Zeile, Google-Logo, Kostenlimit-Hinweis.

- `GoogleCloudAuthPlugin` und `CesiumIonAuthPlugin` von `3d-tiles-renderer` (Namen prüfen).
- **Flache Karte für weltweite Tilesets:** Per-Kachel-Anker (jede Kachel eigenes ENU-Frame mit Mercator-Maßstab am
  Kachelmittelpunkt). Alternative zunächst: nur im Globus-Modus freigeben.
- **Schlüssel:** Google-Key mit Abrechnung und ion-Token nie im Bundle, sondern hinter einem Cloudflare-Worker oder als
  Nutzer-Token in den Einstellungen.
- **Google-Bedingungen:** sichtbare Attribution (Logo plus Datenquellen aus den Tiles), Caching- und Nutzungsbeschränkungen.
  Vor dem Bau gegen die aktuellen Bedingungen lesen; Produktentscheidung, keine reine Technikfrage. Kosten- und
  Zugriffslimit gegen Missbrauch.
- Cesium ion: 3D-Tiles-Assets (eigene Photogrammetrie, OSM Buildings) ja; Cesium World Terrain (quantized-mesh) nein.

## Risiken

| Risiko | Gegenmaßnahme |
|---|---|
| Proxy-Kamera und LOD-Entscheidung | Spike in Phase 0, vor dem Bau |
| Krümmungskorrektur und Höhenbezug | Parameter, sofort sichtbar; Rückfall Per-Kachel-Anker |
| Terrain- und Gebäude-Konflikt (z-fighting) | Gelöst: Modelle nur auf Grundkarten ohne eigene Gebäude; Terrain: Gebäude stehen mit und ohne 3D-Gelände korrekt |
| CORS und Hosting fremder Tilesets | Cloudflare-Proxy |
| Kosten und Lizenz (Google) | Phase 4 bewusst spät, Entscheidung vorher |
| Speicher auf Mobil | Cache-Limits, Gerätelimit |
| Kompatibilität `3d-tiles-renderer` mit three 0.183 | im Spike prüfen |

## Offene Entscheidungen

(Entschieden in Phase 1: alle 23 Bezirke, texturiert, ohne Pro nur Umrisse bis Zoom 10. Offen bleibt die untexturierte Variante als Option für schnelleres Laden; der Plateau-Host braucht 0,4–2,2 s pro Kachel, ein Cache oder Mirror ist ein späteres Thema.)

1. **Tokyo-Umfang in Phase 1:** alle 23 Bezirke oder ein Bezirk (z. B. Chiyoda/Minato)? Ein Bezirk ist kleiner und
   mildert die Krümmungsfrage.
2. **Texturiert oder untexturiert:** Plateau bietet beides; texturiert ist schwerer, wirkt aber wie Photomesh.
3. **Ohne Pro:** nur Umrisse und Hinweis, oder die Ebene ganz ausblenden?
4. **Google/ion:** gewollt trotz Kosten und Auflagen, und wer trägt den Key?

## Arbeitsweise

- Visuelle Prüfung macht der Nutzer; keine Browser-Screenshot-Tests durch Claude (siehe Memory „No browser screenshot testing“).
- Paketmanager pnpm.
- Nach Abschluss einer Phase: Abschnitt „Erweiterungen und Orbis Pro“ in `docs/ARCHITECTURE.md` und `docs/LAYERS.md` ergänzen.
