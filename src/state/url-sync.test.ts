import { beforeEach, describe, expect, it } from 'vitest';
import { activeIds, activeKarte, setActiveIds, setBasemap, setLayerVisible, SCRATCH_ID } from '../karten/active';
import { parseHash, serializeHash } from '../core/url';
import { detailOpen } from './hud';
import { closeDetail, detailPage } from '../features/layers-panel/themes-state';
import { karteMode } from './view';
import { leftPanelOpen } from './ui';
import { applyUrlState, currentUrlState } from './url-sync';

beforeEach(() => {
  detailOpen.value = false;
  leftPanelOpen.value = true;
  setActiveIds([]);
  // a known starting point for the session-only basemap choice
  applyUrlState(parseHash('#/?b=orbis-dark'));
});

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
  it('writes the active layers and the shown basemap, no Karte while the detail menu is closed', () => {
    setActiveIds(['erdbeben', 'radar']);
    const u = currentUrlState();
    expect(u.layers).toEqual(['erdbeben', 'radar']);
    expect(u.detail).toBeUndefined();
    expect(u.basemap).toBe(activeKarte.value.basemap);
    setActiveIds([]);
    expect(currentUrlState().layers).toBeUndefined();
  });
  it('keeps k= and l= together when both are in the link', () => {
    applyUrlState(parseHash('#/@53.75,11.47,6z?k=wetter&l=niederschlag&g=0'));
    expect(activeIds.value).toEqual(['niederschlag']);
    expect(detailOpen.value).toBe(true);
    const u = currentUrlState();
    expect(u.detail).toBe('wetter');
    expect(u.layers).toEqual(['niederschlag']);
    const hash = serializeHash(u);
    expect(hash).toContain('k=wetter');
    expect(hash).toContain('l=niederschlag');
    expect(hash.indexOf('k=wetter')).toBeLessThan(hash.indexOf('l=niederschlag'));
  });
  it('writes the browsed Karte while its detail menu is open, and drops it when closed', () => {
    setActiveIds(['radar']);
    detailOpen.value = true;
    expect(currentUrlState().detail).toBe('wetter');
    detailOpen.value = false;
    expect(currentUrlState().detail).toBeUndefined();
  });
  it('k=<layer> opens that layer\'s page and is written back instead of the Karte', () => {
    applyUrlState(parseHash('#/?k=flugzeuge&l=flughafen,flugzeuge'));
    expect(detailOpen.value).toBe(true);
    expect(detailPage.value?.layerId).toBe('flugzeuge');
    expect(currentUrlState().detail).toBe('flugzeuge');
    expect(serializeHash(currentUrlState())).toContain('k=flugzeuge');
    closeDetail();
    detailOpen.value = false;
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

describe('url basemap', () => {
  it('writes the basemap on show into the hash, including the Karte default', () => {
    setActiveIds(['meerestemperatur']); // Erde & Meer brings its own satellite basemap
    expect(activeKarte.value.basemap).toBe('satellite');
    expect(serializeHash(currentUrlState())).toContain('b=satellite');

    setBasemap(activeKarte.value.id, 'orbis-light');
    const hash = serializeHash(currentUrlState());
    expect(hash).toContain('b=orbis-light');
    expect(parseHash(hash).basemap).toBe('orbis-light');
  });
  it('restores a chosen basemap from a link', () => {
    setActiveIds([]);
    applyUrlState(parseHash('#/?b=orbis-light'));
    expect(activeKarte.value.basemap).toBe('orbis-light');
  });
  it('does not pin a link basemap that is the Karte default, so layers still switch it', () => {
    setActiveIds([]);
    applyUrlState(parseHash('#/?b=orbis-dark'));
    expect(activeKarte.value.basemap).toBe('orbis-dark');
    setActiveIds(['meerestemperatur']);
    expect(activeKarte.value.basemap).toBe('satellite');
  });
  it('lands in the right picker category after a reload, derived from b=', () => {
    setActiveIds([]);
    for (const [basemap, mode] of [['orbis-karte', 'erkunden'], ['orbis-fahren', 'fahren'], ['osm', 'daten']] as const) {
      applyUrlState(parseHash(`#/?b=${basemap}`));
      expect(activeKarte.value.basemap).toBe(basemap);
      expect(karteMode.value).toBe(mode);
    }
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
