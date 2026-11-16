#!/usr/bin/env bash
# Baut die eigene Vektor-Grundkarte aus einem OSM-PBF. Aufruf: tools/vector-basemap/build.sh [pbf] [out.pmtiles]
# Braucht Java 21 und planetiler.jar (https://github.com/onthegomap/planetiler/releases, abgelegt in ~/osm/tools/).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
pbf="${1:-$HOME/osm/geofabrik/hessen-261115.osm.pbf}"
out="${2:-$HOME/osm/tools/hessen-basemap.pmtiles}"
tmp="$HOME/osm/tools/tmp"
mkdir -p "$tmp" "$here/out"
java -jar "$HOME/osm/tools/planetiler.jar" generate-custom \
  --schema="$here/schema.yml" --osm_path="$pbf" --output="$out" \
  --force --nodemap-type=sparsearray --tmpdir="$tmp"
ln -sf "$out" "$here/out/basemap.pmtiles"
