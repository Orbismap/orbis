// Whether the device has a network at all (`navigator.onLine`). A "true" promises nothing: requests may still fail.
import { signal } from '@preact/signals';

export const online = signal(typeof navigator === 'undefined' || navigator.onLine !== false);

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => (online.value = true));
  window.addEventListener('offline', () => (online.value = false));
}
