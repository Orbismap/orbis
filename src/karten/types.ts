import type { BasemapId } from '../map/types';
import type { OptionValues } from '../layers/types';
import type { IconName } from '../ui/icons/names';

export interface KarteLayer { id: string; visible: boolean; opacity: number; options?: OptionValues }
export interface Karte {
  id: string; name: string; icon: IconName; color: string; builtin?: boolean;
  basemap: BasemapId; labels: boolean; terminator: boolean;
  layers: KarteLayer[];             // order = stack inside the slots, topmost first
  view?: { center: [number, number]; zoom: number };
}
