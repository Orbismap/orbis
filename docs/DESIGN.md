# Orbis Map: Design

Verbindliche Gestaltungsgrundlage. Sprache der Oberfläche: Deutsch, Sie-/Du-frei formuliert (Infinitiv oder
Substantiv: „Ebene hinzufügen“, „Standort“).

## Vorrang: Apple-Standards und Liquid Glass

Vorgabe des Auftraggebers (11. Nov. 2026), geht allem Folgenden vor, wo es sich widerspricht:

- **Apple Human Interface Guidelines** sind der Maßstab für Aufbau, Bedienmuster, Abstände, Trefferflächen,
  Bewegung und Zugänglichkeit, auf dem Desktop (macOS) wie mobil (iOS).
- **Liquid Glass** (Design von macOS/iOS 26 „Tahoe“) für alle schwebenden Bedienelemente über der Karte:
  ruhiges, flaches Glas: gleichmäßig getönte Fläche (dunkel ~0.72, hell ~0.72 Deckkraft, Popover +0.08),
  Unschärfe 24–30 px mit Sättigung 150–160 %, nur eine Haarlinie (0.5 px, sehr niedriger Kontrast) statt Lichtkante,
  ein weicher flacher Schatten (`--g-shadow`, kleine Elemente `--g-shadow-sm`), keine Verläufe oder Glows; Elemente
  innerhalb eines Panels nur flache Füllung (`--g-fill`, aktiv `--g-fill-active`) ohne Kante, Blur, Schatten; großen durchgehenden Radien (Kapseln und konzentrische
  Ecken: innerer Radius = äußerer Radius − Abstand). Glas nur für die Bedienebene, nie für Inhalte; Inhalt in
  Paneelen liegt auf ruhigerem, dichterem Material. Bedienelemente gruppieren sich in Glaskapseln und rücken beim
  Scrollen/Verschieben zusammen statt die Karte zu verdecken.
