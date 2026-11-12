import { useEffect, useState } from 'preact/hooks';
import { mapEngine } from '../../state/ui';
import { OrbisSpinner } from './OrbisSpinner';
import './splash.css';

/** Start splash: shown until the first map is ready, then fades out and unmounts. */
export function Splash() {
  const [state, setState] = useState<'on' | 'fading' | 'gone'>('on');
  const engine = mapEngine.value;
  useEffect(() => {
    if (!engine) return;
    let alive = true;
    engine.ready.then(() => alive && setState('fading'));
    return () => { alive = false; };
  }, [engine]);
  useEffect(() => {
    if (state !== 'fading') return;
    const t = setTimeout(() => setState('gone'), 500);
    return () => clearTimeout(t);
  }, [state]);
  if (state === 'gone') return null;
  return (
    <div class="splash" data-fading={state === 'fading'} aria-hidden={state === 'fading'}>
      <OrbisSpinner size={112} />
    </div>
  );
}
