import type { ComponentChildren } from 'preact';
import { useContext, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { effect } from '@preact/signals';
import { ActiveScreen, isDesktop } from './scene';
import { detent, sheetCover, sheetTops, snap, tapped, type Detent } from './sheetState';

const DRAG_START = 8;

/**
 * Das Blatt über der Karte (Desktop: die Seitenspalte). Ziehen an Griff oder Kopf bewegt es immer, im Inhalt nur
 * unterhalb der vollen Rast; dort scrollt der Inhalt erst, wenn das Blatt ganz oben ist.
 */
export function Sheet({ children }: { children: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [dragTop, setDragTop] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; top: number; id: number; on: boolean; last: [number, number]; v: number } | null>(null);
  const desktop = isDesktop.value;
  const at = detent.value;
  const tops = sheetTops(height);
  const top = dragTop ?? tops[at];

  useLayoutEffect(() => {
    const area = root.current!.parentElement!;
    const measure = () => setHeight(area.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(area);
    return () => ro.disconnect();
  }, []);

  // die Karte rückt mit der Rast; voll verdeckt sie ohnehin, dann bleibt der letzte Wert
  useLayoutEffect(() => {
    if (desktop) sheetCover.value = 0;
    else if (height && at !== 'full') sheetCover.value = height - sheetTops(height)[at];
  }, [desktop, height, at]);

  const onDown = (e: PointerEvent) => {
    if (desktop || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, select, textarea')) return;
    if (target.closest('.bn-view-body') && detent.peek() === 'full') return;
    const start = root.current!.offsetTop;
    drag.current = { x: e.clientX, y: e.clientY, top: start, id: e.pointerId, on: false, last: [e.clientY, e.timeStamp], v: 0 };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) < DRAG_START || Math.abs(dy) < Math.abs(e.clientX - d.x)) return;
      d.on = true;
      root.current!.setPointerCapture(d.id); // der Tipp auf das darunter liegende Element entfällt damit
    }
    const dt = e.timeStamp - d.last[1];
    if (dt > 0) d.v = (e.clientY - d.last[0]) / dt;
    d.last = [e.clientY, e.timeStamp];
    setDragTop(Math.min(tops.peek, Math.max(tops.full, d.top + dy)));
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    drag.current = null;
    if (!d.on) return;
    const end = Math.min(tops.peek, Math.max(tops.full, d.top + e.clientY - d.y));
    const still = e.timeStamp - d.last[1] > 80; // gehalten und losgelassen ist kein Wisch
    detent.value = snap(end, still ? 0 : d.v, tops);
    setDragTop(null);
  };

  return (
    <div
      ref={root}
      class={`bn-sheet bn-sheet-${at} ${dragTop !== null ? 'bn-sheet-drag' : ''}`}
      style={desktop ? undefined : { top: height ? top : '46%' }}
      onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}
    >
      {!desktop && (
        <button type="button" class="bn-grab" aria-label={at === 'full' ? 'Karte zeigen' : 'Liste vergrößern'} onClick={() => (detent.value = tapped(detent.peek()))}><i /></button>
      )}
      <div class="bn-views">{children}</div>
    </div>
  );
}

interface ScreenProps {
  /** Fester Kopf der Seite. */
  head?: ComponentChildren;
  children: ComponentChildren;
  /** Rast, in der die Seite beim Öffnen steht. */
  rest?: Detent;
  label: string;
  class?: string;
}

/** Eine Seite im Blatt. Verdeckte Seiten bleiben bestehen: Liste, Scrollstand und Rast sind beim Zurückgehen da. */
export function Screen({ head, children, rest = 'half', label, class: cls }: ScreenProps) {
  const active = useContext(ActiveScreen);
  const remembered = useRef(rest);
  useLayoutEffect(() => {
    if (!active) return;
    detent.value = remembered.current;
    return effect(() => { remembered.current = detent.value; });
  }, [active]);

  return (
    <section class={`bn-view ${active ? '' : 'bn-view-hidden'} ${cls ?? ''}`} aria-label={label} inert={!active}>
      {head && <header class="bn-view-head">{head}</header>}
      <div class="bn-view-body">{children}</div>
    </section>
  );
}
