# 07 – Overpass-Instanzen: Quellen, Erreichbarkeit, Proxy-Plan

Stand 17.11.2026. Quelle der Liste: [OSM-Wiki „Overpass API“, Abschnitt Public instances](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances). Erreichbarkeit am 17.11.2026 abends von einem Rechner in Deutschland geprüft (je zwei GET-Abfragen: Bäume in 700 m Box in Berlin, mit `User-Agent`, `Referer` und `Origin`). Eine Stichprobe, keine Dauermessung.

## Ausgangslage im Code

Der Browser fragt direkt bei drei Servern an (`src/data/parsers/overpassarea.ts:14` und doppelt in `src/layers/verkehr/flughafen.ts:22`): `overpass-api.de`, `overpass.private.coffee`, `overpass.kumi.systems`.

**`overpass.kumi.systems` ist der alte Name von `overpass.private.coffee`** (laut Wiki). Es ist derselbe Betreiber, die Kette hat also nur zwei echte Server, und beide haben bei der Prüfung nicht geantwortet.

**`overpass-turbo.eu`** ist nur die Weboberfläche (Overpass Turbo), kein API-Server. Ihre Standard-API ist `overpass-api.de`. Als Endpunkt taugt sie nicht.

**`turbo.overpass.private.coffee`** (die Turbo-Oberfläche von private.coffee) ist vermutlich offline oder kaputt. Die Startseite liefert bei mir HTTP 200, aber die API dahinter antwortet nicht (30 s Zeitüberschreitung), und im Selbsttest im Browser kam laut Malte ebenfalls nichts zurück.

## Globale Instanzen

| Instanz | Endpunkt | Zugang | Ergebnis der Prüfung |
|---|---|---|---|
| **Haupt-Instanz** (FOSSGIS, Deutschland) | `https://overpass-api.de/api/interpreter` | frei, Richtwert unter 10 000 Abfragen, unter 1 GB pro Tag, Summe der Rechenzeit unter 10 min; `User-Agent` oder `Referer` Pflicht; laut Wiki derzeit überlastet | **keine Antwort** (Zeitüberschreitung 25 s, 2x). Vorher einmal HTTP 406 ohne Browser-Header, `/api/status` ebenfalls hängend |
| **private.coffee** (früher kumi.systems) | `https://overpass.private.coffee/api/interpreter` | frei, kein Limit, bei großem Einsatz vorher melden | **keine Antwort** (Zeitüberschreitung, 4x) |
| **openstreetmap.fr** | `https://overpass.openstreetmap.fr/api/interpreter` | nicht im Wiki gelistet, Richtlinie unbekannt | **200**, 0,3 bis 1,2 s, CORS `*`, lieferte Berlin (1280 Bäume), Abdeckung also mindestens Europa. Ohne Browser-Header HTTP 403 |
| **dresel.systems Europa** | `https://ovp.dresel.systems/api/interpreter` | frei, 4 parallele Abfragen pro IP, tägliches Update (ca. 03:15 UTC) | **200**, 0,4 bis 0,7 s, CORS `*`, Berlin 1280 Bäume, Datenstand vom Vortag |
| **dresel.systems Nordamerika** | `https://ovp.dresel.systems/api-na/interpreter` | wie oben | **200**, 0,25 s, CORS `*` |
| **Overpass.ch** | `https://api.overpass.ch/v1/<KEY>/interpreter` | Key nötig, Gratis-Stufe 10 000 Abfragen pro Monat und 30 pro Minute, eigene schnelle Engine | nicht geprüft (Key) |
| **NextGIS** | `https://overpass.nextgis.com/<KEY>/api/interpreter` | Key nötig, kostenlos, kein Limit angegeben | nicht geprüft; Firmensitz vor Nutzung klären |
| **FairwayMapper** | `https://api.fairwaymapper.com/k/<KEY>/api/interpreter` | Key, Gratis-Stufe für aktive OSM-Mitwirkende | nicht geprüft |
| **Geofabrik**, **Tracestrack**, **Overspan**, **Mapsource** | je mit Key | kostenpflichtig | nicht geprüft |

## Regionale Instanzen

| Instanz | Abdeckung | Endpunkt | Ergebnis der Prüfung |
|---|---|---|---|
| **overpass.osm.ch** | Schweiz | `https://overpass.osm.ch/api/interpreter` | **200**, 0,3 bis 0,5 s, CORS `*`; keine Attic-Daten, Nutzung „Betreiber fragen“ |
| **atownsend.org.uk** | Großbritannien und Irland | `https://overpass.atownsend.org.uk/api/interpreter` (Wiki nennt `/api/`) | **200**, 0,3 bis 1,4 s, CORS `*`; Hobby-Server (4 Kerne, langsame Platte), oft nur IPv6, keine Metadaten; Daten minutenaktuell |
| **MapRVA** | Virginia (USA) | `https://overpass.maprva.org/api/interpreter` | **200**, 0,5 s, CORS `*`; kleiner Server im Kubernetes |
| **OpenPlaceGuide** | Äthiopien | `https://ethiopia.overpass.openplaceguide.org/api/interpreter` | **200**, 0,2 bis 0,3 s, CORS `*` |
| **Spainip.es** | nur Funkamateur-Objekte (`communication:amateur_radio:*`), weltweit | `https://api.spainip.es/v1/overpass/interpreter` | **200**, CORS `*`; für uns uninteressant |
| `overpass.osm.jp` (Japan) | – | – | **nicht erreichbar** (kein DNS-Eintrag), steht auch nicht im Wiki: nicht verwenden |

