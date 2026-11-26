import { Empty, IconButton, Row, Section } from '../ui/parts';
import { Screen } from '../ui/Sheet';
import { favorites, savedKey, type Saved as Item } from '../state/places';
import { push } from '../state/nav';
import { openSaved, savedLabel } from './Start';

/** Merkliste: gemerkte Strecken und Haltestellen. */
export function Saved() {
  const items = favorites.list.value;
  const routes = items.filter((s) => s.kind === 'route');
  const stops = items.filter((s) => s.kind === 'stop');
  const group = (title: string, list: Item[]) => list.length > 0 && (
    <Section title={title}>
      <div class="bn-list">
        {list.map((s) => (
          <div class="bn-split" key={savedKey(s)}>
            <Row icon={s.kind === 'stop' ? 'pin' : 'swap'} title={savedLabel(s)} subtitle={s.kind === 'stop' ? s.stop.area : 'Verbindungen anzeigen'} onClick={() => openSaved(s)} />
            <IconButton icon="close" label={`${savedLabel(s)} entfernen`} onClick={() => favorites.remove(s)} />
          </div>
        ))}
      </div>
    </Section>
  );

  return (
    <Screen label="Merkliste" head={<h1 class="bn-title">Merkliste</h1>}>
      {items.length === 0 && (
        <Empty
          icon="star" title="Noch nichts gemerkt" text="Merke dir Haltestellen und Strecken mit dem Stern. Sie stehen dann hier und auf der Startseite."
          action={<button type="button" class="bn-btn bn-btn-filled" onClick={() => push({ kind: 'search', target: 'stop' })}>Haltestelle suchen</button>}
        />
      )}
      {group('Strecken', routes)}
      {group('Haltestellen', stops)}
    </Screen>
  );
}
