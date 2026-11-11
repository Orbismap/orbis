// public/data/airports.json (OurAirports, public domain): compact rows -> airport records.
// Row: [ident, iata, name, lng, lat, elevationFt, size(1 large / 2 medium), country, city]
export type AirportRow = [string, string, string, number, number, number | null, 1 | 2, string, string];
export type AirportProps = { id: string; icao: string; iata: string; name: string; elevFt: number | null; large: boolean; country: string; city: string };

export function airportsParse(raw: unknown): GeoJSON.FeatureCollection<GeoJSON.Point, AirportProps> {
  const rows = (raw as { rows?: AirportRow[] } | null)?.rows;
  const features: GeoJSON.Feature<GeoJSON.Point, AirportProps>[] = [];
  if (Array.isArray(rows)) {
    for (const r of rows) {
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [r[3], r[4]] },
        properties: { id: r[0], icao: r[0], iata: r[1], name: r[2], elevFt: r[5], large: r[6] === 1, country: r[7], city: r[8] },
      });
    }
  }
  return { type: 'FeatureCollection', features };
}
