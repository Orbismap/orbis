// What the app can look for. A kind names the tiles it comes from and turns one object into a place (or leaves it out).
// Bicycle parking has its own tile set with details; the others come from the places of the base map (OpenFreeMap, OpenMapTiles
// layer `poi`), which name what a place is but not how it is (no opening hours, fees or access).
import { formatInt } from '@/core/format';
import { isCoveredParking, isPublicParking, parkingType, type BikeParkingProps } from '@/data/bikeparking';
import type { RouteMode } from '@/features/routes/osrm';
import { PARKING_ART, PARKING_TILE } from './parkingArt';

export interface Place { key: string; lng: number; lat: number; title: string; detail: string }

/** One thing that can be said about a new object: `key` is its OSM key. */
export interface Field {
  key: string;
  label: string;
  /** to choose from; without them a number is typed */
  options?: [value: string, label: string][];
  /** a picture per option (inner SVG markup on the grid of art.ts) on tiles of one colour: the options are then picked by picture */
  pictures?: { colour: string; art: Record<string, string> };
}

/** How a new object of a kind is entered into OpenStreetMap. */
export interface Addition {
  /** "Neuer Fahrradständer" */
  title: string;
  /** what the change is called in OpenStreetMap */
  comment: string;
  /** the tags that make an object this kind */
  tags: Record<string, string>;
  fields: Field[];
  /** the new object as the tile set would carry it, so that it can be shown before the next extract */
  properties(tags: Record<string, string>, id: number): Record<string, unknown>;
}

export interface Kind {
  /** stored choice of the person */
  id: string;
  /** as the catalogue and the menu name it */
  name: string;
  /** "den nächsten Fahrradständer", as in "Findet …" */
  next: string;
  /** "Kein Fahrradständer", as in "… im Umkreis von 500 m" */
  none: string;
  /** small sign of the kind in the app's controls: a glyph of the map's places (render/poi-icon-paths), else the bicycle */
  glyph?: string;
  /** the tiles that are read: an OSM tile set of its own, or (without `set`) the base map */
  tiles: { set?: string; layer: string; zoom: number };
  /** how one travels there */
  mode: RouteMode;
  /** for what one needs in an emergency: the number to call, shown with every search */
  emergency?: { number: '110' | '112'; note?: string };
  /** how many rings of tiles are searched at most, for what lies further apart (data/places.ts) */
  rings?: number;
  /** null: not of this kind, or not usable for the person (e.g. private). `id`: the tile feature's */
  place(properties: Record<string, unknown>, lng: number, lat: number, id?: number): Place | null;
  /** missing: nothing of this kind is entered from the app */
  add?: Addition;
}

export const BIKE_PARKING: Kind = {
  id: 'fahrradparken',
  name: 'Fahrradständer',
  next: 'den nächsten Fahrradständer',
  none: 'Kein Fahrradständer',
  tiles: { set: 'fahrradparken', layer: 'fahrradparken', zoom: 14 },
  mode: 'bike',
  place(properties, lng, lat) {
    const p = properties as unknown as BikeParkingProps;
    if (!isPublicParking(p)) return null;
    const type = parkingType(p.type);
    const detail = [
      p.name ? type : '',
      p.capacity ? `${formatInt(p.capacity)} ${p.capacity === 1 ? 'Platz' : 'Plätze'}` : '',
      isCoveredParking(p) ? 'überdacht' : '',
      p.fee === 'yes' ? 'gebührenpflichtig' : '',
    ];
    return { key: `${p.osm ?? 'n'}${p.id}`, lng, lat, title: p.name || type, detail: detail.filter(Boolean).join(' · ') };
  },
  add: {
    title: 'Neuer Fahrradständer',
    comment: 'Fahrradständer ergänzt',
    tags: { amenity: 'bicycle_parking' },
    fields: [
      { key: 'bicycle_parking', label: 'Bauart', options: Object.keys(PARKING_ART).map((v) => [v, v === 'safe_loops' ? 'Radhalter mit Bügel' : parkingType(v)]), pictures: { colour: PARKING_TILE, art: PARKING_ART } },
      { key: 'capacity', label: 'Stellplätze' },
      { key: 'covered', label: 'Überdacht', options: [['yes', 'Ja'], ['no', 'Nein']] },
      { key: 'access', label: 'Zugang', options: [['yes', 'Öffentlich'], ['customers', 'Nur Kundschaft'], ['private', 'Privat']] },
    ],
    properties: (tags, id) => ({
      id,
      ...(tags.bicycle_parking ? { type: tags.bicycle_parking } : {}),
      ...(Number(tags.capacity) > 0 ? { capacity: Number(tags.capacity) } : {}),
      ...(tags.covered ? { covered: tags.covered } : {}),
      ...(tags.access ? { access: tags.access } : {}),
    }),
  },
};

