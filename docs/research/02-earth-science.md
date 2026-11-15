# 02 – Erdsystem, Natur und Wissenschaft: neue Domänen

Fokus: Quellen, die Orbis **noch nicht** anfasst. Live geprüft am 15.11.2026, CORS-Angabe aus dem
tatsächlichen Response-Header. `Baustein` = vorhandener Render-Baustein.

---

## 1. Kryosphäre – Eis, Schnee, Permafrost, Wasser

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **Global Surface Water** (JRC) | jede je beobachtete Wasserfläche, 1984–2021, als Kacheln | `storage.googleapis.com/global-surface-water/tiles2021/occurrence/{z}/{x}/{y}.png` ✅ 200, `*` | ja | Copernicus, frei | **S** (`rasterLayer`) |
| **GRACE-FO** Wasseräquivalent | Grundwasser-/Eisschwund als Monatskarte | GIBS `GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI` ✅ | ja | PD | S (`gibsLayer`) |
| **Sea Ice Concentration** (AMSR2, 12 km) | Meereis, täglich | GIBS `AMSRU2_Sea_Ice_Concentration_12km` | ja | PD | S |
| **Snow Cover Daily** (MODIS NDSI) | Schneegrenze täglich | GIBS `MODIS_Terra_NDSI_Snow_Cover_Daily` | ja | PD | S |
| **Freeze/Thaw** | Auftaulinie der borealen Zone | GIBS `MEaSUREs_Daily_Landscape_Freeze_Thaw_SSMI` | ja | PD | S |
| **Permafrost** (ESA CCI / GTN-P) | Auftaugefahr, Bohrlöcher | `cci.esa.int`, `gtnpdatabase.org` (Download) | – | ESA/CC BY | M |
| **Gletscher-Inventar RGI 7** | ~215 000 Gletscher als Polygone | `nsidc.org/data/nsidc-0770` | – | frei, Attribution | M |
| **WGMS Fluktuationen** | Längenänderung je Gletscher, Zeitreihe | `wgms.ch` (403 auf /downloads, Zugang prüfen) | – | CC BY | M |
| **Iceberg-Tracker** (USNIC/AWS) | Antarktische Eisberge, Drift | `usicecenter.gov`, `icebergwatch` | – | PD | M |
| **Schelfeis-Kalben** (NSIDC) | Kalbungsfronten | `nsidc.org/data` | – | PD | M |

Der schnellste Gewinn: **Global Surface Water** + **GRACE** + **Sea Ice**. Drei Kachel-Layer, keine
Dateien, keine Collector-Läufe.

---

## 2. Hydrologie – Flüsse, Seen, Grundwasser, Dürre

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **USGS NWIS** | gemessene Abflüsse, Grundwasserstände, Wasserqualität | `waterservices.usgs.gov/nwis/iv/?format=json&parameterCd=00060` ✅ 4,8 MB | `*` | PD | M |
| **GRDC** | Abfluss langjähriger Pegel weltweit | `grdc.bafg.de` (Download/API) | – | frei, Attribution | M |
| **HydroLAKES / GRanD** | 1,4 Mio. Seen, 7 000 Staudämme mit Volumen | `hydrosheds.org` | – | CC BY | M |
| **JRC Global Surface Water** | s. o. | s. o. | `*` | frei | S |
| **Ramsar-Feuchtgebiete** | 2 500 Schutzgebiete | `rsis.ramsar.org` (ArcGIS) | prüfen | frei, Attribution | S |
| **Aqueduct Water Risk** (WRI) | Wasserstress, Überschwemmungsrisiko | `wri.org/aqueduct` (ArcGIS/CSV) | prüfen | CC BY 4.0 | M |
| **Global Drought Observatory** | Dürreindex, kombinierter Indikator | `edo.jrc.ec.europa.eu`, `gdo.unccd.int` (WMS) | prüfen | CC BY | M |
| **SPEI Global Drought Monitor** | Dürre weltweit, 1–48 Monate | `spei.csic.es` (NetCDF/PNG) | – | CC BY | M |
| **US Drought Monitor** | wöchentliche Dürrestufen (USA) | `droughtmonitor.unl.edu/data/json` | prüfen | PD | S |
| **Global Flood Database** | 913 Überschwemmungen 2000–2018 mit Fläche | `global-flood-database.cloudtostreet.info` | – | CC BY | M |
| **Dartmouth Flood Observatory** | Hochwasser-Historie seit 1985 | `floodobservatory.colorado.edu` | – | frei | M |
| **Hydroweb / Seenpegel** | Wasserstand großer Seen (Zeitreihe) | `hydroweb.theia-land.fr` | – | frei | M |

