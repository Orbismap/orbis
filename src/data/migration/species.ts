// Tierzüge: Arten mit Brut- und Winterquartieren, Zugwegen und Zugzeiten (grobe Angaben aus der Literatur, Vogelwarten, BirdLife, NOAA).
// Das sind keine Messdaten einzelner Tiere: `flock.ts` würfelt daraus Einzeltiere und lässt sie das Jahr durchziehen.
// Längengrade dürfen über ±180 hinausgehen (Pazifik), die Ausgabe wird zurückgewickelt.

export type LngLat = [lng: number, lat: number];
/** Mittelpunkt und Radius in km, aus dem die Tiere gestreut werden. */
export type Area = [lng: number, lat: number, radiusKm: number];

export interface Flyway {
  /** Anteil der Art, der diesen Weg nimmt (relativ). */
  weight: number;
  breed: Area;
  winter: Area;
  /** Wegpunkte vom Brut- zum Winterquartier (Herbst). */
  via: LngLat[];
  /** Rückweg im Frühjahr, wenn er anders verläuft als der Herbstweg (vom Winter- zum Brutquartier). */
  springVia?: LngLat[];
  /** Tage für den Herbst- und den Frühjahrszug. */
  days: [autumn: number, spring: number];
}

export type SpeciesKind = 'vogel' | 'meer' | 'insekt';

export interface Species {
  id: string;
  name: string;
  latin: string;
  /** Wikipedia-Artikel für das Bild: 'Titel' (deutsch) oder 'en:Title' */
  wiki: string;
  kind: SpeciesKind;
  color: string;
  /** Tiere in der Simulation (nicht die Bestandsgröße). */
  n: number;
  /** Beginn des Herbst- und des Frühjahrszugs: Tag im Jahr (1 = 1. Januar) und Streuung in Tagen. */
  autumn: [doy: number, sd: number];
  spring: [doy: number, sd: number];
  flyways: Flyway[];
  /** Ein Satz zu Zug und Besonderheit für die Karte. */
  note: string;
}

