import { describe, expect, it } from 'vitest';
import { doyLabel, mainFlyway, roundKm, routeKm, speciesFacts } from './facts';
import { SPECIES, SPECIES_BY_ID } from './species';

describe('Kennzahlen der Arten', () => {
  it('Zugstrecken sind plausibel', () => {
    expect(routeKm(mainFlyway(SPECIES_BY_ID.weissstorch!))).toBeGreaterThan(4000);
    expect(routeKm(mainFlyway(SPECIES_BY_ID.kuestenseeschwalbe!))).toBeGreaterThan(14000);
    for (const sp of SPECIES) expect(speciesFacts(sp, 'winter').kmPerDay).toBeGreaterThan(10);
  });
  it('Zeitangaben und Rundung', () => {
    expect(doyLabel(233)).toBe('Ende August');
    expect(doyLabel(58)).toBe('Ende Februar');
    expect(roundKm(4280)).toBe('4 300');
  });
  it('als Nächstes: je nach Phase', () => {
    const sp = SPECIES_BY_ID.kranich!;
    expect(speciesFacts(sp, 'winter').next.label).toBe('Aufbruch');
    expect(speciesFacts(sp, 'herbst').next.label).toBe('Ankunft');
  });
});