**Dürre** ist die größte Lücke: Orbis hat Niederschlag und Bodenfeuchte, aber keinen Dürrebegriff.
SPEI/GDO als Raster + US Drought Monitor als Flächen füllen sie sofort.

---

## 3. Ozean – Physik, Chemie, Leben

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **Argo-Floats** | 4 000 Drifter, Temperatur-/Salzprofil beim Klick | `erddap.ifremer.fr/erddap/tabledap/ArgoFloats…` (Dataset-ID prüfen) | – | frei | M |
| **Global Drifter Program** | Oberflächenströmung als Spaghetti | `aoml.noaa.gov/phod/gdp` | – | PD | M |
| **Coral Reef Watch** | Bleiche-Risiko (DHW), global | `coralreefwatch.noaa.gov` (WMS-Pfad neu suchen) | – | PD | M |
| **Chlorophyll** | Algenblüten täglich | GIBS `VIIRS_SNPP_L2_Chlorophyll_a`, `OCI_PACE_Chlorophyll_a` ✅ | ja | PD | S |
| **SST** | Oberflächentemperatur | GIBS `MODIS_Aqua_L2_Sea_Surface_Temp_Day` | ja | PD | S |
| **EMODnet Bathymetrie** | feiner als GEBCO, EU | `ows.emodnet-bathymetry.eu/wms` ✅ 200, `*` | ja | CC BY 4.0 | S |
| **ProtectedSeas / MPAtlas** | Meeresschutzgebiete, Fischereiregeln | `protectedseas.net`, `mpatlas.org` | – | CC BY-NC (prüfen) | M |
| **Global Fishing Watch** | Fischereiintensität (AIS) | `globalfishingwatch.org/our-apis` | – | **CC BY-NC 4.0** ⚠ | L |
| **Ozeanversauerung** (SOCAT) | pH/Karbonat | `socat.info` | – | frei | M |
| **Hydrothermalquellen / Unterwasservulkane** | Punkte | `interridge.org`, OSM | – | frei | S |

**Coral Reef Watch** und **Argo** sind die zwei Layer, die dem Meeresteil am meisten fehlen –
Riffbleiche ist ein globales Ereignis mit klarer Zeitdimension.

---

## 4. Biosphäre – Arten, Wälder, Schutzgebiete

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **GBIF Dichte-Kacheln** | globale Biodiversität als Heatmap | `api.gbif.org/v1/map/occurrence/density/{z}/{x}/{y}.png?srs=EPSG:3857` ✅ (liefert PNG, Status 400 – Parameter prüfen) | `*` | je Datensatz CC0/CC BY | **S** |
| **iNaturalist** | lebende Beobachtungen, weltweit, mit Foto | `api.inaturalist.org/v1/observations?nelat=…` ✅ 40 KB, `*` | ja | CC0/CC BY/CC BY-NC je Beobachter ⚠ | S |
| **Wälder: Tree Cover Loss** | Abholzung 2001–2024 als Kacheln | `tiles.globalforestwatch.org/umd_tree_cover_loss/latest/v1/{z}/{x}/{y}.png` ✅ | nein (Proxy) | CC BY 4.0 | S |
| **Tree Cover Density** | Waldbedeckung | `tiles.globalforestwatch.org/umd_tree_cover_density_2010/…` ✅ | nein | CC BY 4.0 | S |
| **GLAD-Alarme** | illegale Abholzung, wöchentlich | `glad.umd.edu` (API) | – | CC BY | M |
| **WDPA / Protected Planet** | alle Schutzgebiete weltweit | `api.protectedplanet.net/v3/…?token=` (Token nötig, kostenlos) | – | frei, Attribution | M |
| **Natura 2000 / CDDA** | EU-Schutzgebiete | `ows.emodnet-humanactivities.eu` → `cddaareas` ✅ | `*` | CC BY | S |
| **IUCN Ranges** | Verbreitungsgebiete bedrohter Arten | `iucnredlist.org/resources/spatial-data` (Login) | – | **NC** ⚠ | L |
| **Global Fire Atlas** | Feuerregime, 2003–2016 | `globalfireatlas.org` | – | CC BY | M |
| **Movebank** | Tierwanderungen (Zugvögel, Wale) | `movebank.org` (API, teils offen) | – | je Studie | L |
| **eBird** | Vogelbeobachtungen | `api.ebird.org` (Key, kostenlos) | – | CC BY | M |

