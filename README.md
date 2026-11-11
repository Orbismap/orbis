# Orbis Map

Kartenbetrachter von Orbis, von Grund auf neu gebaut: Globus und Karte mit Ebenen zu Wetter, Gefahren, Verkehr,
Infrastruktur und Erde, Zeitleiste von der Vergangenheit bis zur Vorhersage. Technik: Vite, TypeScript, Preact mit
Signalen, MapLibre GL JS 6.

```sh
pnpm install
pnpm dev          # Entwicklungsserver
pnpm build        # Typprüfung + Produktionsbau nach dist/
pnpm test         # Vitest
pnpm typecheck
```

Daten kommen aus den Buckets von [Orbismap/data](https://github.com/Orbismap/data); Adressen lassen sich per `.env`
überschreiben (`.env.example`).

Dokumentation:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): verbindliche Architektur, Ordner, Verträge
- [docs/DESIGN.md](docs/DESIGN.md): Gestaltung
- [docs/LAYERS.md](docs/LAYERS.md): Ebene anlegen, Render-Bausteine
- [docs/DATA.md](docs/DATA.md): Buckets, Manifest, Resource, Parser, OWX
