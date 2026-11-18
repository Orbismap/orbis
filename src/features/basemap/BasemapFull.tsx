// The large view of the basemap picker (a modal): the popover grows into it and shrinks back. While it moves, the panel still shows the
// compact content (a "ghost" of the popover) which fades into the large layout, so there is no empty frame and no jump.
import { useEffect, useRef, useState } from 'preact/hooks';
import { setProjection, projection } from '../../state/view';
import { Icon } from '../../ui/icons/Icon';
import { useEscape } from '../../ui/hooks';
import { Segmented } from '../../ui/Segmented';
import { tipProps } from '../../ui/tip-state';
import { BOOST, CATEGORIES, KEYED, PickerBody, TabPanel, ViewSwitches, usePickerRequests, type PickerState } from './picker-parts';
import { RegionalSelect, useRegional } from './RegionalSelect';

export interface Rect { left: number; top: number; width: number; height: number }

/** ms; the same as the transitions in basemap.css */
const MOVE = 360;
const target = (): Rect => {
  const width = Math.min(1000, window.innerWidth - 24);
  const height = Math.min(700, window.innerHeight - 48);
  return { left: (window.innerWidth - width) / 2, top: (window.innerHeight - height) / 2, width, height };
};
const noop = () => {};

export function BasemapFull({ from, s, onClosed }: { from: Rect; s: PickerState; onClosed(): void }) {
  /** from: at the popover (first frame), full: grown, back: shrinking to the popover */
  const [stage, setStage] = useState<'from' | 'full' | 'back'>('from');
  const [, resize] = useState(0);
  const timer = useRef<number>();
  const root = useRef<HTMLDivElement>(null);
  const regional = useRegional();
  usePickerRequests(s);
  useEffect(() => {
    // two frames: the first paints the panel at the popover's place, the second starts the move
    let b = 0;
    const a = requestAnimationFrame(() => (b = requestAnimationFrame(() => setStage('full'))));
    const on = () => resize((n) => n + 1);
    window.addEventListener('resize', on);
    const f = window.setTimeout(() => root.current?.querySelector<HTMLElement>('.bmf-close')?.focus(), MOVE);
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
      clearTimeout(f);
      clearTimeout(timer.current);
      window.removeEventListener('resize', on);
    };
  }, []);
  const collapse = () => {
    if (stage === 'back') return;
    setStage('back');
    if (KEYED.some((g) => g.title === s.tab)) s.setTab(BOOST);
    timer.current = window.setTimeout(onClosed, MOVE + 20);
  };
  useEscape(true, collapse);
  const r = stage === 'full' ? target() : from;
  const globe = projection.value === 'globe';
  return (
    <>
      <div class="bmf-scrim" data-stage={stage} onPointerDown={collapse} />
      <div
        ref={root} class="bmf" data-stage={stage} role="dialog" aria-modal="true" aria-label="Grundkarte und Ansicht"
        style={{ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` }}
      >
        <div class="bmf-ghost" data-hidden={stage === 'full' || undefined} aria-hidden="true" {...({ inert: true } as object)} style={{ width: `${from.width}px`, height: `${from.height}px` }}>
          <PickerBody s={s} onExpand={noop} />
        </div>
        <div class="bmf-main">
          <header class="bmf-head">
            <h2>Grundkarte und Ansicht</h2>
            <div class="bmf-view">
              <Segmented
                aria-label="Ansicht"
                value={globe ? 'globe' : 'mercator'}
                options={[
                  { value: 'globe', label: 'Globus' },
                  { value: 'mercator', label: 'Karte' },
                ]}
                onChange={(v) => setProjection(v)}
              />
            </div>
            <button type="button" class="bm-expand bmf-close" aria-label="Verkleinern" onClick={collapse} {...tipProps('Verkleinern', undefined, 'bottom')}>
              <Icon name="collapse" size={16} />
            </button>
          </header>
          <div class="bmf-body">
            <nav class="bmf-side" aria-label="Kartenanbieter">
              <div class="bmf-tabs" role="tablist" aria-orientation="vertical">
                {CATEGORIES.map((g) => (
                  <button key={g.title} type="button" role="tab" id={`bm-tab-${g.title}`} aria-selected={s.tab === g.title} class="bmf-tab" data-active={s.activeTab === g.title || undefined} onClick={() => s.setTab(g.title)}>
                    <span>{g.title}</span>
                  </button>
                ))}
              </div>
              <div class="bmf-tabs bmf-tabs-boost" role="tablist" aria-orientation="vertical" aria-label="Mit eigenem Schlüssel (Boost)">
                <p class="bmf-tabs-title"><Icon name="boost" size={12} /> Eigener Schlüssel <span class="bm-pill">Boost</span></p>
                {KEYED.map((g) => (
                  <button key={g.title} type="button" role="tab" id={`bm-tab-${g.title}`} aria-selected={s.tab === g.title} class="bmf-tab bmf-tab-boost" data-active={s.activeTab === g.title || undefined} onClick={() => s.setTab(g.title)}>
                    <span>{g.title}</span>
                  </button>
                ))}
              </div>
              <div class="bmf-side-foot">
                <RegionalSelect r={regional} />
                <ViewSwitches />
              </div>
            </nav>
            <div class="bmf-content">
              <TabPanel s={s} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
