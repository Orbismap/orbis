# 04 – Gamma-Ortsdosisleistung und Strahlungsdaten

Recherche für Orbis (MapLibre, TypeScript). Ergänzung zu den bereits genutzten Quellen **BfS (DE, DL-DE 2.0)**,
**STUK (FI)**, **Health Canada (CA)** und **Safecast (CC0)**. Geprüft am **15.11.2026** mit Live-HTTP-Tests
(Statuscodes, CORS-Header, Content-Type).

**Legende Aufwand:** S = klein (ein Collector/Parser, < 1 Tag), M = mittel (mehrere Tage), L = groß (Wochen, eigene Infrastruktur).

---

## 0. Executive Summary

- **EURDEP / REMAP (JRC) ist NICHT als offene Quelle nutzbar.** Der Dienst erfordert OAuth-Login
  (`remsso.jrc.ec.europa.eu`), die Daten unterliegen dem Copyright der nationalen Datenanbieter
  („cannot be used for other purposes … without prior written agreement“), die Advanced Map ist
  captcha-geschützt. CORS nur für `https://connected.cnect.cec.eu.int`. Kein WFS/WMS/REST-Endpoint
  gefunden (alle Geoserver-Pfade → 404). → **Nicht nutzbar für Orbis.**
- **Safecast** ist die einzige globale, wirklich offene Quelle (CC0). Zusätzlich zu `/measurements.json`
  gibt es `bgeigie_imports` (mobile Messfahrten) und `devices`. CORS nur `safecast.org` (nicht `*`),
  aber statisch spiegelbar. Wert in **cpm** (umrechenbar zu µSv/h). → **Nächster Schritt: bGeigie-Importe
  als Track-Layer spiegeln.**
- **JRC „European Atlas of Natural Radiation“** (Terrestrial Gamma Dose, 10 km × 10 km Raster,
  ETRS89-LAEA) ist als statische Hintergrundebene nutzbar (JRC Open Data, CC BY 4.0). Nicht Echtzeit,
  aber eine starke „geogene Strahlung“-Ebene für Europa.
- **Alle nationalen Netze (UK, FR, CH, AT, CZ, PL, IT, ES, NL, BE, SE, NO, DK, IS, IE)** sind entweder
  hinter Logins/Captchas, liefern keine offene API oder sind nicht CORS-fähig. Keine von ihnen bietet
  einen dokumentierten offenen JSON/WFS/WMS-Endpoint. → **Keine neuen Länder-Ebenen über nationale APIs.**
- **IAEA (IRMIS/PRIS), CTBTO IMS, RadNet, CDC, NRA Japan, KINS Korea, WISE, NRC** sind nicht als
  offene Datenquellen nutzbar (Cloudflare, SharePoint, 403, Timeout, keine API).
- **Einzige realistische Ergänzung zu BfS/STUK/HC/Safecast:** Safecast vertiefen (bGeigie-Tracks,
  Device-Inspector-Fakten) + JRC Terrestrial Gamma Dose als statische Ebene + Safecast-Werte in µSv/h
  umrechnen (bisher cpm).

---

## 1. Live-Test-Ergebnisse (Statuscode / CORS)

