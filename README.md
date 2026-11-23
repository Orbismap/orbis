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

Deployment (Cloudflare, `maps.maltee.dev`): `wrangler.jsonc` liefert `dist/` als statische Assets aus und bindet die
Domain als Custom Domain; der DNS-Eintrag entsteht beim ersten `pnpm build && pnpm dlx wrangler deploy` automatisch.
Der Workflow `.github/workflows/deploy.yml` läuft vorerst nur manuell (Secrets `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`).

Dasselbe Repo baut auch die **Wetter-App** (`src/wetter/`): ein Build, zwei Domains (`maps.maltee.dev` = Karte,
`wetter.maltee.dev` = Wetter). `src/entry.ts` wählt die App nach Hostname, lokal per `?mode=wetter` / `?mode=map`.
Die Wetterkarte wächst im selben Dokument zur Karten-App ([docs/WETTER-HANDOFF.md](docs/WETTER-HANDOFF.md)),
Hosting und PWA: [docs/WETTER-HOSTING.md](docs/WETTER-HOSTING.md).

Daten kommen aus den Buckets von [Orbismap/data](https://github.com/Orbismap/data); Adressen lassen sich per `.env`
überschreiben (`.env.example`).

Dokumentation:

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): verbindliche Architektur, Ordner, Verträge
- [docs/DESIGN.md](docs/DESIGN.md): Gestaltung
- [docs/LAYERS.md](docs/LAYERS.md): Ebene anlegen, Render-Bausteine
- [docs/DATA.md](docs/DATA.md): Buckets, Manifest, Resource, Parser, OWX
- [docs/WETTER-HOSTING.md](docs/WETTER-HOSTING.md), [docs/WETTER-HANDOFF.md](docs/WETTER-HANDOFF.md): Wetter-App, zwei Domains, Übergang
- [docs/WETTER-PLAN.md](docs/WETTER-PLAN.md): Plan und Stand der Zusammenführung
- [docs/research/README.md](docs/research/README.md): Recherche zu neuen Datenquellen (offene Lizenzen)
