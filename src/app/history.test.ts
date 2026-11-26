import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sheetDetent } from '../state/ui';
import { startSheetHistory } from './history';

/** A history with entries; `back()` moves and fires `popstate` at once. */
function fakeBrowser(url: string) {
  const entries = [{ url, state: null as unknown }];
  let i = 0;
  const pops = new Set<() => void>();
  vi.stubGlobal('addEventListener', (_: string, fn: () => void) => pops.add(fn));
  vi.stubGlobal('removeEventListener', (_: string, fn: () => void) => pops.delete(fn));
  const history = {
    get state() {
      return entries[i]!.state;
    },
    pushState(state: unknown) {
      entries.splice(i + 1, entries.length, { url: entries[i]!.url, state });
      i++;
    },
    replaceState(state: unknown, _title: string, next?: string) {
      entries[i] = { url: next ?? entries[i]!.url, state };
    },
    back() {
      if (i === 0) return;
      i--;
      for (const fn of [...pops]) fn();
    },
  };
  vi.stubGlobal('history', history);
  /** A link that changes the hash: a new entry without state, and `popstate`. */
  const follow = (next: string) => {
    entries.splice(i + 1, entries.length, { url: next, state: null });
    i++;
    for (const fn of [...pops]) fn();
  };
  return { history, follow, url: () => entries[i]!.url, depth: () => i };
}

describe('startSheetHistory', () => {
  beforeEach(() => (sheetDetent.value = 'peek'));
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the state changed in the open sheet when the sheet is lowered', () => {
    const b = fakeBrowser('#old');
    let now = '#old';
    const stop = startSheetHistory(() => now);
    sheetDetent.value = 'half';
    now = '#new';
    b.history.replaceState(b.history.state, '', now); // the URL writer
    sheetDetent.value = 'peek';
    expect(b.depth()).toBe(0);
    expect(b.url()).toBe('#new');
    stop();
  });

  it('leaves a link that only changes the hash alone', () => {
    const b = fakeBrowser('#old');
    const stop = startSheetHistory(() => '#current');
    sheetDetent.value = 'half';
    b.follow('#linked');
    expect(b.url()).toBe('#linked');
    expect(sheetDetent.value).toBe('half');
    stop();
  });

  it('lowers the sheet by one detent per back press, with the current URL', () => {
    const b = fakeBrowser('#old');
    const stop = startSheetHistory(() => '#new');
    sheetDetent.value = 'full';
    b.history.back();
    expect(sheetDetent.value).toBe('half');
    expect(b.depth()).toBe(1);
    b.history.back();
    expect(sheetDetent.value).toBe('peek');
    expect(b.depth()).toBe(0);
    expect(b.url()).toBe('#new');
    stop();
  });
});
