import { proAvailable } from '../../ext/loader';
import { proEnabled } from '../../ext/licence';
import { updateSettings } from '../../state/settings';
import { Switch } from '../../ui/Switch';

/** Settings section "Orbis Pro": one switch. Only exists when this build contains the Pro extension. */
export function ProSection() {
  if (!proAvailable) return null;
  return (
    <section class="set-sec" aria-labelledby="set-pro">
      <h3 id="set-pro">Orbis Pro</h3>
      <div class="setgroup">
        <div class="set-row">
          <Switch label="Orbis Pro" checked={proEnabled.value} onChange={(pro) => updateSettings({ pro })} />
        </div>
        <p class="set-text set-pro-note">3D-Darstellung für ausgewählte Ebenen. Vorschau.</p>
      </div>
    </section>
  );
}
