# 03 – Mensch, Technik, Infrastruktur, Gesellschaft

Domänen, die Orbis noch gar nicht bedient. Live geprüft am 15.11.2026.

---

## 1. Energie und Strom

Orbis zeigt Kraftwerke als Punkte – aber nicht, **was sie gerade produzieren** und **was Strom kostet**.

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **Energy-Charts** (Fraunhofer ISE) | **Live-Erzeugungsmix** je Land/Bieterzone, 15-min, plus Börsenpreis | `api.energy-charts.info/public_power?country=de` ✅ CORS `*`, `api.energy-charts.info/price?bzn=DE-LU` ✅ (Antwort nennt selbst „CC BY 4.0, Bundesnetzagentur/SMARD“) | ja | **CC BY 4.0** | M |
| **Carbon Intensity UK** | gCO₂/kWh je **Region** UK, halbstündlich | `api.carbonintensity.org.uk/intensity` ✅, `/regional` ✅ | `*` | CC BY 4.0 (NESO) | S |
| **Ember** | Jahres-/Monatsstrommix, 200+ Länder | `api.ember-energy.org/v1/…` (Key kostenlos) | – | CC BY 4.0 | S |
| **ENTSO-E Transparency** | Last, Erzeugung, grenzüberschreitende Flüsse | `web-api.tp.entsoe.eu` (Token) | – | frei, Attribution | L |
| **OSM Stromnetz** | Leitungen, Masten, Umspannwerke | Overpass `power=line/tower/substation` ✅ | `*` | ODbL | M |
| **Global Solar Atlas** | PV-Potenzial am Klickpunkt | `api.globalsolaratlas.info/data/lta?loc=52,13` ✅ | `*` | frei, Attribution | S |
| **Global Wind Atlas** | Windpotenzial, 100 m | `globalwindatlas.info/api` (Parameter prüfen) | – | CC BY | S |
| **VIIRS Nightfire / Flaring** | **Gasabfackeln** weltweit, täglich | `ngdc.noaa.gov/eog/viirs/download_viirs_fire.html` | – | PD | M |
| **Climate TRACE** | Emissionen je Anlage (API v6) | `api.climatetrace.org` (Endpoint-Version prüfen, `/v6/sources` → 404) | – | CC BY 4.0 | M |
| **Global Coal Plant Tracker** | Kohlekraftwerke, Status, CO₂ | `globalenergymonitor.org` (Download) | – | **CC BY-NC-SA** ⚠ | M |

**Energy-Charts** ist der Fund: kostenlos, CORS offen, CC BY 4.0, 15-Minuten-Takt. Ein Klick auf
Deutschland zeigt den aktuellen Mix, die Zeitachse zeigt die Dunkelflaute. Dazu die Börsenpreise als
zweite Skala – „Strom wird gerade negativ“ ist eine Kartenstory.

---

## 2. Industrie und Rohstoffe (jenseits der Bergwerke)

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **Global Cement & Concrete Tracker** | Zementwerke mit Kapazität/CO₂ | `globalenergymonitor.org` | – | CC BY-NC-SA ⚠ | M |
| **Global Steel Plant Tracker** | Stahlwerke, Route (BF-BOF/EAF) | dito | – | CC BY-NC-SA ⚠ | M |
| **Global Tailings Database** | Absetzbecken von Minen (Risiko) | `globaltailingsreview.org` | – | CC BY | M |
| **OSM Industrie** | `landuse=industrial`, `man_made=works` | Overpass ✅ | `*` | ODbL | S |
| **Open Supply Hub** | Fabriken mit Anschrift (Textil/Elektronik) | `opensupplyhub.org` (API) | – | CC BY-SA | M |
| **Shipbreaking** | Abwrackwerften | OSM `industrial=shipbreaking` | `*` | ODbL | S |
| **E-Schrott / Deponien** | `landfill`, `recycling` | OSM | `*` | ODbL | S |

---

