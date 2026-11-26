import { createSources } from '../data';
import { withSavedStops } from '../data/offline';
import { favorites, recents } from './places';

const base = createSources();
/** Die Haltestellen der Merkliste und der letzten Suchen: auch ohne Netz auffindbar. */
const ownStops = () => [...favorites.list.value, ...recents.list.value].flatMap((s) => (s.kind === 'stop' ? [s.stop] : [s.from, s.to]));

/** Die Datenquellen der App, einmal pro Seite. */
export const sources = { ...base, transit: withSavedStops(base.transit, ownStops) };
