import { render } from 'preact';
import type { Map as MlMap } from 'maplibre-gl';
import { releaseSharedMap } from '../forecast/sharedMap';

const DURATION = 450;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);

const nextFrame = () => new Promise<number>((resolve) => requestAnimationFrame(resolve));

/**
 * The weather map grows to the whole screen, then the map app takes over in the same document – no navigation.
 *
 *  1. The map element moves into a fixed layer on <body> at exactly the card's rectangle (the card's own clipping,
 *     containment and stacking context would otherwise trap it).
 *  2. The layer grows to the viewport; MapLibre is resized every frame so the canvas stays sharp. Meanwhile the map app
 *     (a separate chunk) loads.
 *  3. The weather UI is unmounted, the map app boots in the same root and adopts the running map (`bootOrbis`,
 *     `createMapEngine({ adopt })`). Its menus fade in over the map.
 *
 * `hash` is the URL hash in the map app's format (`#/@lat,lng,zoomz?k=wetter&l=…`).
 */
export async function expandToOrbis({ map, slot, hash }: { map: MlMap; slot: HTMLElement; hash: string }): Promise<void> {
  const bootModule = import('../../../boot'); // loads while the map grows
  const element = map.getContainer();
  const from = slot.getBoundingClientRect();
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const layer = document.createElement('div');
  layer.className = 'wx-expand';
  Object.assign(layer.style, {
    top: `${from.top}px`, left: `${from.left}px`, width: `${from.width}px`, height: `${from.height}px`, borderRadius: '20px',
  });
  document.body.appendChild(layer);
  layer.appendChild(element);
  map.resize();

  if (reduced) {
    Object.assign(layer.style, { top: '0', left: '0', width: '100vw', height: '100vh', borderRadius: '0' });
    map.resize();
  } else {
    const start = await nextFrame();
    for (let t = 0; t < 1;) {
      const now = await nextFrame();
      t = Math.min(1, (now - start) / DURATION);
      const e = ease(t);
      Object.assign(layer.style, {
        top: `${from.top * (1 - e)}px`,
        left: `${from.left * (1 - e)}px`,
        width: `${from.width + (window.innerWidth - from.width) * e}px`,
        height: `${from.height + (window.innerHeight - from.height) * e}px`,
        borderRadius: `${20 * (1 - e)}px`,
      });
      map.resize();
    }
    Object.assign(layer.style, { width: '100vw', height: '100vh' });
    map.resize();
  }

  const { bootOrbis } = await bootModule;

  // From here on the weather app is gone. The map element stays in the layer until the map view has moved it.
  const root = document.getElementById('app')!;
  releaseSharedMap(); // the card's cleanup must not take the element back
  render(null, root);
  window.history.pushState({ orbis: true }, '', `${window.location.pathname}${hash}`);
  document.documentElement.dataset.app = 'map';
  document.documentElement.style.background = '';
  bootOrbis(root, { adopt: { map, element } });
  // Back to the first entry means back to the weather dashboard: a fresh load of this page.
  window.addEventListener('popstate', () => { if (!window.location.hash) window.location.reload(); });

  for (let i = 0; i < 180 && element.parentElement === layer; i++) await nextFrame();
  layer.remove();
}
