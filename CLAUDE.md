# Orbis: Grundregeln

## Mini-Hub oder Seitenleiste in jeder App

Jede eigene Orbis-App zeigt am Desktop **und** am Handy das Mini-Hub: die Kapsel oben links mit Orbis-Logo, App-Name
und App-Wechsler. Braucht die App ein Menü, zeigt sie stattdessen die gemeinsame Seitenleiste, die eingeklappt zum
Mini-Hub wird.

- Nur die Bausteine aus `src/ui/hud/` verwenden, nichts nachbauen: `OrbisSwitcher` (Mini-Hub ohne Seitenmenü),
  `OrbisHud` (Seitenleiste mit Mini-Hub), `HudMenu` und `HudRow` (Menüinhalt).
- Eine neue App steht in `src/ui/hud/projects.tsx` (Liste im App-Wechsler) und in `src/entry.ts`.
- Verdeckt werden darf das Mini-Hub nur von einem ganz hochgezogenen Sheet oder einer Vollbildseite.

| App | Desktop | Handy |
|---|---|---|
| Karten | Seitenleiste | Mini-Hub |
| Wetter | Seitenleiste | Seitenleiste |
| Bus & Bahn | Seitenleiste | Mini-Hub |
| Find | Seitenleiste | Seitenleiste |