**iNaturalist** ist der stärkste „lebendige“ Layer: weltweit ~390 Mio. Beobachtungen, davon
~700 000 im letzten Winter allein im DACH-Raum. Ein `pointLayer` mit Cluster, Foto im Inspector.

---

## 5. Geologie und Geophysik

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **GEM Active Faults** | alle bekannten aktiven Verwerfungen | `gem-global-faults` (Download) | – | CC BY | M |
| **NASA LHASA** | Erdrutsch-Gefahr, täglich | `gibs`/`landslides.nasa.gov` | – | PD | M |
| **Global Landslide Catalog** | 11 000 Ereignisse mit Datum | `data.nasa.gov` | – | PD | S |
| **GVP Eruptionshistorie** | Ausbrüche mit VEI, Zeitachse | bereits im Bucket, Parser wirft Historie weg | – | Attribution | **S** |
| **INTERMAGNET** | Erdmagnetfeld-Observatorien live | `intermagnet.org` (JSON) | – | frei | M |
| **WMM / Magnetfeld** | Deklination, Feldstärke | `ngdc.noaa.gov/geomag` | – | PD | M |
| **EGMS / Subsidenz** | Bodenabsenkung (InSAR) | `land.copernicus.eu` | – | Copernicus | L |
| **COMET-LiCS** | Sentinel-1 Deformation | `comet.nerc.ac.uk` | – | frei | L |
| **Geothermie** | Wärmefluss, Anlagen | `heatflow.world`, OSM | – | frei | S |
| **Meteorite** | Einschläge weltweit | `meteoriticalbulletin`/Wikidata | – | frei | S |

Die **GVP-Eruptionshistorie** ist der billigste Gewinn im ganzen Bericht: Die Daten liegen schon im
Bucket, der Parser behält nur das letzte Jahr. Ein zweiter Parser-Zweig macht daraus eine
200-Jahre-Zeitachse.

---

## 6. Atmosphäre und Strahlung

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **IMERG Niederschlag** | globaler Regen, 30 min | GIBS `IMERG_Precipitation_Rate_30min` ✅ | ja | PD | S |
| **TROPOMI NO₂ / SO₂ / CH₄** | Emissionsfahnen | GIBS `TROPOMI_L2_*` ✅ | ja | Copernicus | S |
| **Aerosol-Index** | Saharastaub, Rauch | GIBS `OMPS_Aerosol_Index` | ja | PD | S |
| **Blitz-Klimatologie** | mittlere Blitzrate | GIBS `LIS_…Climatology` | ja | PD | S |
| **OpenAQ** | weltweite Bodenmessstationen | `api.openaq.org/v3` (Key kostenlos) | – | CC BY 4.0 | M |
| **PurpleAir** | Feinstaub, private Sensoren | `api.purpleair.com` (Key) | – | eigene Terms ⚠ | M |
| **ICOS** | europäische CO₂/CH₄-Stationen | `icos-cp.eu` (API) | – | CC BY | M |
| **NOAA Carbon** | Keeling-Kurve, globale CO₂-Messungen | `gml.noaa.gov/ccgg` | – | PD | S |
| **Saharastaub-Vorhersage** | Staubwolken über Europa | CAMS via Open-Meteo (`dust`) | ja | CC BY | S |
| **UV-Index global** | Tagesmaximum | Open-Meteo `uv_index` | ja | CC BY | S |

**TROPOMI** ist visuell spektakulär: einzelne Schiffe, Kraftwerke und Städte als NO₂-Fahne.

