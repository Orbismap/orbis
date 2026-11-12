// Daily figures for Gaza and the West Bank (Tech for Palestine, Public Domain): two markers whose card shows the
// cumulative figures on the selected day.
import { signal } from '@preact/signals';
import type { FeatureCollection, Point } from 'geojson';
import { formatDate, formatInt } from '../../core/format';
import { DAY } from '../../core/time';
import { rowAt, type GazaDay, type WestBankDay } from '../../data/parsers/gaza';
import { ZEUGEN_WARNUNG } from '../../data/parsers/zeitzeugen';
import { pointLayer } from '../../render/points';
import type { AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#E0E0E0';
const T4P = 'https://data.techforpalestine.org/api/';
const FIRST = Date.UTC(2023, 9, 7);
const SITES: FeatureCollection<Point, { id: string; name: string }> = {
  type: 'FeatureCollection',
  features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [34.42, 31.42] }, properties: { id: 'gaza', name: 'Gazastreifen' } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [35.25, 31.95] }, properties: { id: 'wb', name: 'Westjordanland' } },
  ],
};
const n = (v: number | undefined) => (v == null ? 'k. A.' : formatInt(v));

export default defineLayer({
  id: 'gaza-lage',
  category: 'gesellschaft',
  title: 'Gaza: Tageszahlen',
  summary: 'Gemeldete Getötete und Verletzte in Gaza und im Westjordanland am gewählten Tag',
  icon: 'warning',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  coverage: 'Gaza, Westjordanland',
  sources: [
    { name: 'Tech for Palestine (Gesundheitsministerium Gaza; UN OCHA für das Westjordanland)', url: 'https://data.techforpalestine.org/', license: 'Public Domain' },
  ],
  sensitive: ZEUGEN_WARNUNG,
  time: { mode: 'window', range: () => ({ start: FIRST - Date.now(), end: 0, step: DAY }) },
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Marker: Klick zeigt die Zahlen des gewählten Tages' }] },
  keywords: ['gaza', 'westjordanland', 'tote', 'getötete', 'zahlen', 'gesundheitsministerium', 'zeitzeugen', 'palästina'],

  mount(ctx) {
    const gaza = ctx.resource<GazaDay[]>({ key: 't4p:casualties', url: `${T4P}v2/casualties_daily.json`, timeout: 40_000 });
    const wb = ctx.resource<WestBankDay[]>({ key: 't4p:westbank', url: `${T4P}v2/west_bank_daily.json`, timeout: 40_000 });
    const data = signal(SITES);
    return pointLayer(ctx, {
      data,
      resources: [gaza, wb],
      count: signal(2),
      radius: ['interpolate', ['linear'], ['zoom'], 2, 6, 8, 11] as never,
      color: COLOR,
      stroke: { color: 'rgba(20,20,20,0.9)', width: 1.5 },
      describe: (f: AnyFeature) => {
        const id = String(f.properties?.id);
        const t = ctx.time.peek();
        if (id === 'gaza') {
          const r = rowAt(gaza.data.value, t);
          const killed = r?.ext_killed_cum ?? r?.killed_cum;
          return {
            title: 'Gazastreifen: Zahlen',
            subtitle: r ? `Meldungen seit 7. Oktober 2023, Stand ${formatDate(Date.parse(`${r.report_date}T12:00:00Z`))}` : 'Keine Meldung bis zu diesem Tag',
            time: r ? Date.parse(`${r.report_date}T12:00:00Z`) : undefined,
            color: COLOR,
            icon: 'warning',
            facts: r ? [
              { label: 'Getötete (kumuliert)', value: n(killed), emphasis: true },
              { label: 'Verletzte (kumuliert)', value: n(r.ext_injured_cum ?? r.injured_cum) },
              { label: 'davon Kinder', value: n(r.ext_killed_children_cum) },
              { label: 'davon Frauen', value: n(r.ext_killed_women_cum) },
              { label: 'Medizinisches Personal', value: n(r.ext_med_killed_cum) },
              { label: 'Journalistinnen und Journalisten', value: n(r.ext_press_killed_cum) },
              { label: 'Zivilschutz', value: n(r.ext_civdef_killed_cum) },
            ] : [],
            text: 'Zahlen des Gesundheitsministeriums in Gaza; Vermisste und Verschüttete sind nicht vollständig erfasst.',
            links: [{ label: 'Tech for Palestine (Public Domain)', url: 'https://data.techforpalestine.org/docs/casualties-daily/' }],
          };
        }
        const r = rowAt(wb.data.value, t);
        return {
          title: 'Westjordanland: Zahlen',
          subtitle: r ? `Stand ${formatDate(Date.parse(`${r.report_date}T12:00:00Z`))}` : 'Keine Meldung bis zu diesem Tag',
          time: r ? Date.parse(`${r.report_date}T12:00:00Z`) : undefined,
          color: COLOR,
          icon: 'warning',
          facts: r ? [
            { label: 'Getötete (kumuliert)', value: n(r.killed_cum), emphasis: true },
            { label: 'davon Kinder', value: n(r.killed_children_cum) },
            { label: 'Verletzte (kumuliert)', value: n(r.injured_cum) },
            { label: 'Angriffe von Siedlern', value: n(r.settler_attacks_cum) },
            { label: 'Vertriebene Personen', value: n(r.displaced_persons_cum) },
          ] : [],
          text: 'Zahlen aus den Meldungen der Vereinten Nationen (OCHA).',
          links: [{ label: 'Tech for Palestine (Public Domain)', url: 'https://data.techforpalestine.org/docs/west-bank-daily/' }],
        };
      },
    });
  },
});
