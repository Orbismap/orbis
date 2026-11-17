import { addLayer, setLayerVisible } from '../../karten/store';
import { listedKarten } from '../../karten/store';
import { allLayers } from '../../layers/registry';
import { categoryById } from '../../layers/categories';
import { activeKarte, setActiveKarte } from '../../state/session';
import { updateSettings } from '../../state/settings';
import { selectPlace, setProbe } from '../../state/selection';
import { goLive } from '../../state/time';
import { isMobile, leftPanelOpen, leftView, shortcutsOpen } from '../../state/ui';
import { projection, setProjection } from '../../state/view';
import { scoreLayer, scoreText } from '../catalog/fuzzy';
import { flyToPoint } from '../shared/map';
import { mapEngine } from '../../state/ui';
import { record } from '../../state/history';
import { coordinateLabel, parseCoordinate, type Place, type Result } from './sources';

interface Command { id: string; title: string; subtitle?: string; icon: Result['icon']; words: string[]; run(): void }

const COMMANDS: Command[] = [
  { id: 'globe', title: 'Globus anzeigen', icon: 'globe', words: ['3d', 'kugel', 'erde'], run: () => setProjection('globe') },
  { id: 'flat', title: 'Flache Karte anzeigen', icon: 'map', words: ['2d', 'mercator', 'karte'], run: () => setProjection('mercator') },
  { id: 'now', title: 'Jetzt', subtitle: 'Zur aktuellen Zeit springen', icon: 'clock', words: ['live', 'zeit', 'aktuell'], run: goLive },
  { id: 'theme-dark', title: 'Thema: Dunkel', icon: 'moon', words: ['design', 'nacht'], run: () => updateSettings({ theme: 'dark' }) },
  { id: 'theme-light', title: 'Thema: Hell', icon: 'sun', words: ['design', 'tag'], run: () => updateSettings({ theme: 'light' }) },
  { id: 'theme-auto', title: 'Thema: Automatisch', icon: 'settings', words: ['design', 'system'], run: () => updateSettings({ theme: 'auto' }) },
  { id: 'add', title: 'Ebene hinzufügen', icon: 'layers', words: ['katalog', 'ebenen'], run: () => ((leftPanelOpen.value = true), (leftView.value = 'catalog')) },
  { id: 'settings', title: 'Einstellungen', icon: 'settings', words: ['einheiten', 'optionen'], run: () => ((leftPanelOpen.value = true), (leftView.value = 'settings')) },
  { id: 'keys', title: 'Tastenkürzel', icon: 'keyboard', words: ['hilfe', 'shortcuts'], run: () => (shortcutsOpen.value = true) },
];

export function placeResult(p: Place): Result {
  return {
    id: `place:${p.id}`,
    group: 'Orte',
    icon: 'pin',
    title: p.title,
    subtitle: p.subtitle,
    run: () => {
      record({ key: `s:${p.id}`, kind: 'search', title: p.title, sub: p.subtitle ?? 'Suche', icon: 'search', color: '#72C8F0', lng: p.lng, lat: p.lat, placeKind: p.kind, ...(p.bounds ? { bounds: p.bounds as [number, number, number, number] } : {}) });
      if (!isMobile.peek()) selectPlace({ id: p.id, title: p.title, subtitle: p.subtitle, lng: p.lng, lat: p.lat, kind: p.kind });
      flyToPlace(p.bounds, p.lng, p.lat);
    },
  };
}

export function flyToPlace(b: Place['bounds'], lng: number, lat: number): void {
  if (b && (b[2] - b[0] > 0.002 || b[3] - b[1] > 0.002)) mapEngine.peek()?.flyTo({ bounds: b, maxZoom: 13, padding: { top: 40, bottom: 40, left: 40, right: 40 } });
  else flyToPoint(lng, lat, 12);
}

/** Local (synchronous) results for a query: coordinates, layers, Karten, commands. */
export function localResults(q: string): Result[] {
  const out: Result[] = [];
  const query = q.trim();
  const coord = query ? parseCoordinate(query) : null;
  if (coord)
    out.push({
      id: 'coord',
      group: 'Koordinate',
      icon: 'locate',
      title: coordinateLabel(coord),
      subtitle: 'Hierhin fliegen und Punkt abfragen',
      run: () => {
        flyToPoint(coord.lng, coord.lat, 10);
        setProbe({ lng: coord.lng, lat: coord.lat });
      },
    });

  const k = activeKarte.value;
  const state = new Map(k.layers.map((l) => [l.id, l.visible]));
  const layers = allLayers()
    .map((d) => ({ d, s: scoreLayer(d, query) }))
    .filter((r) => (query ? r.s > 0 : false))
    .sort((a, b) => b.s - a.s)
    .slice(0, 6);
  for (const { d } of layers) {
    const on = state.get(d.id);
    out.push({
      id: `layer:${d.id}`,
      group: 'Ebenen',
      icon: d.icon,
      color: d.color,
      title: d.title,
      subtitle: `${categoryById(d.category).title}: ${d.summary}`,
      hint: on ? 'ausschalten' : 'einschalten',
      run: () => (state.has(d.id) ? setLayerVisible(k.id, d.id, !on) : addLayer(k.id, d.id)),
    });
  }

  const kk = listedKarten.value
    .map((x) => ({ x, s: scoreText(x.name, query, ['karte']) }))
    .filter((r) => r.s > 0 && r.x.id !== k.id)
    .sort((a, b) => b.s - a.s)
    .slice(0, 5);
  for (const { x } of kk) out.push({ id: `karte:${x.id}`, group: 'Karten', icon: x.icon, title: x.name, subtitle: 'Karte wechseln', run: () => setActiveKarte(x.id) });

  const cmds = COMMANDS.map((c) => ({ c, s: scoreText(c.title, query, [...c.words, c.subtitle ?? '']) }))
    .filter((r) => r.s > 0 && !(r.c.id === 'globe' && projection.value === 'globe') && !(r.c.id === 'flat' && projection.value === 'mercator'))
    .sort((a, b) => b.s - a.s)
    .slice(0, query ? 4 : 5);
  for (const { c } of cmds) out.push({ id: `cmd:${c.id}`, group: 'Befehle', icon: c.icon, title: c.title, subtitle: c.subtitle, run: c.run });
  return out;
}