---

## 7. Weltraum, Astronomie, Nacht

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **Sonnenfinsternis-Pfade** | Totalitätszone auf dem Globus, 2001–2030 | `eclipse.gsfc.nasa.gov/SEpath/…` (HTML; Bessel-Elemente rechnen) | nein | PD | M |
| **CNEOS Close Approaches** | Asteroiden-Vorbeiflüge | `ssd-api.jpl.nasa.gov/cad.api` ✅ 0,7 KB | nein | PD | S |
| **Fireballs** | helle Meteore mit Ort/Energie | `ssd-api.jpl.nasa.gov/fireball.api` ✅ | nein | PD | S |
| **Lichtverschmutzung** | Himmelshelligkeit | `lightpollutionmap.info` (VIIRS), `globenight` | – | CC BY | S |
| **Dark-Sky-Parks** | Schutzgebiete der Nacht | `darksky.org` (Liste) | – | frei | S |
| **Sternwarten** | weltweit, Wikidata | `query.wikidata.org` ✅ `*` | ja | CC0 | S |
| **ISS / Satelliten** | Position, Überflug | `api.wheretheiss.at/v1/satellites/25544` ✅ `*` | ja | frei | S |

Die **Sonnenfinsternis** ist der „Aha“-Layer: 12. August 2026 über Spanien/Island, 2. August 2027
über Ägypten. Ein Streifen auf dem Globus, der Menschen bewegt. Daten sind NASA-PD, die Bahn lässt
sich aus den Bessel-Elementen lokal berechnen – kein Server nötig.

---

## 8. Historische Naturereignisse – die Zeitachse füllen

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **HURDAT2** | **alle Atlantik-Hurrikane seit 1851**, 6-h-Spur mit Wind/Druck | `nhc.noaa.gov/data/hurdat/hurdat2-1851-2024-040425.txt` ✅ 7 MB | nein | PD | **M** |
| **NCEI Tsunamis** | Tsunamis seit 2000 v. Chr. | `ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/events` ✅ `*` | ja | PD | **S** |
| **NCEI historische Beben** | Beben seit 2150 v. Chr. | `…/api/v1/earthquakes` ✅ `*` | ja | PD | **S** |
| **SPC Sturmberichte** | Tornados/Hagel/Wind je Tag | `spc.noaa.gov/climo/reports/YYMMDD_rpts_torn.csv` ✅ `*` | ja | PD | S |
| **Storm Events** | Schäden, Tote, Hagelgröße (1950–) | `ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/` ✅ | `*` | PD | M |
| **EFFIS Brandflächen 2016–2025** | jede Jahres-Brandfläche | `maps.effis…/effis` → `modis.ba.2024` ✅ | `*` | CC BY | S |
| **Volcano-Historie** | s. o. | Bucket | – | Attribution | S |

Mit HURDAT2, NCEI und EFFIS-Historie bekommt die Zeitachse endlich **Jahrzehnte statt Wochen**.
Das ist der größte konzeptionelle Gewinn: Orbis wird vom „Was passiert gerade“ zum „Was ist passiert“.

---

## 9. Geprüft und verworfen

| Quelle | Grund |
|---|---|
| `api.gbif.org/v1/occurrence/search` | 200, aber kein CORS → nur über Proxy/Collector |
| `api.protectedplanet.net` ohne Token | 401, Token kostenlos aber Registrierung nötig |
| `wgms.ch/downloads` | 403 |
| `maps.isric.org` (SoilGrids WMS) | Timeout im Test – erneut prüfen |
| `sedac.ciesin.columbia.edu/geoserver` | Timeout |
| `erddap.ifremer.fr/…/ArgoFloats` | 400 (Dataset-ID falsch) – Katalog lesen |
| `coralreefwatch.noaa.gov/geoserver/wms` | 404 |
| `api.research-fish.com` | DNS tot |
| `data.effis.emergency.copernicus.eu` | TLS-Zertifikat abgelaufen |
| Globale Bodenfeuchte über SMAP | nur als GIBS-Kachel sinnvoll, kein Punkt-API |
| IUCN Ranges | NC-Lizenz, Zugang mit Login → nicht konform |
