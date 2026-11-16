import { describe, expect, it } from 'vitest';
import { parseHash } from '../core/url';
import { activeKarte, setActiveKarte } from './session';
import { applyUrlState } from './url-sync';

describe('url layers without a Karte', () => {
  it('opens the standard Karte that holds the layer', () => {
    setActiveKarte('wetter');
    applyUrlState(parseHash('#/@46.8,9.3,17z?l=stromnetz&b=satellite&g=1'));
    expect(activeKarte.value.id).toBe('infrastruktur');
    expect(activeKarte.value.layers.find((l) => l.id === 'stromnetz')?.visible).toBe(true);
    expect(activeKarte.value.basemap).toBe('satellite');
  });
  it('opens nothing when no Karte has the layers', () => {
    setActiveKarte('wetter');
    applyUrlState(parseHash('#/?l=gibt-es-nicht'));
    expect(activeKarte.value.id).toBe('wetter');
  });
});
