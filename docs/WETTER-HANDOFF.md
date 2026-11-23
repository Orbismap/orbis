# Übergang Wetterkarte → Orbis Maps (ein Dokument)

Kein Seitenwechsel mehr. Der Ablauf (`src/wetter/features/handoff/expand.ts`):

1. **Karte in eine feste Ebene:** Das Element der geteilten MapLibre-Karte (`sharedMap.ts`) zieht in eine `position: fixed`-Ebene
   auf `<body>`, genau auf das Rechteck der Karten-Kachel. (In der Kachel würden Containment, Clipping und Stacking-Kontext
   die Vergrößerung behindern.)
2. **Wachsen:** Die Ebene animiert auf Vollbild, `map.resize()` pro Frame, die Karte bleibt scharf. Währenddessen lädt der
   Karten-Chunk (`src/boot.tsx`) nach. Bei `prefers-reduced-motion` entfällt die Animation.
3. **Übernahme:** Die Wetter-Oberfläche wird entfernt, `bootOrbis(root, { adopt })` startet die Karten-App im selben Root.
   `MapView` holt das laufende Karten-Element per `useLayoutEffect` in seinen Host (im selben Commit, die Karte verlässt den
   Bildschirm nie), `createMapEngine({ adopt })` setzt Orbis-Stil und Gesten auf die vorhandene Karte. Die Menüs blenden
   ein (`.app--enter`). URL: `history.pushState` auf `#/@lat,lng,zoomz?k=wetter&l=…`.
4. **Zurück:** Der Chip „Zurück zur Wetter-App“ und der Browser-Zurück-Knopf laden die Wetter-App neu (`/`). Eine
   Rückanimation gibt es noch nicht; das Karten-Modul ist einmalig pro Seite initialisiert (`bootOrbis` ist einseitig).

## Trennung der zwei Apps im selben Dokument

- `<html data-app="wetter" | "map">` (gesetzt in `src/entry.ts`, beim Übergang auf `map`). Die Tokens und die globalen Regeln
  der Wetter-App (`:root`, `body`) sind auf `data-app='wetter'` begrenzt; die Karten-App hat ihre eigenen.
- Die Wetter-Hülle heißt `.wx-app` (vorher `.app`, kollidierte mit der Karten-App).
- Die Karten-App und ihr CSS werden erst beim Vergrößern geladen.

## Bekannte Lücken

- Nicht im Browser geprüft: Stilwechsel auf der übernommenen Karte (kurzes Neuzeichnen möglich), Aussehen der Menüs
  beim Einblenden, Tastatur/Fokus nach dem Übergang.
- `src/export/wx-render.ts` setzt global `settings.motion = 'full'` (siehe TODO dort).
