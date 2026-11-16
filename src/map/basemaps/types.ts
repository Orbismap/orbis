import type { LayerSpecification, SourceSpecification } from 'maplibre-gl';
import type { BasemapId } from '../types';

export type LabelVariant = 'dark' | 'light' | 'imagery' | 'karte';

export interface BasemapDef {
  id: BasemapId;
  label: string;
  /** Sources this basemap needs besides the shared 'ofm' vector source. */
  sources: Record<string, SourceSpecification>;
  /** Layers below the slots; all ids start with `bm-<id>-`. Composed hidden, switched by visibility. */
  layers: LayerSpecification[];
  /** Layers that stand on the ground (2.5D buildings): placed above the 'lines' slot, below the labels. */
  topLayers?: LayerSpecification[];
  /** Colour set of the label layers on top of this basemap. */
  labelVariant: LabelVariant;
  /** Colour of the container behind the map (space around the globe). */
  background: string;
  /** Dark basemaps get dark UI chrome hints (terminator tint, attribution). */
  theme: 'dark' | 'light';
  /** Regional basemap: coverage as [west, south, east, north]; offered only where the view touches it. */
  bounds?: [number, number, number, number];
}
