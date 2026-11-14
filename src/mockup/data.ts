import type { IconName } from './icons';

export interface Layer { name: string; sub: string; icon: IconName; on: boolean }
export interface Category { id: string; title: string; icon: IconName; color: string; blurb: string; layers: Layer[]; now: { title: string; obj?: string }[] }
export interface Obj { id: string; title: string; sub: string; icon: IconName; color: string; stats: [string, string][]; x: number; y: number }

export const CATEGORIES: Category[] = [
  { id: 'wetter', title: 'Wetter', icon: 'cloud', color: '#4f9cf5', blurb: 'Radar, Wind, Temperatur und Vorhersage',
    layers: [
      { name: 'Radar', sub: 'Niederschlag, alle 5 Min.', icon: 'radar', on: true },
      { name: 'Wind', sub: '10 m über Grund', icon: 'wind', on: false },
      { name: 'Temperatur', sub: '2 m, Vorhersage +72 h', icon: 'thermo', on: false },
      { name: 'Wolken', sub: 'Satellit, infrarot', icon: 'cloud', on: false },
      { name: 'Blitze', sub: 'Live', icon: 'bolt', on: true },
    ],
    now: [{ title: 'Tief „Ilka“ über der Nordsee', obj: 'ilka' }, { title: 'Starkregen Oberitalien' }, { title: 'Frost im Alpenraum' }] },
  { id: 'gefahren', title: 'Gefahren', icon: 'warn', color: '#ff6b5e', blurb: 'Erdbeben, Brände, Warnungen',
    layers: [
      { name: 'Erdbeben', sub: 'M 2,5 und stärker', icon: 'quake', on: true },
      { name: 'Waldbrände', sub: 'Satellit, 12 h', icon: 'fire', on: false },
      { name: 'Unwetterwarnungen', sub: 'DWD, MeteoAlarm', icon: 'warn', on: true },
    ],
    now: [{ title: 'M 5,2 vor Honshu', obj: 'honshu' }, { title: '3 aktive Großbrände' }] },
  { id: 'verkehr', title: 'Verkehr', icon: 'car', color: '#34c759', blurb: 'Flugzeuge, Schiffe, Bahn, Straße',
    layers: [
      { name: 'Flugzeuge', sub: 'ADS-B, live', icon: 'plane', on: true },
      { name: 'Schiffe', sub: 'AIS, live', icon: 'ship', on: false },
      { name: 'Züge', sub: 'Echtzeitdaten', icon: 'train', on: false },
      { name: 'Autobahn', sub: 'Baustellen, Staus', icon: 'car', on: false },
    ],
    now: [{ title: 'LH 400 nach New York', obj: 'lh400' }, { title: '11 842 Flugzeuge in der Luft' }] },
  { id: 'infra', title: 'Infrastruktur', icon: 'build', color: '#ff9f0a', blurb: 'Flughäfen, Häfen, Kabel',
    layers: [
      { name: 'Flughäfen', sub: 'mit Flugplan', icon: 'tower', on: false },
      { name: 'Häfen', sub: 'weltweit', icon: 'anchor', on: false },
      { name: 'Seekabel', sub: 'Verlauf', icon: 'waves', on: false },
    ],
    now: [] },
  { id: 'erde', title: 'Erde & Meer', icon: 'waves', color: '#30b0c7', blurb: 'Meer, Eis, Vulkane, Polarlicht',
    layers: [
      { name: 'Meerestemperatur', sub: 'täglich', icon: 'thermo', on: false },
      { name: 'Polarlicht', sub: 'Vorhersage 30 Min.', icon: 'star', on: false },
    ],
    now: [{ title: 'Kp 5: Polarlicht bis Mitteleuropa' }] },
  { id: 'mehr', title: 'Mehr …', icon: 'dots', color: '#8e8e93', blurb: 'Weltraum, Ereignisse, eigene Karten',
    layers: [
      { name: 'Satelliten', sub: 'Bahnen, live', icon: 'star', on: false },
      { name: 'Ereignisse', sub: 'Chronik', icon: 'bell', on: false },
    ],
    now: [] },
];

export const OBJECTS: Obj[] = [
  { id: 'lh400', title: 'LH 400', sub: 'Airbus A350 · Frankfurt → New York', icon: 'plane', color: '#34c759', x: 0.56, y: 0.38,
    stats: [['Höhe', '11 280 m'], ['Tempo', '902 km/h'], ['Kurs', '287°'], ['Ankunft', '14:42']] },
  { id: 'honshu', title: 'Erdbeben M 5,2', sub: 'vor Honshu, Japan · vor 14 Min.', icon: 'quake', color: '#ff6b5e', x: 0.82, y: 0.46,
    stats: [['Stärke', 'M 5,2'], ['Tiefe', '38 km'], ['Quelle', 'USGS'], ['Meldungen', '1 204']] },
  { id: 'ilka', title: 'Tief „Ilka“', sub: 'Nordsee · 978 hPa', icon: 'cloud', color: '#4f9cf5', x: 0.47, y: 0.27,
    stats: [['Kerndruck', '978 hPa'], ['Böen', '112 km/h'], ['Zug', 'Ost, 38 km/h'], ['Warnstufe', '3 von 4']] },
];

export const RECENTS: { title: string; obj?: string; cat?: string }[] = [
  { title: 'Radar Mitteleuropa', cat: 'wetter' },
  { title: 'Erdbeben M 5,2 Honshu', obj: 'honshu' },
  { title: 'LH 400', obj: 'lh400' },
];
