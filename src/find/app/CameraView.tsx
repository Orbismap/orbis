// The upper half as a camera view: the picture of the back camera, on it the places around and arrows behind the junctions where
// the way turns. The picture stays on the device.
import { useEffect, useRef, useState } from 'preact/hooks';
import { formatDistance } from '@/features/routes/osrm';
import { focalLength, scene } from '../data/ar';
import { isThere } from '../data/guide';
import { metres } from '../data/places';
import { chosen, places, route, target } from '../state/finder';
import { attitude, compass, position, startCompass } from '../state/sensors';
import { augmented } from '../state/ui';

type CameraState = 'starting' | 'on' | 'denied' | 'unavailable';
/** Without a reading after this long the device has no compass. */
const NO_COMPASS_MS = 3000;

interface Size { width: number; height: number }

/** Runs the back camera into the video element while the view is shown and the app in front. */
function useCamera() {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<CameraState>('starting');
  const [picture, setPicture] = useState<Size | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let dead = false;
    let stream: MediaStream | undefined;
    let run = 0;
    const el = video.current!;
    const stop = () => {
      run++;
      stream?.getTracks().forEach((track) => track.stop());
      stream = undefined;
    };
    const start = async () => {
      stop();
      const mine = run;
      setState('starting');
      try {
        // missing on pages without HTTPS
        const got = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (dead || mine !== run) return got.getTracks().forEach((track) => track.stop());
        stream = got;
        el.srcObject = got;
        await el.play();
        if (!dead && mine === run) setState('on');
      } catch (error) {
        if (!dead && mine === run) setState((error as Error).name === 'NotAllowedError' ? 'denied' : 'unavailable');
      }
    };
    const measure = () => { if (el.videoWidth) setPicture({ width: el.videoWidth, height: el.videoHeight }); };
    const follow = () => { if (document.hidden) stop(); else void start(); };
    el.addEventListener('loadedmetadata', measure);
    el.addEventListener('resize', measure);
    document.addEventListener('visibilitychange', follow);
    follow();
    return () => {
      dead = true;
      stop();
      el.removeEventListener('loadedmetadata', measure);
      el.removeEventListener('resize', measure);
      document.removeEventListener('visibilitychange', follow);
    };
  }, [attempt]);

  return { video, state, picture, retry: () => setAttempt((n) => n + 1) };
}

export function CameraView() {
  const { video, state, picture, retry } = useCamera();
  const host = useRef<HTMLElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height }));
    observer.observe(host.current!);
    const timer = setTimeout(() => setWaited(true), NO_COMPASS_MS);
    return () => {
      observer.disconnect();
      clearTimeout(timer);
    };
  }, []);

  const at = position.value, eye = attitude.value, to = target.value, way = route.value;
  const there = !!at && !!to && isThere(metres([at.lng, at.lat], [to.lng, to.lat]), at.accuracy);
  const own = to && way?.key === to.key ? way : null;
  const shown = state === 'on' && at && eye && size && picture
    ? scene({ at: [at.lng, at.lat], camera: eye, view: { ...size, focal: focalLength(size, picture) }, places: places.value, target: to, line: own?.line ?? [], junctions: own?.junctions ?? [], there })
    : null;

  const say = state === 'denied' ? 'Kein Zugriff auf die Kamera. Erlaube ihn in den Einstellungen deines Browsers.'
    : state === 'unavailable' ? 'Die Kamera ist nicht verfügbar.'
    : compass.value === 'ask' || compass.value === 'denied' ? 'Ohne Kompass kann ich nichts einblenden.'
    : !eye ? (waited ? 'Dieses Gerät liefert keine Ausrichtung.' : 'Kompass wird gesucht …')
    : shown?.down ? 'Halte das Handy hoch und schau dich um.'
    : there ? 'Du bist ganz nah – schau dich um.'
    : null;

  return (
    <section ref={host} class="find-camera" aria-label="Kameraansicht">
      <video ref={video} muted autoPlay playsInline />
      {shown && (
        <>
          <svg viewBox={`0 0 ${size!.width} ${size!.height}`} aria-hidden="true">
            {shown.arrows.map((a, i) => <polygon key={i} class={a.next ? 'find-turn' : 'find-turn find-turn-later'} points={a.points.map((p) => p.join(',')).join(' ')} />)}
          </svg>
          {shown.markers.map((m) => (
            <button key={m.place.key} type="button" class={m.target ? 'find-mark find-mark-target' : 'find-mark'} style={{ left: `${m.x}px`, top: `${m.y}px` }}
              aria-label={`${m.place.title}, ${formatDistance(m.distance)}`} onClick={() => (chosen.value = m.place)}>
              <i />
              <span>{formatDistance(m.distance)}</span>
            </button>
          ))}
          {shown.aside && (
            <div class={`find-aside find-aside-${shown.aside}`} role="img" aria-label={shown.aside === 'left' ? 'Ziel liegt links' : 'Ziel liegt rechts'}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
                <path d={shown.aside === 'left' ? 'M15 5 8 12l7 7' : 'm9 5 7 7-7 7'} />
              </svg>
            </div>
          )}
        </>
      )}
      {say && <p class="find-say" role="status">{say}</p>}
      <div class="find-corner">
        {(state === 'denied' || state === 'unavailable') && <button type="button" class="find-pill" onClick={retry}>Erneut versuchen</button>}
        {compass.value === 'ask' && <button type="button" class="find-pill" onClick={() => void startCompass()}>Kompass einschalten</button>}
        <button type="button" class="find-pill" onClick={() => (augmented.value = false)}>Karte</button>
      </div>
    </section>
  );
}
