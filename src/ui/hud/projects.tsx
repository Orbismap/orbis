import type { JSX } from 'preact';

/** The Orbis apps. One build serves all of them; the hostname (or `?mode=`) decides which one boots, see `src/entry.ts`. */
export type ProjectId = 'map' | 'wetter';

export interface Project {
  id: ProjectId;
  name: string;
  icon: () => JSX.Element;
}

const svg = (children: JSX.Element) => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">
    {children}
  </svg>
);

export const PROJECTS: readonly Project[] = [
  {
    id: 'map',
    name: 'Karten',
    icon: () => svg(<path d="M2.5 5.5 7 3.5l6 2 4.5-2v11l-4.5 2-6-2-4.5 2zM7 3.5v11M13 5.5v11" />),
  },
  {
    id: 'wetter',
    name: 'Wetter',
    icon: () => svg(<path d="M5.5 15.5a3.5 3.5 0 0 1-.4-6.98 4.5 4.5 0 0 1 8.7-.52A3.75 3.75 0 0 1 14 15.5z" />),
  },
];

/** Address of another Orbis app: swaps the subdomain on the real hosts, uses `?mode=` everywhere else (local, previews). */
export function projectUrl(id: ProjectId): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  const { hostname } = url;
  if (/^(wetter|maps)\./.test(hostname)) url.hostname = hostname.replace(/^(wetter|maps)\./, id === 'wetter' ? 'wetter.' : 'maps.');
  else url.searchParams.set('mode', id);
  return url.toString();
}
