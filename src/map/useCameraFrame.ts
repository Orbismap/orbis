import { effect } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import { mapEngine } from '../state/ui';
import { onCameraFrame, type CameraFrame } from './frame';

/** Runs `cb` for every camera frame (and once on mount / when `deps` change). No re-render: write to refs inside `cb`. */
export function useCameraFrame(cb: (f: CameraFrame) => void, deps: unknown[] = []): void {
  const ref = useRef(cb);
  ref.current = cb;
  useEffect(() => {
    let off: (() => void) | undefined;
    const stop = effect(() => {
      const engine = mapEngine.value;
      off?.();
      off = engine ? onCameraFrame(engine.ml, (f) => ref.current(f)) : undefined;
    });
    return () => (stop(), off?.());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
