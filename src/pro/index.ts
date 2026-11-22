// Orbis Pro: the 3D extension. Everything in this folder is independent of the base app except for the types in
// ../ext/types (the contract) - it can move to its own repository unchanged (see docs/ARCHITECTURE.md, "Erweiterungen
// und Orbis Pro"). three.js is imported only from here, so it ends up in its own lazy chunk.
import { effect } from '@preact/signals';
import type { ExtensionHost, FollowRef, OrbisExtension, TracksChannel } from '../ext/types';
import { BaeumePart } from './baeume/baeume';
import { GebaeudePart } from './gebaeude/gebaeude';
import { LandmarksPart } from './landmarks/landmarks';
import { PlanesPart } from './planes/planes';
import { ShipsPart } from './ships/ships';
import { StromnetzPart } from './stromnetz/stromnetz';
import { TilesetPart } from './tiles3d/tileset';
import { Follow } from './world3d/follow';
import { Stage, STAGE_LAYER_ID, type StagePart } from './world3d/stage';

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
    const stage = new Stage(map, (below) => host.placeLayer(STAGE_LAYER_ID, below ? 'below-data' : 'points'));
    const planes = new PlanesPart(map, stage, (id) => host.tracks.select(id), host.reducedMotion);
    const ships = new ShipsPart(map, stage, (id) => host.ships.select(id), host.reducedMotion);
    const power = new StromnetzPart(map, stage);
    const trees = new BaeumePart(map, stage);
    const buildings = new GebaeudePart(map, stage, host.buildingHeightFactor);
    const landmarks = new LandmarksPart(map, stage, host.buildingHeightFactor, host.mapDark, host.landmarkLabels);
    let tilesPresent = false;
    let tilesRelease: (() => void) | null = null;
    let stateKey = '';
    const tiles = new TilesetPart(map, ({ names, loading, error, ionError, ionRoots }) => {
      const key = `${loading}|${error ?? ''}|${ionError ?? ''}|${ionRoots ?? ''}`;
      if (key !== stateKey) { stateKey = key; host.reportTilesets({ loading, error, ionError, ionRoots }); }
      // the base's outlines disappear while a model is in view; elsewhere they show where models exist
      const show = names.length > 0;
      if (show === tilesPresent) return;
      tilesPresent = show;
      if (show) tilesRelease = host.tilesets.present();
      else { tilesRelease?.(); tilesRelease = null; }
    });
    const follow = new Follow(map, stage, host.reducedMotion, host.holdCamera);
    // below aircraft and ships: the stage asks the part added last first, so an aircraft over a pylon is the one clicked
    stage.add(tiles);
    stage.add(buildings);
    stage.add(landmarks);
    stage.add(power);
    stage.add(trees);
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

    // The power grid has no selection or follow. The layer publishes towers from zoom 14 and an empty list below, so
    // the 3D presentation switches itself on and off with the zoom; present() hides the 2D tower dots meanwhile.
    let powerOn = false;
    let powerRelease: (() => void) | null = null;
    const evaluatePower = () => {
      const show = power.count > 0;
      if (show === powerOn) return;
      powerOn = show;
      power.setActive(show);
      if (show) powerRelease = host.power.present();
      else { powerRelease?.(); powerRelease = null; }
    };
    const stopPower = host.power.subscribe((items) => {
      power.feed(items);
      evaluatePower();
    });
    evaluatePower();
    // Trees work the same way: the layer publishes them from zoom 15 and an empty list below.
    let treesOn = false;
    let treesRelease: (() => void) | null = null;
    const evaluateTrees = () => {
      const show = trees.count > 0;
      if (show === treesOn) return;
      treesOn = show;
      trees.setActive(show);
      if (show) treesRelease = host.trees.present();
      else { treesRelease?.(); treesRelease = null; }
    };
    const stopTrees = host.trees.subscribe((items) => {
      trees.feed(items);
      evaluateTrees();
    });
    evaluateTrees();
    // Buildings: the layer publishes them from zoom 13.5 and an empty list below; while they are drawn the basemap's 2.5D houses step aside.
    let buildingsOn = false;
    let buildingsRelease: (() => void) | null = null;
    // `ready`: the first list is modelled (it is done in slices); the 2.5D houses step aside then, and come back only when the list is empty.
    const evaluateBuildings = () => {
      const show = buildings.ready;
      if (show === buildingsOn) return;
      buildingsOn = show;
      buildings.setActive(show);
      if (show) buildingsRelease = host.buildings.present();
      else { buildingsRelease?.(); buildingsRelease = null; }
    };
    buildings.onChange = evaluateBuildings;
    const stopBuildings = host.buildings.subscribe((items) => {
      buildings.feed(items);
      evaluateBuildings();
    });
    // Landmarks: published from zoom 13 by the base (no layer), an empty list below. They are drawn above the buildings: the model has priority.
    const stopLandmarks = host.landmarks.subscribe((items) => {
      landmarks.feed(items);
      landmarks.setActive(items.length > 0);
    });
    const stopTiles = host.tilesets.subscribe((items) => tiles.feed(items));

    return () => {
      stopWanted();
      stopReport();
      unbindPlanes();
      unbindShips();
      stopPower();
      stopTrees();
      stopBuildings();
      stopLandmarks();
      stopTiles();
      tilesRelease?.();
      powerRelease?.();
      treesRelease?.();
      buildingsRelease?.();
      follow.dispose();
      host.removeLayer(stage.id);
    };
  },
};

export default extension;
