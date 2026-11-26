# Bus & Bahn: UX-Konzept

Stand 2026-11-26, ersetzt die Oberfläche aus `docs/mockups/bahn.html` (Farben und Linien-Badges bleiben). Maßstab:
Material 3 und Apple HIG (Bedienflächen, Typo, Zustände), WCAG 2.2 AA.

## Befund der alten Oberfläche

| Problem | Ursache |
|---|---|
| Karte lässt sich nicht verschieben/zoomen, stattdessen zoomt die ganze Seite | Karte nur auf der Startseite bedienbar (`interactive: false` sonst) |
| Karten, Knöpfe und Chips ohne Fläche, Rahmen und Abstand | Grundregel `:root[data-app] button` schlägt jede Klasse (Spezifität) |
| Auf der Karte nichts antippbar außer wenigen Punkten | keine Treffererkennung, Haltestellen nur als HTML-Marker |
| Strecken als gerade Linien zwischen Halten | Gleisverlauf der Quelle wurde nicht gelesen |
| Jede Seite baut eine eigene Karte, Liste verliert beim Zurückgehen ihren Stand | Karte und Blatt gehören zum Bildschirm |

## Grundsätze

1. **Eine Karte, immer da.** Eine einzige Karte füllt die App; sie lädt einmal und bewegt sich mit. Immer bedienbar.
2. **Ein Blatt mit drei Rasten** (klein, halb, voll). Inhalt steht unten, in Daumenreichweite. Ziehen an Griff, Kopf
   oder Inhalt; die Karte rückt ihren Mittelpunkt in den sichtbaren Teil.
3. **Alles, was man sieht, ist antippbar.** Haltestelle → Abfahrten. Strecke → zugehöriger Abschnitt bzw. Verbindung.
   Abfahrt → ganzer Linienlauf. Halt im Linienlauf → Haltestelle.
4. **Zurück ist verlässlich.** Jede Ebene ist ein Historieneintrag; darunter liegende Seiten behalten Liste,
   Scrollstand und Rast.
5. **Zustände sind gestaltet:** Laden (Platzhalter in Form des Inhalts), leer (mit nächstem Schritt), Fehler (mit
   „Erneut versuchen“), offline (Alter der Daten).

## Aufbau

Untere Leiste mit drei Zielen (der frühere Reiter „Karte“ entfällt, die Karte ist überall):

| Reiter | Inhalt |
|---|---|
| **Start** | „Wohin?“, Zuletzt/Favoriten als Chips, Abfahrten der nächsten Haltestelle, Haltestellen in der Nähe |
| **Abfahrten** | Haltestelle suchen, gemerkte und nahe Haltestellen |
| **Merkliste** | gemerkte Strecken und Haltestellen, entfernen |

| Seite | Kopf | Inhalt | Karte |
|---|---|---|---|
| Suche | Eingabefeld | Mein Standort, Favoriten, Zuletzt, Treffer mit Verkehrsmitteln | – (volle Rast) |
| Verbindungen | Start/Ziel-Feld mit Tauschen, Zeit und Filter | Ergebniskarten, früher/später | gewählte Strecke; Tipp öffnet sie |
| Verbindung | Zeiten, Dauer, Umstiege, teilen | Abschnitte als Karten mit Linienfarbe, Gleise, Umstiegszeit, Zwischenhalte | Gleisverlauf, Halte; Tipp auf Strecke hebt Abschnitt hervor |
| Haltestelle | Name, Ort, merken | „Von hier“/„Nach hier“, Filter, Abfahrten | Haltestelle und Umgebung |
| Linienlauf | Linie, Richtung | alle Halte mit Zeiten und Gleisen | Strecke mit antippbaren Halten |

Ab 960 px Breite: Leiste links, das Blatt wird zur Seitenspalte, die Karte füllt den Rest.

## Gestaltung

- **Typo:** Systemschrift; 28 / 22 / 17 / 15 / 13 / 12 px, nichts unter 12 px; Zahlen tabellarisch.
- **Raster:** 4 px; Seitenrand 16 px; Radien 8 (Badge), 14 (Feld), 18 (Karte), 28 (Blatt).
- **Bedienflächen:** mindestens 48 × 48 px; sichtbarer Druck- und Fokuszustand.
- **Farbe:** Flächen `--ink-0…3`; Akzent `--limb` nur für Aktionen und Auswahl; Verkehrsmittelfarben nur für Linien.
- **Status nie nur über Farbe:** Verspätung als Zahl („+4“), Ausfall als Wort, Gleiswechsel mit Zeichen.
- **Bewegung:** 200–300 ms, bei „Bewegung reduzieren“ aus.

## Später

- Netzpläne als Kartenebene (Linien mit Namen antippbar), sobald die Netz-Kacheln gebaut sind.
- Fahrzeuge live, Störungsmeldungen, helle Karte, Benachrichtigungen.
