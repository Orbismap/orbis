import { describe, expect, it } from 'vitest';
import { activeIds, activeKarte, setActiveIds, setLayerVisible, SCRATCH_ID } from '../karten/active';
import { parseHash } from '../core/url';
import { applyUrlState, currentUrlState } from './url-sync';

describe('url layers', () => {
  it('sets the active layers; the standard Karte follows from them', () => {
    applyUrlState(parseHash('#/@46.8,9.3,17z?l=stromnetz&b=satellite&g=1'));
    expect(activeIds.value).toEqual(['stromnetz']);
    expect(activeKarte.value.id).toBe('infrastruktur');
    expect(activeKarte.value.layers.find((l) => l.id === 'stromnetz')?.visible).toBe(true);
    // a basemap in a link is for this session
    expect(activeKarte.value.basemap).toBe('satellite');
  });
  it('drops unknown layers', () => {
    applyUrlState(parseHash('#/?l=gibt-es-nicht'));
    expect(activeIds.value).toEqual([]);
  });
  it('an old link with k= and no layers opens that standard Karte', () => {
    setActiveIds([]);
    applyUrlState(parseHash('#/?k=wetter'));
    expect(activeIds.value).toContain('radar');
    expect(activeKarte.value.id).toBe('wetter');
  });
  it('writes only the active layers, no Karte and no basemap', () => {
    setActiveIds(['erdbeben', 'radar']);
    const u = currentUrlState();
    expect(u.layers).toEqual(['erdbeben', 'radar']);
    expect(u.karte).toBeUndefined();
    expect(u.basemap).toBeUndefined();
    setActiveIds([]);
    expect(currentUrlState().layers).toBeUndefined();
  });
});

describe('shared own Karte', () => {
  it('opening the link creates the own Karte once and opens it', () => {
    const h = '#/?m=Geteilt,cloud,72C8F0&l=erdbeben,radar';
    applyUrlState(parseHash(h));
    expect(activeKarte.value.name).toBe('Geteilt');
    expect(activeKarte.value.layers.filter((l) => l.visible).map((l) => l.id)).toEqual(['erdbeben', 'radar']);
    const id = activeKarte.value.id;
    applyUrlState(parseHash(h));
    expect(activeKarte.value.id).toBe(id);
  });
});

describe('derived Karte', () => {
  it('is the unsaved Karte while a layer belongs to no standard Karte', () => {
    setActiveIds(['radar']);
    expect(activeKarte.value.id).toBe('wetter');
    setLayerVisible('wetter', 'radar-de', true);
    expect(activeKarte.value.id).toBe(SCRATCH_ID);
    expect(activeKarte.value.layers.filter((l) => l.visible).map((l) => l.id)).toEqual(['radar-de', 'radar']);
    setLayerVisible(SCRATCH_ID, 'radar-de', false);
    expect(activeKarte.value.id).toBe('wetter');
  });
});
