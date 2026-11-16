# 05 – Offene Quellen aus Apples Quellenverzeichnis

Quelle: `https://gspe21-ssl.ls.apple.com/html/attribution-335.html` (Rev. 10/21/2026), gelesen am 16.11.2026 und
gegen `src/layers`, `src/keys/defs`, `docs/research/00–04` abgeglichen.

**Nicht geprüft:** ob die Feeds heute noch erreichbar sind, ob sie CORS erlauben und ob die Lizenz im Detail passt.
Die Seite nennt nur teils eine Lizenz. Vor dem Bau je Quelle Status, CORS und Lizenztext prüfen (wie in 01–03).

## Nicht verwertbar

Alle „Business listings“ (Yelp, Foursquare, Tripadvisor, Yext, Zomato …), CoreLogic (Parzellen), Maponics, Parkopedia,
GasBuddy, Ladenetzbetreiber (ChargePoint, EVgo …), Breezometer, QWeather, Kompass (Wanderwege), Moovit, Trafi,
Shobunsha, HERE-ähnliche Anbieter. Proprietär, keine offene Lizenz.

## Schon abgedeckt

- **Nahverkehr** (rund 300 Einträge, GTFS/GTFS-RT): über Transitous und die Feeds in `verkehr/nahverkehr` und `src/keys/defs`.
- OSM, NASA FIRMS, NWS und DWD (Warnungen), DWD ICON, Open-Meteo, Natural Earth, GEBCO über Terrarium (`meerestiefe`),
  Autobahn GmbH, TomTom (mit Schlüssel).

## Neu und offen

### Brand und Einsatz (Ebene `feuer` kennt nur FIRMS-Hotspots)

| Quelle | Inhalt | Lizenz laut Apple |
|---|---|---|
| Copernicus EFFIS | Gefahr, Brandflächen (siehe 01, 02) | CC BY 4.0 |
| CAL FIRE (fire.ca.gov) | Brände Kalifornien | State of California |
| NSW RFS, QFES (Queensland), DFES (WA), CFS (SA) | offizielle Einsätze Australien | CC BY 4.0 |
| CWFIS (NRCan) | Hotspots, Gefahr Kanada | Open Government Licence – Canada |
| Fogos.pt | Brände Portugal live | Quellenangabe |
| INPE Queimadas | Brände Brasilien | Quellenangabe |

### Warnungen (Ebenen `unwetter-usa`, `unwetter-de`)

Meteoalarm (Europa, größter Gewinn), Environment and Climate Change Canada, BoM (Australien), JMA (Japan),
INMET (Brasilien), TMD (Thailand), IMD (Indien), SMN (Mexiko).

### Verkehrsstörungen (Ebene `autobahn` ist nur Deutschland)

DGT Spanien (DATEX II, CC BY 4.0), Vejdirektoratet Dänemark (CC BY 4.0), Servei Català de Trànsit,
Esri Community Maps Straßensperrungen (CC BY 4.0).

### Einrichtungen (Punkte)

- Esri US Federal Datasets (CC BY 4.0): Feuer-/Rettungswachen, Schulgebäude, Polizei.
- Frankreich: Schulverzeichnis der Education Nationale. Schweden: Apotheken (Läkemedelsverket, CC BY 4.0).
- Mexiko: INEGI DENUE (Betriebsverzeichnis). Australien: Kitas (CC BY 4.0). UK: Food Standards Agency (OGL).
- Portugal: DGS. Städte: NYC, Chicago, Madrid, Gold Coast. Parks: Texas, Kalifornien, MLIT Japan, Trust for Public Land.
- Urban Access Regulations (Umweltzonen Europa): Lizenz erst klären.

### Basisdaten

Flickr Shapes (Ortspolygone), GeoNames, GEBCO 2019, SRTM, GlobCover (ESA), VMAP0, TIGER/Line, USGS, US State Department
(Grenzen).

## Verbesserung der Basiskarten `orbis-dark` und `orbis-light`

Stand: die Basiskarten sind in `src/map/basemaps/vector.ts` gebaut, auf OpenFreeMap-Kacheln (OpenMapTiles-Schema, OSM).
Apples Liste zeigt, woher Apple die Qualität holt: aus nationalen Kartenämtern, nicht aus OSM allein.

| Hebel | Quelle | Nutzen |
|---|---|---|
| Meeresboden-Schummerung | GEBCO / EMODnet (WMS, CC BY 4.0) | Ozean nicht mehr flach; passt zu `meerestiefe` |
| Relief | Terrarium / Mapterhorn (schon als DEM im Code) | Schummerung in beiden Themen |
| Nationale Kartenämter (Rückfall oder Überlagerung) | swisstopo (schon als Regionalkarte), Kartverket (CC BY 4.0), NLS Finnland, IGN Frankreich, LINZ (CC BY 3.0 NZ), Ordnance Survey OpenData (OGL), CanVec (OGL Kanada), TIGER | genauere Gewässer, Wege, Gelände je Land; als regionale Karten wie `regional.ts` |
| Parks und Schutzgebiete | Trust for Public Land, State Parks, MLIT | vollständigere Grünflächen in USA und Japan |
| Ortsnamen und Viertel | GeoNames, Flickr Shapes, logainm (Irland, CC BY) | mehr und bessere Beschriftung, Stadtviertel |
| Grenzen | Natural Earth, US State Dept (LSIB) | gemeinfreie, saubere Landesgrenzen |
| Landbedeckung | ESA WorldCover/GlobCover | Wald, Wüste, Eis als Flächenton; Ebene `landbedeckung` existiert |

Ehrliche Einschätzung: Der größte Hebel ist Meeresboden plus Relief (gleich für alle Länder, schon Code vorhanden).
Nationale Kartenämter lohnen nur als regionale Zusatzkarten, nicht für die globale Basiskarte.
