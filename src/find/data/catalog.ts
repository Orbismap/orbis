// What the catalogue shows. Entries without a kind are announced only ("Bald"): their data is still to come.
import type { ArtId } from './art';
import { ATM, BAKERY, BIKE_PARKING, BIKE_RENTAL, CHARGER, FUEL, HOSPITAL, PHARMACY, POLICE, STATION, STOP, SUPERMARKET, TOILETS, WATER, type Kind } from './kinds';
import { PARKING_TILE } from './parkingArt';

export interface Entry { art: ArtId; name: string; colour: string; kind?: Kind }

export const CATALOG: readonly { title: string; entries: readonly Entry[] }[] = [
  {
    title: 'Rund ums Rad',
    entries: [
      { art: 'stand', name: BIKE_PARKING.name, colour: PARKING_TILE, kind: BIKE_PARKING },
      { art: 'rental', name: 'Leihräder', colour: '#0f8a80', kind: BIKE_RENTAL },
      { art: 'repair', name: 'Reparatur und Luft', colour: '#5b6b8c' },
    ],
  },
  {
    title: 'Unterwegs',
    entries: [
      { art: 'toilet', name: 'Toiletten', colour: '#2563a8', kind: TOILETS },
      { art: 'water', name: 'Trinkwasser', colour: '#1286b8', kind: WATER },
      { art: 'cash', name: 'Geldautomat', colour: '#3d7a4a', kind: ATM },
    ],
  },
  {
    title: 'Einkaufen',
    entries: [
      { art: 'bakery', name: 'Bäckerei', colour: '#a8641c', kind: BAKERY },
      { art: 'supermarket', name: 'Supermarkt', colour: '#c2452d', kind: SUPERMARKET },
      { art: 'pharmacy', name: 'Apotheke', colour: '#1f8a54', kind: PHARMACY },
    ],
  },
  {
    title: 'Bahn, Bus und Auto',
    entries: [
      { art: 'station', name: 'Bahnhof', colour: '#34569c', kind: STATION },
      { art: 'bus', name: 'Haltestelle', colour: '#7a4fb5', kind: STOP },
      { art: 'fuel', name: 'Tankstelle', colour: '#b5452f', kind: FUEL },
      { art: 'charger', name: 'Ladesäule', colour: '#2e7d32', kind: CHARGER },
    ],
  },
  {
    title: 'Notfall',
    entries: [
      { art: 'police', name: 'Polizei', colour: '#1f4e9c', kind: POLICE },
      { art: 'hospital', name: 'Krankenhaus', colour: '#b83250', kind: HOSPITAL },
      { art: 'defibrillator', name: 'Defibrillator', colour: '#c8364a' },
    ],
  },
];
