import { useEffect, useRef, useState } from 'preact/hooks';
import type { InspectCard } from '../../layers/types';
import { IconButton } from '../../ui/Button';
import { Skeleton } from '../../ui/Chip';

type MediaSpec = NonNullable<InspectCard['media']>;

const withStamp = (url: string, n: number) => (n ? `${url}${url.includes('?') ? '&' : '?'}_=${n}` : url);
/** `refresh` is in milliseconds. */
const refreshMs = (r: number) => r;

function ImageMedia({ m, alt }: { m: MediaSpec; alt: string }) {
  const [stamp, setStamp] = useState(0);
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  useEffect(() => {
    if (!m.refresh) return;
    const id = setInterval(() => !document.hidden && setStamp(Date.now()), Math.max(5000, refreshMs(m.refresh)));
    return () => clearInterval(id);
  }, [m.refresh]);
  return (
    <figure class="media">
      <div class="media-frame">
        {state === 'loading' && <Skeleton width="100%" height={180} radius={0} />}
        {state === 'error' ? (
          <div class="media-error" role="status">
            Bild nicht verfügbar
          </div>
        ) : (
          <img
            src={withStamp(m.url, stamp)}
            alt={alt}
            referrerpolicy="no-referrer"
            style={{ display: state === 'ok' ? 'block' : 'none' }}
            onLoad={() => setState('ok')}
            onError={() => setState('error')}
          />
        )}
      </div>
      <figcaption class="media-bar">
        <span>{m.refresh ? 'Aktualisiert automatisch' : 'Bild'}</span>
        <IconButton
          icon="reset"
          label="Bild neu laden"
          onClick={() => {
            setState('loading');
            setStamp(Date.now());
          }}
        />
      </figcaption>
    </figure>
  );
}

function VideoMedia({ m, alt }: { m: MediaSpec; alt: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  const native = m.type !== 'hls' || !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');
  if (!native)
    return (
      <p class="media-fallback">
        Dieser Browser spielt den Live-Stream nicht ab.{' '}
        <a href={m.url} target="_blank" rel="noopener noreferrer">
          Stream öffnen
        </a>
      </p>
    );
  return (
    <figure class="media">
      <div class="media-frame">
        <video ref={ref} src={m.url} poster={m.poster} controls playsInline muted preload="metadata" aria-label={alt} />
      </div>
    </figure>
  );
}

export function Media({ media, title }: { media: MediaSpec; title: string }) {
  if (media.type === 'image') return <ImageMedia m={media} alt={title} />;
  if (media.type === 'audio')
    return (
      <figure class="media">
        <audio src={media.url} controls preload="none" aria-label={title} />
      </figure>
    );
  return <VideoMedia m={media} alt={title} />;
}
