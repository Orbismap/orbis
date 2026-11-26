// A big picture to tap, as in the catalogue and in the form for a new object.
import { Icon } from '@/ui/icons/Icon';

/** `art`: inner SVG markup on a 160 x 120 grid, static strings of the app (data/art.ts). `soon`: announced only. */
export function PictureTile({ art, colour, name, selected, soon, onClick }: { art: string; colour: string; name: string; selected?: boolean; soon?: boolean; onClick(): void }) {
  return (
    <button type="button" class="find-tile" aria-disabled={soon} aria-pressed={soon ? undefined : selected} onClick={onClick}>
      <svg viewBox="0 0 160 120" aria-hidden="true" style={{ background: colour }} dangerouslySetInnerHTML={{ __html: art }} />
      <span>{name}</span>
      {soon && <small>Bald</small>}
      {selected && <i><Icon name="check" size={16} /></i>}
    </button>
  );
}
