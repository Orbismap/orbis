import { useEffect, useState } from 'preact/hooks';

export interface Reverse {
  /** Address or name of what sits at the point. */
  title?: string;
  /** Address / location lines for "Details". */
  lines: string[];
  /** "In der Nähe von ..." when no street or name was found. */
  near?: string;
  isAddress: boolean;
}

interface PhotonProps { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; district?: string; state?: string; country?: string }

const cache = new Map<string, Reverse | null>();

export function parseReverse(p: PhotonProps): Reverse {
  const street = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : undefined;
  const town = [p.postcode, p.city ?? p.district].filter(Boolean).join(' ') || undefined;
  if (street) return { title: street, lines: [street, town, p.country].filter((x): x is string => !!x), isAddress: true };
  const near = p.city ?? p.district ?? p.state;
  return { title: p.name, lines: [p.name, p.district !== p.city ? p.district : undefined, p.city, p.state, p.country].filter((x, i, a): x is string => !!x && a.indexOf(x) === i), near: p.name ? undefined : near, isAddress: false };
}

/** Photon reverse geocoder (same service as the search). `undefined` while loading, `null` when nothing was found or on error. */
export function useReverse(lng: number, lat: number): Reverse | null | undefined {
  const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
  const [r, setR] = useState<Reverse | null | undefined>(cache.get(key));
  useEffect(() => {
    if (cache.has(key)) return setR(cache.get(key));
    setR(undefined);
    const ctl = new AbortController();
    fetch(`https://photon.komoot.io/reverse?lon=${lng}&lat=${lat}&lang=de&limit=1`, { signal: ctl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((j: { features?: { properties: PhotonProps }[] } | null) => {
        const f = j?.features?.[0];
        const v = f ? parseReverse(f.properties) : null;
        cache.set(key, v);
        setR(v);
      })
      .catch((e) => e?.name !== 'AbortError' && setR(null));
    return () => ctl.abort();
  }, [key]);
  return r;
}
