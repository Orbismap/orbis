# Orbis Map: Design

Verbindliche Gestaltungsgrundlage. Sprache der Oberfläche: Deutsch, Sie-/Du-frei formuliert (Infinitiv oder
Substantiv: „Ebene hinzufügen“, „Standort“).

## Vorrang: Apple-Standards und Liquid Glass

Vorgabe des Auftraggebers (11. Nov. 2026), geht allem Folgenden vor, wo es sich widerspricht:

- **Apple Human Interface Guidelines** sind der Maßstab für Aufbau, Bedienmuster, Abstände, Trefferflächen,
  Bewegung und Zugänglichkeit, auf dem Desktop (macOS) wie mobil (iOS).
- **Liquid Glass** (Design von macOS/iOS 26 „Tahoe“) für alle schwebenden Bedienelemente über der Karte:
  durchscheinendes, lichtbrechendes Glas mit starker Unschärfe und Sättigung des Hintergrunds, heller Kante oben
  (Spiegelglanz als 1-px-Innenlinie), weichem Schatten, großen durchgehenden Radien (Kapseln und konzentrische
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
│ ┌─ Legende ─┐ ┌─ Zeitleiste ───────────────────────────────────────────┐│
│ │ °C ▇▇▇▇▇  │ │ ▶  Di 10. ░░▒▒▓▓│▓▓▒▒░░ Mi 11. ░░▒▒▓▓▒▒░░ Do 12.   Jetzt ││
│ └───────────┘ └────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

- Linkes Paneel ist einklappbar (`[`), der Inspektor erscheint nur bei Auswahl. Karte bleibt immer bedienbar.
- „Ebene hinzufügen“ öffnet den **Katalog** im selben Paneel (kein Modal): Suche oben, Kategorien als Abschnitte,
  je Ebene Icon in Leitfarbe, Titel, ein Satz, Abdeckung („DE“), Takt („live“, „täglich“). Ein Klick schaltet,
  das Paneel bleibt offen.
- **Ebenenzeile** und Themenliste: siehe „Linkes Menü: Themenliste“ unten.
- **Punktabfrage**: Klick ins Leere setzt ein Fadenkreuz und zeigt im Inspektor Koordinate, Höhe über der Zeit
  des Tages (Sonnenstand) und je aktiver Feld-Ebene den Wert an dieser Stelle zur gewählten Zeit.
- **Mauszeiger-Wert**: bei aktiver Feld-Ebene wandert der Wert an der Legende mit (kleines Dreieck auf der Skala
  plus Zahl), nicht als Tooltip am Zeiger.

## Linkes Menü: Themenliste

Kuratierte Liste nach dem Vorbild der Apple-Seitenleiste (Vorlage: Menüs des alten Orbis).

- **Themen** sind Daten im Karten-Modell (`Karte.themes` in `src/karten/standard.ts`: Id, Titel, Icon, Ebenen-IDs).
  Jede Standardkarte hat ihre Themen; jede Ebene der Registry steht in mindestens einem (Test `themes.test.ts`).
  Eigene Karten haben keine Themen. Themen kommen immer aus dem Code, nie aus gespeicherten Entwürfen.
- **Themenzeile**: Icon, Name, Zähler („3 von 4“ aktiv, sonst Anzahl), Pfeil. Ein Tipp klappt auf; mehrere dürfen
  offen sein, der Zustand wird je Karte gemerkt (erstes Thema anfangs offen). Darunter Ebenenzeilen mit Schalter
  (`role="switch"`), Datenalter klein rechts (Bernstein, wenn veraltet), Hinweise („Schlüssel nötig“, „Näher
  heranzoomen“) unter dem Namen. Exklusive Feld-Ebenen: Einschalten schaltet die anderen aus.
- **„Eigene Ebenen“**: Ebenen der Karte ohne Thema (aus dem Katalog), per Griff sortierbar (Alt+↑/↓), darunter die
  Zeile „Ebene hinzufügen“ (öffnet den Katalog).
- **Einstellungen, Mischregel** (`settingsMode` in `layers-panel/mode.ts`): höchstens zwei eigene Optionen und kein
  Schlüssel: Pfeil nach unten klappt Deckkraft und Optionen in der Zeile auf. Drei oder mehr Optionen oder ein
  Schlüssel: Pfeil nach rechts schiebt eine **Detailseite** ins Paneel (Push wie iOS, Zurück-Pfeil oben mit dem
  Namen des Themas) mit Titel, Schalter, Daten (Abdeckung, Takt, Quelle mit Alter), Optionen in Abschnitten,
  Deckkraft, Legende. Künftige Ebenen mit mehr Optionen wandern damit von selbst auf die Seite.
- Mobil dieselbe Liste im Bottom-Sheet, die Detailseite schiebt sich innerhalb des Sheets herein.
- **Bedienung**: Pfeil hoch/runter wechselt zwischen Zeilen, Pfeil rechts/links öffnet/schließt ein Thema,
  `aria-expanded` an Themen und aufklappbaren Zeilen, Trefferflächen mobil ≥ 44 px, Animationen 200 ms und bei
  `prefers-reduced-motion` aus.

## Aufbau Mobil (< 900 px)

```
┌───────────────────────┐
│ [◎ Suche……………] [⚙]    │  Kopf: Suche als Pille, Einstellungen
│                    [3D]│
│        Karte       [⌖] │  rechte Daumenleiste: Projektion, Standort
│                        │
│ ┌────────────────────┐ │
│ │ ▬                  │ │  Sheet, drei Stufen:
│ │ Wetter ▾  °C ▇▇▇▇  │ │   1 Blick  (112 px): Karte wählen, Legende, Zeitleiste
│ │ ▶ ──────│───────── │ │   2 Halb   (50 %):   Ebenen der Karte
│ └────────────────────┘ │   3 Voll   (100 % − Kopf): Katalog, Inspektor, Einstellungen
└───────────────────────┘
```

- Sheet folgt dem Finger, rastet mit Federung ein, respektiert `env(safe-area-inset-*)`. Ziehen am Inhalt scrollt
  erst, wenn die Stufe „Voll“ erreicht ist. Zurück-Geste/Escape schließt eine Stufe.
- Auswahl auf der Karte öffnet den Inspektor in Stufe „Halb“; die Karte verschiebt sich so, dass das Objekt im
  sichtbaren Rest bleibt (`padding` der Kamera).
- Zeitleiste ist in Stufe 1 immer erreichbar, Scrubben mit dem Daumen, haptisches Ticken an Tagesgrenzen
  (`navigator.vibrate`, wenn vorhanden).

## Verhalten

- **Bewegung** antwortet nur auf Handlungen: Paneele 180 ms `cubic-bezier(.2,.8,.2,1)`, Sheet mit Feder,
  Auswahlring pulsiert einmal. `prefers-reduced-motion`: keine Partikel, keine Übergänge außer Deckkraft.
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