/** A kind read from the places of the base map. `labels`: what a place is called, per `subclass` that belongs to the kind. */
function onMap(kind: Pick<Kind, 'id' | 'name' | 'next' | 'none' | 'glyph' | 'mode' | 'emergency' | 'rings'> & { labels: Record<string, string>; only?: string }): Kind {
  const { labels, only, ...rest } = kind;
  return {
    ...rest,
    tiles: { layer: 'poi', zoom: 14 },
    place(properties, lng, lat, id) {
      const subclass = String(properties.subclass);
      if (!Object.hasOwn(labels, subclass) || (only && properties.class !== only)) return null;
      const label = labels[subclass]!;
      const name = typeof properties.name === 'string' ? properties.name : '';
      // the ids tell neighbouring tiles' copies of one place apart from two places
      return { key: id === undefined ? `${lng},${lat}` : `m${id}`, lng, lat, title: name || label, detail: name && name !== label ? label : '' };
    },
  };
}

export const BIKE_RENTAL = onMap({ id: 'leihraeder', name: 'Leihräder', next: 'die nächste Leihrad-Station', none: 'Keine Leihrad-Station', glyph: 'pedal_bike', mode: 'foot', labels: { bicycle_rental: 'Leihrad-Station' } });
export const TOILETS = onMap({ id: 'toiletten', name: 'Toiletten', next: 'die nächste Toilette', none: 'Keine Toilette', glyph: 'wc', mode: 'foot', labels: { toilets: 'Toilette' } });
export const WATER = onMap({ id: 'trinkwasser', name: 'Trinkwasser', next: 'das nächste Trinkwasser', none: 'Kein Trinkwasser', glyph: 'water', mode: 'foot', labels: { drinking_water: 'Trinkwasser' } });
export const ATM = onMap({ id: 'geldautomat', name: 'Geldautomat', next: 'den nächsten Geldautomaten', none: 'Kein Geldautomat', glyph: 'local_atm', mode: 'foot', labels: { atm: 'Geldautomat' } });
export const BAKERY = onMap({ id: 'baeckerei', name: 'Bäckerei', next: 'die nächste Bäckerei', none: 'Keine Bäckerei', glyph: 'bakery_dining', mode: 'foot', labels: { bakery: 'Bäckerei' } });
export const SUPERMARKET = onMap({ id: 'supermarkt', name: 'Supermarkt', next: 'den nächsten Supermarkt', none: 'Kein Supermarkt', glyph: 'shopping_cart', mode: 'foot', labels: { supermarket: 'Supermarkt' } });
export const PHARMACY = onMap({ id: 'apotheke', name: 'Apotheke', next: 'die nächste Apotheke', none: 'Keine Apotheke', glyph: 'medication', mode: 'foot', labels: { pharmacy: 'Apotheke' } });
export const STATION = onMap({ id: 'bahnhof', name: 'Bahnhof', next: 'den nächsten Bahnhof', none: 'Kein Bahnhof', glyph: 'train', mode: 'foot', only: 'railway', labels: { station: 'Bahnhof', halt: 'Haltepunkt', subway: 'U-Bahn' } });
export const STOP = onMap({ id: 'haltestelle', name: 'Haltestelle', next: 'die nächste Haltestelle', none: 'Keine Haltestelle', glyph: 'directions_bus', mode: 'foot', labels: { bus_stop: 'Bushaltestelle', bus_station: 'Busbahnhof', tram_stop: 'Straßenbahn' } });
export const FUEL = onMap({ id: 'tankstelle', name: 'Tankstelle', next: 'die nächste Tankstelle', none: 'Keine Tankstelle', glyph: 'local_gas_station', mode: 'car', labels: { fuel: 'Tankstelle' } });
export const CHARGER = onMap({ id: 'ladesaeule', name: 'Ladesäule', next: 'die nächste Ladesäule', none: 'Keine Ladesäule', glyph: 'ev_station', mode: 'car', labels: { charging_station: 'Ladesäule' } });
/** Police stations and hospitals are few: about 12 km to each side in central Europe. */
const FAR_RINGS = 8;
export const POLICE = onMap({ id: 'polizei', name: 'Polizei', next: 'die nächste Polizeiwache', none: 'Keine Polizeiwache', glyph: 'local_police', mode: 'foot', emergency: { number: '110' }, rings: FAR_RINGS, labels: { police: 'Polizei' } });
// without `clinic`: those are mostly practices
export const HOSPITAL = onMap({ id: 'krankenhaus', name: 'Krankenhaus', next: 'das nächste Krankenhaus', none: 'Kein Krankenhaus', glyph: 'local_hospital', mode: 'car', emergency: { number: '112', note: 'Nicht jedes Krankenhaus hat eine Notaufnahme.' }, rings: FAR_RINGS, labels: { hospital: 'Krankenhaus' } });

export const KINDS: readonly Kind[] = [BIKE_PARKING, BIKE_RENTAL, TOILETS, WATER, ATM, BAKERY, SUPERMARKET, PHARMACY, STATION, STOP, FUEL, CHARGER, POLICE, HOSPITAL];
