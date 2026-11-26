import { describe, expect, it } from 'vitest';
import { nextPages, type OpenPage, type PageEntry } from './page-stack';
import type { SheetDetent } from './ui';

/** Plays a sequence of "these pages are open now" and returns the pages and the height after each step. */
function play(start: SheetDetent, ...steps: OpenPage[][]) {
  let stack: PageEntry[] = [];
  let detent = start;
  return steps.map((open) => {
    ({ stack, detent } = nextPages(stack, open, detent));
    return `${stack.map((p) => p.id).join('>') || 'list'} ${detent}`;
  });
}

const catalog: OpenPage = { id: 'catalog', key: 'catalog' };
const settings: OpenPage = { id: 'settings', key: 'settings' };
const routes: OpenPage = { id: 'routes', key: 'routes' };
const search: OpenPage = { id: 'search', key: 'search' };
const at = (key: string): OpenPage => ({ id: 'select', key });

describe('nextPages', () => {
  it('opens a selection at half and lowers the sheet again when it is closed', () => {
    expect(play('peek', [at('a')], [])).toEqual(['select half', 'list peek']);
  });

  it('goes back exactly one page, to the height that page was left at', () => {
    expect(play('half', [catalog], [catalog, at('a')], [catalog], [])).toEqual(['catalog full', 'catalog>select half', 'catalog full', 'list half']);
  });

  it('keeps the order in which the pages came, whatever order the state names them in', () => {
    expect(play('peek', [routes], [at('a'), routes], [routes])).toEqual(['routes half', 'routes>select half', 'routes half']);
  });

  it('takes a second object in place of the first and still leads back to where it began', () => {
    expect(play('peek', [at('a')], [at('b')], [])).toEqual(['select half', 'select half', 'list peek']);
  });

  it('turns the search into the place picked in it', () => {
    expect(play('peek', [search], [at('a')], [])).toEqual(['search full', 'select half', 'list peek']);
  });

  it('replaces the catalog with the settings and returns to the list', () => {
    expect(play('half', [catalog], [settings], [])).toEqual(['catalog full', 'settings full', 'list half']);
  });

  it('does not raise a sheet that was lowered meanwhile', () => {
    const opened = nextPages([], [catalog], 'half');
    expect(nextPages(opened.stack, [], 'peek').detent).toBe('peek');
  });

  it('does not raise a sheet that was pulled up and then closed', () => {
    const opened = nextPages([], [at('a')], 'peek');
    expect(nextPages(opened.stack, [], 'full').detent).toBe('peek');
  });

  it('closes all pages at once, back to the height before the first', () => {
    expect(play('peek', [catalog], [catalog, at('a')], [])).toEqual(['catalog full', 'catalog>select half', 'list peek']);
  });

  it('leaves the height alone when a page below the top goes', () => {
    expect(play('peek', [routes], [routes, at('a')], [at('a')])).toEqual(['routes half', 'routes>select half', 'select half']);
  });
});
