import type { IconName } from '../ui/icons';
import type { TabId } from '../state/nav';

/** Die drei Bereiche: auf dem Handy die Leiste unten, am Desktop Zeilen im Menü. */
export const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'start', label: 'Start', icon: 'home' },
  { id: 'abfahrten', label: 'Abfahrten', icon: 'clock' },
  { id: 'merkliste', label: 'Merkliste', icon: 'star' },
];
