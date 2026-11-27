import type { ReadonlySignal } from '@preact/signals';
import type { Bucket } from '../data/endpoints';
import type { Resource, ResourceSpec } from '../data/resource';
import type { MapEngine } from '../map/types';
import type { IconName } from '../ui/icons/names';

export type CategoryId = 'wetter' | 'gefahren' | 'verkehr' | 'infrastruktur' | 'wasser' | 'erde' | 'meer' | 'medien' | 'gesellschaft';
export type LayerForm = 'field' | 'raster' | 'points' | 'lines' | 'areas' | 'tracks';
export type Cadence = 'live' | 'minutes' | 'hourly' | 'daily' | 'static';

export interface SourceRef {
  name: string; url: string; license: string;
  manifest?: { bucket: Bucket; key: string };   // for the age display
}

export type OptionSpec = (
  | { id: string; label: string; type: 'range'; min: number; max: number; step: number; default: number; unit?: string }
  | { id: string; label: string; type: 'select'; choices: { value: string; label: string }[]; default: string }
  /** Multiple choice (a filter): the value is 'all' or the chosen values joined by commas, see layers/multi.ts. `choices` starts with the entry 'all'. */
  | { id: string; label: string; type: 'multi'; choices: { value: string; label: string }[]; default: string }
  | { id: string; label: string; type: 'toggle'; default: boolean }
) & {
  /** Die Option erscheint nur, solange das für die gewählten Optionen gilt (z. B. nur in einer bestimmten Ansicht). Ohne: immer. */
  when?(options: OptionValues): boolean;
};
export type OptionValues = Record<string, number | string | boolean>;

export type LegendSpec =
  | { type: 'scale'; unit: string; stops: [value: number, color: string][]; ticks: number[]; format?: (v: number) => string }
  | { type: 'classes'; items: { color: string; label: string; shape?: 'dot' | 'line' | 'square' }[] }
  | { type: 'size'; unit: string; items: { size: number; label: string }[]; color: string };

export interface TimeSpec {
  /** Range relative to now in ms, e.g. radar [-2 h, +0.5 h], forecast [0, +72 h], quakes [-7 d, 0] */
  range(options: OptionValues): { start: number; end: number; step?: number; frames?: number[] };
  /** 'frames': discrete/interpolated time steps; 'window': shows events up to the selected time */
  mode: 'frames' | 'window';
  /** Zeitleiste nur, solange das gilt (nach den gewählten Optionen, ohne Eintrag: immer), z. B. nur in der Ansicht mit Zeitbezug. */
  enabled?(options: OptionValues): boolean;
}

export interface LayerStatus {
  state: 'loading' | 'ready' | 'empty' | 'error'; count?: number; updatedAt?: number; note?: string;
  /** Set by the runtime: the layer is not mounted because this required key is missing. */
  needsKey?: string;
  /** Set by the runtime: the layer (or its Karte) waits for the user to confirm its content warning. */
  needsConfirm?: boolean;
}
export interface SensitiveSpec { title: string; text: string }
export interface LayerKeyRef { id: string; /** true: the layer does nothing without it; false: the key "boosts" it */ required: boolean }

export interface InspectCard {
  title: string; subtitle?: string; time?: number; color?: string; icon?: IconName;
  /** Small logo shown in place of the icon, e.g. a radio station's favicon. */
  logo?: string;
  facts: { label: string; value: string; emphasis?: boolean }[];
  text?: string;
  media?: { type: 'image' | 'video' | 'audio' | 'hls'; url: string; poster?: string; refresh?: number };
  links?: { label: string; url: string }[];
  /** A simple vertical timeline (steps of an event): `at` is the small label on the left, a step with `run` is a button. */
  timeline?: { at?: string; title: string; text?: string; run?(): void }[];
  location?: [lng: number, lat: number];
  /** Desktop: show this as the place card (like a searched place) instead of the inspector card. Needs `location`; `subtitle` is the type line. */
  asPlace?: boolean;
  /** Shows a back button in place of the icon (closes the card; whoever opened it brings its own menu back). */
  backLabel?: string;
  /** Extra buttons of the card, e.g. contributed by an extension ("Folgen"). Rendered by the inspector as plain buttons. */
  actions?: { id: string; label: string; icon?: IconName; active?: boolean; /** the main action of the card: drawn as the primary button */ primary?: boolean; run(): void }[];
}

export interface FeedItem { id: string; title: string; subtitle?: string; time?: number; magnitude?: number; color?: string; location: [number, number];
  /** What a click on the feed row opens (the layer's real card). Kits attach it lazily from `describe`. */
  card?: InspectCard }

export interface LayerContext {
  id: string;
  map: MapEngine;
  signal: AbortSignal;                           // aborted when the layer is switched off
  opacity: ReadonlySignal<number>;               // 0..1
  options: ReadonlySignal<OptionValues>;
  time: ReadonlySignal<number>;                  // selected time (ms); Date.now() while "live"
  status(s: LayerStatus): void;
  resource<T>(spec: ResourceSpec<T>): Resource<T>;   // disposed automatically when the layer is switched off
  feed(items: FeedItem[]): void;                 // "Aktuell" list + marks on the timeline
  marks(times: ArrayLike<number>, colors?: ArrayLike<string>): void;         // only marks on the timeline (event times in ms), for layers with too many events for a list
  key(id: string): ReadonlySignal<string | undefined>;   // value of a user key (see src/keys), reactive
  select(card: InspectCard | null): void;        // opens the inspector
  /** The card currently shown in the inspector (any layer); kits use it to draw their selection ring. */
  /** True for cards this layer passed to `select` itself (also later updates of the same card): kits keep their ring. */
  ownSelection?(card: InspectCard | null): boolean;
  selection: ReadonlySignal<InspectCard | null>;
}

export interface LayerHandle {
  /** `numeric`: the value in the base unit (°C, km/h, hPa, mm); the legend marker uses it. */
  probe?(at: { lng: number; lat: number }): { label: string; value: string; numeric?: number } | null;
  destroy(): void;
}

export interface LayerDef {
  id: string;                    // = file name
  category: CategoryId;
  title: string;                 // "Erdbeben"
  summary: string;               // one sentence on what you see
  icon: IconName;
  color: string;                 // lead colour of the layer in list and map
  form: LayerForm;
  cadence: Cadence;
  coverage?: string;             // 'Welt' (default), 'Europa', 'DE', 'USA' …
  sources: SourceRef[];
  exclusive?: 'field';           // at most one field layer at a time
  time?: TimeSpec;
  minZoom?: number;              // below: hint "näher heranzoomen"
  options?: OptionSpec[];
  legend?: LegendSpec | ((o: OptionValues) => LegendSpec);
  keywords?: string[];           // for search
  keys?: LayerKeyRef[];          // user keys: required = not mounted without it, optional = boosts the layer
  sensitive?: SensitiveSpec;     // content warning, confirmed once before the layer is shown
  mount(ctx: LayerContext): LayerHandle | Promise<LayerHandle>;
}

export type { Resource, ResourceSpec } from '../data/resource';
