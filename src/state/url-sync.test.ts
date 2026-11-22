import { beforeEach, describe, expect, it } from 'vitest';
import { activeIds, activeKarte, setActiveIds, setLayerVisible, SCRATCH_ID } from '../karten/active';
import { parseHash, serializeHash } from '../core/url';
import { detailOpen } from './hud';
import { leftPanelOpen } from './ui';
import { applyUrlState, currentUrlState } from './url-sync';

beforeEach(() => { detailOpen.value = false; leftPanelOpen.value = true; });

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
  it('writes only the active layers, no Karte and no basemap while the detail menu is closed', () => {
    setActiveIds(['erdbeben', 'radar']);
    const u = currentUrlState();
    expect(u.layers).toEqual(['erdbeben', 'radar']);
    expect(u.karte).toBeUndefined();
    expect(u.basemap).toBeUndefined();
    setActiveIds([]);
    expect(currentUrlState().layers).toBeUndefined();
  });
  it('keeps k= and l= together when both are in the link', () => {
    applyUrlState(parseHash('#/@53.75,11.47,6z?k=wetter&l=niederschlag&g=0'));
    expect(activeIds.value).toEqual(['niederschlag']);
    expect(detailOpen.value).toBe(true);
    const u = currentUrlState();
    expect(u.karte).toBe('wetter');
    expect(u.layers).toEqual(['niederschlag']);
    const hash = serializeHash(u);
    expect(hash).toContain('k=wetter');
    expect(hash).toContain('l=niederschlag');
    expect(hash.indexOf('k=wetter')).toBeLessThan(hash.indexOf('l=niederschlag'));
  });
  it('writes the browsed Karte while its detail menu is open, and drops it when closed', () => {
    setActiveIds(['radar']);
    detailOpen.value = true;
    expect(currentUrlState().karte).toBe('wetter');
    detailOpen.value = false;
    expect(currentUrlState().karte).toBeUndefined();
  });
  it('applies and keeps the collapsed sidebar', () => {
    applyUrlState(parseHash('#/?s=0'));
    expect(leftPanelOpen.value).toBe(false);
    expect(currentUrlState().sidebar).toBe(false);
    expect(serializeHash(currentUrlState())).toContain('s=0');
    leftPanelOpen.value = true;
    expect(currentUrlState().sidebar).toBeUndefined();
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
