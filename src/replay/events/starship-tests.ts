// Starship flights 1 to 5 (Starbase, Texas, April 2023 to October 2024): from the first flight, which ended in a flight termination,
// to the first catch of a Super Heavy booster by the tower. The path and timing are shared (test-flight.ts); what differs is the end.
import type { EventLink } from '../types';
import type { TestFlight } from './test-flight';

const LINKS: EventLink[] = [{ label: 'SpaceX: Starship', url: 'https://www.spacex.com/vehicles/starship/', kind: 'official' }];
const sources = (extra: { name: string; url: string }[] = []) => [
  { name: 'Wikipedia: Liste der Starship-Flüge', url: 'https://en.wikipedia.org/wiki/List_of_Starship_flights' },
  { name: 'NASASpaceFlight: Ten flights in', url: 'https://www.nasaspaceflight.com/2025/09/ten-flights-starship-program-successes-failures/' },
  ...extra,
];
const NOTE = 'Starttermin, Trennung, Triebwerksabschaltung, Wiedereintritt und Ende stammen aus den veröffentlichten Abläufen und sind auf etwa eine Sekunde (Flug 3 bis 5: einige Sekunden) gerundet. Es gibt keine öffentliche Telemetrie: Positionen, Höhen und Geschwindigkeiten dazwischen sind modelliert.';

const base = { sep: 162, meco: 160, boostback: [166, 196] as [number, number], endAltKm: 150, tower: false, links: LINKS };

export const FLIGHT_TESTS: TestFlight[] = [
  {
    id: 'starship-flight-1', title: 'Starship Flug 1', subtitle: 'Der erste Start des vollen Stapels', t0: Date.UTC(2023, 3, 20, 13, 33, 9),
    summary: 'Der erste Start des kompletten Starship-Systems: Der Stapel hebt mit mehreren ausgefallenen Triebwerken ab, die Stufen trennen sich nicht und das Fahrzeug wird nach 3 min 59 s durch die Flugabbruch-Sicherung zerstört.',
    result: 'Flugabbruch nach 3 min 59 s', vehicles: 'Super Heavy Booster 7, Starship Ship 24', note: NOTE, badges: ['4 min', 'Flugabbruch'],
    ...base, sep: null, meco: 160, boostback: [0, 0], booster: { fate: 'with-ship', end: 239 }, ship: { seco: 239, end: 239, fate: 'terminated', apogeeKm: 39, apogeeT: 239, entry: 239 },
    burnoutKm: 30, sources: sources(),
  },
  {
    id: 'starship-flight-2', title: 'Starship Flug 2', subtitle: 'Erste Heißtrennung, beide Stufen gehen verloren', t0: Date.UTC(2023, 10, 18, 13, 3, 0),
    summary: 'Erstmals trennt sich das Ship noch am brennenden Booster (Heißtrennung). Der Booster explodiert bei der Rückkehr, das Ship erreicht rund 148 km und wird nach etwa acht Minuten zerstört.',
    result: 'Booster und Ship verloren', vehicles: 'Super Heavy Booster 9, Starship Ship 25', note: NOTE, badges: ['8 min', 'Heißtrennung'],
    ...base, boostback: [166, 169], booster: { fate: 'explodes', end: 170 }, ship: { seco: 462, end: 480, fate: 'terminated', apogeeKm: 148, apogeeT: 480, entry: 480 },
    endAltKm: 148, burnoutKm: 1920, sources: sources(),
  },
  {
    id: 'starship-flight-3', title: 'Starship Flug 3', subtitle: 'Fast ein ganzer Flug, Verlust im Wiedereintritt', t0: Date.UTC(2024, 2, 14, 13, 25, 0),
    summary: 'Das Ship erreicht fast die Bahn, öffnet die Ladeluke und überträgt Bilder des Wiedereintritts. Es verliert die Kontrolle und geht nach rund 49 Minuten verloren, der Booster fällt bei der Landebrennen-Zündung aus.',
    result: 'Booster und Ship im Wiedereintritt verloren', vehicles: 'Super Heavy Booster 10, Starship Ship 28', note: NOTE, badges: ['49 min', 'Fast im Orbit'],
    ...base, booster: { fate: 'lost', end: 417 }, ship: { seco: 530, end: 2940, fate: 'lost-in-entry', apogeeKm: 234, apogeeT: 1700, entry: 2600 },
    burnoutKm: 1920, sources: sources(),
  },
  {
    id: 'starship-flight-4', title: 'Starship Flug 4', subtitle: 'Erster Wiedereintritt überlebt, Wasserung im Indischen Ozean', t0: Date.UTC(2024, 5, 6, 12, 50, 0),
    summary: 'Zum ersten Mal übersteht das Ship den Wiedereintritt trotz stark beschädigter Flaps, richtet sich auf und wassert aufrecht im Indischen Ozean. Auch der Booster wassert kontrolliert im Golf.',
    result: 'Ship und Booster kontrolliert gewassert', vehicles: 'Super Heavy Booster 11, Starship Ship 29', note: NOTE, badges: ['1 h 5 min', 'Wiedereintritt geglückt'],
    ...base, booster: { fate: 'splash', end: 444 }, ship: { seco: 529, end: 3900, fate: 'splash', apogeeKm: 213, apogeeT: 1700, entry: 2760 },
    burnoutKm: 1920, sources: sources(),
  },
  {
    id: 'starship-flight-5', title: 'Starship Flug 5', subtitle: 'Der erste Booster-Fang am Turm', t0: Date.UTC(2024, 9, 13, 12, 25, 0),
    summary: 'Zum ersten Mal fangen die Greifarme des Startturms einen zurückkehrenden Super-Heavy-Booster aus der Luft. Das Ship wassert planmäßig im Indischen Ozean.',
    result: 'Booster gefangen, Ship gewassert', vehicles: 'Super Heavy Booster 12, Starship Ship 30', note: NOTE, badges: ['1 h 5 min', 'Booster gefangen'],
    ...base, tower: true, booster: { fate: 'catch', end: 417 }, ship: { seco: 530, end: 3924, fate: 'splash', apogeeKm: 213, apogeeT: 1700, entry: 2784 },
    burnoutKm: 1920, sources: sources(),
  },
];
