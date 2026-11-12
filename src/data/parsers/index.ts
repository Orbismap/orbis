// Parser registry. To add a parser: create a pure function file in this folder and add ONE line below.
// Parsers run in the worker pool (data/worker); they take the raw payload (decoded JSON, text or ArrayBuffer,
// according to the ResourceSpec format) and may be async. Typed arrays in the result are transferred, not copied.
import { cableLines } from './cables';
import { emscQuakes } from './emsc';
import { marineWaves } from './marine';
import { marineSamples } from './oceangrid';
import { floodStations } from './flood';
import { shippingLanes } from './shippinglanes';
import { ndbcBuoys } from './ndbc';
import { pegelStations } from './pegel';
import { plateBoundaries } from './plates';
import { coopsStations } from './tides';
import { mergeQuakes } from './quakes';
import { usgsQuakes } from './usgs';
import { gvpVolcanoes } from './gvp';
import { firmsFires } from './firms';
import { gdacsEvents } from './gdacs';
import { eonetEvents } from './eonet';
import { tsunamiBulletins } from './tsunami';
import { nwsAlerts } from './nws';
import { dwdWarnings } from './dwd';
import { ninaList } from './nina';
import { auroraGrid } from './aurora';
import { bfsDose, stukDose, hcDose, safecastDose } from './radiation';
import { aircraftReadsb } from './readsb';
import { openskyStates } from './opensky';
import { aisLocations, aisVessels } from './ais';
import { tleParse } from './tle';
import { launchesParse } from './launches';
import { launchTracker } from './launchtrack';
import { sondes } from './sondes';
import { trainLocations } from './trains';
import { airportsParse } from './airports';
import { portsParse } from './ports';
import { powerPlants } from './powerplants';
import { wikiResources } from './resources';
import { dataCenters } from './datacenters';
import { heatCells } from './heat';
import { webcamFeed, webcamPoints } from './webcams';
import { radioStations } from './radio';
import { demoEvents } from './demos';
import { incidentTrack } from './incidents';
import { swWind, swMag, swXray } from './spaceweather';
import { overpassPipelines } from './pipelines';
import { peeringdbFacilities } from './peeringdb';
import { mrdsSites } from './mrds';
import { cccEvents } from './ccc';
import { ukraineHarmPoints } from './ukraine';
import { gazaDisplacement, healthSites, ipcAreas } from './gaza';
import { archiveDots, archiveExternal, archivePins } from './archive';
import { ibiCameras, ohgoCameras, qldCameras, trafikverketCameras, npsCameras, windyCameras, camdirMap } from './webcamkeys';
import { transitousTrips } from './transitous';
import { autobahnItems } from './autobahn';
import { overpassRoutes } from './oepnv';
import { overpassRoadmarks } from './roadmark';
import { gbfsStations } from './gbfs';
import { blitzerdeMarkers } from './blitzerde';
import { radarFlow, radarTile } from './radar';
import { decodeOwx } from '../owx/decode';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Parser = (raw: any, args?: any) => unknown;

export const parsers = {
  usgsQuakes,
  emscQuakes,
  mergeQuakes,
  cableLines,
  ndbcBuoys,
  pegelStations,
  plateBoundaries,
  coopsStations,
  marineWaves,
  marineSamples,
  floodStations,
  shippingLanes,
  owxDecode: decodeOwx,
  gvpVolcanoes,
  firmsFires,
  gdacsEvents,
  eonetEvents,
  tsunamiBulletins,
  nwsAlerts,
  dwdWarnings,
  ninaList,
  auroraGrid,
  bfsDose,
  stukDose,
  hcDose,
  safecastDose,
  aircraftReadsb,
  openskyStates,
  aisLocations,
  aisVessels,
  tleParse,
  launchesParse,
  launchTracker,
  sondes,
  trainLocations,
  airportsParse,
  portsParse,
  powerPlants,
  wikiResources,
  dataCenters,
  heatCells,
  webcamFeed,
  webcamPoints,
  radioStations,
  demoEvents,
  incidentTrack,
  swWind,
  swMag,
  swXray,
  overpassPipelines,
  blitzerdeMarkers,
  gbfsStations,
  overpassRoadmarks,
  overpassRoutes,
  autobahnItems,
  transitousTrips,
  peeringdbFacilities,
  mrdsSites,
  cccEvents,
  ukraineHarmPoints,
  gazaDisplacement,
  healthSites,
  ipcAreas,
  archivePins,
  archiveExternal,
  archiveDots,
  ibiCameras,
  ohgoCameras,
  qldCameras,
  trafikverketCameras,
  npsCameras,
  windyCameras,
  camdirMap,
  radarTile,
  radarFlow,
} satisfies Record<string, Parser>;

export type ParserName = keyof typeof parsers;
export type ParserResult<N extends ParserName> = Awaited<ReturnType<(typeof parsers)[N]>>;
