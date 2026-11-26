import { formatCoord } from '../../core/format';
import { getLayer } from '../../layers/registry';
import { clearSelection, probe } from '../../state/selection';
import { Button, IconButton } from '../../ui/Button';
import { copyText, flyToPoint } from '../shared/map';
import { RouteButton } from '../routes/RouteButton';
import { closeCard } from '../../state/sheet-pages';
import { SheetBack } from '../shared/SheetNav';
import { share } from '../place/PlaceCard';
import { useReverse } from '../place/reverse';
import { probeValues } from './values';
import '../inspector/inspector.css';
import '../place/place.css';
import './probe.css';

/** Point query (long press on the map): what sits there (address or name), "in der Nähe von", coordinate and field values. */
export function ProbeCard() {
  const p = probe.value;
  if (!p) return null;
  const rev = useReverse(p.lng, p.lat);
  const plain = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const title = rev?.title ?? 'Markierter Standort';
  const sub = rev?.title ? 'Markierter Standort' : rev?.near ? `In der Nähe von ${rev.near}` : undefined;
  const lines = rev?.lines ?? [];
  return (
    <article class="insp probe place" aria-label="Markierter Standort">
      <header class="place-head">
        <SheetBack />
        <IconButton icon="share" label="Link teilen" class="place-share" onClick={() => share(title)} />
        <div class="place-titles">
          <h2 class="place-title">{title}</h2>
          {sub && <p class="place-sub">{sub}</p>}
        </div>
        <IconButton icon="close" label="Schließen" shortcut="Esc" class="place-close" onClick={() => closeCard(clearSelection)} />
      </header>
      <div class="insp-actions place-actions">
        <RouteButton title={rev?.title ?? formatCoord(p.lat, p.lng, 4)} subtitle={sub} lng={p.lng} lat={p.lat} />
        <Button variant="primary" icon="pin" onClick={() => flyToPoint(p.lng, p.lat, 12)}>
          Hinfliegen
        </Button>
        <Button variant="secondary" icon="copy" onClick={() => void copyText(plain, 'Koordinate kopiert')}>
          Koordinate
        </Button>
      </div>
      <section class="place-details">
        <h3 class="hud-sect">Details</h3>
        <dl class="insp-facts">
          {lines.length > 0 && (
            <div class="insp-fact">
              <dt>{rev?.isAddress ? 'Adresse' : 'Standort'}</dt>
              <dd>
                {lines.map((w) => (
                  <span class="place-line" key={w}>
                    {w}
                  </span>
                ))}
              </dd>
            </div>
          )}
          <div class="insp-fact">
            <dt>Koordinaten</dt>
            <dd class="num">{formatCoord(p.lat, p.lng, 5)}</dd>
          </div>
          {probeValues.value.map((v) => (
            <div class="insp-fact" key={v.layerId}>
              <dt>{getLayer(v.layerId)?.title ?? v.label}</dt>
              <dd class="num">{v.value}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
