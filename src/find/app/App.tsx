import { useEffect } from 'preact/hooks';
import { draft, resumeAdding } from '../state/add';
import { startFinder } from '../state/finder';
import { initSensors } from '../state/sensors';
import { augmented, browsing, searching, useSearched } from '../state/ui';
import { AddView } from './AddView';
import { CameraView } from './CameraView';
import { Catalog } from './Catalog';
import { Guide } from './Guide';
import { FindMap } from './FindMap';
import { Menu } from './Menu';
import { PlaceSearch } from './PlaceSearch';

/** Two halves: the map (or the camera view) above, the arrow below. The Orbis menu lies on top, closed to a capsule in the corner. */
export function App() {
  useEffect(() => {
    const stop = startFinder();
    void initSensors();
    void resumeAdding();
    return stop;
  }, []);
  return (
    <>
      <main class="find">
        {draft.value ? <AddView /> : (
          <>
            {augmented.value ? <CameraView /> : <FindMap />}
            <Guide />
          </>
        )}
      </main>
      <Menu />
      {searching.value && <PlaceSearch onClose={() => (searching.value = false)} onPick={useSearched} />}
      {browsing.value && <Catalog onClose={() => (browsing.value = false)} />}
    </>
  );
}
