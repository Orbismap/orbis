// Orbis Pro: the 3D extension. Everything in this folder is independent of the base app except for the types in
// ../ext/types (the contract) - it can move to its own repository unchanged (see docs/ARCHITECTURE.md, "Erweiterungen
// und Orbis Pro"). three.js is imported only from here, so it ends up in its own lazy chunk.
import type { ExtensionHost, OrbisExtension, TracksChannel } from '../ext/types';
import { PlanesPart } from './planes/planes';
import { ShipsPart } from './ships/ships';
import { Follow } from './world3d/follow';
import { Stage, type StagePart } from './world3d/stage';

/** What the extension needs of a part that presents a channel (aircraft, ships). */
interface TrackPart<T> extends StagePart {
  /** the object with the highlighted model */
  selected: string | null;
  setActive(on: boolean): void;
  feed(items: readonly T[]): void;
  positionOf(id: string): [number, number, number] | null;
}

export const extension: OrbisExtension = {
  id: 'orbis-pro',
  start(host: ExtensionHost) {
    const map = host.map;
    const stage = new Stage(map);
    const planes = new PlanesPart(map, stage, (id) => host.tracks.select(id), host.reducedMotion);
    const ships = new ShipsPart(map, stage, (id) => host.ships.select(id), host.reducedMotion);
    const follow = new Follow(map, stage, host.reducedMotion, host.holdCamera);
    // ships below aircraft: the stage asks the part added last first, so an aircraft over a ship is the one clicked
    stage.add(ships);
    stage.add(planes);
    host.addCustomLayer(stage, 'points');

    // One presenter per channel: 3D at every zoom as soon as the channel has something to show (the base's 2D icons
    // stay otherwise), its own selection, its own follow button. The channels know nothing of each other.
    const bind = <T>(channel: TracksChannel<T>, part: TrackPart<T>, size: () => number) => {
      let on = false;
      let release: (() => void) | null = null;
      const evaluate = () => {
        const show = size() > 0;
        if (show === on) return;
        on = show;
        part.setActive(show);
        if (show) release = channel.present();
        else { release?.(); release = null; }
      };

      const unsubscribe = channel.subscribe((items) => {
        part.feed(items);
        evaluate();
      });

      // A click on a 3D object opens the real card of the layer; the object is highlighted.
      let selectedNow: string | null = null;
      const stopSelected = channel.selectedId.subscribe((id) => {
        selectedNow = id;
        part.selected = id;
        // Following ends when the card is closed or shows something that is not followed. Later, not now: the base
        // clears the card on every map click before the stage sees it, and a click on another object then switches
        // the follow (to this part or another) and selects it again.
        if (follow.followedPart === part && follow.id !== null && follow.id !== id) {
          queueMicrotask(() => {
            if (follow.followedPart === part && follow.id !== null && follow.id !== selectedNow) follow.stop();
          });
        }
        stage.wake();
      });

      // follow camera: a button on the card
      const actions = channel.contributeActions((id) => {
        if (!part.positionOf(id)) return [];
        const following = follow.followedPart === part && follow.id === id;
        return [{ id: 'follow', label: following ? 'Folgen beenden' : 'Folgen', icon: 'locate', active: following, run: () => (following ? follow.stop() : follow.start(part, id)) }];
      });
      const stopFollowListen = follow.listen(() => actions.changed());

      evaluate();
      return () => {
        unsubscribe();
        stopSelected();
        stopFollowListen();
        actions.dispose();
        release?.();
        release = null;
      };
    };

    const unbindPlanes = bind(host.tracks, planes, () => planes.tracker.planes.size);
    const unbindShips = bind(host.ships, ships, () => ships.tracker.ships.size);
    return () => {
      unbindPlanes();
      unbindShips();
      follow.dispose();
      host.removeLayer(stage.id);
    };
  },
};

export default extension;
