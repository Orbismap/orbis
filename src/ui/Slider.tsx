import { useRef, useState } from 'preact/hooks';
import { cx } from './hooks';
import './slider.css';

export interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange(v: number): void;
  onCommit?(v: number): void;
  'aria-label': string;
  /** Text for assistive tech and the optional value bubble, e.g. "80 %". */
  format?(v: number): string;
  disabled?: boolean;
  class?: string;
}

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length;

/** Horizontal slider: pointer drag with capture, click on track, arrows/Home/End/PageUp/PageDown. */
export function Slider({ value, min, max, step = 1, onChange, onCommit, format, disabled, class: cls, ...aria }: SliderProps) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);
  const snap = (v: number) => {
    const n = Math.round((v - min) / step) * step + min;
    return Math.min(max, Math.max(min, +n.toFixed(decimals(step) + 2)));
  };
  const fromPointer = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect();
    return snap(min + ((e.clientX - r.left) / r.width) * (max - min));
  };
  const frac = max === min ? 0 : (value - min) / (max - min);
  const text = format ? format(value) : String(value);

  const down = (e: PointerEvent) => {
    if (disabled || e.button > 0) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setDrag(true);
    onChange(fromPointer(e));
  };
  const move = (e: PointerEvent) => drag && onChange(fromPointer(e));
  const up = (e: PointerEvent) => {
    if (!drag) return;
    setDrag(false);
    onCommit?.(fromPointer(e));
  };
  const key = (e: KeyboardEvent) => {
    if (disabled) return;
    const big = Math.max(step, (max - min) / 10);
    const map: Record<string, number> = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: big, PageDown: -big };
    let next: number | undefined;
    if (e.key in map) next = snap(value + map[e.key]!);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === undefined) return;
    e.preventDefault();
    onChange(next);
    onCommit?.(next);
  };

  return (
    <div
      class={cx('slider', drag && 'is-drag', disabled && 'is-disabled', cls)}
      role="slider"
      tabIndex={disabled ? -1 : 0}
      aria-label={aria['aria-label']}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-valuetext={text}
      aria-disabled={disabled}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onKeyDown={key}
    >
      <div class="slider-track" ref={track}>
        <div class="slider-fill" style={{ width: `${frac * 100}%` }} />
        <div class="slider-thumb" style={{ left: `${frac * 100}%` }}>
          <span class="slider-bubble num">{text}</span>
        </div>
      </div>
    </div>
  );
}
