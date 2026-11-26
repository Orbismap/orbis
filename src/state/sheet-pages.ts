// Phones: the sheet shows one page at a time, stacked over the list of the Karte. Which pages are open follows from the
// app's state; this keeps their order (state/page-stack.ts), so that "back" leads exactly one page back.
import { batch, effect, signal, untracked } from '@preact/signals';
import { closeDetail, detailPage } from '../features/layers-panel/themes-state';
import { sheetPanel } from '../ui/sheet-panel';
import { orteView } from './hud';
import { detentFor, nextPages, type OpenPage, type PageEntry, type PageId } from './page-stack';
import { clearSelection, inspector, probe } from './selection';
import { browsedKarte } from './session';
import { isMobile, leftView, searchOpen, sheetDetent } from './ui';

export const sheetPages = signal<PageEntry[]>([]);

function openPages(): OpenPage[] {
  const out: OpenPage[] = [];
  const view = leftView.value;
  if (view !== 'layers') out.push({ id: view, key: view });
  const layer = detailPage.value;
  if (layer && layer.karteId === browsedKarte.value.id) out.push({ id: 'layer', key: layer.layerId });
  const orte = orteView.value;
  if (orte) out.push({ id: orte, key: orte });
  const sel = inspector.value;
  const at = probe.value;
  if (sel) out.push({ id: 'select', key: `${sel.layerId}:${sel.card.title}` });
  else if (at) out.push({ id: 'select', key: `${at.lng.toFixed(5)},${at.lat.toFixed(5)}` });
  if (searchOpen.value) out.push({ id: 'search', key: 'search' });
  const panel = sheetPanel.value;
  if (panel) out.push({ id: 'panel', key: panel.key });
  return out;
}

function closePage(id: PageId): void {
  if (id === 'select') clearSelection();
  else if (id === 'routes' || id === 'places') orteView.value = null;
  else if (id === 'catalog' || id === 'settings') leftView.value = 'layers';
  else if (id === 'layer') closeDetail();
  else if (id === 'search') searchOpen.value = false;
  else {
    const panel = sheetPanel.peek();
    sheetPanel.value = null; // at once: the panel's component only follows with its next render
    panel?.close();
  }
}

/** One page back. */
export function goBack(): void {
  const top = sheetPages.peek().at(-1);
  if (top) batch(() => closePage(top.id));
}

/** Back to the list of the Karte. */
export function dismissAll(): void {
  batch(() => sheetPages.peek().forEach((p) => closePage(p.id)));
}

/** The close button of a card: on phones it leaves all pages, elsewhere it does what `desktop` says. */
export const closeCard = (desktop: () => void): void => (isMobile.peek() ? dismissAll() : desktop());

/** Brings a page that is already open, below another one, to the top. */
export function bringToFront(id: PageId): void {
  const stack = sheetPages.peek();
  const page = stack.find((p) => p.id === id);
  if (!page) return;
  batch(() => {
    sheetPages.value = [...stack.filter((p) => p !== page), page];
    sheetDetent.value = detentFor(id, sheetDetent.peek());
  });
}

/** Follows the state while the phone layout is shown. Returns a dispose function. */
export function startSheetPages(): () => void {
  const stop = effect(() => {
    const open = openPages();
    untracked(() => {
      const next = nextPages(sheetPages.peek(), open, sheetDetent.peek());
      batch(() => {
        const now = sheetPages.peek();
        if (next.stack.length !== now.length || next.stack.some((p, i) => p !== now[i])) sheetPages.value = next.stack;
        sheetDetent.value = next.detent;
      });
    });
  });
  return () => {
    stop();
    sheetPages.value = [];
  };
}