| Quelle | URL (getestet) | HTTP | CORS-Header | Ergebnis |
|---|---|---|---|---|
| REMAP (JRC) | `https://remap.jrc.ec.europa.eu/` | 200 | kein `*` (nur `connected.cnect.cec.eu.int`) | SPA, kein Daten-Endpoint |
| REMAP Geoserver | `…/geoserver/wms?…GetCapabilities` | 404 | – | nicht vorhanden |
| REMON (JRC) | `https://remon.jrc.ec.europa.eu/` | 200 | `https://connected.cnect.cec.eu.int` | ASP.NET, Captcha, nur 2 EC-Standorte als KML |
| EURDEP Entry | `https://eurdep.jrc.ec.europa.eu/entry/` | 302 → OAuth | – | Login nötig |
| JRC Data Catalogue | `https://data.jrc.ec.europa.eu/` | 200 | kein `*` (Blazor-SPA) | keine REST-API |
| Safecast measurements | `https://api.safecast.org/measurements.json?per_page=1` | 200 | `safecast.org` | JSON, cpm, lat/lon, captured_at |
| Safecast bGeigie | `…/bgeigie_imports.json?per_page=1` | 200 | `safecast.org` | mobile Messfahrten |
| Safecast devices | `…/devices.json?per_page=1` | 200 | `safecast.org` | Gerätetypen |
| RadNet (EPA) | `https://www.epa.gov/radnet` | 200 | – | Drupal-Seite, kein API |
| EPA Envirofacts | `https://data.epa.gov/efservice/…` | 404 | `*` | umgestellt/abgeschaltet |
| CDC Tracking | `https://ephtracking.cdc.gov/` | 403 | – | blockiert |
| NRA Japan | `https://radioactivity.nra.go.jp/ja` | 200 | – | Nuxt-SPA, keine dokumentierte API |
| KINS Korea | `https://www.kins.re.kr/` | Timeout | – | nicht erreichbar |
| CTBTO | `https://www.ctbto.org/` | 403 | – | restricted |
| IAEA | `https://www.iaea.org/` | 403 (Cloudflare) | – | geschützt |
| IAEA PRIS | `https://pris.iaea.org/PRIS/home.aspx` | 302 → pris-stats | – | ASP.NET, keine API |
| UKHSA | `https://ukhsa-dashboard.data.gov.uk/` | 200 | – | Next.js, kein „radiation“ |
| ASNR/IRSN (FR) | `https://www.asnr.fr/` | 200 | – | CMS, keine Strahlungs-API |
| NAZ (CH) | `https://www.naz.ch/` | 200 | – | Nuxt-SPA, keine API |
| AGES (AT) | `https://www.ages.at/` | 200 | – | CMS, keine API |
| SURO (CZ) | `https://www.suro.cz/` | 301 | – | Redirect, keine API |
| PAA (PL) | `https://www.paa.gov.pl/` | 403 | – | blockiert |
| ISPRA (IT) | `https://www.isprambiente.gov.it/` | 302 | – | CMS, keine API |
| CSN (ES) | `https://www.csn.es/` | 200 | – | MARNa-Map 503 (unreachable) |
| RIVM (NL) | `https://data.rivm.nl/meta` | 302 | – | GeoNetwork-Katalog |
| FANC/Telerad (BE) | `https://www.telerad.be/` | 200 | – | alte Seite, keine API |
| SSM (SE) | `https://www.stralsakerhetsmyndigheten.se/` | 200 | – | Cloudflare, keine API |
| DSA (NO) | `https://www.dsa.no/` | 200 | – | keine API |
| SST (DK) | `https://www.sst.dk/` | 429 | – | Vercel-Challenge |
| NRC (US) | `https://www.nrc.gov/` | 200 | – | keine API |
| WISE | `https://www.wise-uranium.org/` | 200 | – | statische IONOS-Seite |
| EPA Ireland | `https://www.epa.ie/…/mapmon/` | 200 | – | ASP.NET, kein offenes API |
| JRC TGDR | `https://data.europa.eu/doi/10.2905/JRC.SBESAC0` | 307 → doi.org | – | statisches 10 km-Raster (FTP 500) |

---

## 2. Detailbewertung pro Quelle

### 2.1 EURDEP / REMAP (JRC) — **nicht nutzbar**

| Feld | Wert |
|---|---|
| URL | `https://remap.jrc.ec.europa.eu/` (Advanced Map), `https://eurdep.jrc.ec.europa.eu/` (Entry) |
| Lizenz | **Copyright der Datenanbieter** (nationale Netze). CONSENT: „All data that is exchanged via EURDEP are subject to copyright of the original data provider and cannot be used for other purposes, including scientific research, without their prior written agreement.“ |
| CORS | Nur `https://connected.cnect.cec.eu.int` (kein `*`) |
| Format | ASP.NET-Web-App, Captcha-geschützt. Kein WFS/WMS/REST-Endpoint (Geoserver-Pfade → 404). |
| Koordinaten | lat/lon pro Station (in der Web-App, nicht als Download) |
| Wert | nSv/h (Gamma-Dosisrate), stündliche Mittelwerte |
| Aktualität | Echtzeit (stündlich), 35 Tage zurück |
| Abdeckung | ~5 500 Stationen, europaweit |
| Aufwand | L (und rechtlich nicht zulässig) |
| API-Key | OAuth-Login nötig (remsso) |
| **Empfehlung** | **Nicht nutzen.** Rechtliche Hürde (Copyright) + kein offener Endpoint. Stattdessen JRC Terrestrial Gamma Dose (statisch) als Hintergrundebene. |

