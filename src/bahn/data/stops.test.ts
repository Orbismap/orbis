import { describe, expect, it } from 'vitest';
import { cleanStopName, dedupeStops, rankStops } from './stops';
import type { Stop } from './types';

const stop = (name: string, importance: number, area = 'Bad Kleinen', modes: Stop['modes'] = ['bus']): Stop => ({ id: name, name, lat: 0, lng: 0, area, importance, modes });

describe('Haltestellensuche', () => {
  it('schneidet Bahnsteige vom Namen', () => {
    expect(cleanStopName('Bad Kleinen Gl. 4')).toBe('Bad Kleinen');
    expect(cleanStopName('Hamburg Hbf, Gleis 7')).toBe('Hamburg Hbf');
    expect(cleanStopName('Kiel Hbf Bstg. B')).toBe('Kiel Hbf');
    expect(cleanStopName('Gleis 5')).toBe('Gleis 5');
  });

  it('fasst Bahnsteige einer Station zusammen', () => {
    const out = dedupeStops([stop('Bad Kleinen Gl. 1', 0.001, 'Bad Kleinen', ['regio']), stop('Bad Kleinen Gl. 4', 0.0025, 'Bad Kleinen', ['fern', 'bus'])]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ name: 'Bad Kleinen', importance: 0.0025, modes: ['fern', 'regio', 'bus'] });
  });

  it('stellt die Station mit dem größten Gewicht vor Bushaltestellen', () => {
    const out = rankStops(
      [
        stop('Bad Kleinen Schule', 0.00002),
        stop('Bad Kleinen Gl. 4', 0.0025, 'Bad Kleinen', ['fern', 'regio']),
        stop('Hoppenrade (Bad Kleinen)', 0.000001),
        stop('Kleinandelfingen, Bad', 0.00002, 'Kleinandelfingen'),
      ],
      'Bad Kleinen',
    );
    expect(out.map((s) => s.name)).toEqual(['Bad Kleinen', 'Bad Kleinen Schule', 'Hoppenrade (Bad Kleinen)', 'Kleinandelfingen, Bad']);
  });

  it('Hauptbahnhof vor Haltestelle mit exakt dem Stadtnamen', () => {
    const out = rankStops([stop('Lübeck', 0.00001, 'Lübeck'), stop('Lübeck Hbf', 0.0047, 'Lübeck', ['regio']), stop('Alt Lübeck', 0.01, 'Lübeck')], 'Lübeck');
    expect(out[0]!.name).toBe('Lübeck Hbf');
    expect(out.at(-1)!.name).toBe('Alt Lübeck');
  });

  it('versteht Hauptbahnhof und Umlaute', () => {
    const out = rankStops([stop('Köln Messe/Deutz', 0.001, 'Köln'), stop('Köln Hbf', 0.03, 'Köln')], 'koeln hauptbahnhof');
    expect(out).toHaveLength(2);
    const out2 = rankStops([stop('München Ost', 0.01, 'München'), stop('München Hbf', 0.03, 'München')], 'munchen hauptbahnhof');
    expect(out2[0]!.name).toBe('München Hbf');
  });
});
