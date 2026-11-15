# 00 – Daten, die schon im Haus liegen und nicht gezeigt werden

Geprüft am 15.11.2026 gegen die Manifeste von `orbis-live`, `orbis-data`, `orbis-osm` und die
Collector-Liste in [Orbismap/data](https://github.com/Orbismap/data) (`collectors/fetch-data.ts`).

Das ist der billigste Teil des Ausbaus: kein neuer Collector, keine neue Lizenzprüfung, oft nur ein
Parser und eine Ebenendatei.

## 1. Mars-Traverse (fertig, sofort nutzbar)

| | |
|---|---|
| Datei | `data/mars/traverse.json` (317 KB, täglich) |
| Inhalt | `{ m20: Track, msl: Track, heli: {flights:[{n, sol, len, pts}]} }`, `Track = {sol0, sol[], ll[] (lon/lat-Paare), km}` |
| Quelle | NASA MMGIS (`mars.nasa.gov/mmgis-maps`) |
| Lizenz | NASA/JPL, public domain |
| Status | **keine Ebene im Code** (`grep mars` → 0 Treffer) |

Perseverance- und Curiosity-Spuren plus 72 Ingenuity-Flüge, bereits auf wenige Meter ausgedünnt.
Ideen: eine „Mars“-Kategorie mit eigenem Globus (MapLibre kann eine Mars-Kachelquelle als Raster
tragen; NASA MMGIS liefert XYZ-Kacheln) und `trackLayer` für die Rover. Ohne Mars-Globus reicht auch
eine „fliegende Untertasse“-Ansicht: Karte auf Mars-Projektion umschalten, Spuren als Linien mit
Sol-Zeitachse (`time.mode: 'frames'` über `sol`), Ingenuity-Flüge als kleine Track-Animation.
Aufwand: S für Spuren auf Erdkarte, M für echten Mars-Globus.

## 2. Mapillary-Abdeckung (Straßenbilder)

| | |
|---|---|
| Datei | `data/street/panos.json` (266 KB, wöchentlich) |
| Inhalt | `{ updated, points: [[lat, lon], …] }` – Stichprobe der 360°-Sequenzen aus Mapillarys z6-Vektorkacheln |
| Quelle | Mapillary Vector Tiles |
| Lizenz | **Mapillary, CC BY-SA 4.0** (Attribution „© Mapillary contributors“) |
| Status | ungenutzt |

Kein Bildabruf nötig – die Punkte allein erzählen schon eine Geschichte: **wo es Straßenbilder gibt und
wo nicht.** Globaler Nord-Süd-Vergleich, Datenlücken in Afrika/Asien, Abdeckung von Wanderwegen.
Als Heatmap oder kleiner Punktteppich (`pointLayer` mit `cluster: false`, Radius 1 px) eine der
ehrlichsten „Offenheit der Welt“-Karten. Mit Token zusätzlich: Klick öffnet das nächste Bild
(Mapillary-API, Bild-Lizenz je Beitragendem CC BY-SA).

## 3. Globales Open-Meteo-Gitter

| | |
|---|---|
| Datei | `live/openmeteo/global.json` (384 KB, stündlich) |
| Inhalt | `{v,g,t,dt,n,vars:[10],pts:[[lon,lat],…],data}` – 5°-Gitter, 24 Schritte à 3 h, Temperatur, Feuchte, Niederschlag, Bewölkung, Druck, Wind, Böen, Schneehöhe, CAPE |
| Quelle | Open-Meteo Forecast, serverseitig gesammelt |
| Lizenz | CC BY 4.0 |
| Status | **keine Ebene im Code**, obwohl der Collector läuft (`omgrid` fehlt in diesem Repo) |

Zwei Verwendungen: (a) Rückfallebene für alle Wetterebenen, wenn OWX/ICON fehlt; (b) eine eigene
„Weltwetter“-Ebene mit 24-Schritt-Animation, die **ohne Budgetverbrauch** läuft (die Daten sind schon
bezahlt). Wind animiert bei Zoom 0–3, sonst Punkte mit Temperaturfarbe.

## 4. Felder, die die vorhandenen Parser wegwerfen

Kleine Ausbeute, aber gratis:

- **BfS ODL**: `value_cosmic` (kosmischer Anteil) und `value_terrestrial` werden geparst, aber nicht
  angezeigt. Ein Schalter „nur kosmisch / nur terrestrisch“ trennt Höhenstrahlung von Bodenbelastung –
  didaktisch stark. Ebenso `site_status_text`, `height_above_sea`, `nuclide`.
- **Safecast**: `device_class`, `device_sn`, `bat_voltage`, `env_temp`, `dev_temp`, `dev_bars` liegen in
  der Antwort. Inspector-Fakten „Gerät“, „Batterie“, „Gehäusetemperatur“ machen die Karte greifbar.
- **Wikidata-Rohstoffe**: 39 872 Objekte, Typen nur `Bergwerk` (34 106), `Ölfeld` (5 763),
  `Salzbergwerk` (3). Die SPARQL-Abfrage im Collector ließe sich um Gasfelder, Kohlefelder, Steinbrüche,
  Lagerstätten und Förderregionen erweitern – dieselbe Lizenz (CC0).
- **Radio Browser**: 229 `radio/cells/*.json` werden geladen; jede Zelle enthält viel mehr als Name und
  Position (Bitrate, Codec, Sprache, Tags, Homepage, Abstimmungen). Ein Filter „nur Sender mit Stream“
  oder „Sprache“ ist ein Einzeiler im Parser.
- **Volcanoes (GVP)**: 2,4 MB Smithsonian-Daten enthalten Eruptionshistorie, VEIs, Gesteinsart,
  Höhe, letzte Eruption – `vulkane.ts` zeigt vermutlich nur einen Teil. Die Eruptionshistorie als
  Zeitachse (`mode: 'window'`, 200 Jahre) wäre eine eigene, starke Ansicht.

## 5. Collector, der läuft, aber nichts veröffentlicht

- `ports` (Gruppe `manual`) – im Manifest von `data` gibt es keinen Eintrag. Entweder Collector defekt
  oder Ausgabe wird nicht hochgeladen. Prüfen lohnt, weil Welthafen-Daten (UNCTAD/World Port Index)
  eine echte Lücke zwischen `haefen` (OSM) und Schiffsverkehr schließen würden.
- `wahlen` (Gruppe `manual`) – ebenfalls kein Manifest-Eintrag sichtbar.

## 6. Nebenbefund: doppelte Wahrheiten

`openmeteo/global.json` und die ICON-OWX-Felder beschreiben dasselbe Wetter aus zwei Modellen.
Sobald beide gerendert werden, braucht die Oberfläche eine klare Aussage, welches Modell eine Ebene
zeigt (Quellenzeile reicht nicht, wenn dieselbe Farbe zwei Modelle bedeutet).
