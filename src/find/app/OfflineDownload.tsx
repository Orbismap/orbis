// "Gebiet herunterladen": the area (what the frame shows, or a city with its outline), what to take along, and how much
// space that needs.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
import { online } from '@/core/online';
import { Icon } from '@/ui/icons/Icon';
import { CATALOG } from '../data/catalog';
import { position } from '../state/sensors';
import { tilesFor, type Box, type Shape } from '../offline/area';
import { searchCities, type City } from '../offline/boundary';
import { MAX_DOWNLOAD_BYTES, MAX_TILES, estimate, estimatedBytes, type Estimate } from '../offline/download';
import { upstream } from '../offline/sources';
import { job, lastView, offlineView, startDownload, storageBroken } from '../offline/state';
import { mapSize } from './mapSize';
import { useMap } from './useMap';

/** The frame lies this many pixels inside the map (as in app.css). */
const FRAME = 20;
const ENTRIES = CATALOG.flatMap((g) => g.entries).flatMap((e) => (e.kind ? [{ id: e.kind.id, name: e.name }] : []));

const outlineData = (shape: Shape | null): GeoJSON.FeatureCollection => ({
  type: 'FeatureCollection',
  features: shape?.type === 'outline' ? [{ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: shape.polygons } }] : [],
});

function frameOf(m: MlMap): Box {
  const { clientWidth: w, clientHeight: h } = m.getContainer();
  const a = m.unproject([FRAME, h - FRAME]), b = m.unproject([w - FRAME, FRAME]);
  const round = (v: number) => Math.round(v * 1e5) / 1e5;
  return [round(a.lng), round(a.lat), round(b.lng), round(b.lat)];
}

