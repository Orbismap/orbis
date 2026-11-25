// Archive Genocide (archivegenocide.com): geolocated documentation clips from Gaza. Exact pins and external placements
// are points with a card linking to the archive entry and the original post; approximately placed clips only appear as a
// density heatmap (rule of the archive: a place name is never drawn as an exact point). No media is loaded or embedded.
import { computed, effect } from '@preact/signals';
import type { ExpressionSpecification, GeoJSONSourceSpecification, LayerSpecification } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { formatDate } from '../../core/format';
import { DAY } from '../../core/time';
import { proxied } from '../../data/endpoints';
import { fetchJson } from '../../data/http';
import { CAT_LABEL, captionParts, dayToDate, type ArchivePinProps, type ArchivePins } from '../../data/parsers/archive';
import { ZEUGEN_WARNUNG, hostLabel, isHttp } from '../../data/parsers/zeitzeugen';
import { pointLayer } from '../../render/points';
import { EMPTY_FC, markEventTimes, type AnyFeature } from '../../render/common';
import { defineLayer } from '../define';

const COLOR = '#C0392B';
const ORIGIN = 'https://archivegenocide.com';
const DATA = `${ORIGIN}/geolocation/data/`;
/** Beginn der Dokumentation: das Archiv zählt die Tage ab dem 7. Oktober 2023 (stats.epoch). */
const FIRST = Date.UTC(2023, 9, 7);
const EMPTY = { type: 'FeatureCollection', features: [] } as ArchivePins;

interface Clip { c?: string; d?: string; a?: string; k?: string; du?: string; et?: string; cat?: string; m?: string; cp?: string; pu?: string | null; pv?: { links?: [string, string][] }[] }
const buckets = new Map<string, Promise<Record<string, Clip>>>();
const clipOf = async (id: number, signal: AbortSignal): Promise<Clip | undefined> => {
  const b = String(id % 512).padStart(2, '0');
  let p = buckets.get(b);
  if (!p) { p = fetchJson<Record<string, Clip>>(proxied(`${DATA}clips/${b}.json`), { timeout: 30_000, signal }).then((r) => r.data); buckets.set(b, p); p.catch(() => buckets.delete(b)); }
  return (await p)[id];
};

