import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { OrbisLogo } from '../brand/OrbisLogo';
import { PROJECTS, projectUrl, type ProjectId } from './projects';
import './orbis-hud.css';

const PanelIcon = () => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true">
    <path d="M4.5 3.5h11A1.5 1.5 0 0 1 17 5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 15V5a1.5 1.5 0 0 1 1.5-1.5zM8 3.5v13" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
  </svg>
);

export interface OrbisHudProps {
  /** The app this menu belongs to – sets the name in the header and the capsule. */
  project: ProjectId;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Content of the menu panel below the header: the only part that differs between apps. */
  children: ComponentChildren;
  /** Extra class on the panel, for app-specific rules. */
  panelClass?: string;
  /** Extra class on the root, for app-specific rules. */
  rootClass?: string;
  /** Sits inside the sliding menu wrapper after the panel (resize grip). */
  mainExtra?: ComponentChildren;
  /** A further capsule beside the closed menu (see HudPill). */
  beside?: ComponentChildren;
  /** Rendered next to the menu (detail panels); stays when the menu is hidden. */
  aside?: ComponentChildren;
  /** `fixed` to the viewport instead of absolute in its parent. */
  fixed?: boolean;
  style?: JSX.CSSProperties;
}

/**
 * The left menu shared by all Orbis apps: glass panel with logo, app name and hide button, and – when hidden – the
 * capsule that slides down in its place. A click on the logo (header or capsule) opens the list of the other Orbis apps.
 */
export function OrbisHud({ project, open, onOpenChange, children, panelClass, rootClass, mainExtra, beside, aside, fixed, style }: OrbisHudProps) {
  const name = PROJECTS.find((p) => p.id === project)?.name ?? '';
  const capsule = <Capsule project={project} name={name} hidden={open} onShow={() => onOpenChange(true)} />;
  return (
    <div class={['ohud', rootClass].filter(Boolean).join(' ')} data-main={open ? 'open' : 'closed'} data-fixed={fixed ? 'true' : undefined} style={style}>
      <div class="ohud-main" {...(open ? {} : ({ inert: '' } as object))}>
        <section class={['ohud-panel', panelClass].filter(Boolean).join(' ')} aria-label={`Orbis ${name}`}>
          <Header project={project} name={name} onHide={() => onOpenChange(false)} />
          {children}
        </section>
        {mainExtra}
      </div>
      {aside}
      {beside ? <div class="ohud-minirow" {...(open ? ({ inert: '' } as object) : {})}>{capsule}{beside}</div> : capsule}
    </div>
  );
}

const Chevron = () => (
  <svg class="ohud-chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
  </svg>
);

/** A capsule with the look of the closed menu that opens something of the app's own; for `beside`. */
export function HudPill({ icon, label, title, expanded, onClick }: { icon: ComponentChildren; label: string; /** what a screen reader says */ title: string; expanded: boolean; onClick: () => void }) {
  return (
    <div class="ohud-mini ohud-pill">
      <div class="ohud-mini-bar">
        <button type="button" class="ohud-mini-title" aria-haspopup="dialog" aria-expanded={expanded} aria-label={title} onClick={onClick}>
          {icon}
          <span class="ohud-name">{label}</span>
          <Chevron />
        </button>
      </div>
    </div>
  );
}

/** Closes a popup on Escape or a press outside of `root`. */
function useDismiss(root: { current: HTMLElement | null }, active: boolean, close: () => void) {
  useEffect(() => {
    if (!active) return;
    const onPointer = (e: PointerEvent) => !root.current?.contains(e.target as Node) && close();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [active]);
}

/** The Orbis apps; the current one is marked. `shown` keeps the links out of the tab order while collapsed. */
function ProjectList({ project, shown, close }: { project: ProjectId; shown: boolean; close: () => void }) {
  return (
    <ul>
      {PROJECTS.map((p) => (
        <li key={p.id}>
          <a href={projectUrl(p.id)} class="ohud-proj" aria-current={p.id === project ? 'page' : undefined} tabIndex={shown ? 0 : -1} onClick={(e) => (p.id === project ? (e.preventDefault(), close()) : undefined)}>
            {p.icon()}
            <span>{p.name}</span>
            {p.id === project && (
              <svg class="ohud-check" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path d="m3.5 8.5 3 3 6-7" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** Menu header: logo left, app name centred; a click on either drops down the list of Orbis apps. */
function Header({ project, name, onHide }: { project: ProjectId; name: string; onHide: () => void }) {
  const [switcher, setSwitcher] = useState(false);
  const root = useRef<HTMLElement>(null);
  useDismiss(root, switcher, () => setSwitcher(false));
  return (
    <header class="ohud-head" ref={root} data-switcher={switcher ? 'open' : 'closed'}>
      <h1>
        <button type="button" class="ohud-head-title" aria-haspopup="true" aria-expanded={switcher} aria-label={`Orbis ${name} – Apps wechseln`} onClick={() => setSwitcher(!switcher)}>
          <OrbisLogo height={22} />
          <span class="ohud-name">{name}</span>
        </button>
      </h1>
      <button type="button" class="ohud-btn" aria-label="Menü ausblenden" aria-keyshortcuts="Meta+B Control+B" onClick={onHide}>
        <PanelIcon />
      </button>
      <div class="ohud-drop" aria-hidden={!switcher}>
        <ProjectList project={project} shown={switcher} close={() => setSwitcher(false)} />
      </div>
    </header>
  );
}

/** Closed state: logo + app name + "show menu". The logo area grows downward into the list of Orbis apps. */
function Capsule({ project, name, hidden, onShow }: { project: ProjectId; name: string; hidden: boolean; onShow: () => void }) {
  const [switcher, setSwitcher] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useDismiss(root, switcher, () => setSwitcher(false));
  useEffect(() => {
    if (hidden) setSwitcher(false);
  }, [hidden]);

  return (
    <div class="ohud-mini" ref={root} data-switcher={switcher ? 'open' : 'closed'} {...(hidden ? ({ inert: '' } as object) : {})} aria-label={`Orbis ${name}`}>
      <div class="ohud-mini-bar">
        <button type="button" class="ohud-mini-title" aria-haspopup="true" aria-expanded={switcher} aria-label="Orbis Apps" onClick={() => setSwitcher(!switcher)}>
          <OrbisLogo height={19} />
          <span class="ohud-name">{name}</span>
          <Chevron />
        </button>
        <button type="button" class="ohud-btn" aria-label="Menü einblenden" aria-keyshortcuts="Meta+B Control+B" onClick={onShow}>
          <PanelIcon />
        </button>
      </div>
      <div class="ohud-switch" aria-hidden={!switcher}>
        <ProjectList project={project} shown={switcher} close={() => setSwitcher(false)} />
      </div>
    </div>
  );
}
