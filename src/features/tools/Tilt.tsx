import { computed, signal } from '@preact/signals';
import { useRef } from 'preact/hooks';
import { mapEngine } from '../../state/ui';
import { tiltAvailable, tiltLimit } from '../../map/camera';
import { camera, setCamera } from '../../state/view';
import { tipProps } from '../../ui/tip-state';

// Behaviour ported from the old Orbis HUD: the group is available as long as the zoom allows a tilt (tiltLimit, shared
// with the engine, which enforces it for every input) and folds away otherwise (the compass slides up); the button reads
// "3D" while flat and "2D" while tilted; "3D" opens the slider and eases to 75 % of the allowed tilt, "2D" eases back to
// flat; the slider runs 0..100 % of the currently allowed tilt (bottom = flat); the group opens by itself whenever the
// camera is tilted and folds shut again once it is flat.
const TILT_START = 0.75;

const pitchSig = computed(() => camera.value.pitch);
const availableSig = computed(() => tiltAvailable(camera.value.zoom));
const maxTiltSig = computed(() => Math.round(tiltLimit(camera.value.zoom) * 10) / 10);
/** Set by the button so the slider opens before the animated pitch rises above 0. */
const opened = signal(false);

const setPitch = (deg: number, animate: boolean) => {
  if (animate) mapEngine.peek()?.flyTo({ pitch: deg, duration: 450 });
  else setCamera({ pitch: Math.max(0, Math.min(deg, maxTiltSig.peek())) });
};

/** Glass capsule with the 2D/3D text button and the vertical tilt slider; sits between the zoom capsule and the compass. */
export function TiltGroup() {
  const pitch = pitchSig.value;
  const max = maxTiltSig.value;
  const available = availableSig.value;
  const open = opened.value || pitch > 0.5;
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef(false);
  const frac = Math.min(1, pitch / max);

  const fromPointer = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height)) * max;
  };
  const down = (e: PointerEvent) => {
    if (e.button > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = true;
    setPitch(fromPointer(e), false);
  };
  const move = (e: PointerEvent) => drag.current && setPitch(fromPointer(e), false);
  const up = () => {
    drag.current = false;
    if (camera.peek().pitch <= 0.5) opened.value = false;
  };
  const key = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 5 : 1;
    const map: Record<string, number> = { ArrowUp: step, ArrowRight: step, ArrowDown: -step, ArrowLeft: -step, PageUp: 10, PageDown: -10 };
    let next: number | undefined;
    if (e.key in map) next = pitch + map[e.key]!;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = max;
    if (next === undefined) return;
    e.preventDefault();
    setPitch(next, false);
    if (next <= 0.5) opened.value = false;
  };
  const toggle = () => {
    if (open) {
      opened.value = false;
      setPitch(0, true);
    } else {
      opened.value = true;
      setPitch(max * TILT_START, true);
    }
  };

  return (
    <div class={available ? 'cap rail-cap tilt' : 'cap rail-cap tilt off'} aria-hidden={available ? undefined : 'true'} {...(available ? {} : ({ inert: '' } as object))}>
      <button type="button" class="railbtn tilt-btn" aria-label={open ? 'Auf 2D zurücksetzen, Kamera nicht mehr neigen' : 'Kamera neigen, 3D'} aria-expanded={open} onClick={toggle} {...tipProps(open ? 'Flach (2D)' : 'Neigen (3D)', undefined, 'left')}>
        {open ? '2D' : '3D'}
      </button>
      <div class={open ? 'tilt-sl open' : 'tilt-sl'}>
        <div
          class="tilt-hit"
          role="slider"
          tabIndex={open ? 0 : -1}
          aria-label="Neigung"
          aria-orientation="vertical"
          aria-valuemin={0}
          aria-valuemax={Math.round(max)}
          aria-valuenow={Math.round(pitch)}
          aria-valuetext={`${Math.round(pitch)} Grad`}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          onKeyDown={key}
        >
          <div class="tilt-track" ref={track}>
            <div class="tilt-fill" style={{ height: `${frac * 100}%` }} />
            <div class="tilt-thumb" style={{ bottom: `${frac * 100}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
