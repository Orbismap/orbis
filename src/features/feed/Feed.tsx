import { computed } from '@preact/signals';
import { formatAge, formatNumber } from '../../core/format';
import { getLayer } from '../../layers/registry';
import type { FeedItem, InspectCard } from '../../layers/types';
import { selectCard } from '../../state/selection';
import { feeds } from '../../state/session';
import { now } from '../../state/time';
import { leftView } from '../../state/ui';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/icons/Icon';
import { VirtualList } from '../../ui/VirtualList';
import { flyToPoint } from '../shared/map';
import '../layers-panel/layers-panel.css';
import './feed.css';

interface Entry { layerId: string; item: FeedItem }

/** All feed items of the visible layers, newest first (items without a time last). */
export const feedEntries = computed<Entry[]>(() => {
  const out: Entry[] = [];
  for (const [layerId, items] of Object.entries(feeds.value)) for (const item of items) out.push({ layerId, item });
  return out.sort((a, b) => (b.item.time ?? -Infinity) - (a.item.time ?? -Infinity));
});

function open(e: Entry) {
  const def = getLayer(e.layerId);
  const real = e.item.card;
  const card: InspectCard = real ?? {
    title: e.item.title,
    subtitle: e.item.subtitle,
    time: e.item.time,
    color: e.item.color ?? def?.color,
    icon: def?.icon,
    facts: [...(e.item.magnitude !== undefined ? [{ label: 'Stärke', value: formatNumber(e.item.magnitude, 1), emphasis: true }] : []), ...(def ? [{ label: 'Ebene', value: def.title }] : [])],
    location: e.item.location,
  };
  selectCard(e.layerId, card);
  flyToPoint(e.item.location[0], e.item.location[1], Math.max(5, 6));
}

export function Feed() {
  const list = feedEntries.value;
  const t = now.value;
  if (!list.length)
    return (
      <div class="lempty">
        <Icon name="clock" size={28} />
        <h3>Noch nichts Aktuelles</h3>
        <p>Hier erscheinen Ereignisse der sichtbaren Ebenen, zum Beispiel Erdbeben oder Unwetter.</p>
        <Button variant="secondary" icon="plus" onClick={() => (leftView.value = 'catalog')}>
          Ebene hinzufügen
        </Button>
      </div>
    );
  return (
    <VirtualList
      class="feed"
      label="Aktuelle Ereignisse"
      items={list}
      rowHeight={56}
      itemKey={(e) => `${e.layerId}:${e.item.id}`}
      render={(e) => {
        const def = getLayer(e.layerId);
        const color = e.item.color ?? def?.color ?? 'var(--limb)';
        return (
          <button type="button" class="frow" onClick={() => open(e)}>
            <span class="frow-icon" style={{ ['--c' as string]: color }}>
              {e.item.magnitude !== undefined ? <span class="frow-mag num">{formatNumber(e.item.magnitude, 1)}</span> : <Icon name={def?.icon ?? 'pin'} size={16} />}
            </span>
            <span class="frow-text">
              <span class="frow-title">{e.item.title}</span>
              <span class="frow-sub">{[e.item.subtitle, def?.title].filter(Boolean).join(' · ')}</span>
            </span>
            {e.item.time !== undefined && <span class="frow-time num">{formatAge(e.item.time, t)}</span>}
          </button>
        );
      }}
    />
  );
}
