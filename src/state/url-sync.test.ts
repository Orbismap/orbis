import { describe, expect, it } from 'vitest';
import { parseHash } from '../core/url';
import { activeKarte, setActiveKarte } from './session';
import { detailOpen } from './hud';
import { applyUrlState, currentUrlState } from './url-sync';

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

describe('url Karte state follows the detail menu', () => {
  it('leaves k and l out when the detail menu is closed and no layer is shown', () => {
    setActiveKarte('infrastruktur');
    applyUrlState(parseHash('#/?k=infrastruktur&l='));
    detailOpen.value = false;
    const u = currentUrlState();
    expect(u.karte).toBeUndefined();
    expect(u.layers).toBeUndefined();
  });
  it('keeps k and l while the detail menu is open', () => {
    setActiveKarte('infrastruktur');
    applyUrlState(parseHash('#/?k=infrastruktur&l='));
    detailOpen.value = true;
    expect(currentUrlState().karte).toBe('infrastruktur');
    expect(currentUrlState().layers).toEqual([]);
  });
});
