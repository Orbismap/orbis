// What the app can look for. A kind names the tile set it comes from and turns one object into a place (or leaves it out).
// Today there is one: bicycle parking. A further one is one more entry here.
import { formatInt } from '@/core/format';
import { isCoveredParking, isPublicParking, parkingType, type BikeParkingProps } from '@/data/bikeparking';
import type { RouteMode } from '@/features/routes/osrm';
import type { UiIconName } from '@/ui/icons/paths';
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
  /** "Fahrradständer" (singular and plural alike) */
  name: string;
  /** small sign of the kind in the app's controls */
  icon: UiIconName;
  /** OSM tile set, its point layer and the zoom that is read */
  set: string;
  layer: string;
  zoom: number;
  /** how one travels there */
  mode: RouteMode;
  /** null: not usable for the person (e.g. private) */
  place(properties: Record<string, unknown>, lng: number, lat: number): Place | null;
  /** missing: nothing of this kind is entered from the app */
  add?: Addition;
}

export const BIKE_PARKING: Kind = {
  name: 'Fahrradständer',
  icon: 'bike',
  set: 'fahrradparken',
  layer: 'fahrradparken',
  zoom: 14,
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
