// Footage synced to the replay timeline. We never download or host a video: it is an embed of the original (YouTube) that
// is steered by the playhead. `offset` is the video's own clock at T-0, so the video time is `t + offset`. Pure.
export interface ReplayVideo {
  /** unique inside the event */
  id: string;
  label: string;
  /** YouTube video id */
  videoId: string;
  /** video seconds at T-0 (negative: the video starts after T-0 ... use with t + offset) */
  offset: number;
}

const ID = /^[A-Za-z0-9_-]{11}$/;

/** The 11-character YouTube id from a link (watch, youtu.be, embed, shorts, live) or the bare id; null when it is none. */
export function parseYouTubeId(input: string): string | null {
  const s = input.trim();
  if (ID.test(s)) return s;
  try {
    const u = new URL(s);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
    else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      id = u.searchParams.get('v');
      if (!id) {
        const m = /^\/(?:embed|shorts|live|v)\/([^/?]+)/.exec(u.pathname);
        id = m?.[1] ?? null;
      }
    }
    return id && ID.test(id) ? id : null;
  } catch {
    return null;
  }
}

/** Where the video is at replay time `t`. */
export const videoTimeAt = (v: ReplayVideo, t: number): number => t + v.offset;

/** The player has to jump when it is more than `tol` seconds off the time it should show. */
export const needsSeek = (playerTime: number, v: ReplayVideo, t: number, tol = 1.5): boolean => Math.abs(playerTime - videoTimeAt(v, t)) > tol;

/** Sound and picture stay in step only at about real time; faster, the video waits. */
export const videoPlays = (playing: boolean, speed: number): boolean => playing && speed <= 1.5;
