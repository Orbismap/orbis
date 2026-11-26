import { showView } from '../../state/sheet-view';
import { leftPanelOpen, settingsKeyFocus } from '../../state/ui';

/** Opens Settings at the Boost entry of a key ("Schlüssel eintragen"). */
export function openKeySettings(id: string): void {
  leftPanelOpen.value = true;
  settingsKeyFocus.value = id;
  showView('settings');
}
