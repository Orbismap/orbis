import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';

interface Props {
  /** Die Karte (und was auf ihr schwebt). */
  map: ComponentChildren;
  /** Kopf des Blatts, gehört zur Zieh-Fläche (Zurück-Knopf, Titel …). */
  header?: ComponentChildren;
  /** Anteil der Höhe, den die Karte im Ruhezustand sichtbar ist. */
  peek?: number;
  children: ComponentChildren;
  class?: string;
}

const OVERLAP = 24;
const DRAG_START = 6;
const FLICK = 0.35; // px/ms

/**
 * Karte oben, darunter ein Blatt mit dem Inhalt. Das Blatt lässt sich an Griff und Kopf nach oben ziehen und deckt
 * dann die Karte ganz ab; nach unten ziehen oder auf den Griff tippen bringt die Karte zurück.
 */
export function MapSheet({ map, header, peek = 0.4, children, class: cls }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(0);
  const [full, setFull] = useState(false);
  const drag = useRef<{ y: number; top: number; t: number; on: boolean; id: number } | null>(null);

  useLayoutEffect(() => {
    const el = root.current!;
    setHeight(el.clientHeight);
    const ro = new ResizeObserver(() => setHeight(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const restTop = Math.round(height * peek);
  const topFor = (isFull: boolean) => (isFull ? 0 : restTop);

  // Nach dem Rendern die Lage setzen (auch nach einer Größenänderung).
  useEffect(() => {
    if (sheet.current && !drag.current?.on) sheet.current.style.top = `${topFor(full)}px`;
  }, [full, restTop]);

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    drag.current = { y: e.clientY, top: sheet.current!.offsetTop, t: performance.now(), on: false, id: e.pointerId };
  };
  const onMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (!d.on) {
      if (Math.abs(dy) < DRAG_START) return;
      d.on = true;
      (e.currentTarget as HTMLElement).setPointerCapture(d.id);
      sheet.current!.classList.add('bn-ms-drag');
    }
    sheet.current!.style.top = `${Math.min(restTop, Math.max(0, d.top + dy))}px`;
  };
  const onUp = (e: PointerEvent) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.on) return;
    sheet.current!.classList.remove('bn-ms-drag');
    const dy = e.clientY - d.y;
    const v = dy / Math.max(1, performance.now() - d.t);
    const top = Math.min(restTop, Math.max(0, d.top + dy));
    const next = Math.abs(v) > FLICK ? v < 0 : top < restTop / 2;
    sheet.current!.style.top = `${topFor(next)}px`;
    setFull(next);
  };

  return (
    <div ref={root} class={`bn-ms ${cls ?? ''}`}>
      <div class="bn-ms-map" style={{ height: restTop + OVERLAP }}>{map}</div>
      <div ref={sheet} class={`bn-ms-sheet ${full ? 'bn-ms-full' : ''}`} style={{ top: restTop }}>
        <div class="bn-ms-drag-zone" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <button type="button" class="bn-ms-grab" aria-label={full ? 'Karte zeigen' : 'Karte ausblenden'} onClick={() => setFull(!full)}><i /></button>
          {header}
        </div>
        <div class="bn-ms-body">{children}</div>
      </div>
    </div>
  );
}