Fehlende Länder: Für **Deutschland** gibt es außer `overpass-api.de` keine eigene Instanz, die dresel.systems-Europa-Instanz und openstreetmap.fr decken es aber mit ab. Für **Frankreich** nehmen wir openstreetmap.fr, für **Japan, Australien, Südamerika, Afrika (außer Äthiopien)** gibt es keine verlässliche eigene Instanz, dort bleibt nur die globale Kette.

## Bewusst ausgelassen (juristisch oder politisch kritisch)

- **maps.mail.ru/osm/tools/overpass** (VK Maps, Russland): technisch gut (keine Limits), aber russischer Betreiber, deshalb nicht verwenden.
- **overpass.openstreetmap.ru**: ebenfalls Russland, nicht verwenden.
- NextGIS hat russische Wurzeln: nur nach Prüfung des Firmensitzes, sonst weglassen.
- Bei den Bezahldiensten (Geofabrik, Tracestrack, Overspan, Mapsource, Overpass.ch, FairwayMapper) vor jeder Nutzung Standort und Datenschutz prüfen, sie sind hier nur der Vollständigkeit halber genannt.

## Einordnung

Von den Servern, die heute im Code stehen, antwortet im Test keiner. Die erreichbaren Mirrors sind **openstreetmap.fr** (Europa, unklare Richtlinie), **dresel.systems** (Europa und Nordamerika, Stand vom Vortag) und die regionalen Instanzen. Das stützt Maltes Plan, eine Kette aus Regionalserver zuerst und globalem Fallback zu bauen, aber nicht als Browser-Direktabfrage, sondern über einen Proxy.

## Plan: Cloudflare-Worker-Proxy (priorisierter Weg)

Ein Worker `overpass.<domain>` nimmt dieselbe Abfrage an wie ein Overpass-Server und wählt den Server serverseitig. Der Browser sieht nur einen Endpunkt.

1. **Routing nach Box:** Aus der Abfrage (`bbox` oder `around`) die Region bestimmen. Schweiz → osm.ch, Großbritannien/Irland → atownsend, Europa → dresel oder openstreetmap.fr, Nordamerika → dresel `api-na`, sonst globale Kette. Region-Tabelle als Konfiguration (Box, Server, Reihenfolge).
2. **Fallback und Abkühlzeit:** Bei Fehler, Zeitüberschreitung, 429, 504 oder leerer Antwort der Reihe nach der nächste Server. Ein fehlerhafter Server wird 1 bis 5 Minuten übersprungen (Zustand in einem Durable Object oder KV), damit nicht jede Anfrage erst 15 s wartet.
3. **Cache:** Antworten über die Cloudflare Cache API zwischenspeichern, Schlüssel ist die normalisierte Abfrage (Box auf ein Raster gerundet). Kurze TTL (5 bis 30 min) für Live-Daten, länger für Flughafenpläne. Gleichzeitige gleiche Abfragen zu einer zusammenfassen.
4. **Ein Absender:** Alle Nutzer erscheinen für die Server als **eine** App. Wir senden einen klaren `User-Agent` mit Kontakt und halten die Fair-Use-Grenzen der Haupt-Instanz (unter 10 000 Abfragen pro Tag) ein. Mit Cache und den freien Mirrors zuerst ist das machbar. Bei großen Mengen den Betreibern (private.coffee, dresel.systems) vorher Bescheid geben.
5. **Schutz:** Nur `[out:json]`, Zeitlimit und Boxgröße begrenzen, kein `[timeout]` über 25 s, nur unsere Origin zulassen, pro IP drosseln.
6. **Client:** `overpassarea.ts` und `flughafen.ts` nutzen eine gemeinsame Funktion, die nur noch den Worker fragt (Direktabfrage als Notnagel).
7. **Kosten:** Workers Free reicht für 100 000 Anfragen pro Tag, ansonsten Paid-Plan. Kein R2-Speicher nötig.

## Offene Punkte

- Dauermessung über mehrere Tage (Verfügbarkeit, Antwortzeit pro Server), bevor die Reihenfolge festgelegt wird.
- Richtlinie von openstreetmap.fr klären (nicht im Wiki).
- Bei dresel.systems für größere Last anfragen (4 parallele Abfragen pro IP gelten pro Absender, also pro Worker-Egress).
- Ob die Überlastung von `overpass-api.de` ein dauerhafter Zustand ist: [Forumsthread „Overpass API performance issues“](https://community.openstreetmap.org/t/overpass-api-performance-issues/140598).
