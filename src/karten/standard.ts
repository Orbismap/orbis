// The five builtin Karten. Layer ids that do not exist (yet) are dropped when the list is built, so other agents
// can extend these lists freely when they add layers.
import { hasLayer } from '../layers/registry';
import { ZEUGEN_WARNUNG } from '../data/parsers/zeitzeugen';
import type { Karte, KarteLayer, KarteTheme } from './types';

const on = (id: string, opacity = 1): KarteLayer => ({ id, visible: true, opacity });
const off = (id: string, opacity = 1): KarteLayer => ({ id, visible: false, opacity });

const T = (id: string, title: string, icon: KarteTheme['icon'], layers: string[]): KarteTheme => ({ id, title, icon, layers });

/**
 * Curated topics per standard Karte. Every layer of the registry belongs to at least one topic of a standard Karte
 * (checked by a test); layers may appear in several topics (and Karten). New layers: add their id here.
 */
const THEMES: Record<string, KarteTheme[]> = {
  wetter: [
    T('niederschlag', 'Niederschlag und Radar', 'rain', ['radar', 'niederschlag']),
    T('felder', 'Felder', 'thermometer', ['wind', 'temperatur', 'gefuehlt', 'taupunkt', 'feuchte', 'luftdruck', 'bewoelkung', 'boeen', 'cape', 'schnee']),
    T('zusaetze', 'Zusätze', 'layers', ['satellit', 'staedte', 'luftqualitaet', 'feinstaub', 'stroemung', 'blitze']),
  ],
  gefahren: [
    T('unwetter', 'Unwetter', 'storm', ['stuerme', 'unwetter-usa', 'unwetter-de', 'blitze']),
    T('erde', 'Erde', 'quake', ['erdbeben', 'vulkane', 'tsunami']),
    T('feuer', 'Feuer', 'flame', ['feuer']),
    T('strahlung', 'Strahlung und Weltraum', 'radiation', ['radioaktivitaet', 'safecast-tracks', 'polarlicht']),
    T('ereignisse', 'Ereignisse', 'warning', ['katastrophen', 'naturereignisse', 'rekonstruktionen']),
  ],
  verkehr: [
    T('strasse', 'Straße', 'car', ['autobahn', 'strassennetz', 'strassenmarkierungen', 'verkehrslage', 'blitzer']),
    T('schiene', 'Schiene', 'train', ['bahnnetz', 'zuege', 'nahverkehr', 'oepnv-linien']),
    T('luft', 'Luft', 'plane', ['flugzeuge', 'flughafen', 'gps-stoerungen', 'wetterballons']),
    T('see', 'See', 'ship', ['schiffe', 'haefen', 'schiffsrouten']),
    T('raumfahrt', 'Raumfahrt', 'rocket', ['satelliten', 'starlink', 'raketenstarts']),
    T('rad-fuss', 'Rad und Fuß', 'pin', ['leihraeder', 'wegenetze']),
  ],
  infrastruktur: [
    T('energie', 'Energie', 'power', ['kraftwerke', 'stromnetz']),
    T('netze', 'Netze', 'cable', ['telekomnetz', 'vermittlungsstellen', 'rechenzentren', 'internetknoten']),
    T('rohstoffe', 'Rohstoffe', 'mine', ['rohstoffe', 'oelgasleitungen']),
    T('wasser', 'Wasser', 'drop', ['wasserleitungen', 'wasserwerke', 'stauseen']),
    T('kameras', 'Kameras', 'camera', ['webcams', 'ueberwachung', 'kennzeichen']),
    T('medien', 'Medien', 'radio', ['radio']),
  ],
  erde: [
    T('oberflaeche', 'Oberfläche', 'leaf', ['satellitenbild', 'vegetation', 'landbedeckung', 'schneedecke', 'bodentemperatur', 'aerosole', 'nachtlichter']),
    T('untergrund', 'Untergrund', 'mountain', ['geologie', 'plattengrenzen', 'erdbeben', 'vulkane']),
    T('meer', 'Meer', 'wave', ['meerestemperatur', 'meeresstroemung', 'seegang', 'meerestiefe', 'meereis', 'chlorophyll']),
    T('gewaesser', 'Küste und Gewässer', 'drop', ['fluesse', 'pegel', 'gezeiten', 'bojen', 'schiffsrouten']),
  ],
  gesellschaft: [
    T('orte', 'Orte und Läden', 'pin', ['orte']),
    T('wahlen', 'Wahlen und Politik', 'vote', ['wahlen', 'wahlen-usa', 'us-kongress-geld']),
    T('proteste', 'Proteste', 'people', ['demos', 'us-proteste']),
    T('kameras', 'Kameras', 'camera', ['ueberwachung', 'webcams', 'kennzeichen']),
    T('medien', 'Medien', 'radio', ['radio']),
  ],
  zeitzeugen: [
    T('archiv', 'Archiv', 'camera', ['kriegsarchiv']),
    T('gaza', 'Gaza', 'people', ['gaza-lage', 'gaza-hunger', 'gaza-vertreibung', 'gaza-gesundheit']),
    T('ukraine', 'Ukraine', 'warning', ['ukraine-lage', 'ukraine-schaeden']),
    T('geld', 'Geld und Hilfe', 'globe', ['geldfluesse', 'ukraine-hilfe']),
  ],
};

