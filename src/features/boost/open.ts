import { leftPanelOpen, leftView, settingsKeyFocus } from '../../state/ui';

/** Opens Settings at the Boost entry of a key ("Schlüssel eintragen"). */
export function openKeySettings(id: string): void {
  leftPanelOpen.value = true;
  leftView.value = 'settings';
  settingsKeyFocus.value = id;
}
