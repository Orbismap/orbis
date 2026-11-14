import { orteView } from '../../state/hud';
import { routeTo, savedPlaces } from '../../state/routes';
import { selectPlace } from '../../state/selection';
import { IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { Panel } from '../../ui/Panel';
import { ScrollArea } from '../../ui/ScrollArea';
import { flyToPoint } from '../shared/map';
import './routes.css';

/** "Gespeicherte Orte": opens a place on the map, routes there or removes it. */
export function SavedPlaces() {
  const places = savedPlaces.value;
  return (
    <Panel as="section" class="hudd rt" aria-label="Gespeicherte Orte">
      <header class="hudd-head">
        <h2>Gespeicherte Orte</h2>
        <span class="hudd-btns">
          <IconButton icon="close" label="Schließen" shortcut="Esc" class="hud-rbtn" onClick={() => (orteView.value = null)} />
        </span>
      </header>
      <ScrollArea class="hudd-scroll">
        <div class="rt-body">
          {places.length === 0 ? (
            <p class="rt-hint">Noch nichts gesichert. Öffne einen Ort über die Suche und tippe auf „Sichern“.</p>
          ) : (
            <ul class="hud-rows" role="list">
              {places.map((p) => (
                <li key={p.id} class="rt-srow">
                  <button
                    type="button"
                    class="hud-row hud-row-2"
                    onClick={() => (selectPlace({ id: p.id, title: p.title, subtitle: p.subtitle ?? '', lng: p.lng, lat: p.lat }), flyToPoint(p.lng, p.lat, 12))}
                  >
                    <span class="hud-badge">
                      <Icon name="pin" size={18} />
                    </span>
                    <span class="hud-rt2">
                      <b>{p.title}</b>
                      {p.subtitle && <small>{p.subtitle}</small>}
                    </span>
                  </button>
                  <IconButton icon="route" label="Route hierhin" size={15} class="rt-del" onClick={() => routeTo(p)} />
                  <IconButton icon="trash" label="Entfernen" size={15} class="rt-del" onClick={() => (savedPlaces.value = savedPlaces.peek().filter((x) => x.id !== p.id))} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </ScrollArea>
    </Panel>
  );
}
