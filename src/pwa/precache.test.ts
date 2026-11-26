import { describe, expect, it } from 'vitest';
import { precacheUrls } from './precache';

describe('precacheUrls', () => {
  it('setzt alle Dateien unter den Basis-Pfad, die Seite als den Pfad selbst', () => {
    expect(precacheUrls('/wetter/', ['index.html', 'assets/index-a1b2.js', 'assets/index-c3d4.css', 'moon/moonPhase0.png'])).toEqual([
      '/wetter/',
      '/wetter/assets/index-a1b2.js',
      '/wetter/assets/index-c3d4.css',
      '/wetter/moon/moonPhase0.png',
    ]);
  });

  it('normalisiert fehlende Slashes und doppelte Dateien', () => {
    expect(precacheUrls('wetter', ['/assets/app.js', 'assets/app.js'])).toEqual(['wetter/assets/app.js']);
  });
});