## 3. Verkehr: was zwischen Flugzeug und Schiff fehlt

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **OurAirports** | **alle 80 000 Flugplätze + 45 000 Pisten** mit Belag, Länge, Befeuerung | `davidmegginson.github.io/ourairports-data/airports.csv` ✅ 12,7 MB, `runways.csv` ✅ 4,0 MB, CORS `*` | ja | PD | **S** |
| **OpenFlights Routen** | **alle Linienverbindungen** als Großkreis-Bögen | `raw.githubusercontent.com/jpatokal/openflights/master/data/routes.dat` ✅ 2,4 MB, `*` | ja | ODbL | **S** |
| **OpenRailwayMap** | Gleise, Signaltechnik, Elektrifizierung, Streckenhöchstgeschwindigkeit | `tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png` ✅ `*` | ja | ODbL | S |
| **OpenSeaMap** | Seezeichen, Betonnung, Fahrrinnen | `tiles.openseamap.org/seamark/{z}/{x}/{y}.png` ✅ `*` | ja | ODbL | S |
| **World Port Index** (NGA) | 3 700 Häfen mit Typ, Tiefgang, Anlagen | `msi.nga.mil` (Download) | – | PD | M |
| **UN/LOCODE** | 100 000 Ortcodes für Häfen/Flughäfen | `unece.org/trade/cefact/unlocode-code-list-country-and-territory` | – | frei | S |
| **Unfallatlas DE** | Unfälle mit Personenschaden, 1-km-Raster | `unfallatlas.statistikportal.de` (DL-DE/BY-2.0) | – | DL-DE 2.0 | M |
| **FARS USA** | jeder tödliche Unfall mit Koordinaten | `nhtsa.gov/fars` | – | PD | S |
| **Open Charge Map** | 300 000 Ladepunkte | `api.openchargemap.io/v3/poi` (Key) | `*` | CC BY-SA | S |
| **OurAirports Pisten** | Startbahnlänge als Linie | s. o. | ja | PD | S |

**OpenFlights-Routen** sind visuell das stärkste fehlende Verkehrsobjekt: 67 000 Flugverbindungen als
Bögen zwischen Flughäfen ergeben das „Nervensystem der Welt“. Mit `lineLayer` + Großkreis-Interpolation
in 30 Minuten gebaut.

---

## 4. Digitale Infrastruktur

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **IODA** | **Internet-Ausfälle** weltweit, live, mit Ursache | `api.ioda.inetintel.cc.gatech.edu/v2/outages/events?from=…&until=…` ✅ 1,3 KB | nein (Proxy) | CC BY 4.0 (prüfen) | M |
| **OONI** | Zensurmessungen, blockierte Dienste | `api.ooni.io/api/v1/measurements` ✅ 2,3 KB | nein (Proxy) | CC BY 4.0 | M |
| **Tor Metrics** | Tor-Relays weltweit | `onionoo.torproject.org/summary` ✅ `*` | ja | CC0 | S |
| **PeeringDB** | IXPs, Rechenzentren, Netze, Kapazität | `peeringdb.com/api/net` ✅ 2,5 KB | nein (Proxy) | CC BY-SA 4.0 | M |
| **Cloudflare Radar** | Angriffe, Ausfälle, Protokollmix | `api.cloudflare.com/client/v4/radar/…` (Token) | – | CC BY-NC ⚠ | M |
| **OpenCelliD** | 40 Mio. Mobilfunkzellen | `opencellid.org/downloads` (Registrierung) | – | CC BY-SA 4.0 | L |
| **Bundesnetzagentur** | Mobilfunkabdeckung DE, Funkanlagen | `bundesnetzagentur.de` (CSV/API) | – | DL-DE 2.0 | M |
| **FCC ULS / Broadband Map** | US-Funklizenzen, Breitband | `fcc.gov` | – | PD | L |
| **RIPE RIS / RouteViews** | BGP-Routen, Prefixe | `stat.ripe.net/data/…` | prüfen | frei | L |

**IODA** ist ein Layer mit Nachrichtenwert: Wenn ein Land vom Netz geht, sieht man es als
Punktwolke mit Ausfallkurve. Der Proxy ist schon da, das Format ist JSON.

---

