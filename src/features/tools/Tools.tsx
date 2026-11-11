import { leftPanelOpen, leftView, mapEngine } from '../../state/ui';
import { camera, projection, setProjection } from '../../state/view';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { tipProps } from '../../ui/tip-state';
import { BasemapPicker } from '../basemap/BasemapPicker';
import { locateMe, locating } from './locate';
import './tools.css';

const zoomBy = (d: number) => mapEngine.peek()?.flyTo({ zoom: camera.peek().zoom + d, duration: 260 });
const resetNorth = () => mapEngine.peek()?.flyTo({ bearing: 0, pitch: 0, duration: 450 });

const TICKS = Array.from({ length: 36 }, (_, i) => i * 10);

/** Round compass: tick ring and red north marker turn with the map, the "N" stays upright. Click = north up, pitch 0. */
function Compass() {
  const b = camera.value.bearing;
  return (
    <button type="button" class="compass-round" aria-label={`Kompass, Ausrichtung ${Math.round(((b % 360) + 360) % 360)} Grad. Norden oben ausrichten`} onClick={resetNorth} {...tipProps('Norden oben')}>
      <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
        <g transform={`rotate(${-b} 26 26)`}>
          {TICKS.map((a) => (
            <line key={a} x1="26" y1={a % 90 === 0 ? 5.5 : 6.5} x2="26" y2={a % 90 === 0 ? 10 : 9} transform={`rotate(${a} 26 26)`} class={a % 90 === 0 ? 'tick tick-major' : 'tick'} />
          ))}
          <path d="M26 3.4 29.2 9.2H22.8z" class="north" />
        </g>
        <text x="26" y="30.6" text-anchor="middle" class="compass-n">
          N
        </text>
      </svg>
    </button>
  );
}

/** Right edge rail: globe toggle, zoom capsule, compass. No route and no location button here. */
export function ToolRail() {
  const globe = projection.value === 'globe';
  return (
    <div class="rail" role="group" aria-label="Kartenansicht">
      <div class="cap rail-cap">
        <button
          type="button"
          class="railbtn"
          aria-pressed={globe}
          aria-label={globe ? 'Globus, aktiv. Zur flachen Karte wechseln' : 'Flache Karte. Zum Globus wechseln'}
          onClick={() => setProjection(globe ? 'mercator' : 'globe')}
          {...tipProps(globe ? 'Flache Karte' : 'Globus', 'G', 'left')}
        >
          <Icon name="globe" size={24} />
        </button>
      </div>
      <div class="cap rail-cap rail-stack">
        <button type="button" class="railbtn" aria-label="Vergrößern" onClick={() => zoomBy(1)} {...tipProps('Vergrößern', undefined, 'left')}>
          <Icon name="plus" size={24} />
        </button>
        <span class="rail-hair" aria-hidden="true" />
        <button type="button" class="railbtn" aria-label="Verkleinern" onClick={() => zoomBy(-1)} {...tipProps('Verkleinern', undefined, 'left')}>
          <Icon name="minus" size={24} />
        </button>
      </div>
      <Compass />
    </div>
  );
}

function openSettings() {
  leftPanelOpen.value = true;
  leftView.value = leftView.peek() === 'settings' ? 'layers' : 'settings';
}

/** Toolbar capsule in the top right corner: basemap, location, settings. */
export function TopBar() {
  const busy = locating.value;
  return (
    <div class="cap topbar" role="toolbar" aria-label="Karte und Einstellungen">
      <BasemapPicker />
      <IconButton icon="locate" label="Mein Standort" onClick={() => void locateMe()} disabled={busy} aria-busy={busy} />
      <IconButton icon="settings" label="Einstellungen" shortcut="," onClick={openSettings} />
    </div>
  );
}
