// Orbis Pro: the 3D extension. Everything in this folder is independent of the base app except for the types in
// ../ext/types (the contract) - it can move to its own repository unchanged (see docs/ARCHITECTURE.md, "Erweiterungen
// und Orbis Pro"). three.js is imported only from here, so it ends up in its own lazy chunk.
import type { ExtensionHost, OrbisExtension } from '../ext/types';
import { Follow } from './planes/follow';
import { PlanesPart } from './planes/planes';
import { Stage } from './world3d/stage';

/** From this zoom on the aircraft are drawn in 3D (the old app's threshold); below, the base's 2D icons stay. */
export const PLANES_ENTER_ZOOM = 9;
/** Hysteresis: back to 2D only below this zoom, so a zoom hovering around the threshold does not flicker. */
export const PLANES_LEAVE_ZOOM = 8.7;

export const extension: OrbisExtension = {
  id: 'orbis-pro',
  start(host: ExtensionHost) {
    const map = host.map;
    const stage = new Stage(map);
    const planes = new PlanesPart(map, stage, (id) => host.tracks.select(id));
    const follow = new Follow(map, stage, planes, host.reducedMotion);
    stage.add(planes);
    host.addCustomLayer(stage, 'points');

    // --- presentation: 3D while zoomed in (or following) and there is something to show; 2D otherwise ---
    let on = false;
    let release: (() => void) | null = null;
    const evaluate = () => {
      const z = map.getZoom();
      const want = (on ? z >= PLANES_LEAVE_ZOOM : z >= PLANES_ENTER_ZOOM) || follow.id !== null;
      const show = want && planes.tracker.planes.size > 0;
      if (show === on) return;
      on = show;
      planes.setActive(show);
      if (show) release = host.tracks.present();
      else { release?.(); release = null; }
    };
    map.on('zoom', evaluate);
    map.on('zoomend', evaluate);

    const unsubscribe = host.tracks.subscribe((items) => {
      planes.feed(items);
      evaluate();
    });

    // --- selection: a click on a 3D aircraft opens the real card of the layer; the aircraft is highlighted ---
    const stopSelected = host.tracks.selectedId.subscribe((id) => {
      planes.selected = id;
      // following ends when something else is selected or the card is closed
      if (follow.id !== null && follow.id !== id) follow.stop();
      stage.wake();
    });

    // --- follow camera: a button on the card ---
    const actions = host.tracks.contributeActions((id) => {
      if (!planes.positionOf(id)) return [];
      const following = follow.id === id;
      return [{ id: 'follow', label: following ? 'Folgen beenden' : 'Folgen', icon: 'locate', active: following, run: () => (following ? follow.stop() : follow.start(id)) }];
    });
    const stopFollowListen = follow.listen(() => {
      evaluate();
      actions.changed();
    });

    evaluate();
    return () => {
      map.off('zoom', evaluate);
      map.off('zoomend', evaluate);
      unsubscribe();
      stopSelected();
      stopFollowListen();
      actions.dispose();
      follow.stop();
      release?.();
      release = null;
      host.removeLayer(stage.id);
    };
  },
};

export default extension;
