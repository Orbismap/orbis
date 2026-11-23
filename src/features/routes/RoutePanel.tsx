import { useEffect, useState } from 'preact/hooks';
import { orteView } from '../../state/hud';
import { activeStop, addStop, clearRoute, coordStop, isRouteSaved, removeStop, routeChoice, backfillRoute, routeMode, routeState, routeView, saveCurrentRoute, savedPlaces, savedRoutes, setStop, stops, swapStops, type Stop } from '../../state/routes';
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
import { routeCameras } from './cameras';
import { SavedRouteCard } from './SavedRouteCard';
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
      // a completed route is framed as a whole once it arrives, so no detour to the single point
      if (!stops.peek().every((x) => x)) flyToPoint(st.lng, st.lat, 11);
      // on to the next empty field; with all fields filled the focus leaves the input
      const next = stops.peek().findIndex((x) => x === null);
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('.rt-stops .rt-field input');
        if (next >= 0) inputs[next]?.focus();
        else (document.activeElement as HTMLElement | null)?.blur();
      }, 0);
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
          placeholder={`${label} suchen`}
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
        {(s || text) && <IconButton icon="close" label={`${label} leeren`} size={14} class="rt-clear" onClick={() => {
            setText('');
            // clearing the start while stops lie between: the first of them moves up to be the start
            if (i === 0 && list.length > 2) removeStop(0);
            else if (s) setStop(i, null);
          }} />}
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

/** Speed cameras on the chosen route: counts by kind (the markers are drawn on the map by the route overlay); a click on the line shows the source note. */
function CameraRow() {
  const c = routeCameras.value;
  const [open, setOpen] = useState(false);
  if (c.status === 'idle') return null;
  if (c.status === 'loading') return <p class="rt-cams-box rt-cams">Blitzer auf der Route werden gesucht</p>;
  if (c.status === 'error') return <p class="rt-cams-box rt-cams">Blitzer konnten nicht geladen werden</p>;
  const fixed = c.cameras.filter((x) => x.kind === 'fixed').length;
  const mobile = c.cameras.length - fixed;
  return (
    <section class="rt-cams-box" data-open={open}>
      <button type="button" class="rt-cams" aria-expanded={open} aria-controls="rt-cams-more" onClick={() => setOpen(!open)}>
        <span class="rt-cams-t">
        {c.cameras.length === 0 ? (
          <span>Keine Blitzer auf der Route gemeldet</span>
        ) : (
          <>
            {fixed > 0 && (
              <span class="rt-cam"><i class="rt-cam-dot" style={{ background: '#FFB020' }} />{fixed} {fixed === 1 ? 'ortsfester' : 'ortsfeste'}{mobile > 0 ? ',' : ''}</span>
            )}
            {mobile > 0 && (
              <span class="rt-cam"><i class="rt-cam-dot" style={{ background: '#E5322D' }} />{mobile} {mobile === 1 ? 'mobiler' : 'mobile'}</span>
            )}
            <span class="rt-cam">Blitzer</span>
          </>
        )}
        </span>
        <Icon name={open ? 'chevron-down' : 'chevron-right'} size={14} class="rt-cams-chev" />
      </button>
      {open && (
        <div class="rt-cams-more" id="rt-cams-more">
          {c.mobileFailed && <p>Mobile Meldungen sind gerade nicht verfügbar.</p>}
          <p>Nach OpenStreetMap und Community-Meldungen, unvollständig.</p>
        </div>
      )}
    </section>
  );
}

function Result() {
  const st = routeState.value;
  const [stepsOpen, setStepsOpen] = useState(false);
  const saved = isRouteSaved();
  if (st.status === 'idle') return null;
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
      <CameraRow />
      <button type="button" class="rt-steps-toggle" aria-expanded={stepsOpen} aria-controls="rt-steps" onClick={() => setStepsOpen(!stepsOpen)}>
        <Icon name={stepsOpen ? 'chevron-down' : 'chevron-right'} size={14} />
        Wegbeschreibung <small class="num">{route.steps.length} Schritte</small>
      </button>
      {stepsOpen && (
        <ol class="rt-steps" id="rt-steps" aria-label="Wegbeschreibung">
          {route.steps.map((s, k) => (
            <li key={k}>
              <button type="button" class="rt-step" onClick={() => flyToPoint(s.lng, s.lat, 16)}>
                <span class="rt-step-t">{s.text}</span>
                {s.distance > 0 && <small class="num">{formatDistance(s.distance)}</small>}
              </button>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

function SavedList() {
  const routes = savedRoutes.value;
  useEffect(() => void routes.forEach((r) => void backfillRoute(r)), [routes]);
  const create = () => {
    clearRoute();
    routeView.value = 'plan';
  };
  if (!routes.length) {
    return (
      <div class="rt-body rt-empty">
        <Icon name="route" size={56} />
        <h3>Eigene Route erstellen</h3>
        <p>Plane Wege zu Fuß, mit dem Rad oder dem Auto und sichere sie hier, um sie später wieder zu öffnen.</p>
        <Button variant="secondary" icon="plus" onClick={create}>
          Route erstellen
        </Button>
      </div>
    );
  }
  return (
    <div class="rt-body">
      <Button variant="primary" icon="plus" block onClick={create}>
        Neue Route
      </Button>
      <section class="rt-saved">
        <h3 class="hud-sect">Gesicherte Routen</h3>
        <ul class="rt-cards" role="list">
          {routes.map((r) => (
            <SavedRouteCard key={r.id} route={r} onOpen={() => (routeView.value = 'plan')} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function Planner() {
  const mode = routeMode.value;
  const any = stops.value.some((s) => s);
  return (
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
    </div>
  );
}

/** Route menu: a list of saved routes with "Neue Route", and the planner (mode, stops, result, collapsible turn list) behind it. */
export function RoutePanel() {
  // a route started from elsewhere (place card, map) goes straight to the planner
  const anyStop = stops.value.some((s) => s);
  useEffect(() => void (anyStop && (routeView.value = 'plan')), [anyStop]);
  const planning = routeView.value === 'plan';
  return (
    <Panel as="section" class="hudd rt" aria-label="Routen">
      <header class="hudd-head">
        {planning && <IconButton icon="chevron-left" label="Zurück zu den Routen" size={16} class="hud-rbtn" onClick={() => (clearRoute(), (routeView.value = 'list'))} />}
        <h2>{planning ? 'Neue Route' : 'Routen'}</h2>
        <span class="hudd-btns">
          <IconButton icon="close" label="Schließen" shortcut="Esc" class="hud-rbtn" onClick={() => (orteView.value = null)} />
        </span>
      </header>
      <ScrollArea class="hudd-scroll">{planning ? <Planner /> : <SavedList />}</ScrollArea>
      {planning && (
        <p class="rt-hint rt-foot" role="status">
          {stops.value[0] ? 'Klicke auf einen Weg oder eine Straße, um Punkte zu deiner Route hinzuzufügen.' : 'Klicke auf einen Weg oder eine Straße, um deinen Startpunkt hinzuzufügen.'}
        </p>
      )}
    </Panel>
  );
}
