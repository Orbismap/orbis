import { Icon } from '../ui/icons';
import { favorites } from '../state/places';
import { from, openBoard, push, to } from '../state/nav';

/** Merkliste: gemerkte Haltestellen und Strecken. */
export function Saved() {
  const items = favorites.list.value;
  return (
    <div class="bn-page">
      <h1 class="bn-title">Merkliste</h1>
      {items.length === 0 && <p class="bn-note">Noch nichts gemerkt. Tippe bei einer Haltestelle oder Strecke auf den Stern.</p>}
      {items.map((s) => (
        <div class="bn-row bn-row-split" key={s.kind === 'stop' ? s.stop.id : `${s.from.id}-${s.to.id}`}>
          <button
            type="button"
            class="bn-row-btn"
            onClick={() => {
              if (s.kind === 'stop') openBoard(s.stop);
              else {
                from.value = s.from;
                to.value = s.to;
                push({ kind: 'journeys' });
              }
            }}
          >
            <Icon name="star" class="bn-row-ic bn-starred" />
            <span class="bn-row-main">{s.kind === 'stop' ? s.stop.name : `${s.from.name} → ${s.to.name}`}<small>{s.kind === 'stop' ? 'Haltestelle' : 'Strecke'}</small></span>
          </button>
          <button type="button" class="bn-iconbtn" aria-label="Entfernen" onClick={() => favorites.remove(s)}><Icon name="close" size={18} /></button>
        </div>
      ))}
    </div>
  );
}
