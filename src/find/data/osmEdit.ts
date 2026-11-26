// The parts of adding an object to OpenStreetMap that need no browser: the request bodies of API 0.6, the sign-in address
// (OAuth 2.0 with PKCE), what is already mapped nearby, and when an entry is acceptable.
import type { LngLat } from '@/core/geo';
import { metres } from './places';

export type Tags = Record<string, string>;

/** An entry may lie this far from where one stands (a poor position widens it, up to the second value). */
const REACH_M = 100;
const REACH_SLACK_M = 50;
/** Something of the same kind this close is probably the very same thing. */
export const DOUBLE_M = 6;
/** Who made the change, as OpenStreetMap shows it. */
const CREATED_BY = 'Orbis Find';

export const withinReach = (distance: number, accuracy: number): boolean => distance <= REACH_M + Math.min(accuracy, REACH_SLACK_M);

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const tagXml = (tags: Tags) => Object.entries(tags).map(([k, v]) => `<tag k="${escape(k)}" v="${escape(v)}"/>`).join('');

export const changesetXml = (comment: string): string => `<osm><changeset>${tagXml({ created_by: CREATED_BY, comment })}</changeset></osm>`;

export const nodeXml = (changeset: string, [lng, lat]: LngLat, tags: Tags): string =>
  `<osm><node changeset="${escape(changeset)}" lat="${lat.toFixed(7)}" lon="${lng.toFixed(7)}">${tagXml(tags)}</node></osm>`;

/** The tags of a new object: what makes it its kind, and the fields that were filled in. */
export function entryTags(base: Tags, values: Tags): Tags {
  const filled = Object.entries(values).map(([k, v]) => [k, v.trim()] as const).filter(([, v]) => v !== '');
  return { ...Object.fromEntries(filled), ...base };
}

export function authorizeUrl(web: string, clientId: string, redirect: string, state: string, challenge: string): string {
  const q = new URLSearchParams({ response_type: 'code', client_id: clientId, redirect_uri: redirect, scope: 'write_api', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return `${web}/oauth2/authorize?${q}`;
}

const base64Url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A random text for the sign-in (`state`, PKCE verifier). */
export const randomText = (): string => base64Url(crypto.getRandomValues(new Uint8Array(32)));

export const challengeOf = async (verifier: string): Promise<string> =>
  base64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));

// ---- what is there already ----------------------------------------------------------------------------------------------

export interface Existing { key: string; lng: number; lat: number }

export interface MapJson { elements?: { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; tags?: Tags }[] }

/** The objects of a `/map` answer that carry all of `base`: nodes as they are, ways in the middle of their corners. */
export function existingIn(json: MapJson, base: Tags): Existing[] {
  const elements = json.elements ?? [];
  const nodes = new Map(elements.flatMap((e) => (e.type === 'node' && e.lat !== undefined && e.lon !== undefined ? [[e.id, [e.lon, e.lat] as LngLat] as const] : [])));
  const wanted = Object.entries(base);
  return elements.flatMap((e) => {
    if (!wanted.every(([k, v]) => e.tags?.[k] === v)) return [];
    if (e.type === 'node') return e.lat === undefined ? [] : [{ key: `n${e.id}`, lng: e.lon!, lat: e.lat }];
    // a closed way names its first corner twice
    const corners = [...new Set(e.nodes)].map((id) => nodes.get(id)).filter((c) => !!c);
    if (e.type !== 'way' || !corners.length) return [];
    const sum = corners.reduce((s, c) => [s[0] + c[0], s[1] + c[1]] as LngLat, [0, 0] as LngLat);
    return [{ key: `w${e.id}`, lng: sum[0] / corners.length, lat: sum[1] / corners.length }];
  });
}

/** Metres to the nearest of them; Infinity without one. */
export const nearestOf = (list: readonly Existing[], at: LngLat): number => list.reduce((best, e) => Math.min(best, metres(at, [e.lng, e.lat])), Infinity);
