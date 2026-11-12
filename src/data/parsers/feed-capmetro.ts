// CapMetro (Austin). The download URL on data.texas.gov redirects without CORS to a file whose id changes with every
// update; the dataset metadata (with CORS) names the current file. MetroRail is route 550.
import type { VehicleFeed } from './vehicles';
import { getBuffer, getJson, rtFixes } from './feedutil';

const SRC = 'CapMetro (Austin)';
export const capmetroFeed: VehicleFeed = {
  id: 'capmetro', label: SRC, bbox: [-98.1, 30.0, -97.4, 30.7], every: 30_000,
  async load({ signal }) {
    const view = await getJson<{ blobId: string }>('https://data.texas.gov/api/views/eiei-9rpf.json', signal);
    const buf = await getBuffer(`https://data.texas.gov/api/views/eiei-9rpf/files/${encodeURIComponent(view.blobId)}?filename=vehiclepositions.pb`, signal);
    return rtFixes(buf, SRC, (v) => ({ kind: v.routeId === '550' ? 'regio' : 'bus', line: v.routeId ?? '', op: 'CapMetro' }));
  },
};
