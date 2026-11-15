# 01 – Was die vorhandenen Quellen schon liefern, Orbis aber nicht zeigt

Alle Endpunkte am 15.11.2026 live geprüft (Status, CORS, Größe). `Baustein` = vorhandener Render-Baustein
aus `src/render`, mit dem die Ebene ohne neuen Code entsteht.

## 1. NASA GIBS: 1 330 Kachel-Layer, Orbis nutzt eine Handvoll

`gibsLayer` kann **jeden** dieser Layer mit einer Zeile rendern (`layer`, `matrixSet`, `date`).
WMTS-Capabilities: 5,8 MB, CORS `*`. Auszug der stärksten ungenutzten Layer:

| Layer-ID | Was man sieht | Kadenz | Baustein |
|---|---|---|---|
| `IMERG_Precipitation_Rate` / `_30min` | globaler Niederschlag, radarähnlich, 0,1° | 30 min | `gibsLayer` |
| `VIIRS_SNPP_DayNightBand_At_Sensor_Radiance` | Nachtlicht **tagesaktuell** – Stromausfälle, Krieg, Feste | täglich | `gibsLayer` |
| `VIIRS_SNPP_L2_Chlorophyll_a`, `OCI_PACE_Chlorophyll_a` | Algenblüten, Ozeanproduktivität | täglich | `gibsLayer` |
| `TROPOMI_L2_Nitrogen_Dioxide_Tropospheric_Column` | **NO₂-Fahnen** über Städten/Schifffahrtsrouten | täglich | `gibsLayer` |
| `TROPOMI_L2_Sulfur_Dioxide_Total_Vertical_Column` | Vulkan- und Industrie-SO₂ | täglich | `gibsLayer` |
| `AIRS_L3_Methane_400hPa_...` / `OCO-2_Carbon_Dioxide_Total_Column_Average` | Methan/CO₂ | täglich–monatlich | `gibsLayer` |
| `MODIS_Terra_L3_Land_Surface_Temp_8Day_Day` | Oberflächentemperatur (Hitzeinseln) | 8 Tage | `gibsLayer` |
| `MODIS_Terra_NDSI_Snow_Cover_Daily` | Schneebedeckung global | täglich | `gibsLayer` |
| `AMSRU2_Sea_Ice_Concentration_12km` | Meereiskonzentration | täglich | `gibsLayer` |
| `MODIS_Aqua_L2_Sea_Surface_Temp_Day` | SST statt Open-Meteo-Punkte | täglich | `gibsLayer` |
| `GRACE_Tellus_Liquid_Water_Equivalent_Thickness_Mascon_CRI` | **Grundwasser-/Gesamtwasserschwund** | monatlich | `gibsLayer` |
| `SMAP_L3_..._Soil_Moisture` / `AMSRE_Soil_Moisture_NPD_Day` | Bodenfeuchte | täglich | `gibsLayer` |
| `MODIS_Terra_L3_EVI_16Day`, `VIIRS_SNPP_NDVI_8Day` | Vegetationszustand | 8–16 Tage | `gibsLayer` |
| `MEaSUREs_Daily_Landscape_Freeze_Thaw_SSMI` | Auftau-/Gefrierlinie | täglich | `gibsLayer` |
| `OMPS_Aerosol_Index` / `OMI_Aerosol_Index` | Saharastaub, Rauch | täglich | `gibsLayer` |
| `LIS_Very_High_Resolution_Lightning_...Climatology` | Blitzhäufigkeit als Klimakarte | statisch | `gibsLayer` |
| `GPW_Population_Density_2020` | Bevölkerung | statisch | `gibsLayer` |
| `BlueMarble_ShadedRelief_Bathymetry` | Relief mit Meeresboden | statisch | `gibsLayer` |
| `Landsat_Human_Built-up_And_Settlement_Extent` | Siedlungsfläche | statisch | `gibsLayer` |

Das sind ~15 neue Ebenen, **ohne** neue Quelle, ohne Key, ohne eigenen Server. Lizenz: NASA, public domain.