export default defineLayer({
  id: 'kriegsarchiv',
  category: 'gesellschaft',
  title: 'Kriegsarchiv Gaza',
  summary: 'Geolokalisierte Dokumentation aus Gaza: genaue Positionen als Punkte, ungefähre als Dichte',
  icon: 'warning',
  color: COLOR,
  form: 'points',
  cadence: 'daily',
  time: { mode: 'window', range: () => ({ start: FIRST - Date.now(), end: 0, step: DAY }) },
  coverage: 'Gaza',
  sources: [
    { name: 'Archive Genocide, Geolocation Map (archivegenocide.com), Abruf über den Daten-Proxy', url: 'https://archivegenocide.com/geolocation/', license: 'Archivdaten, Quellenangabe; Belegmaterial gehört den Urhebern' },
    { name: 'genocide.live (Databases for Palestine), externe Verortungen', url: 'https://genocide.live/', license: 'Genehmigung des Betreibers laut Archiv' },
  ],
  sensitive: ZEUGEN_WARNUNG,
  legend: { type: 'classes', items: [{ color: COLOR, label: 'Genaue Verortung (Archiv oder extern)', shape: 'dot' }, { color: '#E8A25A', label: 'Dichte ungefähr verorteter Clips', shape: 'square' }] },
  keywords: ['archive genocide', 'archiv', 'gaza', 'video', 'dokumentation', 'geolokalisierung', 'zeitzeugen'],

  mount(ctx) {
    const stats = ctx.resource<{ cats?: string[]; epoch?: string }>({ key: 'ag:stats', url: proxied(`${DATA}stats.json`), timeout: 30_000 });
    const pins = ctx.resource<ArchivePins>({ key: 'ag:pins', url: proxied(`${DATA}pins.json`), parse: 'archivePins', timeout: 40_000 });
    const ext = ctx.resource<ArchivePins>({ key: 'ag:external', url: proxied(`${DATA}external.json`), parse: 'archiveExternal', timeout: 40_000 });
    const dots = ctx.resource<FeatureCollection>({ key: 'ag:dots', url: proxied(`${DATA}dots.json`), parse: 'archiveDots', timeout: 60_000 });
    const all = computed<ArchivePins | undefined>(() => (pins.data.value || ext.data.value ? { type: 'FeatureCollection', features: [...(pins.data.value ?? EMPTY).features, ...(ext.data.value ?? EMPTY).features] } : undefined));
    // Datum eines Eintrags (Mittag, ms); Einträge ohne Datum bleiben immer sichtbar
    const timeOf = (p: ArchivePinProps, epoch: string) => {
      const d = p.date || dayToDate(epoch, p.day);
      return d ? Date.parse(`${d}T12:00:00Z`) : undefined;
    };
    const epoch = computed(() => stats.data.value?.epoch ?? '2023-10-07');
    const visible = computed<ArchivePins | undefined>(() => {
      const a = all.value;
      if (!a) return undefined;
      const t = ctx.time.value + DAY / 2;
      const ep = epoch.value;
      return { type: 'FeatureCollection', features: a.features.filter((f) => (timeOf(f.properties, ep) ?? 0) <= t) };
    });
    // Zeitleiste: alle datierten Einträge, unabhängig vom gewählten Zeitpunkt
    markEventTimes(ctx, () => {
      const a = all.value;
      if (!a) return undefined;
      const ep = epoch.value;
      return a.features.flatMap((f) => timeOf(f.properties, ep) ?? []);
    });

    // density of approximate placements
    const ml = ctx.map.ml;
    const dotsSrc = `${ctx.id}.dots-src`, dotsLayer = `${ctx.id}.dots-heat`;
    ctx.map.addSource(dotsSrc, { type: 'geojson', data: EMPTY_FC } as GeoJSONSourceSpecification);
    const heatBase: ExpressionSpecification = ['interpolate', ['linear'], ['zoom'], 6, 0.85, 12, 0.5, 15, 0.15] as unknown as ExpressionSpecification;
    ctx.map.addLayer({
      id: dotsLayer, type: 'heatmap', source: dotsSrc,
      paint: {
        'heatmap-weight': 1, 'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 6, 9, 11, 22, 14, 40] as unknown as number, 'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 6, 0.35, 12, 1] as unknown as number,
        'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(232,162,90,0)', 0.2, 'rgba(232,162,90,0.25)', 0.5, 'rgba(232,130,70,0.55)', 0.8, 'rgba(220,90,60,0.8)', 1, 'rgba(255,200,160,0.95)'] as unknown as string,
        'heatmap-opacity': heatBase as unknown as number,
      },
    } as unknown as LayerSpecification, 'points');
    const stopDots = effect(() => { (ml.getSource(dotsSrc) as { setData(d: unknown): void } | undefined)?.setData(dots.data.value ?? EMPTY_FC); });
    const stopOpacity = effect(() => { const o = ctx.opacity.value; if (ml.getLayer(dotsLayer)) ml.setPaintProperty(dotsLayer, 'heatmap-opacity', ['interpolate', ['linear'], ['zoom'], 6, 0.85 * o, 12, 0.5 * o, 15, 0.15 * o] as unknown as number); });

    const handle = pointLayer(ctx, {
      data: visible,
      resources: [stats, pins, ext, dots],
      cluster: { radius: 34, maxZoom: 11 },
      radius: ['interpolate', ['linear'], ['zoom'], 6, 3, 12, 5, 16, 8] as ExpressionSpecification,
      color: COLOR,
      stroke: { color: 'rgba(40,10,6,0.9)', width: 1 },
      describe: (f: AnyFeature) => {
        const p = f.properties as ArchivePinProps;
        const epoch = stats.data.value?.epoch ?? '2023-10-07';
        const date = p.date || dayToDate(epoch, p.day);
        const cat = p.ci >= 0 ? stats.data.value?.cats?.[p.ci] : undefined;
        const archiveLink = p.kind === 'pin' ? `${ORIGIN}/geolocation/#v=${p.clip}` : undefined;
        const base = {
          title: p.kind === 'ext' ? p.title || 'Externe Verortung' : 'Dokumentierter Clip',
          subtitle: p.kind === 'ext' ? `Externe Verortung: ${p.srcName || 'unbekannt'}` : 'Archive Genocide, genaue Verortung',
          time: date ? Date.parse(`${date}T12:00:00Z`) : undefined,
          color: COLOR,
          icon: 'warning' as const,
          facts: [
            ...(date ? [{ label: 'Datum', value: formatDate(Date.parse(`${date}T12:00:00Z`)), emphasis: true }] : []),
            ...(cat ? [{ label: 'Kategorie', value: CAT_LABEL[cat] ?? cat }] : []),
            { label: 'Genauigkeit der Verortung', value: p.lvl >= 4 ? 'geolokalisiert (Stufe 4)' : `Stufe ${p.lvl}` },
            ...(p.note ? [{ label: 'Verortung', value: p.note }] : []),
          ],
          links: [
            ...(archiveLink ? [{ label: 'Eintrag im Archiv', url: archiveLink }] : []),
            ...(p.footage && isHttp(p.footage) ? [{ label: `Original-Beitrag (${hostLabel(p.footage)})`, url: p.footage }] : []),
            ...(p.srcUrl && isHttp(p.srcUrl) ? [{ label: `Quelle: ${p.srcName || hostLabel(p.srcUrl)}`, url: p.srcUrl }] : []),
            { label: 'Archive Genocide, Geolocation Map', url: `${ORIGIN}/geolocation/` },
          ],
        };
        if (p.kind === 'pin') {
          // caption, event and the original post follow from the clip bucket; the card is updated in place
          void clipOf(p.clip, ctx.signal).then((c) => {
            if (!c || ctx.signal.aborted || ctx.selection.peek()?.title !== base.title) return;
            const cap = captionParts(c.c ?? '');
            ctx.select({
              ...base,
              title: c.et || cap.title || base.title,
              facts: [...base.facts, ...(c.k ? [{ label: 'Medium', value: `${c.k === 'video' ? 'Video' : 'Foto'}${c.du ? `, ${c.du}` : ''} (nicht eingebettet)` }] : []), ...(c.cp ? [{ label: 'Ortsangabe', value: c.cp }] : []), ...(c.a ? [{ label: 'Quelle des Clips', value: c.a }] : [])],
              text: cap.text || undefined,
              links: [...(c.pu && isHttp(c.pu) ? [{ label: `Original-Beitrag (${hostLabel(c.pu)})`, url: c.pu }] : []), ...base.links],
            });
          }).catch(() => {});
        }
        return base;
      },
    });
    return { destroy() { stopDots(); stopOpacity(); handle.destroy(); ctx.map.remove({ layers: [dotsLayer], sources: [dotsSrc] }); } };
  },
});
