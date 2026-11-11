import type { ComponentChildren } from 'preact';
import { Kbd } from './Chip';
import { tip, tipProps, type TipState } from './tip-state';
import './tooltip.css';

/** Wraps arbitrary inline content with a tooltip. For buttons prefer IconButton, which has one built in. */
export function Tooltip({ label, shortcut, place, children }: { label: string; shortcut?: string; place?: TipState['place']; children: ComponentChildren }) {
  return (
    <span class="tip-anchor" {...tipProps(label, shortcut, place)}>
      {children}
    </span>
  );
}

/** Renders the active tooltip; mount once in the app. */
export function TooltipLayer() {
  const t = tip.value;
  if (!t) return null;
  return (
    <div class="tooltip" data-place={t.place} style={{ left: `${t.x}px`, top: `${t.y}px` }} role="tooltip">
      <span>{t.text}</span>
      {t.shortcut && <Kbd keys={t.shortcut} />}
    </div>
  );
}
