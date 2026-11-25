<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.svg">
  <img src="docs/logo-light.svg" alt="Orbis" width="320">
</picture>

<br><br>

**Was auf der Erde gerade passiert – Globus und Karte mit Ebenen zu Wetter, Gefahren, Verkehr, Infrastruktur
und Erde, dazu eine Zeitleiste von der Vergangenheit bis zur Vorhersage.**

<br>

[![Karte](https://img.shields.io/badge/▶_Karte-maps.maltee.dev-5b3fd6?style=for-the-badge)](https://maps.maltee.dev)
[![Wetter](https://img.shields.io/badge/☁️_Wetter-wetter.maltee.dev-0b7285?style=for-the-badge)](https://wetter.maltee.dev)

[![Deploy](https://img.shields.io/github/actions/workflow/status/Orbismap/orbis/deploy.yml?branch=main&label=Deploy&logo=githubactions&logoColor=white)](https://github.com/Orbismap/orbis/actions/workflows/deploy.yml)
![Letzter Commit](https://img.shields.io/github/last-commit/Orbismap/orbis?logo=git&logoColor=white)
![Repo-Größe](https://img.shields.io/github/repo-size/Orbismap/orbis)
![Anmeldung](https://img.shields.io/badge/Anmeldung-nicht_nötig-2f9e44)
![Datenquellen](https://img.shields.io/badge/Quellen-offene_Lizenzen-2f9e44)

![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-7-646cff?logo=vite&logoColor=white)
![Preact](https://img.shields.io/badge/Preact-10-673ab8?logo=preact&logoColor=white)
![MapLibre](https://img.shields.io/badge/MapLibre_GL-6-396cb2?logo=maplibre&logoColor=white)
![three.js](https://img.shields.io/badge/three.js-0.183-000?logo=threedotjs&logoColor=white)
![Cloudflare](https://img.shields.io/badge/Hosting-Cloudflare-f38020?logo=cloudflare&logoColor=white)

[Apps](#-die-apps) · [Ebenen](#-ebenen) · [Entwicklung](#-entwicklung) · [Deployment](#-deployment) · [Daten](#-daten) · [Dokumentation](#-dokumentation)

</div>

---

## ✨ Die Apps

Ein Repository, ein Build, zwei Apps. `src/entry.ts` wählt die App nach Hostname, lokal per `?mode=map` bzw. `?mode=wetter`.
Das linke Menü ist in beiden dasselbe (`src/ui/hud/`); ein Klick auf das Logo wechselt zwischen den Orbis-Apps.

| | |
|---|---|
| 🗺️ **Karten** · [maps.maltee.dev](https://maps.maltee.dev) | Globus und 2D-Karte mit Ebenen, Karten-Sammlungen, Ortssuche, Routen und Zeitleiste von der Vergangenheit bis zur Vorhersage |
| ☁️ **Wetter** · [wetter.maltee.dev](https://wetter.maltee.dev) | Wetter-Dashboard als PWA mit Vorhersage, Widgets und Ortssuche; die Wetterkarte wächst im selben Dokument zur Karten-App ([Übergang](docs/WETTER-HANDOFF.md)) |

## 🧩 Ebenen

Die Karte ist in neun Kategorien gegliedert; jede Ebene ist eine eigene, in sich geschlossene Datei unter `src/layers/`.

| | |
|---|---|
| ☁️ **Wetter** | Radar, Satellit, Temperatur, Niederschlag, Wind und Strömung, Luftdruck, Böen, Bewölkung, Luftqualität, Schnee |
| ⚠️ **Gefahren** | Unwetterwarnungen, Erdbeben, Vulkane, Brände, Stürme, Tsunamis, Blitze, Polarlicht, Radioaktivität |
| ✈️ **Verkehr** | Straßennetz und Verkehrslage, Blitzer, Flugzeuge, Schiffe, Züge, Nahverkehr, Raketenstarts, Satelliten |
| ⚡ **Infrastruktur** | Kraftwerke, Stromnetz, Telekomnetz, Rechenzentren, Rohstoffe, Pipelines, 3D-Gebäude |
| 💧 **Wasser** | Stauseen, Wasserwerke, Wasserleitungen |
| 🌍 **Erde** | Gelände, Satellitenbild, Landbedeckung, Vegetation, Schneedecke, Nachtlichter, Plattengrenzen, Tierzüge im Jahreslauf, Basiskarte „Jahreszeiten“ mit Monatsregler |
| 🌊 **Meer** | Strömung, Temperatur, Seegang, Gezeiten, Meereis, Schiffsrouten, Bojen |
| 📷 **Medien** | Webcams, Radiosender, Überwachung |
| 👥 **Gesellschaft** | Wahlen, Lage- und Hilfedaten, Geldflüsse |

Neue Ebene anlegen: [docs/LAYERS.md](docs/LAYERS.md).

## 🛠️ Entwicklung

Voraussetzung: Node 22 und [pnpm](https://pnpm.io).

```sh
pnpm install
pnpm dev          # Entwicklungsserver (Karte; Wetter: ?mode=wetter)
pnpm build        # Typprüfung + Produktionsbau nach dist/
pnpm test         # Vitest
pnpm typecheck
```

## 🚀 Deployment

Cloudflare: `wrangler.jsonc` liefert `dist/` als statische Assets aus und bindet die Domain als Custom Domain; der
DNS-Eintrag entsteht beim ersten `pnpm build && pnpm dlx wrangler deploy` automatisch. Der Workflow
`.github/workflows/deploy.yml` deployt bei jedem Push auf `main` (Secrets `CLOUDFLARE_API_TOKEN`,
`CLOUDFLARE_ACCOUNT_ID`). Hosting und PWA der Wetter-App: [docs/WETTER-HOSTING.md](docs/WETTER-HOSTING.md).

## 📦 Daten

Die Daten kommen aus den Buckets von [Orbismap/data](https://github.com/Orbismap/data); Adressen lassen sich per `.env`
überschreiben (`.env.example`). Aufbau von Manifest, Resource und Parsern: [docs/DATA.md](docs/DATA.md).
Recherche zu weiteren offenen Quellen: [docs/research/](docs/research/README.md).

## 📚 Dokumentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): verbindliche Architektur, Ordner, Verträge
- [docs/DESIGN.md](docs/DESIGN.md): Gestaltung
- [docs/LAYERS.md](docs/LAYERS.md): Ebene anlegen, Render-Bausteine
- [docs/DATA.md](docs/DATA.md): Buckets, Manifest, Resource, Parser, OWX
- [docs/WETTER-HOSTING.md](docs/WETTER-HOSTING.md), [docs/WETTER-HANDOFF.md](docs/WETTER-HANDOFF.md): Wetter-App, zwei Domains, Übergang
- [docs/WETTER-PLAN.md](docs/WETTER-PLAN.md): Plan und Stand der Zusammenführung
- [docs/research/README.md](docs/research/README.md): Recherche zu neuen Datenquellen (offene Lizenzen)
