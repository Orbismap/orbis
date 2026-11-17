# Neue Daten für Orbis – Synthese

Vier Berichte, Stand 15.11.2026:

| Datei | Inhalt |
|---|---|
| [00-already-mirrored.md](00-already-mirrored.md) | liegt schon im Bucket, wird nicht gerendert |
| [01-existing-sources.md](01-existing-sources.md) | vorhandene Anbieter, ungenutzte Produkte |
| [02-earth-science.md](02-earth-science.md) | Erdsystem, Natur, Wissenschaft |
| [03-human-tech.md](03-human-tech.md) | Mensch, Technik, Wirtschaft, Kultur |
| [06-building-roofs.md](06-building-roofs.md) | Dachformen für 2.5D-Häuser (Overture, 3D BAG, LoD2) |

Regel für alles hier: **offene Lizenz** (Public Domain, CC0, CC BY, CC BY-SA, ODbL, OGL, DL-DE,
Copernicus, NLOD). NC-Kandidaten sind mit ⚠ markiert und stehen unten separat.

---

## Die 20 stärksten Empfehlungen

Bewertung: Wirkung auf der Karte × Aufwand × Lizenzsicherheit.

| # | Ebene | Quelle | Lizenz | Aufwand | Bericht |
|---|---|---|---|---|---|
| 1 | **Flugrouten der Welt** (67 000 Großkreis-Bögen) | OpenFlights | ODbL | S | 03 |
| 2 | **Mars-Rover-Spuren** + Ingenuity-Flüge | NASA MMGIS (im Bucket!) | PD | S | 00 |
| 3 | **Live-Strommix und Börsenpreis** | Energy-Charts | CC BY 4.0 | M | 03 |
| 4 | **15 neue Satelliten-Layer** (NO₂, IMERG, GRACE, SST, Chlorophyll …) | NASA GIBS | PD | S je Layer | 01 |
| 5 | **Waldbrandgefahr + Brandflächen 2016–2025** | Copernicus EFFIS | CC BY 4.0 | S | 01 |
| 6 | **Hurrikan-Historie seit 1851** | NOAA HURDAT2 | PD | M | 02 |
| 7 | **Tsunamis und Beben seit der Antike** | NOAA NCEI Hazard API | PD | S | 02 |
| 8 | **Wikidata-Baukasten** (Burgen, Leuchttürme, Observatorien, UNESCO) | Wikidata SPARQL | CC0 | S | 03 |
| 9 | **Flugplätze und Pisten** | OurAirports | PD | S | 03 |
| 10 | **Biodiversität als Heatmap** | GBIF Kacheln | CC0/CC BY | S | 02 |
| 11 | **iNaturalist-Beobachtungen live** | iNaturalist | CC0/CC BY ⚠ | S | 02 |
| 12 | **Internet-Ausfälle** | IODA | CC BY 4.0 | M | 03 |
| 13 | **EMODnet Meeresnutzung** (Windparks, Kabel, Aquakultur, Einleitungen) | EMODnet | CC BY 4.0 | S | 01 |
| 14 | **Ozean: Korallenbleiche + Argo-Drifter** | NOAA CRW, Ifremer | PD/frei | M | 02 |
| 15 | **Choropleth-Typ** (BIP, Armut, Energie, CO₂) | World Bank, Eurostat | CC BY 4.0 | M | 03 |
| 16 | **Historische Karten 1800–1950** | LoC / NYPL (IIIF) | PD | M | 03 |
| 17 | **OSM-Klassen, die fehlen** (Stromnetz, Staudämme, Bunker, Kläranlagen …) | OSM/Overpass | ODbL | M | 01 |
| 18 | **Gletscher, Schnee, Meereis, Permafrost** | GIBS, NSIDC, RGI | PD/Copernicus | S–M | 02 |
| 19 | **Dürre** (SPEI, GDO, US Drought Monitor) | CSIC, JRC, UNL | CC BY | M | 02 |
| 20 | **Mapillary-Abdeckung** (wo es Straßenbilder gibt) | Mapillary (im Bucket!) | CC BY-SA 4.0 | S | 00 |

---

## Drei Wellen

### Welle 1 – diese Woche, ohne neue Quellen

1. **Mars** (Datei liegt da, `trackLayer` existiert).
2. **Mapillary-Abdeckung** (Datei liegt da, `pointLayer`).
3. **Open-Meteo-Globalgitter** (Datei liegt da, 24-Schritt-Animation).
4. **GIBS-Layer** durchblättern: für jeden Layer eine Zeile `gibsLayer`. Die 15 aus Bericht 01
   sind eine Tagesarbeit, danach hat Orbis 15 neue Ebenen.
