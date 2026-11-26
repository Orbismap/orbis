// What is open, and the actions that more than one part of the app offers.
import { signal } from '@preact/signals';
import { startAdding, stopAdding } from './add';
import { startCompass, startPosition, usePlace } from './sensors';

export const menuOpen = signal(false);
/** The place search is open. */
export const searching = signal(false);
/** The catalogue of things to look for is open. */
export const browsing = signal(false);
/** The camera view (AR) stands in the place of the map. */
export const augmented = signal(false);

/** Call from a tap: iOS asks for the compass only then. */
export function openCameraView(): void {
  augmented.value = true;
  void startCompass();
}

/** Enter a new object where one stands. */
export function openAdding(): void {
  menuOpen.value = false;
  augmented.value = false;
  startAdding();
}

export function openCatalogue(): void {
  menuOpen.value = false;
  browsing.value = true;
}

/** Follow the device's own position. Call from a tap: iOS asks for the compass only then. */
export function useMyPosition(): void {
  menuOpen.value = false;
  startPosition();
  void startCompass();
}

export function openSearch(): void {
  menuOpen.value = false;
  searching.value = true;
}

/** Start from a place picked in the search. */
export function useSearched(place: { title: string; lng: number; lat: number }): void {
  searching.value = false;
  augmented.value = false; // the camera shows where one is, not where one searched
  stopAdding(); // and only what one stands next to is entered
  usePlace(place);
  void startCompass();
}
