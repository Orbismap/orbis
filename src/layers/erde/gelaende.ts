// "Gelände": switches on the map's terrain height map (Mapterhorn DEM), whatever the basemap mode asks for. It has no
// data of its own: the DEM source is part of every style, the layer only tells the map engine to raise the terrain.
import { DEM_SOURCE } from '../../render/gl/latest';
import { terrainLayerOn } from '../../state/view';
import { defineLayer } from '../define';

export default defineLayer({
  id: 'gelaende',
  category: 'erde',
  title: 'Gelände',
  summary: '3D-Höhenmodell der Erde: Berge und Täler heben sich auf der Karte ab, auch in der Datenansicht',
  icon: 'mountain',
  color: '#9C876B',
  form: 'raster',
  cadence: 'static',
  coverage: 'Welt',
  sources: [DEM_SOURCE],
  keywords: ['gelände', 'gelaende', '3d', 'höhe', 'hoehe', 'höhenmodell', 'heights', 'terrain', 'relief', 'berg', 'berge', 'tal', 'täler', 'dem', 'dgm', 'mapterhorn'],

  mount(ctx) {
    terrainLayerOn.value = true;
    ctx.status({ state: 'ready' });
    return {
      destroy() {
        terrainLayerOn.value = false;
      },
    };
  },
});
