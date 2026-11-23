import { useRef, useState } from 'preact/hooks';
import { deleteSavedRoute, editSavedRoute, loadRoute, type SavedRoute } from '../../state/routes';
import { Icon } from '../../ui/icons/Icon';
import { Button } from '../../ui/Button';
import { MenuItem, MenuSeparator, Popover } from '../../ui/Popover';
import { formatNumber, NNBSP } from '../../core/format';
import { formatDistance } from './osrm';

const W = 56;
const PAD = 9;

/** The route line on a plain tinted tile (no map data): fitted to the tile, start green, end red. */
export function RoutePreview({ route }: { route: SavedRoute }) {
  const pts = route.coords?.length ? route.coords : route.stops.map((s) => [s.lng, s.lat] as [number, number]);
  const lat0 = pts.reduce((a, p) => a + p[1], 0) / pts.length;
  const kx = Math.cos((lat0 * Math.PI) / 180);
  const xs = pts.map((p) => p[0] * kx), ys = pts.map((p) => -p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - x0, Math.max(...ys) - y0, 1e-6);
  const k = (W - 2 * PAD) / span;
  const ox = (W - (Math.max(...xs) - x0) * k) / 2, oy = (W - (Math.max(...ys) - y0) * k) / 2;
  const at = (i: number) => `${(ox + (xs[i]! - x0) * k).toFixed(1)},${(oy + (ys[i]! - y0) * k).toFixed(1)}`;
  const line = pts.map((_, i) => at(i)).join(' ');
  const [sx, sy] = at(0).split(',');
  const [ex, ey] = at(pts.length - 1).split(',');
  return (
    <svg class="rt-prev" viewBox={`0 0 ${W} ${W}`} width={W} height={W} aria-hidden="true">
      <g stroke="currentColor" stroke-opacity="0.09" stroke-width="1">
        {[18, 36, 54].map((g) => (
          <path key={g} d={`M${g} 0V${W}M0 ${g}H${W}`} />
        ))}
      </g>
      <polyline points={line} fill="none" stroke="#fff" stroke-opacity="0.9" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
      <polyline points={line} fill="none" stroke="#2f7df6" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
      <circle cx={sx} cy={sy} r="4" fill="#3ecf8e" stroke="#fff" stroke-width="1.8" />
      <circle cx={ex} cy={ey} r="4" fill="#ff5d5d" stroke="#fff" stroke-width="1.8" />
    </svg>
  );
}

const metres = (m: number) => `${formatNumber(m, 0)}${NNBSP}m`;

/** One saved route: preview, own name, distance, climb and descent; "⋯" opens it, edits name and note, or deletes it. */
export function SavedRouteCard({ route, onOpen }: { route: SavedRoute; onOpen(): void }) {
  const [menu, setMenu] = useState<'closed' | 'menu' | 'edit'>('closed');
  const [name, setName] = useState(route.name);
  const [note, setNote] = useState(route.note ?? '');
  const anchor = useRef<HTMLLIElement>(null);
  const open = () => (loadRoute(route), onOpen());
  const close = () => setMenu('closed');
  return (
    <li class="rt-card" ref={anchor}>
      <button type="button" class="rt-card-main" onClick={open}>
        <RoutePreview route={route} />
        <span class="rt-card-t">
          <b class="rt-card-name">{route.name}</b>
          <small class="num rt-card-stats">
            <Icon name="distance" size={13} class="rt-card-ic" /> {formatDistance(route.distance)}
            {(route.ascent !== undefined || route.descent !== undefined) && ` · ↗ ${metres(route.ascent ?? 0)} · ↘ ${metres(route.descent ?? 0)}`}
          </small>
          {route.note && <small class="rt-card-note">{route.note}</small>}
        </span>
      </button>
      <button type="button" class="rt-card-more" aria-label="Aktionen für diese Route" aria-haspopup="menu" aria-expanded={menu !== 'closed'} onClick={() => setMenu(menu === 'closed' ? 'menu' : 'closed')}>
        ⋯
      </button>
      <Popover open={menu !== 'closed'} onClose={close} align="end" label="Routenaktionen" menu={menu === 'menu'} anchorRef={anchor}>
        {menu === 'menu' && (
          <>
            <MenuItem icon="route" onClick={() => (close(), open())}>
              Route
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              icon="pencil"
              onClick={() => {
                setName(route.name);
                setNote(route.note ?? '');
                setMenu('edit');
              }}
            >
              Namen und Notiz bearbeiten
            </MenuItem>
            <MenuItem icon="trash" danger onClick={() => (close(), deleteSavedRoute(route.id))}>
              Route löschen
            </MenuItem>
          </>
        )}
        {menu === 'edit' && (
          <form
            class="nameform"
            onSubmit={(e) => {
              e.preventDefault();
              editSavedRoute(route.id, { name, note });
              close();
            }}
          >
            <label class="nameform-label" for={`rt-name-${route.id}`}>
              Name
            </label>
            <input id={`rt-name-${route.id}`} class="field" value={name} maxLength={60} autoFocus onFocus={(e) => (e.currentTarget as HTMLInputElement).select()} onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)} />
            <label class="nameform-label" for={`rt-note-${route.id}`}>
              Notiz
            </label>
            <textarea id={`rt-note-${route.id}`} class="field rt-note-in" rows={3} maxLength={300} value={note} onInput={(e) => setNote((e.currentTarget as HTMLTextAreaElement).value)} />
            <div class="nameform-actions">
              <Button variant="ghost" onClick={close}>
                Abbrechen
              </Button>
              <Button variant="primary" type="submit">
                Sichern
              </Button>
            </div>
          </form>
        )}
      </Popover>
    </li>
  );
}
