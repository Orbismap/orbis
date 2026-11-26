// What the catalogue shows. Entries without a kind are announced only ("Bald"): their data is still to come.
import type { ArtId } from './art';
import { BIKE_PARKING, type Kind } from './kinds';
import { PARKING_TILE } from './parkingArt';

export interface Entry { art: ArtId; name: string; colour: string; kind?: Kind }

export const CATALOG: readonly { title: string; entries: readonly Entry[] }[] = [
  {
    title: 'Rund ums Rad',
    entries: [
      { art: 'stand', name: BIKE_PARKING.name, colour: PARKING_TILE, kind: BIKE_PARKING },
      { art: 'rental', name: 'Leihräder', colour: '#0f8a80' },
      { art: 'repair', name: 'Reparatur und Luft', colour: '#5b6b8c' },
    ],
  },
  {
    title: 'Unterwegs',
    entries: [
      { art: 'toilet', name: 'Toiletten', colour: '#2563a8' },
      { art: 'water', name: 'Trinkwasser', colour: '#1286b8' },
      { art: 'cash', name: 'Geldautomat', colour: '#3d7a4a' },
    ],
  },
  {
    title: 'Einkaufen',
    entries: [
      { art: 'bakery', name: 'Bäckerei', colour: '#a8641c' },
      { art: 'supermarket', name: 'Supermarkt', colour: '#c2452d' },
      { art: 'pharmacy', name: 'Apotheke', colour: '#1f8a54' },
    ],
  },
  {
    title: 'Bahn, Bus und Auto',
    entries: [
      { art: 'station', name: 'Bahnhof', colour: '#34569c' },
      { art: 'bus', name: 'Haltestelle', colour: '#7a4fb5' },
      { art: 'fuel', name: 'Tankstelle', colour: '#b5452f' },
      { art: 'charger', name: 'Ladesäule', colour: '#2e7d32' },
    ],
  },
  {
    title: 'Notfall',
    entries: [{ art: 'defibrillator', name: 'Defibrillator', colour: '#c8364a' }],
  },
];
