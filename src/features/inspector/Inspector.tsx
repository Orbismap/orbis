import { formatAge, formatCoord, formatDateTime } from '../../core/format';
import type { InspectCard } from '../../layers/types';
import { clearSelection } from '../../state/selection';
import { closeCard } from '../../state/sheet-pages';
import { SheetBack } from '../shared/SheetNav';
import { now } from '../../state/time';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { copyText, flyToPoint } from '../shared/map';
import { RouteButton } from '../routes/RouteButton';
import { Media } from './Media';
import './inspector.css';

/** Inspector card for a selected map object. */
export function InspectorCard({ card, layerId }: { card: InspectCard; layerId: string }) {
  const hero = card.facts.filter((f) => f.emphasis);
  const rest = card.facts.filter((f) => !f.emphasis);
  const share = () => void copyText(location.href, 'Link kopiert');
  return (
    <article class="insp" aria-label={card.title} data-layer={layerId}>
      <header class="insp-head">
        {!card.backLabel && <SheetBack />}
        {card.backLabel ? (
          <IconButton icon="chevron-left" label={card.backLabel} onClick={clearSelection} />
        ) : (
          <span class="insp-icon" style={{ ['--c' as string]: card.color ?? 'var(--limb)' }}>
            <Icon name={card.icon ?? 'pin'} size={18} />
            {card.logo && <img class="insp-logo" src={card.logo} alt="" loading="lazy" referrerpolicy="no-referrer" onError={(e) => { e.currentTarget.style.display = 'none'; }} />}
          </span>
        )}
        <div class="insp-titles">
          <h2 class="insp-title">{card.title}</h2>
          {card.subtitle && <p class="insp-sub">{card.subtitle}</p>}
        </div>
        <IconButton icon="close" label="Schließen" shortcut="Esc" onClick={() => closeCard(clearSelection)} />
      </header>
      {card.time !== undefined && (
        <p class="insp-time num">
          <Icon name="clock" size={14} />
          <time dateTime={new Date(card.time).toISOString()}>{formatDateTime(card.time)}</time>
          <span class="insp-age">{formatAge(card.time, now.value)}</span>
        </p>
      )}
      {hero.length > 0 && (
        <div class="insp-hero">
          {hero.map((f) => (
            <div key={f.label} class="insp-big">
              <span class="insp-big-v num">{f.value}</span>
              <span class="insp-big-l">{f.label}</span>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <dl class="insp-facts">
          {rest.map((f) => (
            <div key={f.label} class="insp-fact">
              <dt>{f.label}</dt>
              <dd>{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {card.text && <p class="insp-text">{card.text}</p>}
      {card.media && <Media media={card.media} title={card.title} />}
      {card.links && card.links.length > 0 && (
        <ul class="insp-links" role="list">
          {card.links.map((l) => (
            <li key={l.url}>
              <a href={l.url} target="_blank" rel="noopener noreferrer">
                {l.label}
                <Icon name="external" size={14} />
              </a>
            </li>
          ))}
        </ul>
      )}
      {card.location && (
        <p class="insp-coord num">{formatCoord(card.location[1], card.location[0])}</p>
      )}
      <div class="insp-actions">
        {card.location && <RouteButton title={card.title} lng={card.location[0]} lat={card.location[1]} />}
        {card.actions?.map((a) => (
          <Button key={a.id} variant={a.active ? 'primary' : 'secondary'} icon={a.icon} aria-pressed={a.active} onClick={a.run}>
            {a.label}
          </Button>
        ))}
        {card.location && (
          <Button variant="secondary" icon="pin" onClick={() => flyToPoint(card.location![0], card.location![1], 9)}>
            Hierhin fliegen
          </Button>
        )}
        <Button variant="ghost" icon="share" onClick={share}>
          Teilen
        </Button>
      </div>
    </article>
  );
}
