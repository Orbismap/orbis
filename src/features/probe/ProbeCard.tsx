import { formatCoord, formatNumber } from '../../core/format';
import { sunAltitude } from '../../core/geo';
import { clearSelection, probe } from '../../state/selection';
import { getLayer } from '../../layers/registry';
import { time } from '../../state/time';
import { Button, IconButton } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { formatSelected } from '../timeline/math';
import { copyText, flyToPoint } from '../shared/map';
import { probeValues } from './values';
import '../inspector/inspector.css';
import './probe.css';

function sunPhase(alt: number): string {
  if (alt > 0) return 'Tag';
  if (alt > -6) return 'bürgerliche Dämmerung';
  if (alt > -12) return 'nautische Dämmerung';
  if (alt > -18) return 'astronomische Dämmerung';
  return 'Nacht';
}

/** Point query card: coordinate, sun position at the selected time, values of field layers. */
export function ProbeCard() {
  const p = probe.value;
  if (!p) return null;
  const t = time.value;
  const alt = sunAltitude(p.lng, p.lat, t);
  const plain = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const vals = probeValues.value;
  return (
    <article class="insp probe" aria-label="Punktabfrage">
      <header class="insp-head">
        <span class="insp-icon" style={{ ['--c' as string]: 'var(--limb)' }}>
          <Icon name="locate" size={18} />
        </span>
        <div class="insp-titles">
          <h2 class="insp-title">Punktabfrage</h2>
          <p class="insp-sub">{formatSelected(t)}</p>
        </div>
        <IconButton icon="close" label="Schließen" shortcut="Esc" onClick={clearSelection} />
      </header>
      <div class="probe-coord">
        <span class="probe-coord-v num">{formatCoord(p.lat, p.lng, 4)}</span>
        <IconButton icon="copy" label="Koordinate kopieren" onClick={() => void copyText(plain, 'Koordinate kopiert')} />
      </div>
      <dl class="insp-facts">
        <div class="insp-fact">
          <dt>Sonnenhöhe</dt>
          <dd class="num">{`${formatNumber(alt, 1)} °`}</dd>
        </div>
        <div class="insp-fact">
          <dt>Tageslicht</dt>
          <dd>{sunPhase(alt)}</dd>
        </div>
        {vals.map((v) => (
          <div class="insp-fact" key={v.layerId}>
            <dt>{getLayer(v.layerId)?.title ?? v.label}</dt>
            <dd class="num">{v.value}</dd>
          </div>
        ))}
      </dl>
      <div class="insp-actions">
        <Button variant="secondary" icon="pin" onClick={() => flyToPoint(p.lng, p.lat, 9)}>
          Hierhin fliegen
        </Button>
      </div>
    </article>
  );
}
