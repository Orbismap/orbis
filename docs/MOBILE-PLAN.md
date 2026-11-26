# Plan: Orbis Map am Handy nach Apple-Standards

Stand 26. Nov. 2026. Maßstab sind die Human Interface Guidelines (HIG), wie in `docs/DESIGN.md` festgelegt.
Orbis ist eine Web-App: Es gelten die HIG-Grundsätze und iOS-Muster; native Bausteine gibt es nicht, sie werden
nachgebildet. Alle Befunde stammen aus dem Code. Am Gerät ist noch nichts geprüft.

## Zielbild

Eine Karte, **ein** Sheet, alles Wichtige unten in Daumenreichweite (wie Apple Karten).

```
 Blick                        Halb                         Voll
┌──────────────────┐        ┌──────────────────┐        ┌──────────────────┐
│             [⛰]  │        │             [⛰]  │        │                  │
│             [3D] │        │             [3D] │        │ ▬                │
│      Karte       │        │      Karte  [➤]  │        │ ‹ Zurück  Titel ✕│
│                  │        │ ┌──────────────┐ │        │                  │
│ Legende     [➤]  │        │ │ ▬            │ │        │  Katalog,        │
│ ┌──────────────┐ │        │ │ 🔍 Suchen  ⚙ │ │        │  Ebenenseite,    │
│ │ ▬            │ │        │ │ Wetter ▾  ＋ │ │        │  Ort, Route,     │
│ │ 🔍 Suchen  ⚙ │ │        │ │ Ebenen  ✓    │ │        │  Einstellungen   │
│ │ Wetter ▾  ＋ │ │        │ │ …            │ │        │                  │
└─┴──────────────┴─┘        └─┴──────────────┴─┘        └──────────────────┘
   Glas                        Glas                        deckend
```

## Befunde

Stufen: **K** kritisch (kaputt oder Zugänglichkeit), **H** hoch, **M** mittel.

| # | Stufe | Befund | Beleg im Code | HIG |
|---|---|---|---|---|
| 1 | K | Der Hauptknopf „Route“ am Handy tut nichts Sichtbares: Die Karte verschwindet, der Planer wird nur am Desktop gezeichnet. Ebenso „Neue Route“ in der Suche. | `features/routes/RouteButton.tsx`, `state/routes.ts` (`orteView`), `app/Mobile.tsx` liest `orteView` nicht | feedback.md › Best practices |
| 2 | K | Ob eine Ebene an ist, zeigt nur die Hintergrundfarbe der Zeile. | `layers-panel.css` `.lrow.is-on` | accessibility.md › Vision; lists-and-tables.md › Best practices |
| 3 | K | „Löschen“ im dunklen Design: Weiß auf `#ff6b5e` = 2,79:1, nötig sind 4,5:1. | `ui/button.css` `.btn-destructive` | accessibility.md › Vision |
| 4 | K | Die Auswahlblätter holen den Fokus nicht, sperren den Hintergrund nicht und lassen sich nicht wegwischen. | `ui/Popover.tsx` | sheets.md › Mobile; modality.md; accessibility.md › Mobility |
| 5 | H | Funktionen fehlen am Handy: Routen, Gespeicherte Orte, Ortskarte aus Suche und Karte, Karten verwalten, Ebenen sortieren und entfernen. | `search/results.ts:46`, `map/engine.ts:143`, `editMode` nur in `app/Hud.tsx` | layout.md › Adaptability (gleiche Funktionen in jeder Größe) |
| 6 | H | Jedes Antippen der Karte öffnet eine Standortabfrage; langes Drücken ist ohne Funktion. | `map/engine.ts:143–155` | gestures.md › Best practices |
| 7 | H | Das Sheet kann den gewählten Punkt verdecken: Die Karte bekommt keinen unteren Rand. | `setPadding` (`state/view.ts`) wird nirgends aufgerufen | maps.md › Place cards |
| 8 | H | Suche oben, als eigenes Vollbild-Overlay mit Desktop-Befehlen. | `app/Mobile.tsx` `Header`, `features/search` | search-fields.md › Phone (unten, wenn Platz ist) |
| 9 | H | Zurück auf einer Unterseite verkleinert das Sheet, statt eine Ebene zurückzugehen. | `app/history.ts` | designing-for-ios.md; gestures.md › Custom gestures |
| 10 | H | Schriftgrößen folgen der Systemeinstellung nicht; viele feste px-Werte (Legende 11, Maßstab 9–10). | Stylesheets | typography.md › Supporting Dynamic Type; accessibility.md (mind. 11 pt) |
| 11 | H | Querformat: keine seitlichen Safe Areas; große iPhones (≥ 900 px breit) bekommen die Desktop-Oberfläche. | kein `safe-area-inset-left/right`; `state/ui.ts:9` | layout.md › Size classes |
| 12 | M | Einstellungen am Handy zeigen Thema, Bewegung, Tastenkürzel und Debug. | `features/settings/Settings.tsx` | settings.md › Best practices; dark-mode.md |
| 13 | M | „Leeren“ entfernt alle Ebenen ohne Rückgängig. | `karten-bar/actions.tsx:284` | undo-and-redo.md |