## 2. Copernicus EFFIS: Waldbrandgefahr und Brandflächen

WMS `https://maps.effis.emergency.copernicus.eu/effis`, CORS `*`, Lizenz CC BY 4.0 (JRC).
Wichtig: `STYLES=` muss mitgeschickt werden, sonst `MissingParameterValue`.

| Layer | Inhalt |
|---|---|
| `mf010.fwi` | **Feuerwetterindex** (Gefahrenstufe) für heute/1–10 Tage |
| `mf010.isi`, `.bui`, `.ffmc`, `.dmc`, `.dc` | Teilindizes (Ausbreitung, Brennstofftrockenheit) |
| `mf010.anomaly` | Abweichung vom langjährigen Mittel |
| `effis.nrt.ba.poly` | **Brandflächen in Echtzeit** (Polygone, letzte 24 h) |
| `modis.ba.week/.month/.season` | abgebrannte Fläche Woche/Monat/Saison |
| `modis.ba.2016 … 2025` | **Brandflächen-Historie 2016–2025** (Zeitachse!) |
| `fuel_map` | Brennstoffkarte |

Ergänzt `gefahren/feuer` (FIRMS-Punkte) um die Fläche und die Vorhersage. Sehr stark: die
Jahres-Historie auf der bestehenden Zeitachse.

## 3. EMODnet Human Activities: die Meeresökonomie als WMS

`https://ows.emodnet-humanactivities.eu/wms`, CORS `*`, CC BY 4.0. 80+ Layer, u. a.:

`windfarms` (Offshore-Windparks), `powercables`, `telecablesactual`, `aggregates`/`aggregateareas`
(Kiesabbau), `aquaculture`, `desalination`, `dischargepoints` (Einleitungen), `dredging`/`dredgespoil`,
`emodnetmarinas`, `bathingwaters`, `cddaareas`/`cddalocations` (Schutzgebiete), `activelicenses`
(Rohstofflizenzen), `divisioncatches`/`divisioneffort` (Fischerei), `faoareas`.

Damit ließe sich `meer` um eine ganze Gruppe „Nutzung“ erweitern – ohne eine einzige neue Datei.

## 4. NOAA: viel mehr als NWS-Warnungen

| Produkt | Endpunkt | Größe | CORS | Lizenz |
|---|---|---|---|---|
| **Alle aktiven Warnungen** | `api.weather.gov/alerts/active?status=actual` | 2,1 MB | `*` | PD |
| SPC Outlook Tag 1/2/3 (GeoJSON) | `spc.noaa.gov/products/outlook/day{1,2,3}otlk_cat.nolyr.geojson` | 0,5–3 KB | `*` | PD |
| SPC **Sturmberichte** (Tornado/Hagel/Wind, tagesaktuell) | `spc.noaa.gov/climo/reports/YYMMDD_rpts_torn.csv` | KB | `*` | PD |
| SPC **Feuerwetter-Outlook** | `spc.noaa.gov/products/outlook/day1otlk_fire.nolyr.geojson` → 404, Pfad prüfen | | | PD |
| **HURDAT2** – alle Atlantik-Hurrikane seit 1851, 6-Stunden-Spur | `nhc.noaa.gov/data/hurdat/hurdat2-1851-2024-040425.txt` | 7,0 MB | nein | PD |
| **NCEI Hazard Service** – Tsunamis seit 2000 v. Chr., Erdbeben seit 2150 v. Chr. | `ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/events` | 70 KB | `*` | PD |
| **Aviation Weather** – METAR, TAF, **SIGMET/AIRMET-Polygone** | `aviationweather.gov/api/data/metar?bbox=…&format=json` | 80 KB | nein | PD |
| NCEI Storm Events (Schäden, Tote, Hagelgröße) | `ncei.noaa.gov/pub/data/swdi/stormevents/csvfiles/` | Zip | `*` | PD |
| Coral Reef Watch (Bleiche) | `coralreefwatch.noaa.gov` (WMS-Pfad prüfen) | | | PD |

