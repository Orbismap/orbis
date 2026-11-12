// Ship photo from Wikimedia Commons (searched by IMO number, then by name). Only accepted when the file title names the IMO
// number or the full ship name, and only with a free licence; small boats usually have no photo. Author and licence are
// returned for the credit line. Commons sends CORS with `origin=*`.
export type ShipPhoto = { src: string; link: string; author: string; license: string; title: string };

const strip = (s: string) => s.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();
const FREE = /^(CC[ -]BY|CC0|Public domain|PD|GFDL|Attribution)/i;

export const commonsSearchUrl = (query: string): string =>
  `https://commons.wikimedia.org/w/api.php?action=query&format=json&formatversion=2&origin=*&generator=search&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=640&gsrsearch=${encodeURIComponent(`${query} filetype:bitmap`)}`;

export function parseCommonsPhoto(raw: unknown, who: { imo: number; name: string }): ShipPhoto | null {
  const pages = (raw as { query?: { pages?: { title?: string; index?: number; imageinfo?: { thumburl?: string; url?: string; descriptionurl?: string; extmetadata?: Record<string, { value?: string }> }[] }[] } } | null)?.query?.pages;
  if (!Array.isArray(pages)) return null;
  const name = norm(who.name);
  const nameOk = name.length >= 5 && name.split(' ').length >= 1;
  for (const p of [...pages].sort((a, b) => (a.index ?? 99) - (b.index ?? 99))) {
    const info = p.imageinfo?.[0];
    const title = norm(String(p.title ?? '').replace(/^File:/, ''));
    const hit = (who.imo > 0 && title.includes(String(who.imo))) || (nameOk && ` ${title} `.includes(` ${name} `));
    const src = info?.thumburl ?? info?.url;
    if (!hit || !src || !/^https:\/\//.test(src)) continue;
    const license = strip(info?.extmetadata?.LicenseShortName?.value ?? '');
    if (!FREE.test(license)) continue;
    return { src, link: info?.descriptionurl ?? 'https://commons.wikimedia.org/', author: strip(info?.extmetadata?.Artist?.value ?? '') || 'Wikimedia Commons', license, title: String(p.title ?? '') };
  }
  return null;
}
