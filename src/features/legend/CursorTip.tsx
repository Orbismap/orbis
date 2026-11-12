import { useEffect, useRef } from 'preact/hooks';
import { cursorRows, cursorTipHidden } from './pointer-value';
import './cursor-tip.css';

let place: ((x: number, y: number) => void) | undefined;
/** Moves the tooltip to the pointer (viewport px). Called per frame by app/MapView; touches no Preact state. */
export const placeCursorTip = (x: number, y: number) => place?.(x, y);

const GAP = 14;
const EDGE = 6;

/** Small glass tooltip above the mouse pointer with the value(s) the legend marker shows. Mouse decoration only. */
export function CursorTip() {
  const el = useRef<HTMLDivElement>(null);
  const rows = cursorRows.value;
  const hidden = cursorTipHidden.value;
  const pos = useRef<[number, number] | null>(null);

  useEffect(() => {
    const move = (x: number, y: number) => {
      const t = el.current;
      if (!t) return;
      pos.current = [x, y];
      const w = t.offsetWidth;
      const h = t.offsetHeight;
      const px = Math.min(Math.max(x - w / 2, EDGE), Math.max(EDGE, window.innerWidth - w - EDGE));
      let py = y - GAP - h;
      if (py < EDGE) py = y + GAP + 8; // no room above: flip below the pointer
      py = Math.min(py, window.innerHeight - h - EDGE);
      t.style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0)`;
    };
    place = move;
    return () => void (place = undefined);
  }, []);

  // size changes with the text: re-place at the last pointer position before paint
  useEffect(() => {
    if (pos.current) place?.(pos.current[0], pos.current[1]);
  }, [rows]);

  const on = rows.length > 0 && !hidden;
  const multi = rows.length > 1;
  return (
    <div ref={el} class="cursor-tip" data-on={on ? '' : undefined} aria-hidden="true">
      {rows.map((r) => (
        <div class="cursor-tip-row" key={r.layerId}>
          {multi && <span class="cursor-tip-dot" style={{ background: r.color }} />}
          <span class="num">{r.text}</span>
          {multi && <span class="cursor-tip-name">{r.name}</span>}
        </div>
      ))}
    </div>
  );
}
