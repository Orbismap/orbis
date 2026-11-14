// Orbis Pro: the 3D extension. Everything in this folder is independent of the base app except for the types in
// ../ext/types (the contract) - it can move to its own repository unchanged (see docs/ARCHITECTURE.md, "Erweiterungen
// und Orbis Pro"). three.js is imported only from here, so it ends up in its own lazy chunk.
import type { ExtensionHost, OrbisExtension } from '../ext/types';
import { PlanesPart } from './planes/planes';
import { Follow } from './world3d/follow';
import { Stage } from './world3d/stage';

export const extension: OrbisExtension = {
  id: 'orbis-pro',
  start(host: ExtensionHost) {
    const map = host.map;
    const stage = new Stage(map);
    const planes = new PlanesPart(map, stage, (id) => host.tracks.select(id), host.reducedMotion);
    const follow = new Follow(map, stage, host.reducedMotion, host.holdCamera);
    stage.add(planes);
    host.addCustomLayer(stage, 'points');

    // --- presentation: 3D at every zoom as soon as there is something to show; the base's 2D icons stay otherwise ---
    let on = false;
    let release: (() => void) | null = null;
    const evaluate = () => {
      const show = planes.tracker.planes.size > 0;
      if (show === on) return;
      on = show;
      planes.setActive(show);
      if (show) release = host.tracks.present();
      else { release?.(); release = null; }
    };

    const unsubscribe = host.tracks.subscribe((items) => {
      planes.feed(items);
      evaluate();
    });

    // --- selection: a click on a 3D aircraft opens the real card of the layer; the aircraft is highlighted ---
    let selectedNow: string | null = null;
    const stopSelected = host.tracks.selectedId.subscribe((id) => {
      selectedNow = id;
      planes.selected = id;
      // Following ends when the card is closed or shows something that is not followed. Later, not now: the base
      // clears the card on every map click before the stage sees it, and a click on another aircraft then switches
      // the follow and selects it again.
      if (follow.id !== null && follow.id !== id) {
        queueMicrotask(() => {
          if (follow.id !== null && follow.id !== selectedNow) follow.stop();
        });
      }
      stage.wake();
    });

    // --- follow camera: a button on the card ---
    const actions = host.tracks.contributeActions((id) => {
      if (!planes.positionOf(id)) return [];
      const following = follow.followedPart === planes && follow.id === id;
      return [{ id: 'follow', label: following ? 'Folgen beenden' : 'Folgen', icon: 'locate', active: following, run: () => (following ? follow.stop() : follow.start(planes, id)) }];
    });
    const stopFollowListen = follow.listen(() => actions.changed());

    evaluate();
    return () => {
      unsubscribe();
      stopSelected();
      stopFollowListen();
      actions.dispose();
      follow.dispose();
      release?.();
      release = null;
      host.removeLayer(stage.id);
    };
  },
};

export default extension;