Historische Datensätze (106Ru-Event 2017) sind über das JRC Data Public Catalogue als CSV verfügbar (doi: 10.2905/JRC.MD7T99G), aber nur für dieses eine Ereignis — kein laufender Dienst.

### 2.2 IAEA (IRMIS / PRIS) — **nicht nutzbar**

| Feld | Wert |
|---|---|
| URL | `https://www.iaea.org/`, `https://nucleus.iaea.org/`, `https://pris.iaea.org/` |
| Lizenz | IAEA-eigene Terms (keine CC) |
| CORS | – (Cloudflare-Challenge, SharePoint) |
| Format | SharePoint/ASP.NET, keine offene API |
| Abdeckung | global (Reaktorstandorte, Vorfälle) |
| Aufwand | L |
| API-Key | Login nötig |
| **Empfehlung** | **Nicht nutzen.** Reaktorstandorte lassen sich über Wikidata SPARQL (CC0) oder OSM (`power=plant` + `source=nuclear`) beziehen — ohne IAEA. |

### 2.3 RadNet (US EPA) — **eingeschränkt / schwer nutzbar**

| Feld | Wert |
|---|---|
| URL | `https://www.epa.gov/radnet` |
| Lizenz | US-Government-Werk (PD) — unkritisch |
| CORS | – (kein offener Endpoint gefunden) |
| Format | Drupal-Seite; EPA Envirofacts (`data.epa.gov/efservice`) → 404; ArcGIS-Endpoints nicht gefunden |
| Abdeckung | USA, ~140 RadNet-Stationen (Luftfilter + Gamma) |
| Aufwand | L (Scraper nötig) |
| API-Key | – |
| **Empfehlung** | **Zurückstellen.** Kein dokumentierter offener Endpoint. Daten sind über data.gov auffindbar, aber ohne stabilen API-Zugang. Falls gewünscht: Collector mit HTML-Scraping (L). |

### 2.4 CDC / EPA Environmental Radiation — **nicht nutzbar**

| Feld | Wert |
|---|---|
| URL | `https://ephtracking.cdc.gov/` |
| Lizenz | US-Government (PD) |
| CORS | – (403) |
| Format | nicht erreichbar |
| **Empfehlung** | **Nicht nutzen.** |

### 2.5 Japan (NRA / SPEEDI / MEXT) — **eingeschränkt**

| Feld | Wert |
|---|---|
| URL | `https://radioactivity.nra.go.jp/` |
| Lizenz | japanische Regierung (vermutlich frei mit Attribution, nicht formal CC) |
| CORS | – |
| Format | Nuxt-SPA, keine dokumentierte offene API |
| Abdeckung | Japan, ~3 000 Monitoring-Posts (Fukushima + national) |
| Aufwand | L |
| **Empfehlung** | **Zurückstellen.** NRA betreibt eine Web-App ohne offene API. Safecast hat sehr gute Abdeckung in Japan (Fukushima-Gebiet) — das deckt den wichtigsten Anwendungsfall bereits ab. |

### 2.6 Korea (KINS) — **nicht nutzbar**

| Feld | Wert |
|---|---|
| URL | `https://www.kins.re.kr/` |
| Ergebnis | Timeout (20 s) |
| **Empfehlung** | **Nicht nutzen.** |

### 2.7 China, Russland — **nicht offen**

Nicht geprüft (keine offenen Datenquellen bekannt; chinesische NRA und Roshydromet veröffentlichen keine offenen APIs). → **Nicht nutzen.**

### 2.8 Safecast — **nutzbar, vertiefen**

| Feld | Wert |
|---|---|
| URL | `https://api.safecast.org/` |
| Lizenz | **CC0** (Public Domain) |
| CORS | `safecast.org` (nicht `*`) → **Collector/Skript nötig**, aber spiegelbar |
| Format | JSON (Array von Objekten) |
| Koordinaten | `latitude`, `longitude` |
| Wert | `value` in **cpm** (counts per minute). Umrechnung: 1 µSv/h ≈ 175 cpm (Cs-137-äquivalent); Safecast-Doku empfiehlt Faktor ~0.0057 µSv/h pro cpm für typische Umgebungsstrahlung. |
| Zeitstempel | `captured_at` (ISO-8601) |
| Aktualität | Echtzeit (neue Messungen laufend) |
| Abdeckung | global, Schwerpunkt Japan/USA/Europa, ~1,7 Mio. Messungen |
| Aufwand | S (Collector existiert bereits) |
| API-Key | nein |
| Zusätzliche Endpoints | `bgeigie_imports.json` (mobile Messfahrten mit GPS-Track, ~4 000 Punkte pro Fahrt), `devices.json` (Gerätetypen: Bosean, bGeigie, …) |
| **Empfehlung** | **Vertiefen.** (1) bGeigie-Imports als `trackLayer` spiegeln (mobile Messkampagnen, z. B. Fukushima-Fahrten). (2) Inspector-Fakten ergänzen: Gerätetyp, Batterie, Gehäusetemperatur (liegen in der Antwort, werden bisher weggefiltert). (3) Wert in µSv/h umrechnen und als `value` in µSv/h ausliefern, damit er mit BfS/STUK/HC vergleichbar ist. |

