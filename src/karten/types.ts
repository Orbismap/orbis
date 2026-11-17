import type { BasemapId } from '../map/types';
import type { OptionValues } from '../layers/types';
import type { IconName } from '../ui/icons/names';

export interface KarteLayer { id: string; visible: boolean; opacity: number; options?: OptionValues }
/** Curated topic of a Karte: a named group of layer ids shown as one expandable row in the left menu. */
export interface KarteTheme { id: string; title: string; icon: IconName; layers: string[] }
export interface Karte {
  id: string; name: string; icon: IconName; color: string; builtin?: boolean;
  /** Works as a Karte but is not offered in any list (menu, bar, shortcuts, search): the plain start map. */
  hidden?: boolean;
  basemap: BasemapId; labels: boolean; terminator: boolean;
  layers: KarteLayer[];             // order = stack inside the slots, topmost first
  view?: { center: [number, number]; zoom: number };
  /** Content warning, confirmed once before the Karte shows its layers. */
  sensitive?: { title: string; text: string };
  /** Curated topics (standard Karten only; not persisted, always taken from the code). Own Karten have none. */
  themes?: KarteTheme[];
}
