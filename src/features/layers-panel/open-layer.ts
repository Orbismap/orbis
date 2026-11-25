import { batch } from '@preact/signals';
import { openActive } from '../../karten/active';
import { orteView, detailOpen } from '../../state/hud';
import { clearSelection } from '../../state/selection';
import { activeKarte } from '../../state/session';
import { leftView } from '../../state/ui';
import { openDetail } from './themes-state';

/** Opens the page of a layer in the detail menu (desktop), on whatever Karte is shown. One batch: the link never shows the Karte in between. */
export function openLayerPage(layerId: string): void {
  batch(() => {
    clearSelection();
    orteView.value = null;
    leftView.value = 'layers';
    openActive();
    detailOpen.value = true;
    openDetail(activeKarte.peek().id, layerId, 'Karte');
  });
}