**HURDAT2** ist der stärkste Fund: 174 Jahre Hurrikan-Spuren mit Wind, Druck, Zuggeschwindigkeit.
Animation über die Zeitachse = „Die Geschichte der Hurrikane“. Braucht einen Collector (kein CORS),
aber die Datei ist statisch und ändert sich saisonal.

**NCEI Hazard Service** liefert antike Tsunamis und Erdbeben mit Koordinaten – eine
„Naturkatastrophen der Geschichte“-Ebene, die die Zeitachse weit über die Live-Fenster hinaus öffnet.

## 5. USGS: Wasser, Beben, Vulkane, Erdrutsche

| Produkt | Endpunkt | CORS | Lizenz |
|---|---|---|---|
| **NWIS** Abfluss/Pegel/Grundwasser, alle Parameter | `waterservices.usgs.gov/nwis/iv/?format=json&parameterCd=00060` | `*` | PD |
| FDSN Event (beliebige Filter, ShakeMap/PAGER-Verknüpfung) | `earthquake.usgs.gov/fdsnws/event/1/query` | `*` | PD |
| Earthquake-Feeds in allen Stufen (`all_day`, `4.5_week`, …) | `earthquake.usgs.gov/earthquakes/feed/v1.0/summary/` | `*` | PD |
| Volcano-Observatorien (VONA-Meldungen, Alert-Level) | `volcanoes.usgs.gov/vsc/api/` bzw. `avo.alaska.edu/` | prüfen | PD |
| **LHASA** Erdrutsch-Gefahr | `gibs`/`landslides.usgs.gov` | | PD |
| MRDS (bereits genutzt) + **Mineral Resources online** | `mrdata.usgs.gov` | `*` | PD |

NWIS ist der Gegenentwurf zu GloFAS: **gemessene** Abflüsse an zehntausenden Stationen, plus
Grundwasserstände und Wasserqualität. Nur USA, aber mit Pegel-Historie.

## 6. NOAA SWPC: Weltraumwetter jenseits von Polarlicht

| Produkt | Endpunkt | CORS |
|---|---|---|
| Aurora-Vorhersage (30/60/90 min) | `services.swpc.noaa.gov/json/ovation_aurora_latest.json` (genutzt) + `…/ovation_aurora_forecast.json` | `*` |
| **Dst-Index** (Ringstrom) | `…/json/geospace/geospace_dst_1_hour.json` | `*` |
| **Sonnenflare-Liste** | `…/json/goes/primary/xray-flares-latest.json` | `*` |
| Sonnenzyklus (Literaturwerte + Vorhersage) | `…/json/solar-cycle/observed-solar-cycle-indices.json` | `*` |
| D-RAP Kurzwellen-Absorption (Polkappen) | `…/json/d-rap/global.json` | `*` |
| Magnetometer-Ketten (Boulder, Fredericksburg …) | `…/json/planetary_k_index_1m.json` | `*` |
| Strahlungsstürme (Protonen) | `…/json/goes/primary/integral-protons-1-day.json` | `*` |

D-RAP als Flächenlayer über der Polarregion und Dst als Zeitreihe im Inspector wären zwei
schnelle, sehr „wissenschaftliche“ Ergänzungen zu `polarlicht`.

## 7. Open-Meteo: ein Vielfaches der heutigen Variablen

Orbis nutzt Temperatur, Feuchte, Niederschlag, Wolken, Druck, Wind, Böen, CAPE, Schnee, Strahlung.
Frei und ohne Key zusätzlich (CC BY 4.0, 600/min):