## 5. Wirtschaft, Handel, Versorgung

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **World Bank** | 1 400 Indikatoren je Land (BIP, Armut, Wald, Energie) | `api.worldbank.org/v2/country/DEU/indicator/SP.POP.TOTL?format=json` ✅ `*` | ja | CC BY 4.0 | S |
| **Eurostat** | NUTS-Regionen: Bevölkerung, BIP, Arbeitslosigkeit, Energie | `ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/…` ✅ `*` | ja | CC BY 4.0 | M |
| **UNHCR** | Flüchtlinge, Herkunft/Ziel, Zeitreihe | `api.unhcr.org/population/v1/population/` ✅ `*` | ja | CC BY 4.0 | S |
| **SIPRI** | Waffenexporte, Militärausgaben | `sipri.org/…/SIPRI-Milex-data-1949-2024.xlsx` ✅ 824 KB | nein | frei, Zitat | M |
| **UCDP** | georeferenzierte Konfliktereignisse, Tote | `ucdpapi.pcr.uu.se/api/gedevents/25.1` ✅ (401 → Key) | – | CC BY 4.0 | M |
| **ACLED** | Konfliktereignisse, Live | `acleddata.com` (Key, Registrierung) | – | **eigene Terms** ⚠ | M |
| **OpenSanctions** | Sanktionen, PEPs, Firmen | `api.opensanctions.org` (Key), Bulk-Download | – | **CC BY-NC** ⚠ | M |
| **HDX** | humanitäre Basisdaten (Schulen, Wasser, Märkte) | `data.humdata.org/api/3/action/package_search` ✅ `*` | ja | je Datensatz | M |
| **WFP HungerMap / VAM** | Ernährungslage, Preise | `hungermap.wfp.org`, `api.wfp.org` (neues Gateway prüfen) | – | CC BY-IGO | M |
| **FEWS NET** | Ernährungskrisen-Prognose | `fews.net` (API neu) | – | PD | M |
| **FAO GIEWS** | Ernteprognosen, Preise | `fao.org/giews` | – | CC BY-IGO | M |
| **Global Solar/Wind Atlas** | s. o. | s. o. | ja | frei | S |

Ein **Choropleth-Baustein** fehlt Orbis komplett. World Bank/Eurostat liefern die Werte, Natural Earth
die Flächen (schon im Repo, `ne50m_land.json`). Damit wären BIP, Armut, Energieverbrauch, Waldfläche
und CO₂ als eingefärbte Länderkarte in einem Rutsch möglich – ein ganzer Ebenentyp, der heute fehlt.

---

## 6. Gesundheit und Gesellschaft

| Quelle | Was sichtbar wird | Endpunkt | CORS | Lizenz | Aufwand |
|---|---|---|---|---|---|
| **WHO GHO** | 1 000+ Gesundheitsindikatoren je Land | `ghoapi.azureedge.net/api/` | prüfen | CC BY-NC-SA ⚠ | M |
| **ECDC / WHO DON** | Ausbrüche (Masern, Cholera, Mpox) | `ecdc.europa.eu`, `who.int/emergencies` | – | CC BY | M |
| **Healthsites** | Gesundheitseinrichtungen global | `healthsites.io` (bereits für Gaza genutzt) | – | ODbL | **S** |
| **UNESCO-Welterbe** | 1 273 Stätten mit Koordinaten, Gefährdungsstatus | `whc.unesco.org/en/list/xml/` ✅ 2,5 MB | nein | Attribution | S |
| **Wikidata SPARQL** | beliebige Objektklassen mit Koordinaten | `query.wikidata.org/sparql?format=json` ✅ `*` | ja | CC0 | **S** |
| **Glottolog** | 8 000 Sprachen mit Verbreitung | `glottolog.org` (Download) | – | CC BY 4.0 | M |
| **GHSL / WorldPop** | Bevölkerung, Stadtwachstum, Zeitreihe 1975–2030 | `ghsl.jrc.ec.europa.eu`, `worldpop.org` | – | Copernicus/CC BY | M |
| **ReliefWeb** | humanitäre Berichte, geografisch | `api.reliefweb.int/v2/…?appname=` (Appname registrieren) | `*` | CC BY | S |
| **IFRC GO** | Katastrophen, Einsätze | `goadmin.ifrc.org/api/v2/country/` ✅ | nein | frei | S |

**Wikidata SPARQL** ist der Universalschlüssel: Eine Abfrage, eine Ebenendatei, und man hat
„alle Burgen“, „alle Leuchttürme“, „alle Sternwarten“, „alle UNESCO-Stätten“, „alle Kernkraftwerke“
mit Koordinaten und Label. CC0, CORS offen, in 20 Zeilen Code.

---

## 7. Kultur, Orte, Kuriosa

| Idee | Datenquelle | Lizenz | Aufwand |
|---|---|---|---|
| **Historische Karten** (Zeitreise) | Library of Congress `loc.gov` (IIIF), NYPL Digital Collections (IIIF) | PD | M |
| **Sprachgrenzen** | Glottolog + Wikidata | CC BY / CC0 | M |
| **Weinbaugebiete** | OSM `landuse=vineyard` | ODbL | S |
| **Pilgerwege** | OSM `route=hiking` + `pilgrimage` | ODbL | S |
| **Leuchttürme** | OSM `man_made=lighthouse` | ODbL | S |
| **Burgen und Schlösser** | OSM `historic=castle` / Wikidata | ODbL / CC0 | S |
| **Bunker und Lost Places** | OSM `military=bunker`, `abandoned:*` | ODbL | S |
| **Forschungsstationen Antarktis** | COMNAP (Download) | frei | S |
| **Zeitzonen** | Natural Earth (im Repo) | PD | S |
| **Telefonvorwahlen / Postleitzahlen** | GeoNames `download.geonames.org` ✅ 3,2 MB | CC BY 4.0 | S |
| **Klimazonen Köppen-Geiger** | `koeppen-geiger.vu-wien.ac.at` | CC BY-SA | S |
| **Bodentypen WRB** | FAO/ISRIC | CC BY | M |
| **Geocaching** | OpenCaching (API) | eigene Terms ⚠ | M |
| **Nachtzüge** | OSM + Back-on-Track | ODbL | S |