const DEFS: Karte[] = [
  {
    id: 'wetter', name: 'Wetter', icon: 'cloud', color: '#72C8F0', builtin: true, basemap: 'orbis-dark', labels: true, terminator: true,
    layers: [on('radar'), off('wind', 0.85), off('temperatur', 0.8), off('gefuehlt', 0.8), off('staedte'), off('luftqualitaet', 0.85), off('niederschlag'), off('bewoelkung'), off('luftdruck'), off('satellit'), on('stroemung'), off('blitze'), off('feinstaub')],
  },
  {
    id: 'gefahren', name: 'Gefahren', icon: 'warning', color: '#FF6B5E', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [
      on('stuerme'), on('katastrophen'), { ...on('vulkane'), options: { onlyActive: true } }, on('erdbeben'), on('feuer'),
      off('unwetter-usa'), off('unwetter-de'), off('naturereignisse'), off('tsunami'), off('blitze'), off('polarlicht'), off('rekonstruktionen'), off('radioaktivitaet'), off('safecast-tracks'), off('plastik'),
    ],
  },
  {
    id: 'verkehr', name: 'Verkehr', icon: 'plane', color: '#F2B45A', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [on('flugzeuge'), on('satelliten'), off('schiffe'), off('flughafen'), off('gps-stoerungen'), off('haefen'), off('raketenstarts'), off('starlink'), off('blitzer'), off('wetterballons'), off('zuege'), off('nahverkehr'), off('autobahn'), off('strassennetz'), off('bahnnetz'), off('oepnv-linien'), off('wegenetze'), off('leihraeder'), off('verkehrslage'), off('strassenmarkierungen')],
  },
  {
    id: 'infrastruktur', name: 'Infrastruktur', icon: 'power', color: '#58D0A0', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [on('kraftwerke'), on('telekomnetz'), on('rechenzentren'), off('stromnetz'), off('vermittlungsstellen'), off('internetknoten'), off('rohstoffe'), off('oelgasleitungen'), off('wasserleitungen'), off('wasserwerke'), off('stauseen')],
  },
  {
    id: 'erde', name: 'Erde & Meer', icon: 'globe', color: '#8FDCFF', builtin: true, basemap: 'satellite', labels: true, terminator: true,
    layers: [on('meerestemperatur', 0.85), on('plattengrenzen', 0.9), off('satellitenbild'), off('vegetation', 0.8), off('schneedecke', 0.85), off('bodentemperatur', 0.8), off('aerosole', 0.8), off('landbedeckung', 0.75), off('geologie', 0.65), off('meereis'), off('chlorophyll', 0.85), off('meerestiefe', 0.8), off('meeresstroemung', 0.9), off('seegang', 0.85), off('fluesse'), off('schiffsrouten', 0.8), off('bojen'), off('pegel'), off('gezeiten'), off('nachtlichter'), off('vulkane'), off('erdbeben')],
  },
  {
    id: 'gesellschaft', name: 'Gesellschaft', icon: 'vote', color: '#C0A0FF', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    layers: [on('wahlen', 0.9), off('wahlen-usa', 0.9), on('demos'), off('us-proteste'), off('us-kongress-geld'), off('ueberwachung'), off('webcams'), off('kennzeichen')],
  },
  {
    id: 'zeitzeugen', name: 'Zeitzeugen', icon: 'camera', color: '#C0392B', builtin: true, basemap: 'orbis-dark', labels: true, terminator: false,
    view: { center: [34.47, 31.5], zoom: 10.6 },
    sensitive: ZEUGEN_WARNUNG,
    layers: [on('kriegsarchiv'), off('gaza-lage'), off('gaza-hunger', 0.8), off('gaza-vertreibung'), off('gaza-gesundheit'), off('ukraine-schaeden'), off('ukraine-lage', 0.8), off('geldfluesse'), off('ukraine-hilfe')],
  },
];

/** Raw definitions (unfiltered), for tests. */
export const STANDARD_DEFS: readonly Karte[] = DEFS.map((k) => ({ ...k, themes: THEMES[k.id] }));
/** Builtin Karten with unknown layer ids removed (also inside the themes; empty themes are dropped). */
export const builtinKarten = (): Karte[] =>
  STANDARD_DEFS.map((k) => ({
    ...k,
    layers: k.layers.filter((l) => hasLayer(l.id)).map((l) => ({ ...l })),
    themes: k.themes?.map((t) => ({ ...t, layers: t.layers.filter(hasLayer) })).filter((t) => t.layers.length),
  }));
export const DEFAULT_KARTE_ID = 'wetter';
