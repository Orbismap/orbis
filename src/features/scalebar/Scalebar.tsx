import { effect, signal } from '@preact/signals';
import { useEffect, useState } from 'preact/hooks';
import { unitPrefs } from '../../core/units';
import { camera } from '../../state/view';
import { mapEngine } from '../../state/ui';
import { haversine, MAX_PX, scaleModel, SCALE_UNITS, type ScaleModel } from './scale';
import './scalebar.css';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
const fmt = (v: number) => nf.format(v);
const key = (m: ScaleModel | null, u: string) => (m ? `${u}|${m.seg}|${m.n}|${m.label}|${m.width.toFixed(1)}|${m.zoom.toFixed(1)}` : 'x');

const model = signal<ScaleModel | null>(null);
let lastKey = '';

/** Measures the ground distance under MAX_PX pixels around the middle of the map (there the globe is always under the points). */
function startMeasure(): () => void {
  return effect(() => {
    const c = camera.value; // 10 Hz, written by the engine; read here only
    const engine = mapEngine.value;
    const unit = unitPrefs.value.distance;
    if (!engine) return;
    const ml = engine.ml;
    const el = ml.getContainer();
    const x = el.clientWidth / 2;
    const y = el.clientHeight / 2;
    let m: ScaleModel | null = null;
    try {
      m = scaleModel(haversine(ml.unproject([x - MAX_PX / 2, y]), ml.unproject([x + MAX_PX / 2, y])), SCALE_UNITS[unit] ?? SCALE_UNITS.km, c.zoom);
    } catch {
      m = null;
    }
    const k = key(m, unit);
    if (k !== lastKey) {
      lastKey = k;
      model.value = m;
    }
  });
}

/**
 * Scale bar: numbers above a rounded strip of up to three alternating light/dark segments.
 * Sits directly on the map. `side="right"` ends the last label at the bar (right-anchored), "left" starts it at its tick.
 */
export function Scalebar({ side }: { side: 'left' | 'right' }) {
  const [, force] = useState(0);
  useEffect(() => {
    lastKey = '';
    const stop = startMeasure();
    const un = model.subscribe(() => force((n) => n + 1));
    return () => (stop(), un());
  }, []);
  const m = model.value;
  if (!m) return null;
  const segW = m.width / m.n;
  return (
    <div class="scalebar" style={{ width: `${m.width}px` }} role="img" aria-label={`Maßstab ${fmt(m.seg * m.n)} ${m.label}`}>
      <div class="sb-marks" aria-hidden="true">
        {Array.from({ length: m.n + 1 }, (_, i) => {
          const pos = i === 0 ? { left: 0 } : i === m.n ? (side === 'left' ? { left: `${i * segW - 7}px` } : { right: 0 }) : { left: `${i * segW}px`, transform: 'translateX(-50%)' };
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
          <i key={i} class={i % 2 ? 'dk' : 'lt'} style={{ width: `${segW}px` }} />
        ))}
      </div>
    </div>
  );
}
