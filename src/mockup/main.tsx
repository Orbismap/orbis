import { render } from 'preact';
import { createPortal } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import '../ui/base.css';
import './mockup.css';
import { CATEGORIES, OBJECTS, RECENTS, type Category, type Layer, type Obj } from './data';
import { Icon, type IconName } from './icons';

/* ---------- tweakable knobs: edit DEFAULTS or use the panel bottom right ---------- */
const DEFAULTS = {
  theme: 'dark' as 'dark' | 'light',
  base: 'orbis-dark' as 'orbis-dark' | 'satellite' | 'terrain' | 'orbis-light',
  mainW: 222, // gemessen am Apple-Karten-Screenshot: 282 px bei ~1,27 px/pt
  radius: 20,
  alpha: 72,
};
type Tweaks = typeof DEFAULTS;
const DETAIL_W = 290; // fest
const GAP = 8; // fest
const MAIN_MIN = 200;
const MAIN_MAX = 480;
const KEY = 'orbis-hud-mockup-v3';

function loadTweaks(): Tweaks {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return DEFAULTS; }
}

type Sel = { kind: 'cat'; id: string } | { kind: 'obj'; id: string } | null;

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return <button class="sw" role="switch" aria-checked={on} onClick={() => onChange(!on)}><i /></button>;
}

function Badge({ icon, color, size = 28 }: { icon: IconName; color: string; size?: number }) {
  return <span class="badge" style={{ background: color, width: size, height: size }}><Icon name={icon} size={Math.round(size * 0.6)} /></span>;
}

