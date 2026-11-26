// The footage pane: an embed of the original video (YouTube, never a copy) that follows the replay's playhead. The viewer
// pastes a link, scrubs the video to the moment of T-0 and presses "Hier ist T-0"; from then on it stays in step.
import { useEffect, useRef, useState } from 'preact/hooks';
import { onReplayFrame, replayEffectiveSpeed, replayEvent, replayPlaying, replaySeeks, replayT } from '../../state/replay';
import { activeVideo, activeVideoId, addVideo, isMine, removeVideo, replayVideos, setVideoOffset } from '../../state/replay-video';
import { videoShown } from '../../state/replay-sound';
import { needsSeek, videoPlays, videoTimeAt } from '../../replay/video';
import { tLabel } from '../../replay/director';
import { IconButton } from '../../ui/Button';

interface YTPlayer {
  getCurrentTime(): number;
  getPlayerState(): number;
  seekTo(s: number, ahead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  loadVideoById(id: string): void;
  destroy(): void;
}
interface YTApi { Player: new (el: HTMLElement, o: Record<string, unknown>) => YTPlayer }

let apiPromise: Promise<YTApi> | null = null;
function loadApi(): Promise<YTApi> {
  const w = window as unknown as { YT?: YTApi; onYouTubeIframeAPIReady?: () => void };
  if (w.YT?.Player) return Promise.resolve(w.YT);
  apiPromise ??= new Promise<YTApi>((resolve, reject) => {
    w.onYouTubeIframeAPIReady = () => resolve(w.YT!);
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    s.onerror = () => { apiPromise = null; reject(new Error('youtube api')); };
    document.head.appendChild(s);
  });
  return apiPromise;
}

const STATE_PLAYING = 1;

export function VideoPane() {
  const ev = replayEvent.value;
  const video = activeVideo.value;
  const host = useRef<HTMLDivElement>(null);
  const player = useRef<YTPlayer | null>(null);
  const [failed, setFailed] = useState(false);
  const [link, setLink] = useState('');
  const [bad, setBad] = useState(false);
  const shown = videoShown.value && !!ev;
  const videoId = shown ? (video?.videoId ?? null) : null;

  // the player lives as long as a video is picked
  useEffect(() => {
    if (!videoId || !host.current) return;
    let dead = false;
    const el = document.createElement('div');
    host.current.replaceChildren(el);
    setFailed(false);
    loadApi().then((YT) => {
      if (dead) return;
      player.current = new YT.Player(el, {
        videoId,
        host: 'https://www.youtube-nocookie.com',
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, playsinline: 1, modestbranding: 1, controls: 1, origin: location.origin },
      });
    }).catch(() => setFailed(true));
    return () => { dead = true; player.current?.destroy(); player.current = null; };
  }, [videoId]);

  // follow the playhead: jump when it drifts or the viewer scrubs, play only at about real time
  useEffect(() => {
    if (!video || !shown) return;
    let seeks = replaySeeks.peek();
    let lastCheck = 0;
    return onReplayFrame((t) => {
      const p = player.current;
      if (!p || typeof p.getCurrentTime !== 'function') return;
      const now = performance.now();
      const jumped = replaySeeks.peek() !== seeks;
      if (!jumped && now - lastCheck < 400) return;
      lastCheck = now;
      seeks = replaySeeks.peek();
      const target = videoTimeAt(video, t);
      const want = target >= 0 && videoPlays(replayPlaying.peek(), replayEffectiveSpeed.peek());
      const on = p.getPlayerState() === STATE_PLAYING;
      if (target >= 0 && (jumped || needsSeek(p.getCurrentTime(), video, t))) p.seekTo(target, true);
      if (want && !on) p.playVideo();
      else if (!want && on) p.pauseVideo();
    });
  }, [video, shown]);

  if (!ev || !shown) return null;
  const mine = video ? isMine(video.id) : false;
  const nudge = (d: number) => video && setVideoOffset(video.id, video.offset + d);
  const submit = (e: Event) => {
    e.preventDefault();
    if (addVideo(link)) { setLink(''); setBad(false); } else setBad(true);
  };
  return (
    <aside class="cap rp-video" aria-label="Originalvideo">
      <div class="rp-video-head">
        <strong>Originalvideo</strong>
        {replayVideos.value.length > 1 && (
          <select aria-label="Video wählen" value={activeVideoId.value ?? ''} onChange={(e) => { activeVideoId.value = (e.currentTarget as HTMLSelectElement).value || null; }}>
            <option value="">–</option>
            {replayVideos.value.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
        )}
        <IconButton icon="close" label="Video schließen" variant="ghost" onClick={() => { videoShown.value = false; }} />
      </div>
      {video ? (
        <>
          <div class="rp-video-frame" ref={host}>{failed && <p>Das Video konnte nicht geladen werden.</p>}</div>
          <div class="rp-video-sync num">
            <span>Video bei T-0: {tLabel(video.offset).replace('T+', '').replace('T-', '−')}</span>
            {mine && (
              <>
                <button type="button" class="rp-chip" onClick={() => player.current && setVideoOffset(video.id, Math.round(player.current.getCurrentTime() - replayT.peek()))} title="Das Video an der Stelle anhalten, an der gerade der Zeitpunkt der Wiederholung läuft">Hier ist jetzt</button>
                <button type="button" class="rp-chip" onClick={() => nudge(-1)} aria-label="Eine Sekunde zurück">−1 s</button>
                <button type="button" class="rp-chip" onClick={() => nudge(1)} aria-label="Eine Sekunde vor">+1 s</button>
                <button type="button" class="rp-chip" onClick={() => removeVideo(video.id)}>Entfernen</button>
              </>
            )}
          </div>
          <p class="rp-video-hint">So stellst du es ein: Wiederholung auf einen klaren Moment stellen (z. B. Abheben, T+00:00), das Video an dieselbe Stelle spulen und „Hier ist jetzt“ drücken.</p>
        </>
      ) : (
        <p class="rp-video-hint">Füge den Link eines offiziellen Videos ein (YouTube). Es wird nur eingebettet, nicht kopiert, und läuft dann zur Zeitleiste synchron.</p>
      )}
      <form class="rp-video-add" onSubmit={submit}>
        <input type="text" placeholder="YouTube-Link einfügen" value={link} aria-invalid={bad} onInput={(e) => { setLink((e.currentTarget as HTMLInputElement).value); setBad(false); }} />
        <button type="submit" class="rp-chip">Hinzufügen</button>
      </form>
      {bad && <p class="rp-video-hint" role="alert">Das ist kein YouTube-Link.</p>}
    </aside>
  );
}
