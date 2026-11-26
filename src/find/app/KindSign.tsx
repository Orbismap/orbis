// The small sign of a kind in the app's controls: the glyph the map uses for such places, or the bicycle.
import { POI_GLYPHS } from '@/render/poi-icon-paths';
import { Icon } from '@/ui/icons/Icon';
import type { Kind } from '../data/kinds';

export function KindSign({ kind, size }: { kind: Kind; size: number }) {
  const glyph = kind.glyph && POI_GLYPHS[kind.glyph];
  return glyph
    ? <svg width={size} height={size} viewBox="0 -960 960 960" fill="currentColor" aria-hidden="true"><path d={glyph} /></svg>
    : <Icon name="bike" size={size} />;
}
