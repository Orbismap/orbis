import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { unitPrefs } from '../../core/units';
import { useCameraFrame } from '../../map/useCameraFrame';
import { mapEngine } from '../../state/ui';
import { haversine, MAX_PX, scaleModel, SCALE_UNITS, type ScaleModel } from './scale';
import './scalebar.css';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const fmt = (v: number) => nf.format(v);
/** What changes the labels/segments; the width alone is applied per frame without a re-render. */
const structKey = (m: ScaleModel | null) => (m ? `${m.seg}|${m.n}|${m.label}` : 'x');

/** Measures the ground distance under MAX_PX pixels around the middle of the map (there the globe is always under the points). */
function measure(unit: 'km' | 'mi', zoom: number): ScaleModel | null {
  const ml = mapEngine.peek()?.ml;
  if (!ml) return null;
  const el = ml.getContainer();
  const x = el.clientWidth / 2;
  const y = el.clientHeight / 2;
  try {
    return scaleModel(haversine(ml.unproject([x - MAX_PX / 2, y]), ml.unproject([x + MAX_PX / 2, y])), SCALE_UNITS[unit] ?? SCALE_UNITS.km, zoom);
  } catch {
    return null;
  }
}

/**
 * Scale bar: numbers above a rounded strip of up to three alternating light/dark segments.
 * Sits directly on the map. `side="right"` ends the last label at the bar (right-anchored), "left" starts it at its tick.
 * The width follows the map every frame (sub-pixel, one element, no re-render); labels change only at the step jumps.
 */
export function Scalebar({ side }: { side: 'left' | 'right' }) {
  const unit = unitPrefs.value.distance;
  const [m, setM] = useState<ScaleModel | null>(null);
  const el = useRef<HTMLDivElement>(null);
  const width = useRef(0);
  const key = useRef('x');
  const apply = () => {
    if (el.current) el.current.style.width = `${width.current}px`;
  };
  useCameraFrame((f) => {
    const next = measure(unit, f.zoom);
    width.current = next ? next.width : 0;
    apply();
    const k = structKey(next);
    if (k !== key.current) {
      key.current = k;
      setM(next);
    }
  }, [unit]);
  // a freshly mounted bar (after the model was null) gets the current width before it is painted
  useLayoutEffect(apply, [m]);
  if (!m) return null;
  return (
    <div ref={el} class="scalebar" role="img" aria-label={`Maßstab ${fmt(m.seg * m.n)} ${m.label}`}>
      <div class="sb-marks" aria-hidden="true">
        {Array.from({ length: m.n + 1 }, (_, i) => {
          const pos = i === 0 ? { left: 0 } : i === m.n ? (side === 'left' ? { left: 'calc(100% - 7px)' } : { right: 0 }) : { left: `${(i / m.n) * 100}%`, transform: 'translateX(-50%)' };
          return (
            <span key={i} style={pos}>
              {fmt(m.seg * i)}
              {i === m.n ? ` ${m.label}` : ''}
            </span>
          );
        })}
      </div>
      <div class="sb-bar" aria-hidden="true">
        {Array.from({ length: m.n }, (_, i) => (
          <i key={i} class={i % 2 ? 'dk' : 'lt'} />
        ))}
      </div>
    </div>
  );
}