5. **EFFIS-WMS** (Feuergefahr heute + Brandflächen) an `gefahren/feuer` hängen.

Nach Welle 1: ~20 Ebenen mehr, **null** neue Lizenzen, null neue Collectoren.

### Welle 2 – zwei bis vier Wochen, Collector nötig

- OpenFlights-Routen, OurAirports (beides CORS-offen, kein Collector!)
- HURDAT2 + NCEI-Hazard (Collector, weil kein CORS)
- Energy-Charts, Carbon Intensity (CORS-offen, kein Collector)
- GBIF-Kacheln, EMODnet-WMS, EFFIS (CORS-offen)
- Wikidata-SPARQL-Baukasten
- IODA/OONI/PeeringDB (über den bestehenden Worker-Proxy)

### Welle 3 – eigene Ebenentypen

- **Choropleth** (Länder/Regionen nach Wert) – fehlt als Baustein komplett.
- **Zeitpanorama** (historische Karten als Basiskarte, Zeitregler).
- **Mars-Globus** (eigene Projektion/Kachelquelle).

---

## Lizenzprüfung: was NICHT ohne Warnung übernommen werden darf

| Quelle | Problem | Empfehlung |
|---|---|---|
| Global Fishing Watch | CC BY-**NC** 4.0 | nur wenn Orbis sicher nicht-kommerziell ist; kennzeichnen |
| ACLED | eigene Terms, kommerzielle Nutzung eingeschränkt | weglassen oder kennzeichnen |
| OpenSanctions (Bulk) | CC BY-**NC** | API mit Key, NC kennzeichnen |
| Global Coal/Cement/Steel Tracker | CC BY-**NC-SA** | kennzeichnen |
| IUCN Ranges | NC + Login | weglassen |
| GADM | ausdrücklich nicht-kommerziell | **nicht verwenden**, Natural Earth reicht |
| Sentinel-2 cloudless (EOX) | CC BY-**NC-SA** | kennzeichnen |
| PurpleAir | eigene Terms, Sensordaten teils privat | nur mit Key und Hinweis |
| iNaturalist | Lizenz **je Beobachtung** (CC0/CC BY/CC BY-NC) | nur CC0/CC BY filtern |
| GBIF | Lizenz **je Datensatz** | Filter auf CC0/CC BY/CC BY-SA |
| UNESCO-Liste | keine formale CC, aber Reuse mit Attribution üblich | Attribution, im Zweifel nachfragen |
| SIPRI | keine CC, Zitat erforderlich | Attribution, keine Rohdaten-Weitergabe |
| NOAA/NWS | US-Government-Werk, PD | unkritisch |
| Copernicus (EFFIS, EMS, CAMS, GHSL) | Copernicus-Bedingungen, Attribution | unkritisch mit Quellenvermerk |
| Mapillary | CC BY-SA 4.0, Share-Alike | Attribution „© Mapillary contributors“ |

---

## Was auffällt

1. **Der größte Hebel ist GIBS.** 1 330 fertige Kartenlayer, public domain, ein vorhandener Baustein.
   Orbis zeigt davon eine Handvoll. Allein daraus lassen sich 20 Ebenen bauen, die heute fehlen –
   ohne eine einzige neue Datenquelle.
2. **Vier Dateien liegen ungenutzt im eigenen Bucket** (Mars, Mapillary, Open-Meteo-Gitter,
   Vulkan-Historie im Parser). Das ist der billigste Ausbau überhaupt.
3. **Die Zeitachse ist unterfüllt.** Orbis kann Jahre, zeigt aber Wochen. HURDAT2 (1851),
   NCEI (Antike), EFFIS (2016–2025), historische Karten (1800) würden sie erst ausreizen.
4. **Ein Ebenentyp fehlt:** der Choropleth. World Bank, Eurostat, UNHCR und GHSL liefern alle
   Daten dafür, aber es gibt keinen Baustein, der Werte auf Länderflächen malt.
5. **Viele „neue“ Quellen brauchen keinen Collector.** OpenFlights, OurAirports, GBIF, EFFIS,
   EMODnet, Energy-Charts, Carbon Intensity, Wikidata, Tor Metrics, OpenRailwayMap und OpenSeaMap
   antworten mit `Access-Control-Allow-Origin: *`. Der vorhandene Proxy bleibt für
   IODA, OONI, PeeringDB, HURDAT2, Aviation Weather und GBIF-Suche.
