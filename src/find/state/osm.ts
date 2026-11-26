// The connection to OpenStreetMap for adding objects: sign-in with the person's own account and the calls of API 0.6. Nothing
// passes through a server of ours; the access token stays in this browser.
import { signal } from '@preact/signals';
import type { LngLat } from '@/core/geo';
import { authorizeUrl, challengeOf, changesetXml, existingIn, nodeXml, randomText, type Existing, type MapJson, type Tags } from '../data/osmEdit';

/**
 * Where entries go. `test` is the playground of OpenStreetMap with its own accounts; nothing there reaches the real map. Each
 * has its own registered OAuth 2 application: the id is public (there is no secret), the redirect address `redirectUri()`.
 */
const SERVERS = {
  test: { web: 'https://master.apis.dev.openstreetmap.org', api: 'https://master.apis.dev.openstreetmap.org', clientId: '' },
  live: { web: 'https://www.openstreetmap.org', api: 'https://api.openstreetmap.org', clientId: '' },
};
export const isTest = import.meta.env.VITE_OSM_EDIT !== 'live';
export const server = SERVERS[isTest ? 'test' : 'live'];
export const clientId: string = import.meta.env.VITE_OSM_CLIENT_ID || server.clientId;
/** Without a registered application the app offers no adding (in development it says what is missing). */
export const canEdit = !!clientId || import.meta.env.DEV;

export const redirectUri = (): string => `${window.location.origin}/find/oauth.html`;

/** Half the side of the square that is searched for objects that are already there. */
export const LOOK_AROUND_M = 100;
const TIMEOUT_MS = 20_000;
const TOKEN = `find.osm.token.${isTest ? 'test' : 'live'}`;
/** Kept over the visit to OpenStreetMap (public/find/oauth.html reads `back` and writes the answer). */
const PENDING = 'find.osm.pending';
const ANSWER = 'find.osm.answer';

const stored = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

export const token = signal<string | null>(stored(TOKEN));

const keepToken = (value: string | null) => {
  token.value = value;
  try {
    if (value) localStorage.setItem(TOKEN, value);
    else localStorage.removeItem(TOKEN);
  } catch {
    /* without storage the sign-in lasts as long as the page */
  }
};

/** Leaves for OpenStreetMap to sign in. `carry`: what the app wants back afterwards. */
export async function signIn(carry: unknown): Promise<void> {
  const state = randomText(), verifier = randomText();
  const back = window.location.pathname + window.location.search;
  localStorage.setItem(PENDING, JSON.stringify({ state, verifier, back, carry }));
  window.location.assign(authorizeUrl(server.web, clientId, redirectUri(), state, await challengeOf(verifier)));
}

/** After the return from OpenStreetMap: null when there was no sign-in, else what was carried and whether it worked. */
export async function finishSignIn(): Promise<{ carry: unknown; signedIn: boolean } | null> {
  const answer = stored(ANSWER), pending = stored(PENDING);
  if (answer === null || pending === null) return null;
  localStorage.removeItem(ANSWER);
  localStorage.removeItem(PENDING);
  let carry: unknown;
  try {
    const sent = JSON.parse(pending) as { state: string; verifier: string; carry: unknown };
    carry = sent.carry;
    const q = new URLSearchParams(answer);
    const code = q.get('code');
    if (!code || q.get('state') !== sent.state) return { carry, signedIn: false };
    const res = await fetch(`${server.web}/oauth2/token`, {
      method: 'POST',
      body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri(), client_id: clientId, code_verifier: sent.verifier }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const got = res.ok ? ((await res.json()) as { access_token?: string }).access_token : undefined;
    if (got) keepToken(got);
    return { carry, signedIn: !!got };
  } catch {
    return { carry, signedIn: false };
  }
}

export function signOut(): void {
  const old = token.peek();
  keepToken(null);
  // best effort: the token is forgotten here in any case
  if (old) void fetch(`${server.web}/oauth2/revoke`, { method: 'POST', body: new URLSearchParams({ token: old, client_id: clientId }) }).catch(() => {});
}

/** The objects tagged like `base` around a point, as they are mapped right now (anyone may read this). */
export async function fetchExisting([lng, lat]: LngLat, base: Tags, abort: AbortSignal): Promise<Existing[]> {
  const dLat = LOOK_AROUND_M / 111_320, dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const box = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((v) => v.toFixed(6)).join(',');
  const res = await fetch(`${server.api}/api/0.6/map.json?bbox=${box}`, { cache: 'no-store', signal: AbortSignal.any([abort, AbortSignal.timeout(TIMEOUT_MS)]) });
  if (!res.ok) throw new Error(`OpenStreetMap: ${res.status}`);
  return existingIn((await res.json()) as MapJson, base);
}

/** The access ran out or was taken back: sign in again. */
export class SignedOut extends Error {}

async function write(method: 'POST' | 'PUT', path: string, body?: string): Promise<string> {
  const res = await fetch(`${server.api}/api/0.6/${path}`, {
    method, body,
    headers: { Authorization: `Bearer ${token.peek()}`, ...(body ? { 'Content-Type': 'text/xml' } : {}) },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (res.status === 401) {
    keepToken(null);
    throw new SignedOut();
  }
  const text = await res.text();
  if (!res.ok) throw new Error(text.slice(0, 200) || `OpenStreetMap: ${res.status}`);
  return text.trim();
}

/** Creates one node in a change of its own. Returns its id. */
export async function createNode(at: LngLat, tags: Tags, comment: string): Promise<number> {
  const changeset = await write('POST', 'changesets', changesetXml(comment));
  try {
    return Number(await write('POST', 'nodes', nodeXml(changeset, at, tags)));
  } finally {
    // an open change closes by itself after a while: a failure here changes nothing
    await write('PUT', `changeset/${changeset}/close`).catch(() => {});
  }
}
