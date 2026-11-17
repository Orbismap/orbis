// Buses, trams, metros and ferries from city zoom on: Transitous (timetable with real-time, Europe and more) plus the
// GPS feeds of MBTA (Boston), SEPTA, Metro Transit, CapMetro, TTC, HSL, OVapi, TransLink SEQ, data.gov.my and Entur.
// Boost with a key: Transport Victoria (Melbourne), CTA (Chicago), Trafiklab (Sweden). Only feeds whose region meets
// the view are polled.
import { kindLegend, mountVehicles } from '../../data/parsers/vehiclekit';
import { defineLayer } from '../define';

const KINDS = ['ubahn', 'tram', 'bus', 'faehre'] as const;

export default defineLayer({
  id: 'nahverkehr',
  category: 'verkehr',
  title: 'Busse, Trams & U-Bahnen',
  summary: 'Nahverkehr live ab Stadtzoom, Farbe nach Verkehrsmittel',
  icon: 'train',
  color: '#b57bff',
  form: 'tracks',
  cadence: 'live',
  coverage: 'Europa und Städte weltweit',
  minZoom: 10,
  sources: [
    { name: 'Transitous (MOTIS) – Fahrplan mit Echtzeit', url: 'https://transitous.org/', license: 'Daten der Verkehrsunternehmen, meist offen' },
    { name: 'Entur (Norwegen), MBTA (Boston), SEPTA (Philadelphia), Metro Transit (Minneapolis), CapMetro (Austin), TTC (Toronto)', url: 'https://developer.entur.org/', license: 'offene Betreiber-Feeds' },
    { name: 'HSL (Helsinki), OVapi (Niederlande), TransLink (Brisbane), data.gov.my (Malaysia)', url: 'https://transitous.org/', license: 'CC BY 4.0 bzw. offene Feeds' },
    { name: 'Transport Victoria, CTA Chicago, Trafiklab Schweden (mit eigenem Schlüssel)', url: 'https://opendata.transport.vic.gov.au/', license: 'CC BY 4.0 / Betreiber' },
  ],
  options: [
    { id: 'kind', label: 'Verkehrsmittel', type: 'multi', default: 'all', choices: [{ value: 'all', label: 'Alle' }, { value: 'bus', label: 'Bus' }, { value: 'tram', label: 'Tram' }, { value: 'ubahn', label: 'U-Bahn' }, { value: 'faehre', label: 'Fähre' }] },
  ],
  legend: kindLegend([...KINDS]),
  keys: [{ id: 'victoria', required: false }, { id: 'cta', required: false }, { id: 'trafiklab', required: false }],
  keywords: ['bus', 'tram', 'u-bahn', 'metro', 'straßenbahn', 'öpnv', 'nahverkehr', 'fähre', 'transit', 'subway', 'mbta', 'bvg', 'hsl'],

  mount: (ctx) => mountVehicles(ctx, { group: 'local', transitousZoom: 10, minZoom: 10, kinds: [...KINDS] }, [0.28, 0.36, 0.5, 0.7]),
});
