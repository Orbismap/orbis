import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createTracksChannel } from './channels';
import type { ShipSample, TrackSample } from './types';

const SRC = fileURLToPath(new URL('..', import.meta.url));

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(p);
  }
  return out;
}

/** Everything that names a module: static imports, re-exports, dynamic import() and import.meta.glob. */
const SPECIFIER = /(?:from\s+|import\s*\(\s*|import\s+|import\.meta\.glob(?:<[^>]*>)?\s*\(\s*)['"]([^'"]+)['"]/g;
const specifiers = (file: string) => [...readFileSync(file, 'utf8').matchAll(SPECIFIER)].map((m) => m[1]!);
const isPro = (spec: string) => /(^|\/)pro(\/|$)/.test(spec);

describe('the base never depends on src/pro', () => {
  // this file names the glob in its assertions, so it is not scanned itself
  const base = walk(SRC).filter((f) => !relative(SRC, f).startsWith('pro/') && relative(SRC, f) !== 'ext/ext.test.ts');

  it('no file outside src/pro imports from it, except the glob in ext/loader.ts', () => {
    const offenders: string[] = [];
    for (const f of base) {
      const rel = relative(SRC, f);
      for (const spec of specifiers(f)) {
        if (!isPro(spec)) continue;
        if (rel === 'ext/loader.ts' && spec === '../pro/index.ts') continue;
        offenders.push(`${rel}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the loader uses the lazy glob and nothing else', () => {
    const src = readFileSync(join(SRC, 'ext/loader.ts'), 'utf8');
    expect(src).toContain("import.meta.glob<{ default?: OrbisExtension; extension?: OrbisExtension }>('../pro/index.ts')");
    expect(src).not.toMatch(/eager/);
  });

  it('three.js is only imported inside src/pro', () => {
    const offenders = base.filter((f) => specifiers(f).some((s) => s === 'three' || s.startsWith('three/')));
    expect(offenders.map((f) => relative(SRC, f))).toEqual([]);
  });
});

// without the folder (a build of the base alone) there is nothing to check
describe.skipIf(!existsSync(join(SRC, 'pro')))('src/pro stays movable to its own repository', () => {
  it('imports only itself, packages, and the contract types of ext/types', () => {
    const pro = walk(join(SRC, 'pro')).filter((f) => /\.(ts|tsx)$/.test(f));
    const offenders: string[] = [];
    for (const f of pro) {
      const text = readFileSync(f, 'utf8');
      for (const m of text.matchAll(/(?:import|export)\s+(type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gs)) {
        const spec = m[2]!;
        if (!spec.startsWith('.')) continue; // a package
        const target = join(f, '..', spec);
        if (relative(join(SRC, 'pro'), target).startsWith('..')) {
          // outside the folder: only the contract, and only as a type
          if (!(relative(SRC, target) === 'ext/types' && m[1])) offenders.push(`${relative(SRC, f)}: ${spec}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

const sample = (id: string): TrackSample => ({ id, lng: 1, lat: 2, altM: 3, speedMs: 4, vrMs: 0, ground: false, heli: false, category: 'A3', emergency: false, military: false, color: '#ffd84a', label: id, t: 1 });

describe('tracks channel', () => {
  it('does not build the list while nobody listens', () => {
    const ch = createTracksChannel();
    let built = 0;
    ch.publish(() => (built++, [sample('a')]));
    ch.publish(() => (built++, [sample('b')]));
    expect(built).toBe(0);
    expect(ch.listening).toBe(false);
  });

  it('a new listener gets the latest list at once, then every publish', () => {
    const ch = createTracksChannel();
    ch.publish(() => [sample('a')]);
    const seen: string[][] = [];
    const off = ch.subscribe((items) => seen.push(items.map((i) => i.id)));
    ch.publish(() => [sample('b'), sample('c')]);
    off();
    ch.publish(() => [sample('d')]);
    expect(seen).toEqual([['a'], ['b', 'c']]);
    expect(ch.listening).toBe(false);
  });

  it('reset sends an empty list and forgets the selection', () => {
    const ch = createTracksChannel();
    ch.publish(() => [sample('a')]);
    ch.setSelectedId('a');
    const seen: number[] = [];
    ch.subscribe((i) => seen.push(i.length));
    ch.reset();
    expect(seen).toEqual([1, 0]);
    expect(ch.selectedId.value).toBeNull();
  });

  it('presenters nest: 2D is back when the last one released', () => {
    const ch = createTracksChannel();
    expect(ch.presented.value).toBe(false);
    const a = ch.present();
    const b = ch.present();
    expect(ch.presented.value).toBe(true);
    a();
    a(); // releasing twice counts once
    expect(ch.presented.value).toBe(true);
    b();
    expect(ch.presented.value).toBe(false);
  });

  it('select goes to the layer, actions are merged and versioned', () => {
    const ch = createTracksChannel();
    const picked: (string | null)[] = [];
    ch.onSelect((id) => picked.push(id));
    ch.select('a');
    ch.select(null);
    expect(picked).toEqual(['a', null]);
    const v0 = ch.actionsVersion.value;
    const h = ch.contributeActions((id) => [{ id: 'x', label: `for ${id}`, run() {} }]);
    expect(ch.actionsFor('a').map((a) => a.label)).toEqual(['for a']);
    h.changed();
    expect(ch.actionsVersion.value).toBe(v0 + 2);
    h.dispose();
    expect(ch.actionsFor('a')).toEqual([]);
  });
});

describe('generic channel', () => {
  it('carries ship samples with their own selection', () => {
    const ships = createTracksChannel<ShipSample>();
    const planes = createTracksChannel();
    const ship: ShipSample = { id: '211000000', lng: 8, lat: 54, speedMs: 5, moving: true, cls: 'cargo', color: '#4fc3f7', label: 'MMSI 211000000', t: 1 };
    ships.publish(() => [ship]);
    ships.setSelectedId('211000000');
    const seen: string[] = [];
    ships.subscribe((items) => seen.push(...items.map((i) => i.cls)));
    expect(seen).toEqual(['cargo']);
    expect(ships.selectedId.value).toBe('211000000');
    // the two channels do not share anything
    expect(planes.selectedId.value).toBeNull();
    expect(planes.listening).toBe(false);
    expect(ships.listening).toBe(true);
  });
});
