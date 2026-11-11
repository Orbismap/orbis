import { mapEngine } from '../../state/ui';
import { toast } from '../../ui/toast';
import { camera } from '../../state/view';

/** Flies the map to a place; keeps at least the current zoom when `zoom` is omitted and the target is a point. */
export function flyToPoint(lng: number, lat: number, zoom?: number): void {
  const z = zoom ?? Math.max(camera.peek().zoom, 6);
  mapEngine.peek()?.flyTo({ center: [lng, lat], zoom: z });
}

export async function copyText(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast(message, { kind: 'ok' });
  } catch {
    // clipboard blocked (insecure context, permissions): fall back to a temporary textarea
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    toast(ok ? message : 'Kopieren nicht möglich', { kind: ok ? 'ok' : 'error' });
  }
}