**Historische Karten** sind der stärkste „wir haben an nichts gedacht“-Layer: Die Zeitachse reicht
heute von gestern bis übermorgen. Mit IIIF-Kacheln aus LoC/NYPL kann man 1800, 1900, 1950 als
Basiskarte legen und die Gegenwart darüberblenden. Public Domain, kein Key.

---

## 8. Rangliste: die 15 stärksten neuen Ebenen

| # | Ebene | Quelle | Warum | Lizenz | Aufwand |
|---|---|---|---|---|---|
| 1 | **Flugrouten der Welt** | OpenFlights | 67 000 Großkreis-Bögen, sofort ikonisch | ODbL | S |
| 2 | **Live-Strommix + Börsenpreis** | Energy-Charts | kostenlos, CORS, CC BY, 15 min | CC BY 4.0 | M |
| 3 | **Pisten und Flugplätze** | OurAirports | 80 000 Plätze mit Belag/Länge | PD | S |
| 4 | **Wikidata-Klassen** (Burgen, Leuchttürme, Observatorien) | Wikidata SPARQL | ein Baukasten für 50 Ebenen | CC0 | S |
| 5 | **Internet-Ausfälle** | IODA | Nachrichtenwert, Proxy vorhanden | CC BY 4.0 | M |
| 6 | **Tor-Relays / IXPs** | Tor Metrics, PeeringDB | „Wie das Netz wirklich aussieht“ | CC0 / CC BY-SA | S–M |
| 7 | **Bevölkerungs-/Wohlstands-Choropleth** | World Bank, Eurostat, GHSL | fehlender Ebenentyp | CC BY 4.0 | M |
| 8 | **Historische Karten (Zeitreise)** | LoC, NYPL (IIIF) | Zeitachse rückwärts | PD | M |
| 9 | **UNESCO-Welterbe** | UNESCO XML | 1 273 Punkte, Gefährdungsstatus | Attribution | S |
| 10 | **Flüchtlingsströme** | UNHCR | Herkunft→Ziel als Bögen | CC BY 4.0 | S |
| 11 | **Sprachen der Welt** | Glottolog | ungewöhnlich, bildstark | CC BY 4.0 | M |
| 12 | **Seezeichen / Fahrrinnen** | OpenSeaMap | Segler-Perspektive | ODbL | S |
| 13 | **Gleisnetz mit Elektrifizierung** | OpenRailwayMap | Infrastruktur-Detail | ODbL | S |
| 14 | **Gasabfackeln** | VIIRS Nightfire | Industrie, die man sonst nicht sieht | PD | M |
| 15 | **Ladepunkte** | Open Charge Map | E-Mobilität, Alltagsnutzen | CC BY-SA | S |

## 9. Geprüft und verworfen

| Quelle | Grund |
|---|---|
| `api.climatetrace.org/v6/*` | 404 – API-Version/Endpunkt hat sich geändert |
| `api.acleddata.com` | DNS tot, Nachfolger mit Key |
| `api.opensanctions.org` | 401, Bulk nur CC BY-NC |
| `ucdpapi.pcr.uu.se` | 401 – inzwischen Key nötig |
| `api.wfp.org/vam-data-bridges` | Gateway abgeschaltet (Antwort sagt es selbst) |
| `api.hungermapdata.org` | 404 |
| `developer.nrel.gov` | DNS tot |
| `tiles.openinframap.org` | Host tot (Daten via Overpass) |
| `api.teleport.org`, `api.sun.host` | DNS tot |
| `service.unece.org/.../loc242csv.zip` | 403, Liste über Webseite |
| `unfallatlas.statistikportal.de/_packages/2023.csv` | 404, Paket-URL jährlich anders |
| `globalwindatlas.info/api` | 400, Parameter dokumentieren |
| GADM | **nicht-kommerzielle Lizenz** → nicht verwenden, Natural Earth reicht |
| Open Charge Map ohne Key | 403, Key kostenlos |
