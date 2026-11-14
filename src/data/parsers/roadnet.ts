// Road network for the street-scale markings, built in the worker (see render/roadnet.ts).
import { buildRoadNet, type RawRoad } from '../../render/roadnet';

export function roadNet(input: { roads: RawRoad[]; lon0: number; lat0: number }) {
  return buildRoadNet(input.roads, input.lon0, input.lat0);
}
