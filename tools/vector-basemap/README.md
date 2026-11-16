# Orbis Karte: Werkzeuge

Die Datenpipeline der Grundkarte "Orbis Karte" (Labels, Landbedeckung grob und fein, Deponien als PMTiles) liegt im Repo
**Orbismap/data** (`collectors/karte/`, Workflow `karte.yml`, Ziel `orbis-osm/karte/`). Die App liest die Dateien über `VITE_OSM_BASE`
(`src/map/basemaps/karte-data.ts`); im Dev kommen sie aus `public/data/karte/` (gitignoriert, dort aus dem Daten-Repo bauen oder kopieren).

Hier bleiben nur die Designwerkzeuge:
- `palette.md`: gemessene Apple-Maps-Farben und Zoomstufen
- `build.sh`, `schema.yml`, `preview.html`: Planetiler-Experiment für eine komplette eigene Hessen-Karte (nicht Teil der App)
