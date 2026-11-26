# Orbis Bahn (in der Oberfläche „Bus & Bahn“): Grundlagen und offene Entscheidungen

Dritte App im selben Build, neben Orbis Wetter und Orbis Map. Richtung: DB Navigator (Verbindungen, Abfahrten, Karte),
für Züge und Busse.

- Einstieg: `src/entry.ts` wählt per Hostname `bahn.*` oder lokal `?mode=bahn` (`pnpm dev`, dann `/?mode=bahn`).
- Code: `src/bahn/` (`app/` Oberfläche, `data/` Domänenmodell und Anbieter-Schnittstelle, `styles/` Tokens).
- PWA: `public/bahn/manifest.webmanifest`, bisher nur SVG-Icon, noch kein Service Worker, Domain `bahn.maltee.dev` in `wrangler.jsonc`.
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
- **Worker:** `https://bahn.maltee.dev` steht in `ALLOWED_ORIGINS` von `orbis-data/workers/push/wrangler.jsonc` (Branch `claude/bahn-origin`). Der Worker muss nach dem Merge neu deployt werden.

## Design-Entscheidungen (Mockups: `docs/mockups/bahn.html`)

- Reiter: Start, Abfahrten, Karte, Merkliste. Dunkel, Tokens wie Wetter/Map.
- Start-Screen mit Karte oben, **nur wenn ein Standort bekannt ist** (Gerätestandort oder eingetragener Start). Sonst reicht das Blatt bis ganz nach oben (Suche, Favoriten, zuletzt gesucht, Hinweis „Standort verwenden“).
- Orbis-Ebenen in der Bahn-Karte: Fahrzeuge live, Liniennetz im Detail, Störungen, Leihräder. **Kein Wetter.**
- **Neue Orbis-Ebene nötig:** „Liniennetz im Detail“, Zugnetze einzelner ausgewählter Städte mit allen Linien und Haltestellen.

## Oberfläche (umgesetzt, `src/bahn/`)

- `app/` Hülle mit Reitern, `screens/` Start, Suche, Abfahrtstafel, Verbindungen, Verbindungsdetail, Karte, Merkliste. `ui/` Badges, Gleisschild, Karte (`NetMap`), Formatierer. `state/` Signals für Navigation, Standort, Favoriten.
- Start-Screen: Karte nur mit bekanntem Standort (Gerätestandort oder eingetragener Start).
- Karte: MapLibre mit dem dunklen Stil der Wetterkarte, lädt erst bei Bedarf. Noch keine Orbis-Ebenen, keine Fahrzeuge live.
- Lokal: `pnpm dev`, dann `/?mode=bahn`.
- Zurück-Taste und Wischgeste: jeder geöffnete Bildschirm ist ein Historieneintrag (`state/nav.ts`). Reiterwechsel erzeugen keine Einträge.
- Noch nicht: Service Worker, Domain, Orbis-Ebenen, Hellmodus-Feinschliff.

## Offen

1. Umfang (Deutschland oder Europa). Quelle ist entschieden: Transitous plus DB-Worker.
2. Funktionsumfang der ersten Version und Reiter-Aufbau.
3. Karte: MapLibre-Engine aus Orbis wiederverwenden (Wetter-Modus tut das schon) oder erst später.
4. Offline, Favoriten, Benachrichtigungen bei Verspätung.