- `soil_temperature_0_to_7cm`, `soil_moisture_0_to_7cm` (bis 100 cm) – **Bodenfeuchte** für Dürre/Landwirtschaft
- `et0_fao_evapotranspiration`, `vapour_pressure_deficit` – Verdunstung, Trockenstress
- `direct_radiation`, `diffuse_radiation`, `terrestrial_radiation`, `sunshine_duration`, `uv_index`
- `visibility`, `dew_point_2m`, `apparent_temperature` (heute berechnet, könnte direkt kommen)
- `cloud_cover_low/mid/high`, `freezing_level_height`, `boundary_layer_height`
- `snowfall_water_equivalent`, `snow_depth`, `ice_thickness` (Seen)
- `lightning_potential`, `convective_inhibition`, `lifted_index`, `shear_*` – Gewitterparameter
- `growing_degree_days_*`, `leaf_wetness_probability`
- **Archive API** (`archive-api.open-meteo.com`) – 1940 bis gestern, für Zeitreisen/Klimanormalien
- **Climate API** (`climate-api.open-meteo.com`) – CMIP6-Projektionen bis 2050
- **Ensemble API** – Unsicherheit statt einer Linie
- **Previous Runs API** – Modelländerung von Lauf zu Lauf
- **Marine API**: `ocean_current_velocity`, `wave_period`, `secondary_swell_*`, `sea_surface_temperature`
- **Air Quality**: zusätzlich `ammonia`, `methane`, `nitrogen_dioxide`, `sulphur_dioxide`,
  `carbon_monoxide`, `formaldehyde`, `aerosol_optical_depth`, `dust`, `uv_index_clear_sky`

Wichtig: jede zusätzliche Variable im selben Aufruf kostet **keine** zusätzlichen Abrufe. Die
Luftqualitätsebene könnte also CO, SO₂, NH₃ und Staub praktisch gratis mitnehmen.

## 8. OpenStreetMap: tausende Tags, Orbis nutzt ~20 Klassen

Die PMTiles-Pipeline (`osm-tiles.mjs`) kann jede Tag-Klasse als eigenen Satz bauen. Visuell
starke, noch fehlende Klassen (global, ODbL):

| Klasse | OSM-Tag | Aussehen | Nutzen |
|---|---|---|---|
| **Stromnetz** | `power=line`/`minor_line`/`tower`/`substation` | Liniennetz + Knoten | „Der Aderlass der Welt“ – passt zu Kraftwerken |
| Pipelines | `man_made=pipeline` | Linien | heute nur Seekabel/Pipelines manuell |
| Staudämme | `waterway=dam`, `landuse=reservoir` | Punkte/Flächen | Wasser, Energie, Risiko |
| Kläranlagen/Wasserwerke | `man_made=wastewater_plant`, `water_works` | Punkte | Wasserversorgung |
| Brücken/Tunnel | `bridge`, `tunnel` | Linien | Infrastruktur-Dichte |
| Baustellen | `construction=*` | Punkte | Stadtentwicklung live |
| Hochhäuser | `building:levels>=20` | Punkte | Skyline |
| Bergbau | `landuse=quarry`, `man_made=mineshaft` | Flächen/Punkte | ergänzt `rohstoffe` |
| Leuchttürme | `man_made=lighthouse` | Punkte | Kuriosa, Schifffahrt |
| Burgen/Schlösser | `historic=castle` | Punkte | Kultur |
| Bunker | `military=bunker` | Punkte | Zeitgeschichte |
| Sternwarten | `man_made=observatory` | Punkte | Wissenschaft |
| Kirchen/Moscheen/Tempel | `amenity=place_of_worship` | Punkte | Religionsgeografie |
| Sportstadien | `leisure=stadium` | Flächen | Sport |
| Bahnübergänge | `railway=level_crossing` | Punkte | Verkehrssicherheit |
| Ladestationen | `amenity=charging_station` | Punkte | E-Mobilität |
| Tankstellen | `amenity=fuel` | Punkte | Verkehr |
| Feuerwachen/Krankenhäuser | `amenity=fire_station`/`hospital` | Punkte | Gefahrenabwehr |
| Flughafen-Infrastruktur | `aeroway=terminal`/`runway` | Flächen/Linien | ergänzt `flughafen-plan` |
| Grenzübergänge | `barrier=border_control` | Punkte | Verkehr, Politik |

Overpass ist CORS-frei erreichbar (Test: 200, `*`), aber für globale Mengen braucht es die
PMTiles-Pipeline. Die bestehende Infrastruktur ist genau dafür gebaut.

## 9. CelesTrak: 7 TLE-Gruppen im Bucket, Dutzende verfügbar

