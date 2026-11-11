// Values of the mounted layers at the probed point and selected time (LayerHandle.probe via runtime.probeAt).
import { effect, signal } from '@preact/signals';
import { probeAt } from '../../layers/runtime';
import { probe } from '../../state/selection';
import { time } from '../../state/time';

export interface ProbeValue { layerId: string; label: string; value: string }
export const probeValues = signal<ProbeValue[]>([]);

effect(() => {
  const p = probe.value;
  void time.value;
  probeValues.value = p ? probeAt(p.lng, p.lat).map(({ layerId, label, value }) => ({ layerId, label, value })) : [];
});