### 2.9 CTBTO (IMS Radionuklid-Stationen) — **restricted**

| Feld | Wert |
|---|---|
| URL | `https://www.ctbto.org/` |
| Ergebnis | 403 (Cloudflare) |
| **Empfehlung** | **Nicht nutzen.** IMS-Daten sind vertraglich restricted (nur Vertragsstaaten). |

### 2.10 IRIS / USGS — **nicht relevant**

Seismisch, nicht Strahlung. → **Nicht nutzen.**

### 2.11 Copernicus / JRC REM (Radioactivity Environmental Monitoring) — **eingeschränkt**

| Feld | Wert |
|---|---|
| URL | `https://rem.jrc.ec.europa.eu/` → redirect zu `https://remon.jrc.ec.europa.eu/` |
| Lizenz | JRC Open Data (für den Atlas), EURDEP-Daten unter Copyright der Anbieter |
| CORS | nur `https://connected.cnect.cec.eu.int` |
| Format | ASP.NET-Web-App (REMON), Captcha |
| **Empfehlung** | **Nicht als Echtzeit-Quelle.** Aber: JRC „European Atlas of Natural Radiation“ (Terrestrial Gamma Dose, 10 km × 10 km Raster, ETRS89-LAEA) ist als **statische Hintergrundebene** nutzbar (doi: 10.2905/JRC.SBESAC0, JRC Open Data). Wert in nGy/h (terrestrisch). |

### 2.12 Nationale Netze — **keine offenen APIs**

| Land | Betreiber | URL (getestet) | Ergebnis | Lizenz (falls nutzbar) |
|---|---|---|---|---|
| UK | UKHSA | `ukhsa-dashboard.data.gov.uk` | Next.js, kein „radiation“ | – |
| Frankreich | ASNR (ex-IRSN) | `asnr.fr` | CMS, keine Strahlungs-API; Cartoradio = Mobilfunk | – |
| Schweiz | NAZ | `naz.ch` | Nuxt-SPA, keine API | – |
| Österreich | AGES | `ages.at` | CMS, keine API | – |
| Tschechien | SURO | `suro.cz` | Redirect, keine API | – |
| Polen | PAA | `paa.gov.pl` | 403 | – |
| Italien | ISPRA | `isprambiente.gov.it` | CMS, keine API | – |
| Spanien | CSN | `csn.es` | MARNa-Map 503 (unreachable) | – |
| Niederlande | RIVM | `data.rivm.nl` | GeoNetwork-Katalog (kein direkter Endpoint) | – |
| Belgien | FANC/Telerad | `telerad.be` | alte Seite, keine API | – |
| Schweden | SSM | `stralsakerhetsmyndigheten.se` | Cloudflare, keine API | – |
| Norwegen | DSA | `dsa.no` | keine API (NLOD 2.0 wäre möglich) | NLOD 2.0 |
| Dänemark | SST | `sst.dk` | 429 (Vercel-Challenge) | – |
| Island | – | nicht geprüft | – | – |
| Irland | EPA | `epa.ie/…/mapmon` | ASP.NET, kein offenes API | – |

**Keines** dieser Netze bietet einen dokumentierten offenen JSON/WFS/WMS-Endpoint für Gamma-Dosisraten. Die Daten sind entweder hinter Logins, als HTML-Seiten oder als nicht-maschinenlesbare Karten verfügbar.

### 2.13 WISE — **nicht nutzbar**

| Feld | Wert |
|---|---|
| URL | `https://www.wise-uranium.org/` |
| Ergebnis | statische IONOS-Seite, keine API |
| **Empfehlung** | **Nicht nutzen.** Politisch, keine Daten-API. |

### 2.14 NRC (US) — **eingeschränkt**