export function OfflineDownload() {
  const [mode, setMode] = useState<'view' | 'city'>('view');
  const [frame, setFrame] = useState<Box | null>(null);
  const [city, setCity] = useState<City | null>(null);
  const [kinds, setKinds] = useState<string[]>(() => ENTRIES.map((e) => e.id));
  const [name, setName] = useState('');
  const map = useRef<MlMap | null>(null);

  const start = useMemo(() => {
    const view = lastView.peek();
    if (view) return { center: [(view[0] + view[2]) / 2, (view[1] + view[3]) / 2] as [number, number], zoom: 13 };
    const p = position.peek();
    return p ? { center: [p.lng, p.lat] as [number, number], zoom: 13 } : { center: [10.4, 51.1] as [number, number], zoom: 5 };
  }, []);

  const { host, failed } = useMap(start, (_ml, m, cleanup) => {
    map.current = m;
    m.addSource('area', { type: 'geojson', data: outlineData(null) });
    m.addLayer({ id: 'area-fill', type: 'fill', source: 'area', paint: { 'fill-color': '#72c8f0', 'fill-opacity': 0.14 } });
    m.addLayer({ id: 'area-line', type: 'line', source: 'area', paint: { 'line-color': '#72c8f0', 'line-width': 2.5 } });
    const take = () => setFrame(frameOf(m));
    m.on('moveend', take);
    m.on('resize', take);
    // the view of the main map: the frame starts with the same section
    const view = lastView.peek();
    if (view) m.fitBounds([[view[0], view[1]], [view[2], view[3]]], { padding: FRAME, duration: 0 });
    take();
    cleanup.push(() => { map.current = null; });
  });

  const shape = useMemo<Shape | null>(() => (mode === 'city' ? city?.shape ?? null : frame ? { type: 'box', box: frame } : null), [mode, city, frame]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    void (m.getSource('area') as GeoJSONSource | undefined)?.setData(outlineData(mode === 'city' ? shape : null));
    if (mode === 'city' && city) m.fitBounds([[city.shape.box[0], city.shape.box[1]], [city.shape.box[2], city.shape.box[3]]], { padding: 24, duration: 400 });
  }, [mode, city]);

  const tiles = useMemo(() => (shape ? tilesFor(shape, MAX_TILES) : undefined), [shape]);
  const [size, setSize] = useState<{ of: unknown; value?: Estimate; failed?: boolean }>({ of: null });
  const [again, setAgain] = useState(0);
  const net = online.value;
  // not beside a download: together they would ask for more than four tiles at a time
  const idle = !job.value;
  useEffect(() => {
    if (!tiles || !net || !idle) return;
    const ctl = new AbortController();
    setSize({ of: tiles });
    // wait for the map to rest: every estimate reads some tiles
    const timer = setTimeout(() => {
      estimate(tiles, upstream, ctl.signal).then(
        (value) => !ctl.signal.aborted && setSize({ of: tiles, value }),
        () => !ctl.signal.aborted && setSize({ of: tiles, failed: true }),
      );
    }, 700);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
  }, [tiles, net, idle, again]);
  const known = size.of === tiles ? size.value : undefined;

  const [free, setFree] = useState<number>();
  useEffect(() => { void navigator.storage?.estimate?.().then((e) => setFree(e.quota === undefined ? undefined : e.quota - (e.usage ?? 0))); }, []);

  const total = known && estimatedBytes(known, kinds);
  const transfer = known && known.mapTransfer + kinds.reduce((sum, id) => sum + (known.kindBytes[id] ?? 0), 0);
  const tooLarge = tiles === null || (transfer !== undefined && transfer > MAX_DOWNLOAD_BYTES);
  const tooFull = total !== undefined && free !== undefined && total > free;
  const suggested = mode === 'city' && city ? city.name : 'Kartenausschnitt';
  const blocked = !net || !shape || !tiles || tooLarge || tooFull || !!job.value || storageBroken.value;

  const go = () => {
    if (blocked) return;
    void startDownload({ name: name.trim() || suggested, shape: shape!, kinds });
    offlineView.value = 'manage';
  };
  const toggle = (id: string) => setKinds((cur) => (cur.includes(id) ? cur.filter((k) => k !== id) : [...cur, id]));

  return (
    <div class="find-sheet" role="dialog" aria-modal="true" aria-labelledby="find-off-title" onKeyDown={(e) => { if (e.key === 'Escape') offlineView.value = null; }}>
      <div class="find-sheet-body">
        <header>
          <h1 id="find-off-title">Gebiet herunterladen</h1>
          <button type="button" class="find-close" aria-label="Schließen" onClick={() => (offlineView.value = null)}><Icon name="close" size={20} /></button>
        </header>
        <div class="find-tabs" role="group" aria-label="Art des Gebiets">
          <button type="button" class="find-chip" aria-pressed={mode === 'view'} onClick={() => setMode('view')}>Kartenausschnitt</button>
          <button type="button" class="find-chip" aria-pressed={mode === 'city'} onClick={() => setMode('city')}>Stadt</button>
        </div>
        {mode === 'city' && <CitySearch chosen={city} onPick={setCity} />}
        <div class="find-areamap">
          <div ref={host} class="find-map-canvas" />
          {mode === 'view' && <div class="find-frame" aria-hidden="true" />}
          {failed && <p class="find-map-failed">Die Karte kann nicht angezeigt werden.</p>}
        </div>
        <p class="find-text">{mode === 'view' ? 'Geladen wird, was im Rahmen liegt. Verschiebe und zoome die Karte.' : city ? `Geladen wird alles in der Stadtgrenze von ${city.name} (ganze Kartenkacheln).` : 'Suche eine Stadt.'}</p>

        <fieldset class="find-kinds">
          <legend>Orte, die offline suchbar sein sollen</legend>
          <div class="find-kinds-all">
            <button type="button" class="find-linkbutton" onClick={() => setKinds(ENTRIES.map((e) => e.id))}>Alle</button>
            <button type="button" class="find-linkbutton" onClick={() => setKinds([])}>Keine</button>
          </div>
          {ENTRIES.map((e) => (
            <label key={e.id}>
              <input type="checkbox" checked={kinds.includes(e.id)} onChange={() => toggle(e.id)} />
              <span>{e.name}</span>
              <small>{!known ? '' : known.kindBytes[e.id] === undefined ? 'unbekannt' : known.kindBytes[e.id] ? `ca. ${mapSize(known.kindBytes[e.id]!)}` : 'keine gefunden'}</small>
            </label>
          ))}
        </fieldset>

        <input class="find-nameinput" type="text" maxLength={60} aria-label="Name der Offline-Karte" placeholder={suggested} value={name} onInput={(e) => setName(e.currentTarget.value)} />

        <div class="find-sizebar">
          <p role="status">
            {!net ? 'Zum Herunterladen brauchst du eine Verbindung.'
              : storageBroken.value ? 'Dieser Browser erlaubt hier keinen Offline-Speicher.'
              : !idle ? 'Warte, bis der laufende Download fertig ist.'
              : !shape ? 'Noch kein Gebiet gewählt.'
              : tooLarge ? `Zu groß für einen Download (höchstens ${MAX_TILES.toLocaleString('de-DE')} Kacheln und ${mapSize(MAX_DOWNLOAD_BYTES)}). ${mode === 'view' ? 'Zoome näher heran.' : 'Lade Teile davon als Kartenausschnitt.'}`
              : total !== undefined ? <><b>ca. {mapSize(total)}</b> · {known!.tiles.toLocaleString('de-DE')} Kacheln{free !== undefined && ` · ${free > 1e9 ? `${(free / 1e9).toFixed(1).replace('.', ',')} GB` : mapSize(free)} frei`}{tooFull && ' – nicht genug Platz'}</>
              : size.failed ? 'Größe nicht ermittelbar.'
              : 'Platzbedarf wird geschätzt …'}
          </p>
          {size.failed && net && <button type="button" class="find-linkbutton" onClick={() => setAgain(again + 1)}>Erneut schätzen</button>}
          <button type="button" class="find-button" disabled={blocked} onClick={go}>{job.value ? 'Ein Download läuft schon' : 'Herunterladen'}</button>
        </div>
      </div>
    </div>
  );
}

