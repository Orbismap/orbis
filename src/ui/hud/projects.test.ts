import { afterEach, describe, expect, it, vi } from 'vitest';
import { PROJECTS, projectUrl } from './projects';

const at = (href: string) => vi.stubGlobal('window', { location: { href } });

describe('Orbis apps', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lists the apps of the menu', () => {
    expect(PROJECTS.map((p) => p.id)).toEqual(['map', 'wetter', 'find']);
  });

  it('swaps the subdomain on the real hosts', () => {
    at('https://find.maltee.dev/?x=1#y');
    expect(projectUrl('map')).toBe('https://maps.maltee.dev/');
    expect(projectUrl('wetter')).toBe('https://wetter.maltee.dev/');
    at('https://maps.maltee.dev/');
    expect(projectUrl('find')).toBe('https://find.maltee.dev/');
  });

  it('uses the mode parameter elsewhere', () => {
    at('http://localhost:5173/?mode=find&pos=1,2');
    expect(projectUrl('wetter')).toBe('http://localhost:5173/?mode=wetter');
  });
});