- **Schrift:** Systemschrift (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, …`), Zahlen mit
  `tabular-nums`. IBM Plex entfällt.
- **Werkzeugleiste rechts** nach dem Vorbild des bisherigen Orbis: senkrechte Glaskapseln am rechten Rand,
  von oben nach unten: Kapsel 1 mit dem Globus-Schalter (2D/3D), Kapsel 2 mit Plus und Minus, darunter ein runder
  Kompass (Nordmarke rot, Strichskala, „N“), der mit der Kartendrehung mitläuft und per Klick nach Norden dreht.
  Kein Routen- und kein Standort-Knopf in dieser Leiste.
- Die Bedeutung der Farben bleibt: Blau für Ort/Auswahl, Bernstein nur für Zeit.

## Idee

Orbis ist ein **Beobachtungsinstrument**. Vorbild sind Leitstände und Satellitenbilder, nicht Dashboards.
Zwei Dinge aus der Sache selbst tragen die Gestaltung:

- **Der Limbus**: die dünne blaue Linie der Atmosphäre am Erdrand. Sie ist die einzige Akzentfarbe der Bedienung
  (Fokus, aktiv, Auswahl). *Blau heißt: wo.*
- **Der Terminator**: die Tag-Nacht-Grenze. Bernstein markiert ausschließlich Zeit (Jetzt-Linie, Zeitleiste,
  Abspielen, Alter von Daten). *Bernstein heißt: wann.*

Alle anderen Farben gehören den Daten. Die Bedienung ist sonst einfarbig.

**Das eine Markenzeichen ist die Zeitleiste**: ein durchgehendes Band von Vergangenheit (Radar, Ereignisse der
letzten Tage) bis Vorhersage (+72 h), mit Tag/Nacht-Schattierung für den Kartenmittelpunkt, Ereignismarken der
aktiven Ebenen und der bernsteinfarbenen Jetzt-Linie. Alles andere bleibt still.

## Marke

Idee: jeder Punkt der Welt, einer leuchtet, das ist jetzt und hier. Eine Kugel aus einzelnen Punkten (Fibonacci-Verteilung,
leicht gekippt), ein Punkt in Bernstein. Eine Geometrie, vier Fassungen (`src/ui/brand/orbis-dots.ts`, Skript
`pnpm brand` erzeugt daraus Favicon, App-Symbole und PNGs):

- **Logo** (ab 33 px): 70 große Punkte. **Klein** (17 bis 32 px): 34 Punkte. **Winzig** (bis 16 px, Favicon): 12 Punkte.
  `<OrbisMark size>` wählt automatisch; Mindestgröße 12 px.
- **Bewegung** (`<OrbisSpinner>`): 260 feine Punkte, dreht sich mit etwa 0,15 rad/s, der Leuchtpunkt wandert mit.
  Nur für globale Lade- und Startzustände (Start-Splash), nie als Dauerzierde. Pausiert im Hintergrund-Tab, steht
  bei „Bewegung reduzieren“ still.
- **Farben**: Punkte `--limb`, Leuchtpunkt `--now`. App-Symbol: Kachel `#0b1220`, Radius 27/120, Punkte `#4f8dff`,
  Leuchtpunkt `#ffb547`. Hell: Kachel `#eef3fb`, Punkte `#2f5fc0`. Einfarbig (`mono`): `currentColor`, Leuchtpunkt
  größer.
- Maskable-Symbol: Kachel randlos, Zeichen in der sicheren Zone (80 %).

## Farben

Dunkel ist Standard (Karten leuchten auf dunklem Grund, Satellitenbild und Wetterfelder wirken). Hell folgt
`prefers-color-scheme` oder der Einstellung.

| Token | Dunkel | Hell | Zweck |
|---|---|---|---|
| `--ink-0` | `#0A0F18` | `#FFFFFF` | Grund hinter der Karte, tiefste Fläche |
| `--ink-1` | `#101724` | `#F4F6F9` | Paneele |
| `--ink-2` | `#182132` | `#E9EDF2` | erhöhte Flächen, Hover |
| `--ink-3` | `#243044` | `#D8DEE7` | Eingaben, gedrückte Zustände |
| `--line` | `#2A3649` | `#CDD5E0` | Trennlinien (1 px) |
| `--text-1` | `#EDF1F6` | `#0F1826` | Haupttext |
| `--text-2` | `#A3AFC2` | `#4A5871` | Nebentext |
| `--text-3` | `#6C7A91` | `#7A879C` | Hinweise, Einheiten |
| `--limb` | `#72C8F0` | `#0B6FA8` | Akzent Bedienung |
| `--limb-quiet` | `rgba(114,200,240,.14)` | `rgba(11,111,168,.10)` | Akzentfläche |
| `--now` | `#F2B45A` | `#A86200` | Zeit |
| `--boost` | `#B9A2FD` | `#6D44D0` | Boost (eigene Schlüssel), nur dafür |
| `--boost-soft` | `rgba(185,162,253,.14)` | `rgba(109,68,208,.12)` | Boost-Fläche |

Farbregel: Blau = Ort/Auswahl, Bernstein = Zeit, Violett = Boost, sonst nirgends. Violett steht nur beim Boost-Abschnitt, bei Schlüssel-Hinweisen und -Symbolen.
| `--alert` | `#FF6B5E` | `#C6382C` | Fehler, Warnung |
| `--ok` | `#58D0A0` | `#1B8A5E` | frisch, verbunden |

Paneele über der Karte: `background: color-mix(in oklab, var(--ink-1) 86%, transparent)` mit
`backdrop-filter: blur(18px) saturate(1.4)`; ohne `backdrop-filter`-Unterstützung deckend. Rand
`1px solid color-mix(in oklab, var(--line) 70%, transparent)`. Schatten nur einer: `0 8px 32px rgba(0,0,0,.35)`
(hell: `.12`). Keine Farbverläufe als Schmuck.

Datenfarben (Ebenen-Leitfarben, Skalen) stehen in `core/color.ts`. Skalen sind wahrnehmungsgleichmäßig und für
Farbfehlsichtige geprüft; Temperatur divergierend um 0 °C, Niederschlag sequentiell blau→violett, Wind sequentiell.

## Schrift

- **IBM Plex Sans** (400, 500, 600) für alles. Technische Herkunft, sehr gute Ziffern, deutsche Sonderzeichen.
- **IBM Plex Sans Condensed** (500, 600) für Messwerte, Skalen, Zeitachse, Koordinaten: dicht, immer
  `font-variant-numeric: tabular-nums`. Keine Monospace-Schrift.
- Selbst gehostet über `@fontsource`, `font-display: swap`, nur lateinische Teilmenge.

Skala (rem, Basis 16 px): 0.6875 (11, Achsen) · 0.75 (12, Nebentext) · 0.8125 (13, Standard der Bedienung) ·
0.9375 (15, Titel in Paneelen) · 1.125 (18, Inspektor-Titel) · 1.5 (24, großer Messwert, Condensed 600).
Zeilenhöhe 1.35 für Bedienung, 1.5 für Fließtext. Keine Versalien-Etiketten, keine gesperrte Schrift.
Großschreibung nach deutscher Rechtschreibung, Satzschreibung in Schaltflächen.

## Maße

- Raster 4 px. Abstände: 4, 8, 12, 16, 24, 32.
- Radien: 6 (Eingaben, Chips), 10 (Paneele), 16 (Sheet oben), 999 (runde Schaltflächen). Nicht alles gleich rund:
  Hierarchie über den Radius.
- Trefferflächen: Maus mindestens 28 px, Touch mindestens 44 px.
- Paneelbreite Desktop: 336 px links, 360 px Inspektor rechts. Abstand zum Rand 12 px.
- Icons: eigener Satz, 20 px Raster, 1.5 px Strich, runde Enden, `currentColor`. Als ein Sprite/Modul in `ui/icons`.

## Aufbau Desktop (≥ 900 px)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ ┌─ Kopf links ──────────────┐                       ┌─ Werkzeuge ─────┐ │
│ │ ◎ Orbis │ Suche (⌘K)      │                       │ 2D│3D  ⌖  ＋ −  ⚙ │ │
│ ├───────────────────────────┤                       └─────────────────┘ │
│ │ Karten: Wetter·Gefahren…  │  ← Reiter, eigene Karten, „＋“            │
│ ├───────────────────────────┤                       ┌─ Inspektor ─────┐ │
│ │ Ebenen der Karte          │                       │ Titel            │ │
│ │  ● Temperatur    ▁▂▅ 100% │                       │ Fakten …         │ │
│ │  ● Erdbeben   412 · 3 min │                       │ Quelle · Alter   │ │
│ │  …                        │                       └─────────────────┘ │
│ │ [＋ Ebene hinzufügen]     │                                           │
│ └───────────────────────────┘                                           │
│   Temperatur ▇▇▇▇▇ °C   ← Legende, direkt auf der Karte                  │
│ ┌─ Zeitleiste ───────────────────────────────────────────────────────────┐│
│ │ ▶  Di 10. ░░▒▒▓▓│▓▓▒▒░░ Mi 11. ░░▒▒▓▓▒▒░░ Do 12.   Jetzt ││
│ └────────────────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

- Linkes Paneel ist einklappbar (`[`), der Inspektor erscheint nur bei Auswahl. Karte bleibt immer bedienbar.
- „Ebene hinzufügen“ öffnet den **Katalog** im selben Paneel (kein Modal): Suche oben, Kategorien als Abschnitte,
  je Ebene Icon in Leitfarbe, Titel, ein Satz, Abdeckung („DE“), Takt („live“, „täglich“). Ein Klick schaltet,
  das Paneel bleibt offen.
- **Ebenenzeile** und Ebenenliste: siehe „Linkes Menü: Aktiv und Vorschläge“ unten.
- **Punktabfrage**: Klick ins Leere setzt ein Fadenkreuz und zeigt im Inspektor Koordinate, Höhe über der Zeit
  des Tages (Sonnenstand) und je aktiver Feld-Ebene den Wert an dieser Stelle zur gewählten Zeit.
- **Maßstab**: oben mittig über der Kartenfläche (bei offenem linken Paneel dessen rechter Bereich, sonst Fenstermitte),
  7 px unter dem oberen Rand (`safe-area-inset-top`), mobil direkt unter der Suchleiste. Ohne Hintergrund, `pointer-events: none`.
  Die Einheit folgt der Balkenlänge: unter 1 km Meter, darüber Kilometer (imperial Fuß/Meilen).
- **Legende**: keine Karte, sondern schlanke Zeilen direkt auf der Karte (weiße 11-px-Schrift mit Textschatten wie der
  Maßstab), unten links neben dem Paneel über der Zeitleiste, mobil über Attribution und Sheet. Je sichtbarer Ebene mit
  Legende eine Zeile: Name (Sekundärfarbe), 6 px hoher Farbbalken (120–200 px) mit 2–4 Zahlenmarken, Einheit rechts;
  der Wert unter dem Mauszeiger erscheint als feiner Strich auf dem Balken. Klassen- und Symbol-Legenden sind eine Reihe
  kleiner Farbfelder mit Kurzlabels (höchstens 6, der Rest steht auf der Detailseite der Ebene). Höchstens 3 Zeilen,
  weitere als „+n“ (öffnet die Ebenenliste). Klick auf eine Zeile öffnet die Detailseite der Ebene.

## Linkes Menü: Aktiv und Vorschläge

Schmales, dichtes Paneel (300 px, `--panel-left` in `ui/tokens.css`). Zeilen
~33 px, Schrift 13 px, Nebentext 11 px, Icons 16 px, kompakte Schalter; mobil bleiben Trefferflächen ≥ 44 px.

- **Aktiv**: alle eingeschalteten Ebenen der Karte (auch die aus Themen). Zeile: Griff, Icon, Name,
  Datenalter/Status klein rechts (Bernstein, wenn veraltet; Hinweise wie „Schlüssel nötig“ unter dem Namen),
  Einstellungs-Symbol (Schieberegler, Sekundärfarbe), Schalter (`role="switch"`). Reihenfolge für alle aktiven Ebenen per Griff oder Alt+↑/↓. Ausschalten nimmt die
  Zeile heraus. Leer: „Schalte unten eine Ebene ein.“
- **Passt zu dieser Karte**: Ebenen aus `Karte.themes` (`src/karten/standard.ts`), die nicht aktiv sind, mit Icon,
  Name, Schalter, nach Themen gruppiert (kleine Zwischenüberschrift, nicht aufklappbar). Anfangs höchstens 6
  Zeilen, dann „n weitere anzeigen“ (Zustand je Karte gemerkt, `themes-state.ts`). Eigene Karten ohne Themen:
  Abschnitt entfällt.
- **Feld** (direkt unter „Aktiv“): Exklusive Feld-Ebenen (`exclusive: 'field'`, z. B. Wind, Temperatur) sind
  Einfachauswahl und deshalb eine Auswahlliste mit Häkchen (`role="radiogroup"`/`radio`), keine Schalter; erste
  Zeile „Kein Feld“, die gewählte Zeile ist blau hinterlegt und zeigt Datenalter und Einstellungs-Symbol. Anfangs
  höchstens 6 Felder (gewähltes immer sichtbar), Pfeil hoch/runter wechselt die Auswahl; Felder erscheinen nicht
  zusätzlich in „Aktiv“ oder „Passt zu dieser Karte“. Im Katalog tragen sie den Vermerk „Feld · ersetzt das aktuelle“.
- **Alle Ebenen**: Zeile „Katalog durchsuchen“ öffnet den Katalog.
- **Einstellungen**: Das Schieberegler-Symbol an aktiven Zeilen und an der gewählten Feld-Zeile (`aria-label`
  „Einstellungen <Ebene>“) und ein Klick auf den Ebenennamen schieben immer die **Detailseite** (`LayerPage`) ins
  Paneel (Push, Zurück-Pfeil): Schalter, Quelle, Alter, Abdeckung, Optionen, Deckkraft, Legende, ggf. Schlüssel.
  Kein Aufklappen unter der Zeile.
- Mobil dieselbe Liste im Bottom-Sheet.
- **Bedienung**: Pfeil hoch/runter wechselt zwischen Zeilen, `aria-expanded` an den „weitere anzeigen“-Knöpfen, Animationen
  200 ms und bei `prefers-reduced-motion` aus.

## Aufbau Mobil (< 900 px)

```
┌───────────────────────┐
│ [◎ Suche……………] [⚙]    │  Kopf: Suche als Pille, Einstellungen
│                    [3D]│
│        Karte       [⌖] │  rechte Daumenleiste: Projektion, Standort
│                        │
│ ┌────────────────────┐ │
│ │ ▬                  │ │  Sheet, drei Stufen:
│ │ Wetter ▾  Jetzt    │ │   1 Blick  (112 px): Karte wählen, Zeit, Zeitleiste
│ │ ▶ ──────│───────── │ │   2 Halb   (50 %):   Ebenen der Karte
│ └────────────────────┘ │   3 Voll   (100 % − Kopf): Katalog, Inspektor, Einstellungen
└───────────────────────┘
```

- Sheet folgt dem Finger, rastet mit Federung ein, respektiert `env(safe-area-inset-*)`. Der Inhalt scrollt in „Halb“ und „Voll“
  nativ (Scroll-Viewport = sichtbarer Teil); Herunterziehen am Scroll-Anfang übergibt die Geste ans Sheet, Griff und Blick-Zeile
  ziehen das Sheet immer. Zurück-Geste/Escape schließt eine Stufe.
- Auswahl auf der Karte öffnet den Inspektor in Stufe „Halb“ als Überlagerung; die Karte verschiebt sich nie.
- Zeitleiste ist in Stufe 1 immer erreichbar, Scrubben mit dem Daumen, haptisches Ticken an Tagesgrenzen
  (`navigator.vibrate`, wenn vorhanden).

## Karten: Ansichten und eigene Karten

- **Standardkarten sind ein Katalog.** Ein Klick öffnet die Karte im Detailmenü mit ihren Ebenen zum Schalten; sie lässt sich weder sichern noch in Grundkarte oder Deckkraft umbauen. Auch der Stift gibt es dort nicht; Ebenen hinzufügen und Reihenfolge ändern geht nur in eigenen Karten. Welche Ebenen aktiv sind, steht im Hauptmenü unter „Aktive Ebenen“ (zwischen „Orte“ und „Karten“) und ist das Einzige, was in Link und localStorage landet; die Zuordnung zur Standardkarte ergibt sich daraus. Eine Ebene, die in keiner Standardkarte liegt (z. B. über Cmd+K), landet in der ungespeicherten Karte („Als Karte sichern“ macht eine eigene daraus). Grundkarte-Wahl gilt nur für die Sitzung, außer in eigenen Karten.
- **Ungespeicherte Karte:** schmale Glaszeile „Nicht gespeichert“ (Als Karte sichern, Leeren), solange aktive Ebenen in keiner Standardkarte liegen.
- **„Alle Karten“:** Standardkarten, Eigene Karten, „Neue Karte“. Nur eigene Karten haben „⋯“ (Umbenennen/Symbol/Farbe, Duplizieren, Link kopieren, Löschen mit Bestätigung). Das Popover scrollt bei vielen Karten.
- **Eigene Karten** speichern jede Änderung sofort (Ebenen, Reihenfolge, Deckkraft, Grundkarte); sie haben keinen „geändert“-Zustand.

## Verhalten

- **Bewegung** antwortet nur auf Handlungen: Paneele 180 ms `cubic-bezier(.2,.8,.2,1)`, Sheet mit Feder,
  Auswahlring pulsiert einmal. `prefers-reduced-motion`: keine Partikel, keine Übergänge außer Deckkraft.
- **Cursor-Tooltip:** Wo die Legende den Strich unter dem Mauszeiger zeigt, erscheint zusätzlich ein kleines Glaskärtchen 14 px über dem Zeiger mit dem Wert in der gewählten Einheit (bei mehreren Ebenen je Zeile Farbpunkt und Name, höchstens drei). Nur bei vorhandenem Wert, nur mit Maus; nicht beim Ziehen, Zoomen, Drehen, über HUD-Elementen oder bei Objekt-Hover. `aria-hidden`, Einblenden 100 ms, ohne Bewegung entfällt es.
- **Laden**: nie Vollbild-Spinner. Die Ebenenzeile zeigt einen 2-px-Fortschrittsstreifen in Limbus-Blau; die Karte
  bleibt bedienbar. Skelette nur im Inspektor.
- **Fehler** stehen an der Ebene, die sie betreffen, mit Ursache und Handlung („Quelle antwortet nicht.
  Erneut laden“). Toasts nur für Dinge ohne Ort (Standort verweigert, Link kopiert).
- **Leere**: „Keine Erdbeben ab M 5 in den letzten 7 Tagen. Schwelle senken“ statt leerer Liste.
- **Tastatur**: alles erreichbar, sichtbarer Fokusring (`2px var(--limb)`, 2 px Abstand). Kürzel: `⌘K`/`/` Suche,
  `[` Paneel, `G` Globus/Karte, `Leertaste` Abspielen, `←/→` Zeitschritt, `J` Jetzt, `1–5` Standardkarten,
  `Esc` schließt. `?` zeigt die Übersicht.
- **Zugänglichkeit**: Kontrast Text ≥ 4.5:1 auf Paneelen, Rollen und Namen an allen Bedienelementen, Regler mit
  `role="slider"` und Pfeiltasten, Statusänderungen über `aria-live="polite"`.

## Texte

Ebenen heißen nach dem, was man sieht („Erdbeben“, „Seekabel“), nicht nach der Quelle. Zusammenfassung ist ein
Satz ohne Punkt am Ende. Alter: „vor 3 min“, „heute 14:20“, „Stand 9. Nov.“. Zahlen mit `Intl.NumberFormat('de-DE')`,
Einheiten mit schmalem Leerzeichen. Keine Ausrufezeichen, keine Emojis.

Die Vorschau der Grundkartenauswahl ist eine Miniatur der Hauptkarte (gleiche Position, Zoom, Neigung und Projektion): `features/basemap/preview.ts` rendert beim Öffnen mit einer versteckten MapLibre-Karte jede Miniatur einmal, sobald sie sichtbar wird (auch die regionalen Karten). Aufbau des Menüs: eine scrollbare Liste fester Höhe mit den Modi Daten / Erkunden / Fahren / Satellit vorn (Daten: reine Karte ohne Gelände und Häuser, Erkunden: mit beidem, Fahren vorerst wie Daten, Satellit: alle Luftbilder), dahinter die Karten des Modus nach Anbieter gegliedert (kleine Überschriften; kurze Gruppen teilen sich eine Zeile); „Mehr anzeigen“ ändert nur die Höhe der Liste. Darunter, durch einen Divider getrennt, die regionalen Karten als zweite Liste derselben Art; ganz unten Globus/Karte und die Schalter. Die Bilder in `public/basemaps/*.webp` (`pnpm thumbs`) braucht nur noch das Mockup.
