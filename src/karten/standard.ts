// The five builtin Karten. Layer ids that do not exist (yet) are dropped when the list is built, so other agents
// can extend these lists freely when they add layers.
import { hasLayer } from '../layers/registry';
import { ZEUGEN_WARNUNG } from '../data/parsers/zeitzeugen';
import type { Karte, KarteLayer } from './types';

const on = (id: string, opacity = 1): KarteLayer => ({ id, visible: true, opacity });
const off = (id: string, opacity = 1): KarteLayer => ({ id, visible: false, opacity });

const DEFS: Karte[] = [
  {
    id: 'wetter', name: 'Wetter', icon: 'cloud', color: '#72C8F0', builtin: true, basemap: 'orbis-dark', labels: true, terminator: true,
    layers: [on('wind', 0.85), off('temperatur', 0.8), off('gefuehlt', 0.8), off('staedte'), off('luftqualitaet', 0.85), off('niederschlag'), off('bewoelkung'), off('luftdruck'), off('radar'), off('satellit'), off('stroemung'), off('blitze')],
  },
  {
    id: 'gefahren', name: 'Gefahren', icon: 'warning', color: '#FF6B5E', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [
      on('stuerme'), on('katastrophen'), { ...on('vulkane'), options: { onlyActive: true } }, on('erdbeben'), on('feuer'),
      off('unwetter-usa'), off('unwetter-de'), off('naturereignisse'), off('tsunami'), off('blitze'), off('polarlicht'), off('rekonstruktionen'), off('radioaktivitaet'), off('plastik'),
    ],
  },
  {
    id: 'verkehr', name: 'Verkehr', icon: 'plane', color: '#F2B45A', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [on('flugzeuge'), on('satelliten'), off('schiffe'), off('flughaefen'), off('flughafen-plan'), off('gps-stoerungen'), off('haefen'), off('raketenstarts'), off('starlink'), off('blitzer'), off('wetterballons'), off('zuege'), off('nahverkehr'), off('autobahn'), off('strassennetz'), off('bahnnetz'), off('oepnv-linien'), off('wegenetze'), off('leihraeder'), off('verkehrslage'), off('strassenmarkierungen')],
  },
  {
    id: 'infrastruktur', name: 'Infrastruktur', icon: 'power', color: '#58D0A0', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [on('kraftwerke'), on('seekabel'), on('rechenzentren'), off('windraeder'), off('internetknoten'), off('rohstoffe'), off('pipelines')],
  },
  {
    id: 'erde', name: 'Erde & Meer', icon: 'globe', color: '#8FDCFF', builtin: true, basemap: 'satellite', labels: true, terminator: true,
    layers: [on('meerestemperatur', 0.85), on('plattengrenzen', 0.9), off('satellitenbild'), off('vegetation', 0.8), off('schneedecke', 0.85), off('bodentemperatur', 0.8), off('aerosole', 0.8), off('landbedeckung', 0.75), off('geologie', 0.65), off('meereis'), off('chlorophyll', 0.85), off('meerestiefe', 0.8), off('meeresstroemung', 0.9), off('seegang', 0.85), off('fluesse'), off('schiffsrouten', 0.8), off('bojen'), off('pegel'), off('gezeiten'), off('nachtlichter'), off('vulkane'), off('erdbeben')],
  },
  {
    id: 'gesellschaft', name: 'Gesellschaft', icon: 'vote', color: '#C0A0FF', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [on('wahlen', 0.9), off('wahlen-usa', 0.9), on('demos'), off('us-proteste'), off('us-kongress-geld'), off('geldfluesse')],
  },
  {
    id: 'zeitzeugen', name: 'Zeitzeugen', icon: 'camera', color: '#C0392B', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    view: { center: [34.47, 31.5], zoom: 10.6 },
    sensitive: ZEUGEN_WARNUNG,
    layers: [on('kriegsarchiv'), off('gaza-lage'), off('gaza-hunger', 0.8), off('gaza-vertreibung'), off('gaza-gesundheit'), off('ukraine-schaeden'), off('ukraine-lage', 0.8)],
  },
];

/** Builtin Karten with unknown layer ids removed. */
export const builtinKarten = (): Karte[] => DEFS.map((k) => ({ ...k, layers: k.layers.filter((l) => hasLayer(l.id)).map((l) => ({ ...l })) }));
export const DEFAULT_KARTE_ID = 'wetter';
