import { computed, signal } from '@preact/signals';
import { locate, type Located } from '@/map/camera';
import type { Stop } from '../data/types';

export const position = signal<Located | null>(null);
export const locationState = signal<'unknown' | 'asking' | 'granted' | 'denied'>('unknown');

export async function requestLocation(): Promise<void> {
  locationState.value = 'asking';
  try {
    position.value = await locate();
    locationState.value = 'granted';
  } catch {
    locationState.value = 'denied';
  }
}

/** Beim Start still nachsehen: Ist der Standort schon erlaubt, wird er ohne Rückfrage geholt. */
export async function initLocation(): Promise<void> {
  try {
    const status = await navigator.permissions?.query({ name: 'geolocation' });
    if (status?.state === 'granted') await requestLocation();
    else if (status?.state === 'denied') locationState.value = 'denied';
  } catch {
    /* Permissions API fehlt: erst auf Knopfdruck fragen. */
  }
}

/** Der Gerätestandort als Ort für Verbindungssuchen (MOTIS nimmt Koordinaten "lat,lng" als ID). */
export const myLocation = computed<Stop | null>(() => {
  const p = position.value;
  return p ? { id: `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`, name: 'Mein Standort', lat: p.lat, lng: p.lng } : null;
});