### Was ich im letzten Umbau korrigieren muss

Der Stand auf `claude/mobile-karte` behebt echte Fehler, weicht aber an vier Stellen von den HIG ab:

| Eigene Änderung | Problem | Korrektur |
|---|---|---|
| Alle Dropdowns als Blatt von unten | Aufklappende Auswahl ist ein **Menü**, Aktionsblätter sind für Rückfragen zu einer Aktion und sollen nicht scrollen (action-sheets.md). Zudem liegt ein zweites Blatt über dem Sheet (sheets.md: nur eines). | Kartenwahl und „⋯“ als Menü am Knopf; Grundkarte, Filter, Quellen als Inhalt **im** Sheet; Löschen als Aktionsblatt mit „Abbrechen“ |
| Sheet immer deckend | Sheets gehören zur Glas-Bedienebene (DESIGN.md, liquid-glass.md) | Blick und Halb aus Glas, Voll deckend (Einschätzung nach iOS 26) |
| Alle Kartenknöpfe oben rechts | Häufige Knöpfe sollen erreichbar sein (designing-for-ios.md) | Standort unten rechts über dem Sheet, Grundkarte und 3D oben |
| Zoom-Knöpfe entfernt | Nur Gesten reicht nicht (accessibility.md › Mobility) | Zoom für VoiceOver und Schaltersteuerung als unsichtbare Knöpfe erhalten |

## Etappen

Jede Etappe ist ein eigener PR und für sich nutzbar. Aufwand: S bis halber Tag, M etwa ein Tag, L mehrere Tage
(grobe Schätzung).

### 0. Stand sichern (S) · erledigt, Test am iPhone offen

- Im Handyformat (375 × 812) mit Bildschirmfotos und nachgestellten Wischgesten geprüft. Dabei behoben:
  abgeschnittene Uhrzeit, doppelte Kopfzeile auf Ebenenseiten, schiefer „Zurück“-Knopf, abgeschnittene
  Optionstexte in den Zeilen, Maßstab hinter dem offenen Sheet, Links bei offenem Sheet.
- Echtes Wischgefühl, Tastatur und Safe Areas zeigt nur ein iPhone.
- Gesehen und noch offen: Die Legende liegt breit über der Karte (Etappe 4); die Blick-Zeile mit Zeitleiste
  nimmt auf Unterseiten viel Platz (Etappe 2).

### 1. Nichts Kaputtes, für alle bedienbar (M) · Befunde 1–4 · erledigt, Test am iPhone offen

- „Route“: Der Planer (`RoutePanel`) ist eine Seite im Sheet; Tippen auf die Karte setzt Routenpunkte, Links mit
  Route öffnen ihn.
- Ebenenzeilen zeigen am Handy einen Schalter statt nur der Hintergrundfarbe.
- Gefüllte „Löschen“-Knöpfe: `--alert-fill`, Weiß darauf 5,2:1; `test/contrast.mjs` prüft die Knöpfe mit.
- Blätter nehmen den Fokus und geben ihn zurück, sind `aria-modal`, sperren den Hintergrund und lassen sich nach
  unten wegwischen.
