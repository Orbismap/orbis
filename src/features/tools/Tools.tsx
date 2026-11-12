import { computed } from '@preact/signals';
import { leftPanelOpen, leftView, mapEngine } from '../../state/ui';
import { camera } from '../../state/view';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { tipProps } from '../../ui/tip-state';
import { TiltGroup } from './Tilt';
import { BasemapPicker } from '../basemap/BasemapPicker';
import './tools.css';

const zoomBy = (d: number) => mapEngine.peek()?.flyTo({ zoom: camera.peek().zoom + d, duration: 260 });
const resetNorth = () => mapEngine.peek()?.flyTo({ bearing: 0, pitch: 0, duration: 450 });

/** Bearing alone: the compass re-renders only when it changes, not on every camera move. */
const bearingSig = computed(() => camera.value.bearing);
const HEADINGS = [
  ['N', 'Nord'],
  ['NO', 'Nordost'],
  ['O', 'Ost'],
  ['SO', 'Südost'],
  ['S', 'Süd'],
  ['SW', 'Südwest'],
  ['W', 'West'],
  ['NW', 'Nordwest'],
] as const;
const heading = (b: number) => HEADINGS[Math.round((((b % 360) + 360) % 360) / 45) % 8]!;

const TICKS = Array.from({ length: 36 }, (_, i) => i * 10);

/** Round compass: tick ring and red north marker turn with the map, the "N" stays upright. Click = north up, pitch 0. */
function Compass() {
  const b = bearingSig.value;
  const [abbr, full] = heading(b);
  return (
    <button type="button" class="compass-round" aria-label={`Kompass, Blick nach ${full}. Nach Norden ausrichten`} onClick={resetNorth} {...tipProps('Norden oben')}>
      <svg viewBox="0 0 52 52" aria-hidden="true">
        <g transform={`rotate(${-b} 26 26)`}>
          {TICKS.map((a) => (
            <line key={a} x1="26" y1={a % 90 === 0 ? 5.5 : 6.5} x2="26" y2={a % 90 === 0 ? 10 : 9} transform={`rotate(${a} 26 26)`} class={a % 90 === 0 ? 'tick tick-major' : 'tick'} />
          ))}
          <path d="M26 3.4 29.2 9.2H22.8z" class="north" />
        </g>
        <text x="26" y={abbr.length > 1 ? 30.2 : 31} text-anchor="middle" class="compass-n" style={{ fontSize: abbr.length > 1 ? 14 : 17.5 }}>
          {abbr}
        </text>
      </svg>
    </button>
  );
}

/** Right edge rail: basemap and view button (icon = current projection), zoom capsule, compass. G toggles the projection. */
export function ToolRail({ popoverUp }: { popoverUp?: boolean }) {
  return (
    <div class="rail" role="group" aria-label="Kartenansicht">
      <BasemapPicker side={popoverUp ? 'left' : 'down'} />
      <div class="cap rail-cap rail-stack">
        <button type="button" class="railbtn" aria-label="Vergrößern" onClick={() => zoomBy(1)} {...tipProps('Vergrößern', undefined, 'left')}>
          <Icon name="plus" size={20} />
        </button>
        <span class="rail-hair" aria-hidden="true" />
        <button type="button" class="railbtn" aria-label="Verkleinern" onClick={() => zoomBy(-1)} {...tipProps('Verkleinern', undefined, 'left')}>
          <Icon name="minus" size={20} />
        </button>
      </div>
      <TiltGroup />
      <Compass />
    </div>
  );
}

function openSettings() {
  leftPanelOpen.value = true;
  leftView.value = leftView.peek() === 'settings' ? 'layers' : 'settings';
}

/** Round glass settings button in the top right corner, same size class as the rail. */
export function TopBar() {
  return (
    <div class="cap topbar">
      <IconButton icon="settings" label="Einstellungen" shortcut="," onClick={openSettings} place="left" />
    </div>
  );
}
