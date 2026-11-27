# Orbis Bahn (in der Oberfläche „Bus & Bahn“): Grundlagen und offene Entscheidungen

Dritte App im selben Build, neben Orbis Wetter und Orbis Map. Richtung: DB Navigator (Verbindungen, Abfahrten, Karte),
für Züge und Busse.

- Einstieg: `src/entry.ts` wählt per Hostname `bahn.*` oder lokal `?mode=bahn` (`pnpm dev`, dann `/?mode=bahn`).
- Code: `src/bahn/` (`app/` Oberfläche, `data/` Domänenmodell und Anbieter-Schnittstelle, `styles/` Tokens).
- PWA: `public/bahn/manifest.webmanifest`, bisher nur SVG-Icon, Service Worker für den Offline-Betrieb (`docs/WETTER-HOSTING.md`, Abschnitt Offline), Domain `bahn.maltee.dev` in `wrangler.jsonc`.
- Stand: leere Hülle mit vier Reitern (Verbindung, Abfahrten, Karte, Merkliste) und `TransitProvider`-Schnittstelle.

## Datenquellen (aus dem alten Orbis, `src/api/connections.ts`, `dbdelays.ts`, `transit.ts`)

- **Transitous** (`https://api.transitous.org/api`, MOTIS v5, ohne Schlüssel, Europa weit): `/v1/geocode` (Haltestellensuche),
  `/v1/reverse-geocode` (in der Nähe), `/v5/plan` (Verbindungen A → B, mit Cursor für früher/später), `/v5/stoptimes`
  (Abfahrten). Echtzeit nur, wenn der Betreiber sie meldet; Verkehrsmittel als MOTIS-Modi (`LONG_DISTANCE`, `SUBURBAN`, `BUS` …).
- **DB-Verspätungen**: Transitous' Bahn-Verspätungen sind unzuverlässig. Der Worker aus Orbismap/data (`workers/push`,
  `POST /db/delays`) hält den Schlüssel der DB API Marketplace (Timetables) und liefert Verspätung, Gleis und Ausfall je
  Zug. Die Daten werden nachträglich eingemischt; bis dahin zeigt die App für Bahnfahrten nur die Fahrplanzeit.
- **Fahrzeugpositionen** (Karte): Transitous-Fahrtabschnitte, Position aus Abfahrts- und Ankunftszeit interpoliert.

## Datenschicht (umgesetzt, `src/bahn/data/`)

- `types.ts`: Modell (Stop, Time mit Fahrplan/Echtzeit, Call, Leg, Journey, Departure) und die Schnittstellen `TransitProvider` und `DelayEnricher`. Zeiten sind Epoch-ms.
- `transitous.ts`: reine Parser plus `createTransitous()`. `delays.ts`: DB-Worker mit Pause bei Fehlern, `plannedJourney` / `plannedDepartures` für die Anzeige, bis die DB-Daten da sind. `modes.ts`: MOTIS-Modi ↔ Gruppen. `index.ts`: `createSources()`.
- Ablauf in der Oberfläche: Transitous abfragen, Züge mit `plannedJourney` zeigen, `delays.journeys()` nachladen und ersetzen.
- Worker-Adresse: `VITE_BAHN_DELAYS_URL` (`off` schaltet ab), Standard `https://orbis-trains.malte9799.workers.dev`.
- Push zu gespeicherten Verbindungen: derselbe Worker; `VITE_BAHN_PUSH_URL` (`off` schaltet ab). Einzelne Fahrten tragen ein `date`, dafür muss der Worker aus Orbismap/data neu ausgerollt sein.
- **Worker:** `https://bahn.maltee.dev` steht in `ALLOWED_ORIGINS` von `orbis-data/workers/push/wrangler.jsonc` (Branch `claude/bahn-origin`). Der Worker muss nach dem Merge neu deployt werden.

## Oberfläche

Konzept, Befund und Gestaltungsregeln: [BAHN-UX.md](BAHN-UX.md).

- `app/` Hülle (eine Karte, ein Blatt, drei Reiter). `screens/` Start, Abfahrten, Merkliste, Suche, Verbindungen, Verbindungsdetail, Haltestelle, Linienlauf.
- `ui/TransitMap.tsx` die eine Karte (MapLibre, dunkler Stil der Wetterkarte mit Schienennetz, lädt beim ersten Bild); Ebenen in `ui/mapLayers.ts`, Umrechnung von Verbindungen in `ui/mapData.ts`.
- Seiten beschreiben nur ihre Szene (`ui/scene.ts`, `useScene`); die oberste gilt. `ui/Sheet.tsx` ist das Blatt mit drei Rasten (Geometrie in `ui/sheetState.ts`), `Screen` eine Seite darin. Verdeckte Seiten bleiben bestehen.
- Antippen auf der Karte: Haltestelle → Abfahrten, Strecke → Abschnitt bzw. Verbindung. Haltestellen der Umgebung ab Zoom 14 aus Transitous (`/v1/map/stops`), darunter die Bahnhöfe des Grundstils. Linienläufe aus `/v5/trip`, Gleisverläufe aus `legGeometry`.
- Orbis-Ebenen in der Bahn-Karte (geplant): Fahrzeuge live, Netzpläne, Störungen, Leihräder. **Kein Wetter.**
- Lokal: `pnpm dev`, dann `/?mode=bahn`.
- Zurück-Taste und Wischgeste: jede geöffnete Seite ist ein Historieneintrag (`state/nav.ts`). Reiterwechsel erzeugen keine Einträge.
- Offline: Start ohne Netz und zuletzt bekannte Daten (`data/offline.ts`; ohne Gleisverläufe).
- Noch nicht: Orbis-Ebenen, helle Karte.

## Desktop (ab 960 px Breite)

Leiste links (88 px) | Blatt als Seitenspalte (420 px) | dieselbe Karte. Darunter Karte mit Blatt (ab 640 px Breite mittig). Verbindungsliste: Mit der Maus über eine Verbindung zeigt die Karte deren Strecke.

## Offen

1. Umfang (Deutschland oder Europa). Quelle ist entschieden: Transitous plus DB-Worker.
2. Funktionsumfang der ersten Version und Reiter-Aufbau.
3. Karte: MapLibre-Engine aus Orbis wiederverwenden (Wetter-Modus tut das schon) oder erst später.
4. Favoriten, Benachrichtigungen bei Verspätung.
