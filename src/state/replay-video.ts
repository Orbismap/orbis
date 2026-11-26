// The footage the viewer synced to a replay: links they pasted and the offset they set, kept in the browser (we host nothing).
import { computed, signal } from '@preact/signals';
import { getJSON, setJSON } from '../core/storage';
import { parseYouTubeId, type ReplayVideo } from '../replay/video';
import { replayEvent } from './replay';
import { videoShown } from './replay-sound';

type Store = Record<string, ReplayVideo[]>;
const KEY = 'orbis.replay.videos';

function valid(raw: unknown): Store | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: Store = {};
  for (const [k, list] of Object.entries(raw as Record<string, unknown>)) {
    if (!Array.isArray(list)) continue;
    out[k] = list.filter((v): v is ReplayVideo => !!v && typeof v.id === 'string' && typeof v.label === 'string' && typeof v.videoId === 'string' && typeof v.offset === 'number' && !!parseYouTubeId(v.videoId));
  }
  return out;
}

const mine = signal<Store>(getJSON<Store>(KEY, 1, valid, {}));
const save = () => setJSON(KEY, 1, mine.value);

/** the picked video of the open event, by id */
export const activeVideoId = signal<string | null>(null);

/** curated videos of the event plus the ones the viewer added */
export const replayVideos = computed<ReplayVideo[]>(() => {
  const ev = replayEvent.value;
  return ev ? [...(ev.videos ?? []), ...(mine.value[ev.id] ?? [])] : [];
});
export const activeVideo = computed(() => replayVideos.value.find((v) => v.id === activeVideoId.value) ?? null);

export function addVideo(input: string, label?: string): boolean {
  const ev = replayEvent.peek();
  const videoId = parseYouTubeId(input);
  if (!ev || !videoId) return false;
  const list = mine.peek()[ev.id] ?? [];
  const v: ReplayVideo = { id: `u-${videoId}`, label: label?.trim() || `Video ${list.length + 1}`, videoId, offset: 0 };
  mine.value = { ...mine.peek(), [ev.id]: [...list.filter((x) => x.id !== v.id), v] };
  save();
  activeVideoId.value = v.id;
  videoShown.value = true;
  return true;
}

export function setVideoOffset(id: string, offset: number): void {
  const ev = replayEvent.peek();
  if (!ev) return;
  const list = mine.peek()[ev.id];
  if (!list?.some((v) => v.id === id)) return;
  mine.value = { ...mine.peek(), [ev.id]: list.map((v) => (v.id === id ? { ...v, offset } : v)) };
  save();
}

export function removeVideo(id: string): void {
  const ev = replayEvent.peek();
  if (!ev) return;
  mine.value = { ...mine.peek(), [ev.id]: (mine.peek()[ev.id] ?? []).filter((v) => v.id !== id) };
  save();
  if (activeVideoId.peek() === id) activeVideoId.value = null;
}

/** is this a video the viewer added (its offset may be changed)? */
export const isMine = (id: string): boolean => id.startsWith('u-');
