import type { JSX } from 'preact';

/** The Orbis apps. One build serves all of them; the hostname (or `?mode=`) decides which one boots, see `src/entry.ts`. */
export type ProjectId = 'map' | 'wetter' | 'bahn' | 'find';

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
  {
    id: 'bahn',
    name: 'Bus & Bahn',
    icon: () => svg(<path d="M6.5 3h7A2.5 2.5 0 0 1 16 5.5v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7A2.5 2.5 0 0 1 6.5 3zM4 9.5h12M7 12h.01M13 12h.01M7 14.5l-1.5 2.5M13 14.5l1.5 2.5" />),
  },
  {
    id: 'find',
    name: 'Find',
    icon: () => svg(<path d="M16.5 3.5 3.5 9l5.5 2 2 5.5z" />),
  },
];

/** The subdomain of each app on the real hosts. */
const HOSTS: Record<ProjectId, string> = { map: 'maps', wetter: 'wetter', bahn: 'bahn', find: 'find' };

/** Address of another Orbis app: swaps the subdomain on the real hosts, uses `?mode=` everywhere else (local, previews). */
export function projectUrl(id: ProjectId): string {
  const url = new URL(window.location.href);
  url.search = '';
  url.hash = '';
  const { hostname } = url;
  const own = new RegExp(`^(${Object.values(HOSTS).join('|')})\\.`);
  if (own.test(hostname)) url.hostname = hostname.replace(own, `${HOSTS[id]}.`);
  else url.searchParams.set('mode', id);
  return url.toString();
}