export const SPECIES: Species[] = [
  {
    id: 'weissstorch', name: 'Weißstorch', latin: 'Ciconia ciconia', wiki: 'Weißstorch', kind: 'vogel', color: '#FF6F91', n: 520,
    autumn: [232, 12], spring: [58, 12],
    note: 'Westzieher über Gibraltar, Ostzieher über den Bosporus; Winter in der Sahelzone und in Ost- und Südafrika',
    flyways: [
      { weight: 0.45, breed: [4, 49, 450], winter: [-7, 14, 450], via: [[0, 44], [-5.6, 36.2], [-8, 27]], days: [32, 35] },
      { weight: 0.55, breed: [21, 52, 520], winter: [31, -8, 800], via: [[27, 45], [29.2, 41.2], [35, 34], [33, 22], [32, 8]], days: [55, 60] },
    ],
  },
  {
    id: 'rauchschwalbe', name: 'Rauchschwalbe', latin: 'Hirundo rustica', wiki: 'Rauchschwalbe', kind: 'vogel', color: '#FFB347', n: 520,
    autumn: [255, 12], spring: [75, 10],
    note: 'Von Europa über die Sahara bis nach Südafrika, etwa 10 000 km in jeder Richtung',
    flyways: [{ weight: 1, breed: [11, 51, 800], winter: [23, -25, 600], via: [[3, 44], [-4, 36], [5, 24], [15, 6], [22, -8]], days: [45, 45] }],
  },
  {
    id: 'mauersegler', name: 'Mauersegler', latin: 'Apus apus', wiki: 'Mauersegler', kind: 'vogel', color: '#C9A0FF', n: 380,
    autumn: [212, 8], spring: [118, 8],
    note: 'Zieht früh ab (Ende Juli) und kommt spät, verbringt fast das ganze Leben in der Luft',
    flyways: [{ weight: 1, breed: [14, 52, 900], winter: [22, -5, 700], via: [[8, 44], [4, 33], [12, 14], [18, 3]], days: [26, 30] }],
  },
  {
    id: 'kranich', name: 'Kranich', latin: 'Grus grus', wiki: 'Kranich', kind: 'vogel', color: '#7FDBDA', n: 420,
    autumn: [281, 9], spring: [57, 12],
    note: 'Westroute über Frankreich nach Spanien, Ostroute über die Türkei nach Äthiopien',
    flyways: [
      { weight: 0.75, breed: [18, 60, 650], winter: [-5.5, 39, 250], via: [[13, 53], [5, 48], [-1, 43]], days: [16, 20] },
      { weight: 0.25, breed: [32, 62, 600], winter: [38, 11, 350], via: [[30, 52], [33, 43], [36, 36], [34, 26]], days: [32, 40] },
    ],
  },
  {
    id: 'kuestenseeschwalbe', name: 'Küstenseeschwalbe', latin: 'Sterna paradisaea', wiki: 'Küstenseeschwalbe', kind: 'vogel', color: '#FF8A5B', n: 320,
    autumn: [212, 14], spring: [62, 12],
    note: 'Der längste Zug im Tierreich: von der Arktis bis zum Packeis der Antarktis, im Bogen über den Atlantik, gut 70 000 km im Jahr',
    flyways: [{ weight: 1, breed: [-22, 66, 900], winter: [5, -66, 1300], via: [[-18, 48], [-20, 28], [-18, 8], [-30, -8], [-34, -30], [-22, -50]], springVia: [[-10, -50], [-40, -30], [-42, -8], [-36, 14], [-34, 40]], days: [85, 80] }],
  },
  {
    id: 'pfuhlschnepfe', name: 'Pfuhlschnepfe (Alaska)', latin: 'Limosa lapponica baueri', wiki: 'Pfuhlschnepfe', kind: 'vogel', color: '#6FE3A8', n: 260,
    autumn: [247, 8], spring: [78, 8],
    note: 'Fliegt im Herbst in rund neun Tagen ohne Pause von Alaska nach Neuseeland, zurück mit Rast am Gelben Meer',
    flyways: [{ weight: 1, breed: [-160, 62, 250], winter: [-185, -38, 250], via: [[-169, 45], [-175, 25], [-182, 5], [-187, -20]], springVia: [[-205, -10], [-237, 35], [-215, 57]], days: [9, 42] }],
  },
  {
    id: 'kolibri', name: 'Rubinkehlkolibri', latin: 'Archilochus colubris', wiki: 'Rubinkehlkolibri', kind: 'vogel', color: '#FF5D8F', n: 260,
    autumn: [232, 14], spring: [72, 10],
    note: 'Fliegt etwa 800 km nonstop über den Golf von Mexiko',
    flyways: [{ weight: 1, breed: [-80, 42, 900], winter: [-86, 11, 450], via: [[-84, 32], [-90, 26.5], [-90, 21], [-88, 16]], days: [30, 38] }],
  },
  {
    id: 'monarch', name: 'Monarchfalter', latin: 'Danaus plexippus', wiki: 'Monarchfalter', kind: 'insekt', color: '#FF9F1C', n: 420,
    autumn: [250, 12], spring: [64, 12],
    note: 'Ein Schmetterling zieht im Herbst über 4 000 km nach Mexiko; im Frühjahr tragen mehrere Generationen den Zug zurück',
    flyways: [{ weight: 1, breed: [-83, 42, 800], winter: [-100.3, 19.6, 120], via: [[-91, 36], [-97, 30], [-100, 24]], days: [60, 105] }],
  },
  {
    id: 'buckelwal', name: 'Buckelwal (Nordatlantik)', latin: 'Megaptera novaeangliae', wiki: 'Buckelwal', kind: 'meer', color: '#5CC8FF', n: 240,
    autumn: [296, 18], spring: [76, 18],
    note: 'Frisst im Sommer vor Neuengland, Island und Norwegen und gebiert im Winter in der Karibik und vor Kap Verde',
    flyways: [
      { weight: 0.45, breed: [-68, 42.5, 250], winter: [-69.5, 20.5, 180], via: [[-66, 36], [-67, 28]], days: [32, 36] },
      { weight: 0.35, breed: [-20, 66, 450], winter: [-24.5, 16, 220], via: [[-26, 55], [-25, 40], [-24.5, 27]], days: [45, 50] },
      { weight: 0.2, breed: [-20, 66, 450], winter: [-67, 19, 300], via: [[-35, 56], [-50, 40], [-62, 28]], days: [55, 60] },
    ],
  },
  {
    id: 'grauwal', name: 'Grauwal (Ostpazifik)', latin: 'Eschrichtius robustus', wiki: 'en:Gray_whale', kind: 'meer', color: '#8EA8C3', n: 200,
    autumn: [305, 20], spring: [62, 20],
    note: 'Etwa 18 000 km im Jahr, die längste Wanderung eines Säugetiers: von der Beringsee zu den Lagunen von Baja California',
    flyways: [{ weight: 1, breed: [-168, 62, 400], winter: [-112, 26.5, 220], via: [[-160, 55], [-150, 52], [-135, 46], [-124, 38], [-118, 31]], days: [70, 75] }],
  },
];

export const SPECIES_BY_ID: Record<string, Species> = Object.fromEntries(SPECIES.map((s) => [s.id, s]));