function CitySearch({ chosen, onPick }: { chosen: City | null; onPick(city: City): void }) {
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ status: 'idle' | 'loading' | 'error' } | { status: 'ok'; cities: City[] }>({ status: 'idle' });
  const running = useRef<AbortController>();
  useEffect(() => () => running.current?.abort(), []);

  const search = (e: Event) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    running.current?.abort();
    const ctl = (running.current = new AbortController());
    setFound({ status: 'loading' });
    searchCities(q, ctl.signal).then(
      (cities) => !ctl.signal.aborted && setFound({ status: 'ok', cities }),
      () => !ctl.signal.aborted && setFound({ status: 'error' }),
    );
  };

  return (
    <>
      <form class="find-search-bar" role="search" onSubmit={search}>
        <input type="search" enterkeyhint="search" autocomplete="off" aria-label="Stadt" placeholder="Stadt, z. B. Schwerin" value={query} onInput={(e) => setQuery(e.currentTarget.value)} />
        <button type="submit" class="find-button">Suchen</button>
      </form>
      <div class="find-cities" aria-live="polite">
        {found.status === 'loading' && <p class="find-text">Suche …</p>}
        {found.status === 'error' && <p class="find-text">Die Suche ist nicht erreichbar.</p>}
        {found.status === 'ok' && !found.cities.length && <p class="find-text">Keine Stadt mit Grenze gefunden.</p>}
        {found.status === 'ok' && found.cities.length > 0 && <p class="find-text">Grenzen von Nominatim, © OpenStreetMap-Mitwirkende</p>}
        {found.status === 'ok' && found.cities.map((c) => (
          <button type="button" key={c.id} class="find-result" aria-pressed={chosen?.id === c.id} onClick={() => { onPick(c); setFound({ status: 'idle' }); }}>
            <span class="find-name">{c.name}</span>
            <span class="find-text">{c.detail}</span>
          </button>
        ))}
      </div>
    </>
  );
}
