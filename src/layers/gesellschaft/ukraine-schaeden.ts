// Civilian harm in Ukraine: Bellingcat's verified-location incidents. Points with text and links to the original posts;
// no media is loaded or embedded.
import type { ExpressionSpecification } from 'maplibre-gl';
import { computed } from '@preact/signals';
import { formatDate } from '../../core/format';
import { DAY } from '../../core/time';
import { bucketUrl } from '../../data/endpoints';
import type { HarmCollection, HarmProps } from '../../data/parsers/ukraine';
import { ZEUGEN_WARNUNG, hostLabel, isHttp } from '../../data/parsers/zeitzeugen';
import { pointLayer } from '../../render/points';
import { markEventTimes, type AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#E8664D';
const FIRST = Date.UTC(2022, 1, 24);

export default defineLayer({
  id: 'ukraine-schaeden',
  category: 'gesellschaft',
  title: 'Ukraine: zivile Schäden',
  summary: 'Von Bellingcat verortete Vorfälle mit Schäden an zivilen Orten, mit Links zu den Originalquellen',
  icon: 'warning',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  coverage: 'Ukraine',
  sources: [{ name: 'Bellingcat, Civilian Harm in Ukraine (ukraine.bellingcat.com)', url: 'https://ukraine.bellingcat.com/', license: 'Lizenz nicht angegeben, Namensnennung und Link auf Bellingcat', manifest: { bucket: 'data', key: 'ukraine-harm.json' } }],
  sensitive: ZEUGEN_WARNUNG,
  time: { mode: 'window', range: () => ({ start: FIRST - Date.now(), end: 0, step: DAY }) },
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Vorfall mit Quellenlinks (keine Medien auf der Karte)' }] },
  keywords: ['ukraine', 'krieg', 'bellingcat', 'zivil', 'schäden', 'angriff', 'zeitzeugen'],

  mount(ctx) {
    const raw = ctx.resource<HarmCollection>({ key: 'data:ukraine-harm', url: bucketUrl('data', 'ukraine-harm.json'), parse: 'ukraineHarmPoints', timeout: 40_000 });
    const visible = computed<HarmCollection | undefined>(() => {
      const d = raw.data.value;
      if (!d) return undefined;
      const t = ctx.time.value;
      return { type: 'FeatureCollection', features: d.features.filter((f) => f.properties.t <= t + DAY / 2) };
    });
    // Striche in der Zeitleiste: wann die Ereignisse stattfanden
    markEventTimes(ctx, () => raw.data.value?.features.map((x) => x.properties.t));
    return pointLayer(ctx, {
      data: visible,
      resources: [raw],
      cluster: { radius: 36, maxZoom: 8 },
      radius: ['interpolate', ['linear'], ['zoom'], 3, 3, 10, 5.5, 14, 8] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: 'rgba(40, 12, 8, 0.9)', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as HarmProps;
        const links = p.src.split('\n').filter(isHttp);
        return {
          title: p.place || 'Vorfall',
          subtitle: 'Bellingcat: Civilian Harm in Ukraine',
          time: p.t,
          color: COLOR,
          icon: 'warning',
          facts: [
            { label: 'Datum', value: formatDate(p.t), emphasis: true },
            ...(p.impact ? [{ label: 'Betroffen', value: p.impact }] : []),
            ...(p.weapons ? [{ label: 'Waffensystem', value: p.weapons }] : []),
            ...(p.graphic ? [{ label: 'Hinweis', value: 'Bellingcat kennzeichnet verlinktes Material als drastisch' }] : []),
            { label: 'Belege', value: links.length ? `${links.length} Originalquelle${links.length > 1 ? 'n' : ''} (externe Links, nicht eingebettet)` : 'keine Links' },
          ],
          text: p.text || undefined,
          links: [...links.slice(0, 6).map((u, i) => ({ label: `Quelle ${i + 1}: ${hostLabel(u)}`, url: u })), { label: 'Bellingcat, Datensatz und Methode', url: 'https://ukraine.bellingcat.com/' }],
        };
      },
    });
  },
});