| Feld | Wert |
|---|---|
| URL | `https://www.nrc.gov/` |
| Ergebnis | keine API; Reaktorstandorte nicht als offener Datensatz |
| **Empfehlung** | **Nicht nutzen.** Reaktorstandorte über Wikidata SPARQL (CC0) oder OSM (`power=plant` + `source=nuclear`) beziehen. |

### 2.15 IAEA PRIS — **eingeschränkt**

Reaktorstandorte als Kontext, aber keine offene API (ASP.NET, Redirect auf pris-stats). → **Nicht nutzen.** Wikidata/OSM reicht.

### 2.16 EPA Ireland — **eingeschränkt**

26 Stationen, µSv/h, aber nur als ASP.NET-Seite (`epawebapp.epa.ie/Article27Register/GammaDoseRateNew.aspx`). Kein offenes API. → **Zurückstellen.**

---

## 3. Zusammenfassung: was wirklich nutzbar ist

| Quelle | Status | Lizenz | Aufwand | Nächster Schritt |
|---|---|---|---|---|
| **Safecast** (bereits genutzt) | ✅ global, Echtzeit | CC0 | S | bGeigie-Tracks + µSv/h-Umrechnung + Inspector-Fakten |
| **JRC Terrestrial Gamma Dose** | ✅ statisch (Europa) | JRC Open Data (CC BY 4.0) | S–M | Raster als Hintergrundebene (10 km, ETRS89-LAEA) |
| **BfS ODL** (bereits genutzt) | ✅ DE, Echtzeit | DL-DE 2.0 | S | kosmisch/terrestrisch-Schalter (bereits im Parser) |
| **STUK** (bereits genutzt) | ✅ FI | – | – | – |
| **Health Canada** (bereits genutzt) | ✅ CA | – | – | – |
| EURDEP/REMAP | ❌ Copyright + Login + Captcha | – | – | nicht nutzen |
| Alle nationalen Netze | ❌ keine offenen APIs | – | – | nicht nutzen |
| IAEA/CTBTO/RadNet/CDC/NRA/KINS | ❌ restricted/keine API | – | – | nicht nutzen |

---

## 4. Empfehlung: nächste 3 Schritte

1. **Safecast vertiefen (S, 1–2 Tage).**
   - Neuer Collector `safecast-bgeigie`: spiegelt `bgeigie_imports.json` (letzte N Imports), parst die zugehörigen Messpunkte (lat/lon/cpm/captured_at) als Track-Layer (`trackLayer`), damit mobile Messkampagnen (Fukushima-Fahrten, Kalifornien) als animierte Spuren sichtbar werden.
   - µSv/h-Umrechnung: `value_cpm * 0.0057` → `value_usvh`, damit Safecast-Werte mit BfS/STUK/HC vergleichbar sind. Im Inspector beide Werte zeigen (cpm + µSv/h).
   - Inspector-Fakten ergänzen: `device_class`, `device_sn`, `bat_voltage`, `env_temp` (liegen in der Antwort, werden bisher weggefiltert — siehe `00-already-mirrored.md` § 4).

2. **JRC Terrestrial Gamma Dose als statische Europa-Ebene (S–M, 2–3 Tage).**
   - Datensatz: doi 10.2905/JRC.SBESAC0 („07. Terrestrial gamma dose“), 10 km × 10 km Raster, ETRS89-LAEA, Wert in nGy/h.
   - Download über JRC Data Catalogue (Login nötig für Download, aber Lizenz JRC Open Data). Alternativ: WMS/WMTS-Service der JRC prüfen (`https://rem.jrc.ec.europa.eu/About/Atlas-of-Natural-Radiation/…`).
   - Als Raster-Layer rendern (ähnlich GIBS), statisch, mit Legende nGy/h → µSv/h (Faktor 1 nGy/h ≈ 0.001 µSv/h für terrestrische Strahlung).
   - Didaktisch starker Kontrast: „geogene Strahlung“ (statisch, JRC) vs. „aktuelle Ortsdosisleistung“ (dynamisch, BfS/STUK/HC/Safecast).

3. **Safecast-Messungen in µSv/h ausliefern (S, 1 Tag).**
   - Collector-Output ändern: `value` statt in cpm in µSv/h (mit Faktor 0.0057). Bestehende Ebene `strahlung/safecast` nutzt dann µSv/h — einheitlich mit den anderen Quellen.
   - Im Inspector cpm als Rohwert zusätzlich anzeigen („Rohwert: 14 cpm“).

