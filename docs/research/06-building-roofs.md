# 06 – Dachformen für die 2.5D-Häuser

Stand 17.11.2026. Frage: Können die 2.5D-Häuser eine Dachform haben oder anzeigen, ohne dass wir selbst hosten oder Overpass belasten?

## Ist-Zustand

Die Häuser kommen aus der `building`-Ebene der OpenFreeMap-Kacheln (Quelle `ofm`, OpenMapTiles-Schema). Gelesen werden nur `render_height` und `render_min_height` (`src/map/buildings-tilt.ts`). OpenMapTiles wirft fast alle OSM-Tags weg, `roof:shape` kommt nicht an. MapLibre-`fill-extrusion` kann ohnehin nur Prismen (Flachdächer).

## Ausgeschlossen

- **Selbst hosten**: alle Gebäude weltweit sind eine hohe zweistellige GB-Menge. Zu teuer, zu viel Pflege.
- **Overpass**: Rate Limits, nicht für flächendeckende Kartenanzeige gedacht.

## Offen gehostete Kandidaten

| Quelle | Abdeckung | Dachform-Feld | Zugang | Lizenz | Bewertung |
|---|---|---|---|---|---|
| **Overture Maps Buildings** | global (OSM, Microsoft, Google, Esri u. a.) | `roof_shape` (14 Werte: flat, gabled, hipped, mansard, dome …), `roof_height`, `roof_material`, `roof_color` auf `building` und `building_part` | Offizielle PMTiles auf S3: `s3://overturemaps-extras-us-west-2/tiles/<RELEASE>/buildings.pmtiles` (älter: `overturemaps-tiles-us-west-2-beta`). Per HTTP-Range direkt in MapLibre ladbar, kein Server nötig. GeoParquet auf S3 und source.coop zusätzlich | ODbL (Teile CDLA-P, je Quelle) | **Beste Option.** Offen: Ob `roof_shape` im fertigen PMTiles-Attributsatz steckt, ist **ungeprüft**. Datei in pmtiles.io öffnen. Die Felder sind nur bei den OSM-Anteilen gefüllt, die Dachform ist also lückenhaft |
| **OSM Buildings** (`data.osmbuildings.org`) | global, aus OSM | `roofShape`, `roofHeight` | GeoJSON-Kacheln, Gratis-Tarif; Key `anonymous` in Beispielen | OSM (ODbL) für Geometrie, Endpoint-Terms unklar | Projekt gilt im OSM-Wiki als unmaintained, Backend proprietär, Bezahltarife ab 99 $/Monat. **Nicht als Abhängigkeit** |
| **3D BAG** (Niederlande) | alle ~10 Mio. Gebäude NL | `dak_type`: horizontal, slanted, multiple horizontal, unknown. Dazu Dachhöhen-Attribute (LoD1.2/2.2) | PDOK OGC API (`api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1`) ohne Auth, PDOK 3D Tiles Gebäude, TU-Delft-Downloads, source.coop | CC BY 4.0, Credit „© 3DBAG by tudelft3d and 3DGI“ | Sehr gute Daten, aber nur NL. Dachtyp ist grob (flach/schräg) |
| **LoD2-Open-Data der Länder (DE)** | je Bundesland (NRW, Berlin, Hamburg, Bayern, BW …) | echte Dachgeometrie, `Dachform`-Code in CityGML | Bulk-Downloads, teils 3D Tiles/WFS | meist DL-DE BY 2.0 / CC BY | Hohe Qualität, aber je Land eigener Weg, **nicht per Range-Request** nutzbar, Vorverarbeitung nötig |

## Nicht offen genug oder nicht passend

- **Google Photorealistic 3D Tiles, Cesium OSM Buildings**: Token nötig, Lizenz mit Nutzungsbedingungen (Cesium ion), nicht frei.
- **Global Building Atlas (TUM)**: LoD1-Höhen, keine Dachform.
- **Protomaps / VersaTiles / OpenFreeMap**: kein `roof:shape` im Kachelschema.

## Wie viel Dachform steckt überhaupt in OSM?

Ein Prozentwert war nicht auffindbar (Taginfo live prüfen: `roof:shape` gegen `building` je Land). Qualitativ: `roof:shape` und `roof:height` sind stark wachsend, aber weit unter `building:levels`. Die Abdeckung schwankt stark nach Region, in Städten mit „Simple 3D Buildings“-Mapping hoch, sonst schwach. Overture holt zusätzlich Footprints aus ML-/Fremddaten **ohne** Dachform.

## Empfehlung

1. **Schritt 0 (30 min):** Overture-`buildings.pmtiles` in pmtiles.io öffnen und prüfen, ob `roof_shape` / `roof_height` Attribute in den Tiles sind und bei welchem Zoom. Das entscheidet alles.
2. **Wenn ja:** als zweite Gebäudequelle neben `ofm` nur in Orbis Pro einbinden. Dachform im Popup/Inspector anzeigen (reine Anzeige, billig). Rendering von Satteldach, Walmdach, Pultdach als three.js-Geometrie aus Footprint + `roof_shape`, analog zu den Bäumen, nur für Gebäude mit bekannter Dachform und nahe Zoomstufen. Rest bleibt Prisma.
3. **Wenn nein:** DuckDB-WASM-Abfrage auf Overture-GeoParquet (HTTP-Range, nur sichtbarer Ausschnitt) für das Popup. Kachelrendering entfällt.
4. **Optional später:** NL über 3D BAG und deutsche Städte über LoD2 als Qualitätsinseln.

Attribution: Overture ODbL (+ jeweilige Quell-Credits), OSM © Mitwirkende, 3DBAG CC BY 4.0.

## Quellen

- [Overture: roof_shape](https://docs.overturemaps.org/schema/reference/buildings/types/roof_shape)
- [Overture: building](https://docs.overturemaps.org/schema/reference/buildings/building/)
- [Overture: Cloud-Quellen](https://docs.overturemaps.org/getting-data/cloud-sources/)
- [Overture + PMTiles](https://docs.overturemaps.org/examples/overture-tiles/)
- [OSM Buildings Data](https://osmbuildings.org/data/)
- [3D BAG auf source.coop](https://source.coop/cholmes/portolan-nl/tudelft/3dbag)
- [PDOK 3D Basisvoorziening](https://api.pdok.nl/kadaster/3d-basisvoorziening/ogc/v1)
- [OSM Wiki: roof:shape](https://wiki.openstreetmap.org/wiki/Key:roof:shape)
