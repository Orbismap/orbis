// Orbis Pro: the 3D extension. Everything in this folder is independent of the base app except for the types in
// ../ext/types (the contract) - it can move to its own repository unchanged (see docs/ARCHITECTURE.md, "Erweiterungen
// und Orbis Pro"). three.js is imported only from here, so it ends up in its own lazy chunk.
import { effect } from '@preact/signals';
import type { ExtensionHost, FollowRef, OrbisExtension, TracksChannel } from '../ext/types';
import { PlanesPart } from './planes/planes';
import { ShipsPart } from './ships/ships';
import { Follow } from './world3d/follow';
import { Stage, type StagePart } from './world3d/stage';

/** What the extension needs of a part that presents a channel (aircraft, ships). */
/** how long a followed object from the URL is waited for (ms): the data may take a while to arrive */
const FOLLOW_WAIT_MS = 90_000;

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

    // Following from the URL: starts once the object is in the data (and selects it, so its card opens); ends when the URL
    // no longer asks for it. What is followed is reported back, so the URL carries it.
    let pending: { ref: FollowRef; until: number } | null = null;
    const tryPending = () => {
      if (!pending) return;
      if (performance.now() > pending.until) { pending = null; return; }
      const { ref } = pending;
      const [part, channel] = ref.kind === 'flug' ? [planes, host.tracks] : [ships, host.ships];
      if (!part.positionOf(ref.id)) return;
      pending = null;
      channel.select(ref.id);
      follow.start(part, ref.id);
    };
    const stopWanted = effect(() => {
      const ref = host.follow.wanted.value;
      if (!ref) {
        pending = null;
        if (follow.id !== null) follow.stop();
        return;
      }
      pending = { ref, until: performance.now() + FOLLOW_WAIT_MS };
      tryPending();
    });
    const stopReport = follow.listen(() => {
      const id = follow.id;
      host.follow.report(id === null ? null : { kind: follow.followedPart === planes ? 'flug' : 'schiff', id });
    });

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
        tryPending();
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
      stopWanted();
      stopReport();
      unbindPlanes();
      unbindShips();
      follow.dispose();
      host.removeLayer(stage.id);
    };
  },
};

export default extension;
