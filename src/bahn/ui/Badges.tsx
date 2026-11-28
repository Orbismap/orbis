import type { ModeGroup, Vehicle } from '../data/types';
import { Icon, modeIcon } from './icons';

/** Linien-Badge: Symbol | Linienname. Farbe und Symbol hängen vom Verkehrsmittel ab. */
export function LineBadge({ mode, line, vehicle }: { mode: ModeGroup; line: string; vehicle?: Vehicle }) {
  return (
    <span class={`bn-badge bn-m-${mode}`}>
      <Icon name={modeIcon(mode, vehicle)} size={16} />
      {line && <i />}
      {line}
    </span>
  );
}

/** Blaues Gleisschild. Bei Gleiswechsel rot mit Ausrufezeichen. */
export function PlatformSign({ platform, changed = false, mode }: { platform?: string; changed?: boolean; mode?: ModeGroup }) {
  if (!platform) return null;
  // Busse haben Steige, Züge Gleise.
  const label = /^\d/.test(platform) || mode === 'fern' || mode === 'regio' || mode === 'sbahn' ? `Gl. ${platform}` : mode === 'bus' || mode === 'tram' || mode === 'fernbus' ? `Stg. ${platform}` : `Gl. ${platform}`;
  return (
    <span class={`bn-gl ${changed ? 'bn-gl-chg' : ''}`} title={changed ? 'Gleiswechsel' : undefined}>
      {changed && (
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#fff" /><path d="M12 6.500v7M12 17.200v.1" stroke="#b3261e" stroke-width="2.800" stroke-linecap="round" /></svg>
      )}
      {label}
    </span>
  );
}
