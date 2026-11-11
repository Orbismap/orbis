import { computed } from '@preact/signals';
import { activeKarte } from '../state/session';
import { feedEntries } from '../features/feed/Feed';
import { Feed } from '../features/feed/Feed';
import { Catalog } from '../features/catalog/Catalog';
import { LayersList } from '../features/layers-panel/LayersList';
import { SettingsView } from '../features/settings/Settings';
import { leftTab, leftView, isMobile } from '../state/ui';
import { Button } from '../ui/Button';
import { Segmented } from '../ui/Segmented';
import { ScrollArea } from '../ui/ScrollArea';
import { formatCompact } from '../core/format';

const visibleCount = computed(() => activeKarte.value.layers.filter((l) => l.visible).length);

function Tabs() {
  const tab = leftTab.value;
  const mobile = isMobile.value;
  const n = feedEntries.value.length;
  return (
    <div class="ltabs">
      <Segmented
        aria-label="Ansicht"
        size="md"
        value={tab}
        onChange={(v) => (leftTab.value = v)}
        options={[
          { value: 'layers', label: <>Ebenen <span class="ltab-n num">{visibleCount.value}</span></> },
          { value: 'feed', label: <>Aktuell {n ? <span class="ltab-n num">{formatCompact(n)}</span> : null}</> },
        ]}
      />
      {mobile && (
        <Button class="ltabs-add" variant="secondary" icon="plus" onClick={() => (leftView.value = 'catalog')}>
          Hinzufügen
        </Button>
      )}
    </div>
  );
}

/** Content of the left panel / sheet: layers, feed, catalog or settings. */
export function LeftBody() {
  const view = leftView.value;
  if (view === 'catalog') return <Catalog />;
  if (view === 'settings')
    return (
      <ScrollArea class="lbody">
        <SettingsView />
      </ScrollArea>
    );
  return (
    <>
      <Tabs />
      {leftTab.value === 'feed' ? (
        <Feed />
      ) : (
        <ScrollArea class="lbody">
          <LayersList />
        </ScrollArea>
      )}
    </>
  );
}
