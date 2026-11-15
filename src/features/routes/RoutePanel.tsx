import { useEffect, useState } from 'preact/hooks';
import { orteView } from '../../state/hud';
import { activeStop, addStop, clearRoute, coordStop, isRouteSaved, loadRoute, removeStop, routeChoice, routeMode, routeState, saveCurrentRoute, savedPlaces, savedRoutes, setStop, stops, swapStops, type Stop } from '../../state/routes';
import { mapEngine } from '../../state/ui';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/hooks';
import { Icon } from '../../ui/icons/Icon';
import { Panel } from '../../ui/Panel';
import { ScrollArea } from '../../ui/ScrollArea';
import { toast } from '../../ui/toast';
import { usePlaces } from '../search/Search';
import { flyToPoint } from '../shared/map';
import { formatDistance, formatDuration, MODES, type RouteMode } from './osrm';
import './routes.css';

const MODE_ICON = { car: 'car', bike: 'bike', foot: 'walk' } as const;
const LABEL = ['Start', 'Ziel'];

/** One field of the planner: shows the stop, or searches while empty (saved places first). */
function StopField({ i }: { i: number }) {
  const list = stops.value;
  const s = list[i] ?? null;
  const last = i === list.length - 1;
  const [text, setText] = useState(s?.title ?? '');
  const [focus, setFocus] = useState(false);
  const [hi, setHi] = useState(0);
  useEffect(() => void (s && setText(s.title)), [s?.id, s?.title]);
  const q = focus && !s ? text : '';
  const found = usePlaces(q);
  const saved = savedPlaces.value.filter((p) => !q.trim() || p.title.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 4);
  const options: { key: string; icon: 'bookmark' | 'pin' | 'locate'; title: string; sub?: string; stop: () => Promise<Stop> | Stop }[] = [
    ...(!q.trim() ? [{ key: 'me', icon: 'locate' as const, title: 'Mein Standort', stop: async () => { const p = await mapEngine.peek()!.locate(); return { ...coordStop(p.lng, p.lat), title: 'Mein Standort' }; } }] : []),
    ...saved.map((p) => ({ key: `s${p.id}`, icon: 'bookmark' as const, title: p.title, sub: p.subtitle, stop: () => p })),
    ...found.places.filter((p) => !saved.some((x) => x.title === p.title)).map((p) => ({ key: p.id, icon: 'pin' as const, title: p.title, sub: p.subtitle, stop: () => ({ ...coordStop(p.lng, p.lat), title: p.title, subtitle: p.subtitle }) })),
  ];
  const pick = async (o: (typeof options)[number] | undefined) => {
    if (!o) return;
    try {
      const st = await o.stop();
      setStop(i, st);
      setText(st.title);
      setFocus(false);
      flyToPoint(st.lng, st.lat, Math.max(11, 0));
    } catch (e) {
      toast((e as Error).message || 'Standort nicht verfügbar', { kind: 'error' });
    }
  };
  const label = i === 0 ? LABEL[0] : last ? LABEL[1] : `Stopp ${i}`;
  return (
    <li class="rt-stop">
      <span class={cx('rt-dot', i === 0 ? 'is-start' : last ? 'is-end' : 'is-via')} aria-hidden="true" />
      <div class="rt-field" data-active={activeStop.value === i}>
        <input
          type="text"
          aria-label={label}
          placeholder={`${label} suchen oder auf die Karte tippen`}
          autocomplete="off"
          spellcheck={false}
          value={text}
          onFocus={(e) => (activeStop.value = i, setFocus(true), setHi(0), (e.currentTarget as HTMLInputElement).select())}
          onBlur={() => setTimeout(() => setFocus(false), 120)}
          onInput={(e) => {
            const v = (e.currentTarget as HTMLInputElement).value;
            setText(v);
            setHi(0);
            if (s) setStop(i, null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') (e.preventDefault(), setHi((hi + 1) % Math.max(1, options.length)));
            else if (e.key === 'ArrowUp') (e.preventDefault(), setHi((hi - 1 + options.length) % Math.max(1, options.length)));
            else if (e.key === 'Enter') (e.preventDefault(), void pick(options[hi]));
            else if (e.key === 'Escape') (e.stopPropagation(), (e.currentTarget as HTMLInputElement).blur());
          }}
        />
        {(s || text) && <IconButton icon="close" label={`${label} leeren`} size={14} class="rt-clear" onClick={() => (setText(''), s ? setStop(i, null) : undefined)} />}
      </div>
      {list.length > 2 && i > 0 && !last && <IconButton icon="minus" label="Stopp entfernen" size={15} class="rt-rm" onClick={() => removeStop(i)} />}
      {focus && !s && options.length > 0 && (
        <ul class="rt-sugg" role="listbox" aria-label="Vorschläge">
          {options.map((o, k) => (
            <li key={o.key}>
              <button type="button" role="option" aria-selected={k === hi} class="rt-opt" onPointerDown={(e) => e.preventDefault()} onMouseMove={() => k !== hi && setHi(k)} onClick={() => void pick(o)}>
                <Icon name={o.icon} size={16} />
                <span class="rt-opt-t">
                  <b>{o.title}</b>
                  {o.sub && <small>{o.sub}</small>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function Result() {
  const st = routeState.value;
  const saved = isRouteSaved();
  if (st.status === 'idle') return <p class="rt-hint">Wähle Start und Ziel oder tippe sie auf der Karte an.</p>;
  if (st.status === 'loading') return <p class="rt-hint">Route wird berechnet</p>;
  if (st.status === 'error') return <p class="rt-hint rt-err">{st.message}</p>;
  const c = Math.min(routeChoice.value, st.routes.length - 1);
  const route = st.routes[c]!;
  const fastest = Math.min(...st.routes.map((r) => r.duration));
  return (
    <>
      {st.routes.length > 1 && (
        <div class="rt-opts" role="radiogroup" aria-label="Routenoptionen">
          {st.routes.map((r, k) => (
            <button key={k} type="button" role="radio" aria-checked={k === c} class="rt-opt-card" onClick={() => (routeChoice.value = k)}>
              <span class="rt-opt-n">{k === 0 ? 'Schnellste' : `Option ${k + 1}`}</span>
              <b class="num">{formatDuration(r.duration)}</b>
              <small class="num">{formatDistance(r.distance)}{r.duration - fastest >= 60 ? ` · +${Math.round((r.duration - fastest) / 60)} Min.` : ''}</small>
            </button>
          ))}
        </div>
      )}
      <section class="rt-sum" aria-label="Route">
        <div>
          <b class="num">{formatDuration(route.duration)}</b>
          <span class="num">{formatDistance(route.distance)}</span>
        </div>
        <Button variant="secondary" icon="bookmark" disabled={saved} onClick={() => (saveCurrentRoute(), toast('Route gesichert', { kind: 'ok' }))}>
          {saved ? 'Gesichert' : 'Sichern'}
        </Button>
      </section>
      <ol class="rt-steps" aria-label="Wegbeschreibung">
        {route.steps.map((s, k) => (
          <li key={k}>
            <button type="button" class="rt-step" onClick={() => flyToPoint(s.lng, s.lat, 16)}>
              <span class="rt-step-t">{s.text}</span>
              {s.distance > 0 && <small class="num">{formatDistance(s.distance)}</small>}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Route planner in the detail menu: mode, stops, result with turn list, saved routes. */
export function RoutePanel() {
  const mode = routeMode.value;
  const routes = savedRoutes.value;
  const any = stops.value.some((s) => s);
  return (
    <Panel as="section" class="hudd rt" aria-label="Routen">
      <header class="hudd-head">
        <h2>Routen</h2>
        <span class="hudd-btns">
          <IconButton icon="close" label="Schließen" shortcut="Esc" class="hud-rbtn" onClick={() => (orteView.value = null)} />
        </span>
      </header>
      <ScrollArea class="hudd-scroll">
        <div class="rt-body">
          <div class="rt-modes" role="radiogroup" aria-label="Fortbewegung">
            {MODES.map((m) => (
              <button key={m.id} type="button" role="radio" aria-checked={mode === m.id} class="rt-mode" onClick={() => (routeMode.value = m.id as RouteMode)}>
                <Icon name={MODE_ICON[m.id]} size={16} />
                {m.label}
              </button>
            ))}
          </div>
          <ul class="rt-stops" role="list">
            {stops.value.map((_, i) => (
              <StopField key={i} i={i} />
            ))}
          </ul>
          <div class="rt-tools">
            <button type="button" class="rt-link" onClick={addStop} disabled={stops.value.length >= 6}>
              <Icon name="plus" size={14} /> Stopp
            </button>
            <button type="button" class="rt-link" onClick={swapStops}>
              <Icon name="swap" size={14} /> Tauschen
            </button>
            {any && (
              <button type="button" class="rt-link" onClick={clearRoute}>
                <Icon name="reset" size={14} /> Zurücksetzen
              </button>
            )}
          </div>
          <Result />
          {routes.length > 0 && (
            <section class="rt-saved">
              <h3 class="hud-sect">Gesicherte Routen</h3>
              <ul class="hud-rows" role="list">
                {routes.map((r) => (
                  <li key={r.id} class="rt-srow">
                    <button type="button" class="hud-row hud-row-2" onClick={() => loadRoute(r)}>
                      <span class="hud-badge">
                        <Icon name={MODE_ICON[r.mode]} size={18} />
                      </span>
                      <span class="hud-rt2">
                        <b>{r.name}</b>
                        <small class="num">
                          {formatDuration(r.duration)} · {formatDistance(r.distance)}
                        </small>
                      </span>
                    </button>
                    <IconButton icon="trash" label="Route löschen" size={15} class="rt-del" onClick={() => (savedRoutes.value = savedRoutes.peek().filter((x) => x.id !== r.id))} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </ScrollArea>
    </Panel>
  );
}
