// Position and compass of the device. Both need the person's yes; on iOS the compass can only be asked for from a tap.
import { batch, signal } from '@preact/signals';
import { blend, cameraFromAngles, fromNorth, headingOf, type Camera, type OrientationReading } from '../data/attitude';
import { unwrap } from '../data/guide';

export interface Position { lng: number; lat: number; accuracy: number }
export type PositionState = 'off' | 'asking' | 'on' | 'denied' | 'unavailable';

export const position = signal<Position | null>(null);
export const positionState = signal<PositionState>('off');
/** Name of the searched place that stands in for the position; null: the device's own. */
export const manual = signal<string | null>(null);
/** Degrees clockwise from north the device (or, without a compass, the way travelled) points; null: unknown. Not wrapped. */
export const heading = signal<number | null>(null);
/** Where the back camera looks; null: no compass readings. */
export const attitude = signal<Camera | null>(null);
/** 'ask': a tap on the compass button is needed; 'on': readings arrive. */
export const compass = signal<'none' | 'ask' | 'on' | 'denied'>('none');

/** Above this speed (m/s) the way travelled says where one is heading. */
const COURSE_SPEED = 1.2;
/** Share of a new compass reading that is taken over, to calm the needle and the camera view. */
const SMOOTH = 0.3;

const turnTo = (next: number) => {
  const previous = heading.peek();
  heading.value = previous === null ? next : unwrap(previous, next);
};

/** iOS: what turns its alpha into one counted from north. */
let northOffset: number | null = null;
const onOrientation = (e: Event) => {
  const reading = e as Event & OrientationReading;
  const north = fromNorth(reading, northOffset);
  if (!north) return;
  northOffset = north.offset;
  const next = cameraFromAngles(north.alpha, reading.beta ?? 0, reading.gamma ?? 0, screen.orientation?.angle ?? 0);
  const camera = blend(attitude.peek(), next, SMOOTH);
  batch(() => {
    compass.value = 'on';
    attitude.value = camera;
    turnTo(headingOf(camera));
  });
};
const listenCompass = () => {
  window.addEventListener('deviceorientationabsolute', onOrientation);
  window.addEventListener('deviceorientation', onOrientation);
};

const orientationApi = () => (typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }));

/** Asks for the compass. Must run inside a tap on iOS. */
export async function startCompass(): Promise<void> {
  const api = orientationApi();
  if (!api) return;
  if (api.requestPermission) {
    try {
      if ((await api.requestPermission()) !== 'granted') {
        compass.value = 'denied';
        return;
      }
    } catch {
      compass.value = 'ask'; // not called from a tap
      return;
    }
  }
  listenCompass();
}

let watch: number | undefined;
const stopWatch = () => {
  if (watch !== undefined) navigator.geolocation.clearWatch(watch);
  watch = undefined;
};

/** Starts from a searched place instead of the device's position. */
export function usePlace(place: { title: string; lng: number; lat: number }): void {
  stopWatch();
  batch(() => {
    if (compass.peek() !== 'on') heading.value = null; // a way travelled belongs to the old position
    manual.value = place.title;
    position.value = { lng: place.lng, lat: place.lat, accuracy: 0 };
    positionState.value = 'on';
  });
}

/** Starts following the position; safe to call again (e.g. after a refusal, or to leave a searched place). */
export function startPosition(): void {
  if (manual.peek() !== null) {
    batch(() => {
      manual.value = null;
      position.value = null;
    });
  }
  const dev = devPosition();
  if (dev) return dev();
  if (!navigator.geolocation) {
    positionState.value = 'unavailable';
    return;
  }
  stopWatch();
  if (!position.peek()) positionState.value = 'asking';
  watch = navigator.geolocation.watchPosition(
    ({ coords }) => {
      position.value = { lng: coords.longitude, lat: coords.latitude, accuracy: coords.accuracy };
      positionState.value = 'on';
      if (compass.peek() !== 'on' && coords.heading !== null && (coords.speed ?? 0) > COURSE_SPEED) turnTo(coords.heading);
    },
    (error) => {
      if (error.code === error.PERMISSION_DENIED) positionState.value = 'denied';
      else if (!position.peek()) positionState.value = 'unavailable'; // a later gap keeps the last position
    },
    { enableHighAccuracy: true, maximumAge: 2000, timeout: 20_000 },
  );
}

/** On start: a position that is already allowed is followed without another tap; iOS shows the compass button. */
export async function initSensors(): Promise<void> {
  if (orientationApi()?.requestPermission) compass.value = 'ask';
  if (devPosition()) return startPosition();
  try {
    if ((await navigator.permissions?.query({ name: 'geolocation' }))?.state === 'granted') {
      startPosition();
      if (compass.peek() !== 'ask') void startCompass();
    }
  } catch {
    /* no permissions API: wait for the tap */
  }
}

/** Development only: `?pos=52.52,13.40` stands in for the position, `&dir=90` also for the compass (testing on a desk). */
function devPosition(): (() => void) | undefined {
  if (!import.meta.env.DEV) return undefined;
  const q = new URLSearchParams(window.location.search);
  const [lat, lng] = (q.get('pos') ?? '').split(',').map(Number);
  if (!q.has('pos') || !Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return () => {
    position.value = { lat: lat!, lng: lng!, accuracy: 5 };
    positionState.value = 'on';
    if (q.has('dir')) {
      heading.value = Number(q.get('dir')) || 0;
      attitude.value = cameraFromAngles(360 - heading.value, 90, 0); // held upright, for the camera view
    }
  };
}
