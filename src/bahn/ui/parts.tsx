// Bausteine der Oberfläche: Kopf, Knöpfe, Chips, Listen und die Zustände Laden, Leer und Fehler.
import type { ComponentChildren } from 'preact';
import { haversine } from '@/core/geo';
import { formatAge } from '@/core/format';
import type { Stop } from '../data/types';
import { pop } from '../state/nav';
import { distance } from './format';
import { Icon, modeIcon, type IconName } from './icons';

export function IconButton({ icon, label, onClick, pressed, class: cls }: { icon: IconName; label: string; onClick: () => void; pressed?: boolean; class?: string }) {
  return (
    <button type="button" class={`bn-iconbtn ${pressed ? 'bn-on' : ''} ${cls ?? ''}`} aria-label={label} title={label} aria-pressed={pressed} onClick={onClick}>
      <Icon name={icon} size={22} />
    </button>
  );
}

/** Kopf einer geöffneten Seite: Zurück, Titel mit Unterzeile, Aktionen. */
export function Header({ title, subtitle, actions }: { title: ComponentChildren; subtitle?: ComponentChildren; actions?: ComponentChildren }) {
  return (
    <div class="bn-head">
      <IconButton icon="back" label="Zurück" onClick={pop} />
      <div class="bn-head-text">
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function Chip({ children, onClick, pressed, icon, expanded }: { children: ComponentChildren; onClick: () => void; pressed?: boolean; icon?: IconName; expanded?: boolean }) {
  return (
    <button type="button" class={`bn-chip ${pressed || expanded ? 'bn-on' : ''}`} aria-pressed={pressed} aria-expanded={expanded} onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  );
}

export const Section = ({ title, action, children }: { title: string; action?: ComponentChildren; children: ComponentChildren }) => (
  <section class="bn-section">
    <div class="bn-section-head"><h2>{title}</h2>{action}</div>
    {children}
  </section>
);

/** Zeile einer Liste: Symbol, Titel mit Unterzeile, rechts Zusätze. */
export function Row({ icon, title, subtitle, after, onClick }: { icon: IconName; title: ComponentChildren; subtitle?: ComponentChildren; after?: ComponentChildren; onClick: () => void }) {
  return (
    <button type="button" class="bn-row" onClick={onClick}>
      <span class="bn-row-ic"><Icon name={icon} size={20} /></span>
      <span class="bn-row-main"><b>{title}</b>{subtitle && <small>{subtitle}</small>}</span>
      {after && <span class="bn-row-after">{after}</span>}
    </button>
  );
}

export function StopRow({ stop, from, icon = 'pin', onClick }: { stop: Stop; from?: Stop | null; icon?: IconName; onClick: () => void }) {
  const away = from ? distance(haversine([from.lng, from.lat], [stop.lng, stop.lat])) : undefined;
  return (
    <Row
      icon={icon}
      title={stop.name}
      subtitle={[stop.area, away].filter(Boolean).join(' · ') || undefined}
      after={stop.modes?.slice(0, 4).map((m) => <span key={m} class={`bn-mode bn-m-${m}`}><Icon name={modeIcon(m)} size={14} /></span>)}
      onClick={onClick}
    />
  );
}

/** Platzhalter in Form der Zeilen, die gleich kommen. */
export const Skeleton = ({ rows = 4, card = false }: { rows?: number; card?: boolean }) => (
  <div role="status" aria-label="Lädt">
    {Array.from({ length: rows }, (_, i) => <div key={i} class={`bn-skel ${card ? 'bn-skel-card' : ''}`}><i /><i /></div>)}
  </div>
);

export const Empty = ({ icon, title, text, action }: { icon: IconName; title: string; text?: string; action?: ComponentChildren }) => (
  <div class="bn-empty">
    <span class="bn-empty-ic"><Icon name={icon} size={28} /></span>
    <b>{title}</b>
    {text && <p>{text}</p>}
    {action}
  </div>
);

export const ErrorState = ({ message, onRetry }: { message: string; onRetry?: () => void }) => (
  <div class="bn-error" role="alert">
    <span>{message}</span>
    {onRetry && <button type="button" class="bn-btn bn-btn-tonal" onClick={onRetry}>Erneut versuchen</button>}
  </div>
);

/** Hinweis über gespeicherten Daten: wie alt sie sind. */
export const SavedNote = ({ at, now }: { at: number; now?: number }) => <p class="bn-saved" role="status">Gespeicherte Daten · {formatAge(at, now)}</p>;