Bereits gespiegelt: `starlink`, `stations`, `science`, `visual`, `weather`, `gps-ops`, `galileo`.
Frei und ohne Key zusätzlich: `active` (11 000+ Objekte, 7 MB JSON), `geo`, `iridium`, `oneweb`,
`beidou`, `glo-ops`, `sbas`, `engineering`, `debris`, `last-30-days`, `analyst`, `molniya`.

`active` als „alle Satelliten“-Ebene (mit `satellite.js` bereits im Haus) ist ein Schauwert-Layer:
11 000 Punkte, davon ein Bruchteil sichtbar. Lizenz: CelesTrak frei, Attribution.

## 10. The Space Devs (Launch Library 2): mehr als Starts

Neben `launches/upcoming` frei: `agencies`, `astronauts`, `events`, `expeditions`, `spacestations`,
`docking_events`, `launch_vehicles`, `spacecraft`, `spacelaunches` (historisch, 1957+).
Eine **Startplatz-Historie** (alle Starts seit 1957 mit Koordinaten) ist eine starke Zeitachse.
Lizenz: frei, Attribution „The Space Devs“.

## 11. HDX/Humdata: der humanitäre Katalog

Die API ist offen (`data.humdata.org/api/3/action/package_search`, CORS `*`, 150 KB). Geliefert
werden u. a.: Verwaltungsgrenzen (admin 0–4), Straßen, Gesundheitseinrichtungen, Schulen,
Wasserstellen, Märkte, Siedlungen, Vertreibungslager, Ernährungssicherheit (IPC, FEWS NET),
Bevölkerungsschätzungen. Lizenz je Datensatz (meist CC BY / ODbL / CC BY-IGO) – beim Import
mitnehmen. Orbis nutzt bisher nur Gaza/Ukraine-Dateien daraus.

## 12. Kleinere, sofort mögliche Ergänzungen

| Quelle | Was zusätzlich geht | Lizenz |
|---|---|---|
| **Radio Browser** | Filter nach Sprache, Land, Bitrate, Codec, Tags, Stream-Status | frei |
| **Safecast** | Gerätetyp, Batterie, Gehäusetemperatur als Inspector-Fakten | CC0 |
| **BfS ODL** | kosmischer vs. terrestrischer Anteil, Stationsstatus, Höhe | DL-DE 2.0 |
| **Wikidata** | SPARQL frei: alle Objekte mit Koordinaten (Burgen, Leuchttürme, Observatorien, UNESCO, Kraftwerke …) | CC0 |
| **OpenSky** | Flugzeugtyp, Registrierung, Route, Squawk, Vertikalrate | frei/NC |
| **BarentsWatch** | AIS-Ziele mit Zielhafen, Tiefgang, ETA | NLOD 2.0 |
| **demonstrations.org** | Kategorien, Teilnehmerzahl, Organisatoren | CC BY-SA 4.0 |
| **WRI Power Plants** | Brennstoff, Kapazität, Betreiber, Inbetriebnahme, Emissionen | CC BY 4.0 |
| **GVP Vulkane** | Eruptionshistorie (Jahr, VEI), Gesteinsart, letzte Eruption | Attribution |

## 13. Geprüft und verworfen

| Quelle | Grund |
|---|---|
| `spc.noaa.gov/…/day1otlk_fire.nolyr.geojson` | 404 (Pfad geändert) – Ersatz suchen |
| `nowcoast.noaa.gov` ArcGIS REST | 403 ohne Referer |
| `coralreefwatch.noaa.gov/geoserver/wms` | 404 – WMS-Pfad neu ermitteln |
| `gwis.jrc.ec.europa.eu/…/wms` | liefert HTML, kein WMS |
| `emergency.copernicus.eu/…/list-of-components` | 404 (neue URL) |
| `power.larc.nasa.gov` | 200, aber **kein** CORS → nur über Collector |
| `tiles.openinframap.org` | DNS auflösbar, aber Host tot |
| `data.effis.emergency.copernicus.eu` | TLS-Zertifikat abgelaufen |
