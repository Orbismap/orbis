import { useRef } from 'preact/hooks';
import { moveLayer } from '../../karten/store';
import { getLayer } from '../../layers/registry';
import { activeKarte } from '../../state/session';
import { leftView } from '../../state/ui';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { useFlip } from './flip';
import { LayerRow } from './LayerRow';
import { reorderMessage, startRowDrag } from './reorder';
import './layers-panel.css';

/** Rows of the active Karte, topmost first. Drag by the grip, Alt+↑/↓ from the keyboard. */
export function LayersList() {
  const k = activeKarte.value;
  const list = useRef<HTMLUListElement>(null);
  const flipPrev = useFlip(list);
  const rows = k.layers.map((l) => ({ l, def: getLayer(l.id) })).filter((r): r is { l: typeof r.l; def: NonNullable<typeof r.def> } => !!r.def);

  if (!rows.length)
    return (
      <div class="lempty">
        <Icon name="layers" size={28} />
        <h3>Diese Karte ist leer</h3>
        <p>Ebenen zeigen, was gerade passiert: Wetter, Erdbeben, Flugzeuge, Seekabel.</p>
        <Button variant="primary" icon="plus" onClick={() => (leftView.value = 'catalog')}>
          Ebene hinzufügen
        </Button>
      </div>
    );

  const move = (id: string, to: number) => {
    moveLayer(k.id, id, k.layers.findIndex((x) => x.id === rows[to]?.l.id));
    const def = getLayer(id);
    reorderMessage.value = `${def?.title ?? id}, Position ${to + 1} von ${rows.length}`;
  };

  return (
    <>
      <ul class="llist lgroup" role="list" ref={list} aria-label={`Ebenen von ${k.name}`}>
        {rows.map(({ l, def }, i) => (
          <LayerRow
            key={def.id}
            layer={l}
            def={def}
            karteId={k.id}
            index={i}
            count={rows.length}
            onGrip={(e) => startRowDrag(e, def.id, { list, flipPrev, onDrop: (id, to) => move(id, to) })}
            onKeyMove={(dir) => {
              const to = i + dir;
              if (to >= 0 && to < rows.length) move(def.id, to);
            }}
          />
        ))}
      </ul>
      <div class="sr-only" role="status" aria-live="polite">
        {reorderMessage.value}
      </div>
    </>
  );
}
