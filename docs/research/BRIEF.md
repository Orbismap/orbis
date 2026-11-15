# Orbis – Rechercheauftrag: neue Datenquellen

## Was Orbis ist

Ein Kartenbetrachter (Globus + Mercator, MapLibre GL JS) mit ~100 Ebenen in den Kategorien
**Erde, Wetter, Gefahren, Verkehr, Infrastruktur, Meer, Medien, Gesellschaft**.
Technik: TypeScript/Preact, Daten als GeoJSON/PMTiles/Raster, Anzeige als Punkte, Linien, Flächen,
Raster (Kacheln), Partikel/Tracks. Zeitachse von Vergangenheit bis Vorhersage ist vorhanden.

## Harte Regel

**Nur offene Lizenzen.** Akzeptiert:

- Public Domain / CC0 / DL-DE 0/2.0 / Open Government Licence / NLOD / ODbL / CC BY / CC BY-SA
- Ausdrücklich auch: US-Government-Werke (NASA, NOAA, USGS, EPA …), EU-Copernicus-Daten

Nicht akzeptiert (oder nur mit klarer Warnung, falls unvermeidbar):

- proprietary, „all rights reserved“, unklare Lizenz, reine „research only“-Terms
- NC-Klauseln nur, wenn die kommerzielle Nutzung für Orbis irrelevant ist — **immer kennzeichnen**
- Scraping von Websites ohne Lizenz (nur wenn ein offener Bulk-/API-Zugang existiert)

Jede Quelle im Bericht braucht: **Lizenzname + Lizenz-URL + Attributionspflicht ja/nein**.

## Was schon drin ist (nicht nochmal vorschlagen)

Ebenen (Auszug): Erdbeben (USGS+EMSC), Vulkane, Tsunami, Waldbrände (FIRMS), GDACS-Katastrophen,
EONET-Naturereignisse, Blitze, Stürme, Polarlicht, Radioaktivität (BfS/Safecast/STUK/HC),
Unwetter DE/USA, Rekonstruktionen; ICON-Wetterfelder (T, Taupunkt, Feuchte, Wind, Böen, CAPE,
Druck, Niederschlag, Schnee, Bewölkung, Strahlung), Radar, Satellit, Luftqualität+Pollen (CAMS),
Städtewetter; Meeresströmung, Seegang, Gezeiten, Pegel, Bojen, Meereis, Meerestemperatur,
Chlorophyll, Meerestiefe (GEBCO/Terrarium), Flüsse (GloFAS), Schiffsrouten; Schiffe (AIS),
Flugzeuge (OpenSky/adsb), Züge, Bahnnetz, ÖPNV, Flughäfen, Häfen, Autobahn, Straßennetz,
Leihräder, Verkehrslage, Blitzer, GPS-Störungen, Raketenstarts, Satelliten, Starlink, Wetterballons;
Seekabel, Pipelines, Kraftwerke (WRI), Rechenzentren, Windräder, Rohstoffe, Internetknoten;
Webcams, Überwachungskameras (CCTV), Kennzeichenleser (ALPR), Radio; Demos, Wahlen, Ukraine-Krieg,
Gaza, US-Kongress-Gelder, Geldflüsse, Kriegsarchiv; Nachtlichter, Vegetation, Landbedeckung,
Schneedecke, Bodentemperatur, Aerosole, Geologie, Platten Grenzen, Satellitenbild.

Bereits angebundene Quellen (dürfen erweitert werden!): USGS, EMSC/SeismicPortal, GDACS, NASA EONET,
NASA FIRMS, NASA GIBS, NOAA NWS/SPC/NHC/NDBC, NOAA SWPC, CelesTrak, OpenSky, adsb.lol/adsb.fi,
BarentsWatch (AIS), Open-Meteo (Forecast/Marine/Flood/Air Quality), Copernicus CAMS/GloFAS,
OpenStreetMap/Overpass/Geofabrik, HDX (Humdata), IPC, IDMC, Healthsites, WRI, Wikidata,
Radio Browser, EMODnet, GEBCO/AWS Terrarium, Mapterhorn, demonstrations.org, C3 (Harvard Dataverse),
The Space Devs, BfS, STUK/FMI, Safecast, Health Canada.

## Was gesucht ist

1. **Ungenutztes in bereits angebundenen Quellen.** Viele APIs liefern viel mehr Felder/Produkte als
   Orbis zeigt (z. B. Open-Meteo hat Dutzende Variablen; NOAA hat hunderte Produkte; OSM hat tausende
   Tags; Copernicus/CDS hat ganze Datenkataloge). Konkret: welches *Produkt*, welche *Variable*,
   welcher *Endpunkt* ist frei verfügbar und noch nicht visualisiert?
2. **Ganz neue Quellen und Themen.** Domänen, an die bisher niemand gedacht hat.

Für jeden Vorschlag:

- **Was man sieht** (eine Ebene, ein Satz, wie es auf der Karte aussieht: Punkte/Linien/Fläche/Raster/Track/Heatmap)
- **Endpunkt** (echte URL, möglichst ohne Key; bei Key: wie bekommt man ihn, Limits)
- **Format** (GeoJSON, CSV, NetCDF, GRIB, PMTiles, WMS/WMTS, XYZ-Kacheln, JSON-API)
- **Volumen & Kadenz** (MB, Aktualisierungsrate)
- **CORS** (ja/nein/Proxy nötig) — bitte **live testen**, wenn möglich
- **Lizenz** (Name + URL, Attribution)
- **Aufwand** (S/M/L) und warum es auf eine Karte gehört

Priorität: Dinge, die **visuell stark** sind, **global** oder für Europa/DE relevant, und die
**ohne eigenen Server** funktionieren (CORS offen oder über den vorhandenen Worker-Proxy).

## Ausgabe

Markdown-Datei mit Tabellen und kurzen Abschnitten. Keine Prosa-Einleitungen.
Am Ende: **Top-10-Ranking** nach (a) visueller Wirkung, (b) Aufwand, (c) Lizenzsicherheit.
Ehrlich sein: Quellen, die tot/geblockt/ kostenpflichtig sind, ausdrücklich als solche markieren.