function MainPanel({ sel, onSelect, onCollapse }: { sel: Sel; onSelect: (s: Sel) => void; onCollapse: () => void }) {
  const [q, setQ] = useState('');
  const cats = CATEGORIES.filter((c) => c.title.toLowerCase().includes(q.toLowerCase()));
  return (
    <section class="mpanel main" aria-label="Orbis Karten">
      <header class="mhead">
        <h1>Orbis Karten</h1>
        <button class="rbtn" onClick={onCollapse} aria-label="Menü ausblenden" title="Menü ausblenden"><Icon name="sidebar" size={17} /></button>
      </header>
      <label class="msearch">
        <Icon name="search" size={15} />
        <input placeholder="Suche" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
      </label>
      <div class="mscroll">
        <ul class="rows">
          {cats.map((c) => (
            <li key={c.id}>
              <button class="row" aria-current={sel?.kind === 'cat' && sel.id === c.id} onClick={() => onSelect({ kind: 'cat', id: c.id })}>
                <Badge icon={c.icon} color={c.color} />
                <span class="rt">{c.title}</span>
                <span class="chev"><Icon name="chev" size={13} /></span>
              </button>
            </li>
          ))}
          {cats.length === 0 && <li class="empty">Nichts gefunden</li>}
        </ul>
        {!q && (
          <>
            <h2 class="sect">Zuletzt</h2>
            <ul class="rows">
              {RECENTS.map((r) => (
                <li key={r.title}>
                  <button class="row" onClick={() => onSelect(r.obj ? { kind: 'obj', id: r.obj } : { kind: 'cat', id: r.cat! })}>
                    <Badge icon="clock" color="rgba(142,142,147,.9)" />
                    <span class="rt">{r.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  );
}

function Group({ children }: { children: preact.ComponentChildren }) {
  return <div class="group">{children}</div>;
}

function AddLayerSheet({ have, onAdd, onClose }: { have: Set<string>; onAdd: (l: Layer) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const all = CATEGORIES.flatMap((c) => c.layers.map((l) => ({ l, c })));
  const list = all.filter(({ l }) => l.name.toLowerCase().includes(q.toLowerCase()));
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    addEventListener('keydown', k, true);
    return () => removeEventListener('keydown', k, true);
  }, []);
  return createPortal(
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheetm" role="dialog" aria-label="Ebene hinzufügen">
        <h2>Ebene hinzufügen</h2>
        <label class="ssearch"><Icon name="search" size={17} /><input autofocus placeholder="Orbis Karten" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /></label>
        <div class="sscroll">
          <h3 class="ssect">Vorschläge</h3>
          {list.map(({ l, c }) => {
            const has = have.has(l.name);
            return (
              <div class="srow" key={c.id + l.name}>
                <Badge icon={l.icon} color={c.color} size={34} />
                <span class="gt"><b>{l.name}</b><small>{c.title} · {l.sub}</small></span>
                <button class="addc" disabled={has} aria-label={has ? 'Hinzugefügt' : 'Hinzufügen'} onClick={() => onAdd({ ...l, on: true })}><Icon name={has ? 'check' : 'plusc'} size={24} /></button>
              </div>
            );
          })}
          {list.length === 0 && <p class="empty">Nichts gefunden</p>}
        </div>
        <footer><button class="done" onClick={onClose}>Fertig</button></footer>
      </div>
    </div>,
    document.querySelector('.stage')!,
  );
}

function CatDetail({ cat, onSelect }: { cat: Category; onSelect: (s: Sel) => void }) {
  const [layers, setLayers] = useState(cat.layers);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setLayers(cat.layers); setEditing(false); setAdding(false); }, [cat.id]);
  const active = layers.filter((l) => l.on).length;
  return (
    <>
      <div class="mscroll withbar">
        <p class="lead">{cat.blurb}</p>
        <h3 class="dsect">Ebenen <span>{active} aktiv</span></h3>
        <Group>
          {layers.map((l, i) => (
            <div class="grow" key={l.name}>
              {editing && <button class="minus" aria-label="Entfernen" onClick={() => setLayers(layers.filter((_, j) => j !== i))}><Icon name="minusc" size={22} /></button>}
              <span class="gi"><Icon name={l.icon} size={18} /></span>
              <span class="gt"><b>{l.name}</b><small>{l.sub}</small></span>
              {!editing && <Switch on={l.on} onChange={(v) => setLayers(layers.map((x, j) => (j === i ? { ...x, on: v } : x)))} />}
            </div>
          ))}
          {layers.length === 0 && <div class="grow"><span class="gt"><small>Keine Ebenen</small></span></div>}
        </Group>
        {cat.now.length > 0 && (
          <>
            <h3 class="dsect">Aktuell</h3>
            <Group>
              {cat.now.map((n) => (
                <button class="grow btn" key={n.title} onClick={() => n.obj && onSelect({ kind: 'obj', id: n.obj })}>
                  <span class="gt"><b>{n.title}</b></span>
                  {n.obj && <span class="chev"><Icon name="chev" size={13} /></span>}
                </button>
              ))}
            </Group>
          </>
        )}
      </div>
      <div class="fbar">
        <button aria-label="Ebene hinzufügen" title="Ebene hinzufügen" onClick={() => setAdding(true)}><Icon name="addsq" size={21} /></button>
        <button aria-label={editing ? 'Fertig' : 'Karte bearbeiten'} title={editing ? 'Fertig' : 'Karte bearbeiten'} aria-pressed={editing} onClick={() => setEditing(!editing)}><Icon name={editing ? 'check' : 'pencil'} size={21} /></button>
      </div>
      {adding && <AddLayerSheet have={new Set(layers.map((l) => l.name))} onAdd={(l) => setLayers([...layers, l])} onClose={() => setAdding(false)} />}
    </>
  );
}

function ObjDetail({ obj }: { obj: Obj }) {
  return (
    <>
      <p class="lead">{obj.sub}</p>
      <div class="actions">
        {([['pin', 'Ansehen'], ['bell', 'Folgen'], ['share', 'Teilen']] as [IconName, string][]).map(([i, l]) => (
          <button key={l} class="abtn"><Icon name={i} size={20} /><span>{l}</span></button>
        ))}
      </div>
      <h3 class="dsect">Details</h3>
      <Group>
        {obj.stats.map(([k, v]) => (
          <div class="grow" key={k}><span class="gt"><b>{k}</b></span><span class="val">{v}</span></div>
        ))}
      </Group>
    </>
  );
}

function Detail({ sel, onClose, onSelect }: { sel: NonNullable<Sel>; onClose: () => void; onSelect: (s: Sel) => void }) {
  const cat = sel.kind === 'cat' ? CATEGORIES.find((c) => c.id === sel.id)! : null;
  const obj = sel.kind === 'obj' ? OBJECTS.find((o) => o.id === sel.id)! : null;
  const title = cat?.title ?? obj!.title;
  return (
    <section class="mpanel detail" aria-label={title} key={`${sel.kind}:${sel.id}`}>
      <header class="dhead">
        <h2>{title}</h2>
        <button class="rbtn" onClick={onClose} aria-label="Schließen"><Icon name="x" size={15} /></button>
      </header>
      {cat && <CatDetail cat={cat} onSelect={onSelect} />}
      {obj && <div class="mscroll"><ObjDetail obj={obj} /></div>}
    </section>
  );
}

function TweakPanel({ t, set }: { t: Tweaks; set: (p: Partial<Tweaks>) => void }) {
  const [open, setOpen] = useState(true);
  const seg = <K extends keyof Tweaks>(k: K, opts: [Tweaks[K], string][]) => (
    <div class="tseg">{opts.map(([v, l]) => <button key={String(v)} aria-pressed={t[k] === v} onClick={() => set({ [k]: v } as Partial<Tweaks>)}>{l}</button>)}</div>
  );
  const num = (k: 'mainW' | 'radius' | 'alpha', min: number, max: number) => (
    <input type="range" min={min} max={max} value={t[k]} onInput={(e) => set({ [k]: +(e.target as HTMLInputElement).value } as Partial<Tweaks>)} />
  );
  return (
    <aside class="mpanel tweaks" data-open={open}>
      <button class="thead" onClick={() => setOpen(!open)}><Icon name="sliders" size={15} />Experimente</button>
      {open && (
        <div class="tbody">
          <label>Thema{seg('theme', [['dark', 'Dunkel'], ['light', 'Hell']])}</label>
          <label>Karte{seg('base', [['orbis-dark', 'Dunkel'], ['orbis-light', 'Hell'], ['satellite', 'Sat'], ['terrain', 'Relief']])}</label>
          <label>Breite Leiste · {t.mainW}{num('mainW', MAIN_MIN, MAIN_MAX)}</label>
          <label>Radius · {t.radius}{num('radius', 8, 40)}</label>
          <label>Glas · {t.alpha} %{num('alpha', 30, 100)}</label>
          <button class="treset" onClick={() => set(DEFAULTS)}>Zurücksetzen</button>
        </div>
      )}
    </aside>
  );
}

function App() {
  const [t, setT] = useState<Tweaks>(loadTweaks);
  const [sel, setSel] = useState<Sel>({ kind: 'cat', id: 'wetter' });
  const [open, setOpen] = useState(true);
  const set = (p: Partial<Tweaks>) => setT((o) => {
    const n = { ...o, ...p };
    try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ }
    return n;
  });
  useEffect(() => { document.documentElement.dataset.theme = t.theme; }, [t.theme]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setSel(null); };
    addEventListener('keydown', k);
    return () => removeEventListener('keydown', k);
  }, []);

  const style = {
    '--main-w': `${t.mainW}px`, '--detail-w': `${DETAIL_W}px`, '--gap': `${GAP}px`,
    '--rad': `${t.radius}px`, '--alpha': `${t.alpha}%`,
    '--base': `url(./basemaps/${t.base}.webp)`,
  } as preact.JSX.CSSProperties;

  return (
    <div class="stage" style={style} onClick={(e) => { if ((e.target as HTMLElement).classList.contains('stage') || (e.target as HTMLElement).classList.contains('map')) setSel(null); }}>
      <div class="map">
        {OBJECTS.map((o) => (
          <button key={o.id} class="pin" data-active={sel?.kind === 'obj' && sel.id === o.id}
            style={{ left: `${o.x * 100}%`, top: `${o.y * 100}%`, '--c': o.color } as preact.JSX.CSSProperties}
            onClick={(e) => { e.stopPropagation(); setSel({ kind: 'obj', id: o.id }); }} aria-label={o.title}>
            <Icon name={o.icon} size={14} />
          </button>
        ))}
      </div>
      <div class="hud" data-main={open ? 'open' : 'closed'}>
        <div class="mainwrap">
          <MainPanel sel={sel} onSelect={setSel} onCollapse={() => setOpen(false)} />
          <div class="grip" role="separator" aria-orientation="vertical" aria-label="Breite ändern" title="Ziehen, um die Breite zu ändern" onDblClick={() => set({ mainW: DEFAULTS.mainW })}
            onPointerDown={(e) => {
              const el = e.currentTarget as HTMLElement;
              el.setPointerCapture(e.pointerId);
              const x0 = e.clientX, w0 = t.mainW;
              el.dataset.drag = 'true';
              const move = (ev: PointerEvent) => set({ mainW: Math.round(Math.min(MAIN_MAX, Math.max(MAIN_MIN, w0 + ev.clientX - x0))) });
              const up = () => { delete el.dataset.drag; el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
              el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
            }} />
        </div>
        {sel && <Detail sel={sel} onClose={() => setSel(null)} onSelect={setSel} />}
      </div>
      {!open && (
        <div class="mpanel minihead">
          <h1>Orbis Karten</h1>
          <button class="rbtn" onClick={() => setOpen(true)} aria-label="Menü einblenden" title="Menü einblenden"><Icon name="sidebar" size={17} /></button>
        </div>
      )}
      <TweakPanel t={t} set={set} />
    </div>
  );
}

render(<App />, document.getElementById('app')!);