- Zoom-Knöpfe unsichtbar, für VoiceOver und Schaltersteuerung vorhanden; Cesium-Schlüsselknopf 44 px.
- Offen für Etappe 2: Die Route liegt zur Hälfte hinter dem Sheet (Befund 7). VoiceOver am Gerät ist nicht geprüft.

### 2. Gerüst wie Apple Karten (L) · Befunde 6–9 · erledigt, Test am iPhone offen

- Suchfeld in die Blick-Zeile des Sheets; Tippen öffnet Voll mit Verlauf, Vorschlägen und „Abbrechen“. Ohne
  Tastaturbefehle. Der Kopfbereich oben entfällt, Einstellungen wandern neben die Suche.
- Ein Seitenstapel im Sheet (Liste → Ebene, Ort, Route, Katalog, Einstellungen) mit „Zurück“ links, „Schließen“
  rechts; Browser-Zurück geht genau eine Seite zurück.
- Menüs und Aktionsblätter wie in der Korrekturtabelle.
- Tippen: Objekt wählen, auf leere Fläche abwählen. Langes Drücken: Stecknadel mit Ortskarte.
- Karte bekommt unten den Sheet-Rand, damit die Auswahl sichtbar bleibt.
- Glas in Blick und Halb; Knöpfe neu verteilen.
- `docs/DESIGN.md`, Abschnitt „Aufbau Mobil“, anpassen.
- Aus Etappe 3 vorgezogen: Die Ortskarte erscheint am Handy für Suche, Ortsnamen auf der Karte, gespeicherte Orte und
  Links.
- Offen: Zeigt nur ein iPhone — Tastatur beim Antippen des Suchfelds, langes Drücken, Zurück-Wischen, Glas beim
  Ziehen (Leistung). Die Leiste mit Zeitleiste ist in „Halb“ hoch; „Halb“ reicht deshalb etwas weiter (Etappe 4).

### 3. Gleicher Funktionsumfang (L) · Befund 5

- Ortskarte (`PlaceCard`) für Suche, Kartenorte und Stecknadel.
- Gespeicherte Orte und Routen als Abschnitt im Sheet.
- Karten verwalten: eigene Liste mit Wischaktionen (Umbenennen, Löschen) und „Bearbeiten“ zum Sortieren und
  Entfernen von Ebenen.
- Aktive Ebenen als erster Abschnitt, auch aus fremden Karten.

### 4. Feinschliff (M) · Befunde 10–13

- Schriftskala in `rem`, an die iOS-Textgröße gekoppelt (`font: -apple-system-body` an der Wurzel); Zeilen
  wachsen mit. Prüfen bei 200 %.
- Querformat: seitliche Safe Areas, Sheet als Seitenspalte bei geringer Höhe, Umschaltpunkt nach Zeigerart
  und Höhe statt nur Breite.
- Einstellungen am Handy: Einheiten, Schlüssel, Über; Tastenkürzel und Debug ausblenden.
- „Leeren“ mit „Rückgängig“.
- Legende und Zeitleiste kompakter, Texte mindestens 11 px.
- Zum Startbildschirm: Statusleiste und Startansicht prüfen.

## Bewusst anders

- Haptik: iOS Safari bietet Web-Apps kein `navigator.vibrate`; das Ticken der Zeitleiste gibt es dort nicht.
- Kein Tab-Bar: Orbis hat eine Ansicht; Navigation läuft über das Sheet.
- Systemschrift und eigene Symbole statt SF Symbols (Lizenz).

## Entschieden (26. Nov. 2026)

1. Die Suche wandert nach unten ins Sheet.
2. Bei einer Auswahl verschiebt sich die Karte so weit, dass der Punkt sichtbar bleibt.
3. Thema und Bewegung entfallen in den Einstellungen am Handy.
4. Zur Prüfung sind Bildschirmfotos im Handyformat erlaubt.

## Prüfung je Etappe

`pnpm typecheck`, `pnpm test`, `pnpm build`; danach am iPhone: Hoch- und Querformat, helles und dunkles Design,
größte Textgröße, VoiceOver, „Bewegung reduzieren“.
