// Phones: what the sheet shows for the page on top (state/sheet-pages.ts).
import { useLayoutEffect, useRef } from 'preact/hooks';
import { InspectorCard } from '../features/inspector/Inspector';
import { KartenChangeRow } from '../features/karten-bar/actions';
import { LayersList } from '../features/layers-panel/LayersList';
import { PlaceCard } from '../features/place/PlaceCard';
import { ProbeCard } from '../features/probe/ProbeCard';
import { RoutePanel } from '../features/routes/RoutePanel';
import { SavedPlaces } from '../features/routes/SavedPlaces';
import { SearchResults } from '../features/search/SheetSearch';
import { SheetBack } from '../features/shared/SheetNav';
import type { PageEntry } from '../state/page-stack';
import { inspector, place } from '../state/selection';
import { dismissAll } from '../state/sheet-pages';
import { IconButton } from '../ui/Button';
import { cx } from '../ui/hooks';
import { ScrollArea } from '../ui/ScrollArea';
import { sheetPanel, sheetPanelHost } from '../ui/sheet-panel';
import { LeftBody } from './LeftBody';

/** The page itself; without one, the list of the Karte. */
export function PageContent({ page }: { page: PageEntry | undefined }) {
  switch (page?.id) {
    case 'select': {
      const sel = inspector.value;
      if (sel) return <InspectorCard key={page.key} card={sel.card} layerId={sel.layerId} />;
      return place.value ? <PlaceCard key={page.key} /> : <ProbeCard key={page.key} />;
    }
    case 'routes':
      return <RoutePanel />;
    case 'places':
      return <SavedPlaces />;
    case 'search':
      return <SearchResults />;
    case 'catalog':
      return <LeftBody view="catalog" />;
    case 'settings':
      return <LeftBody view="settings" />;
    case 'layer':
      return (
        <ScrollArea class="lbody">
          <LayersList />
        </ScrollArea>
      );
    default:
      return (
        <>
          <KartenChangeRow />
          <LeftBody view="layers" />
        </>
      );
  }
}

/** The page of a panel (Popover `page`): its head, and the element the panel's content goes into. */
export function PanelPage() {
  const panel = sheetPanel.value;
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    sheetPanelHost.value = host.current;
    return () => void (sheetPanelHost.value = null);
  }, [panel?.key]);
  if (!panel) return null;
  return (
    <section key={panel.key} aria-label={panel.label}>
      <header class="sheet-bar">
        <SheetBack />
        <h2>{panel.label}</h2>
        <IconButton icon="close" label="Schließen" onClick={dismissAll} />
      </header>
      <div ref={host} class={cx('sheet-panel', panel.class)} />
    </section>
  );
}