**Nicht empfohlen:** EURDEP/REMAP (Copyright + Login + Captcha), nationale Netze (keine offenen APIs), IAEA/CTBTO (restricted). Die „große europäische Lücke“ (EURDEP) lässt sich mit Orbis-Mitteln nicht legal schließen — die einzige legale, globale, offene Quelle bleibt Safecast (CC0) + die drei nationalen Netze (BfS/STUK/HC).

---

## 6. Umsetzung (15.11.2026)

### Schritt 1 – Safecast-Werte in µSv/h (bereits vorhanden)
- `safecastDose()` in `src/data/parsers/radiation.ts` rechnet rohe cpm-Werte (lnd_7318c / 334, lnd_7318u / 334, lnd_7128ec / 108, lnd_712u / 108) bereits in µSv/h um.
- Der Collector liefert den rohen cpm-Wert (`safecast.json` enthält `lnd_7318c`); der Parser läuft im Worker (`runParser`).
- Test: `Safecast: counts per minute to µSv/h, age filter` in `src/data/parsers/gefahren.test.ts`.
- Keine Code-Änderung nötig.

### Schritt 2 – Safecast bGeigie-Importe als Track-Layer
- Neuer Parser `safecastTrack` (Alias `safecastBgeigie`/`safecastTracks`) in `src/data/parsers/radiation.ts`, registriert in `src/data/parsers/index.ts`.
- Neuer Layer `src/layers/gefahren/safecast-tracks.ts` (form `lines`, Kategorie `gefahren`, cadence `daily`), lädt `public/data/safecast-tracks.json`.
- Snapshot-Skript `scripts/fetch-safecast-tracks.mjs` holt die 50 neuesten Imports (sortiert nach `created_at` desc), parst die bGeigie-Logs (NMEA) und schreibt kompakte Tracks (downsampled auf ~200 Punkte) mit min/max/avg in µSv/h. Snapshot enthält 39 Fahrten (~160 KB).
- Inspector zeigt Credits, Importdatum, Wertebereich, Messpunktzahl, Quelldatei, Lizenz und Link zur Safecast-Karte.
- Test: `Safecast bGeigie: imports become tracks with stats` (+ Fixture `__fixtures__/safecast-tracks.json`).
- Live-API hat keine `points`-Felder; die Geometrie stammt aus den S3-Logs (`source.url`). Der Parser unterstützt sowohl das kompakte Snapshot-Format als auch rohe Imports mit `points`-Arrays (`[lat, lon, cpm, …]`).

### Schritt 3 – JRC Terrestrial Gamma Dose
- **Nicht verfügbar als offene, CORS-fähige Quelle.** Live-Prüfung:
  - `remap.jrc.ec.europa.eu` / `rem.jrc.ec.europa.eu` / `remon.jrc.ec.europa.eu`: keine CORS-Header (`*`), Geoserver-Pfade → 404, SPA/Captcha.
  - `data.jrc.ec.europa.eu`: Blazor-SPA ohne REST-API, kein direkter Download ohne Login.
  - DOI `10.2905/JRC.SBESAC0` → Redirect auf das JRC-Katalog-Frontend, kein GeoTIFF/WMS-Endpoint auffindbar.
- Daher **kein neuer Layer**; stattdessen dokumentiert. Für eine künftige statische Ebene wäre ein manueller Download des 10 km-Rasters (ETRS89-LAEA, nGy/h) und eine Konvertierung zu GeoJSON/PMtiles nötig.
- Die bestehende Ebene `radioaktivitaet` bleibt unverändert.

## 5. Quellenverzeichnis

- EURDEP/REMAP: https://remap.jrc.ec.europa.eu/, https://eurdep.jrc.ec.europa.eu/
- EURDEP-Paper: https://essd.copernicus.org/articles/12/109/2020/ (ESSD, Copernicus)
- JRC Data Catalogue: https://data.jrc.ec.europa.eu/
- Safecast API: https://api.safecast.org/
- JRC Terrestrial Gamma Dose: https://data.europa.eu/doi/10.2905/JRC.SBESAC0
- JRC Atlas of Natural Radiation: https://remon.jrc.ec.europa.eu/About/Atlas-of-Natural-Radiation/
- EPA Ireland: https://www.epa.ie/our-services/monitoring--assessment/radiation/mapmon/
- NRC: https://www.nrc.gov/
- IAEA PRIS: https://pris.iaea.org/
- CTBTO: https://www.ctbto.org/