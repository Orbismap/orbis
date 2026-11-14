import { useEffect, useRef, useState } from 'preact/hooks';
import { formatCoord } from '../../core/format';
import { getLayer } from '../../layers/registry';
import { clearSelection, place } from '../../state/selection';
import { Button, IconButton } from '../../ui/Button';
import { cx } from '../../ui/hooks';
import { copyText, flyToPoint } from '../shared/map';
import { probeValues } from '../probe/values';
import '../inspector/inspector.css';
import './place.css';

interface Wiki { extract: string; thumb?: string; url: string }
const wikiCache = new Map<string, Wiki | null>();

/** German Wikipedia summary of the place, only when its coordinates match (guards against homonyms). */
function useWiki(title: string, lng: number, lat: number): Wiki | null | undefined {
  const key = `${title}|${lng.toFixed(2)},${lat.toFixed(2)}`;
  const [wiki, setWiki] = useState<Wiki | null | undefined>(wikiCache.get(key));
  useEffect(() => {
    if (wikiCache.has(key)) return setWiki(wikiCache.get(key));
    setWiki(undefined);
    const ctl = new AbortController();
    fetch(`https://de.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}`, { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { type?: string; extract?: string; thumbnail?: { source: string }; coordinates?: { lat: number; lon: number }; content_urls?: { desktop?: { page?: string } } } | null) => {
        const c = j?.coordinates;
        const ok = !!j && j.type === 'standard' && !!j.extract && !!c && Math.abs(c.lat - lat) < 0.6 && Math.abs(c.lon - lng) < 0.9;
        const w: Wiki | null = ok ? { extract: j!.extract!, thumb: j!.thumbnail?.source, url: j!.content_urls?.desktop?.page ?? `https://de.wikipedia.org/wiki/${encodeURIComponent(title)}` } : null;
        wikiCache.set(key, w);
        setWiki(w);
      })
      .catch((e) => e?.name !== 'AbortError' && setWiki(null));
    return () => ctl.abort();
  }, [key]);
  return wiki;
}

/** Native share sheet (macOS: Mail, Nachrichten, AirDrop ...); falls back to copying the link where the browser has none. */
export function share(title: string): void {
  const data = { title, text: title, url: location.href };
  if (typeof navigator.share === 'function') {
    navigator.share(data).catch((e) => e?.name !== 'AbortError' && void copyText(location.href, 'Link kopiert'));
  } else void copyText(location.href, 'Link kopiert');
}

/** Photo above, then "Info": the summary clamped to five lines with MEHR, source line below. */
function Info({ wiki }: { wiki: Wiki }) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const el = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    setOpen(false);
    const e = el.current;
    if (e) setClamped(e.scrollHeight > e.clientHeight + 1);
  }, [wiki]);
  return (
    <>
      {wiki.thumb && <img class="place-img" src={wiki.thumb} alt="" loading="lazy" referrerpolicy="no-referrer" />}
      <section class="place-info">
        <h3 class="hud-sect">Info</h3>
        <p ref={el} class={cx('place-text', open && 'is-open', clamped && 'is-clamped')}>
          {clamped && !open && (
            <button type="button" class="place-more" onClick={() => setOpen(true)}>
              MEHR
            </button>
          )}
          {wiki.extract}
        </p>
        <p class="place-src">
          Mehr auf{' '}
          <a href={wiki.url} target="_blank" rel="noopener noreferrer">
            Wikipedia
          </a>
        </p>
      </section>
    </>
  );
}

/** Detail card of a searched place: name, actions, Wikipedia info and a "Details" group (location, coordinate, field values). */
export function PlaceCard() {
  const p = place.value;
  if (!p) return null;
  const wiki = useWiki(p.title, p.lng, p.lat);
  const plain = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
  const where = p.subtitle.split(', ').filter(Boolean);
  return (
    <article class="insp place" aria-label={p.title}>
      <header class="place-head">
        <IconButton icon="share" label="Link teilen" class="place-share" onClick={() => share(p.title)} />
        <h2 class="place-title">{p.title}</h2>
        <IconButton icon="close" label="Schließen" shortcut="Esc" class="place-close" onClick={clearSelection} />
      </header>
      <div class="insp-actions place-actions">
        <Button variant="primary" icon="pin" onClick={() => flyToPoint(p.lng, p.lat, 11)}>
          Hinfliegen
        </Button>
        <Button variant="secondary" icon="copy" onClick={() => void copyText(plain, 'Koordinate kopiert')}>
          Koordinate
        </Button>
      </div>
      {wiki && <Info wiki={wiki} />}
      <section class="place-details">
        <h3 class="hud-sect">Details</h3>
        <dl class="insp-facts">
          {where.length > 0 && (
            <div class="insp-fact">
              <dt>Standort</dt>
              <dd>
                {where.map((w) => (
                  <span class="place-line" key={w}>
                    {w}
                  </span>
                ))}
              </dd>
            </div>
          )}
          <div class="insp-fact">
            <dt>Koordinaten</dt>
            <dd class="num">{formatCoord(p.lat, p.lng, 4)}</dd>
          </div>
        {probeValues.value.map((v) => (
          <div class="insp-fact" key={v.layerId}>
            <dt>{getLayer(v.layerId)?.title ?? v.label}</dt>
            <dd class="num">{v.value}</dd>
          </div>
        ))}
        </dl>
      </section>
    </article>
  );
}
