// The order of the pages in the phone sheet, and how high the sheet stands with them. Pure, see state/sheet-pages.ts.
import type { SheetDetent } from './ui';

export type PageId = 'search' | 'select' | 'layer' | 'routes' | 'places' | 'catalog' | 'settings' | 'panel';
/** A page that is open; another `key` is another page (a second object, another layer). */
export interface OpenPage { id: PageId; key: string }
/** `from`: the height the sheet had before the page came. */
export interface PageEntry extends OpenPage { from: SheetDetent }

const ORDER: SheetDetent[] = ['peek', 'half', 'full'];
const lower = (a: SheetDetent, b: SheetDetent): SheetDetent => (ORDER.indexOf(a) < ORDER.indexOf(b) ? a : b);

/** The height a page needs when it comes. */
export function detentFor(id: PageId, now: SheetDetent): SheetDetent {
  if (id === 'search' || id === 'catalog' || id === 'settings') return 'full';
  if (id === 'select' || id === 'routes') return 'half'; // the map stays in view
  return now === 'peek' ? 'half' : now;
}

const same = (a: OpenPage, b: OpenPage) => a.id === b.id && a.key === b.key;

/**
 * The stack after the open pages changed: closed ones drop out, new ones go on top. Closing the page on top leads back to
 * the height the sheet had before it; a sheet moved by hand meanwhile is never raised.
 */
export function nextPages(stack: readonly PageEntry[], open: readonly OpenPage[], detent: SheetDetent): { stack: PageEntry[]; detent: SheetDetent } {
  const kept = stack.filter((e) => open.some((o) => same(o, e)));
  const top = kept[kept.length - 1];
  const gone = stack[top ? stack.indexOf(top) + 1 : 0]; // the lowest of the pages closed above what stays
  let d = detent;
  if (gone) {
    const last = stack[stack.length - 1]!;
    // untouched since the last page came: back to where it was; moved by hand: only ever down
    d = detent === detentFor(last.id, last.from) ? gone.from : lower(detent, gone.from);
  }
  const next = [...kept];
  for (const o of open) {
    if (stack.some((e) => same(o, e))) continue;
    next.push({ id: o.id, key: o.key, from: d });
    d = detentFor(o.id, d);
  }
  return { stack: next, detent: d };
}
