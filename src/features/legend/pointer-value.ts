// Value of the top layer under the mouse pointer that reports a numeric probe, in the layer's BASE unit
// (°C, km/h, hPa, mm). The legend draws a marker on its scale from this signal.
import { effect, signal } from '@preact/signals';
import { probeAt } from '../../layers/runtime';
import { time } from '../../state/time';
import { pointerLngLat } from '../../state/ui';

export const pointerValue = signal<{ layerId: string; value: number } | null>(null);

effect(() => {
  const p = pointerLngLat.value;
  void time.value; // re-read when the selected time changes
  if (!p) return void (pointerValue.value = null);
  const hit = (probeAt(p.lng, p.lat) as { layerId: string; numeric?: number }[]).find((r) => typeof r.numeric === 'number');
  const next = hit ? { layerId: hit.layerId, value: hit.numeric! } : null;
  const cur = pointerValue.peek();
  if (cur?.layerId !== next?.layerId || cur?.value !== next?.value) pointerValue.value = next;
});
