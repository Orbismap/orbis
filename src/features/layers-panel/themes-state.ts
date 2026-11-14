import { signal } from '@preact/signals';
import { getJSON, setJSON } from '../../core/storage';

const KEY = 'suggest-all';
const VERSION = 1;

const validate = (raw: unknown): string[] | undefined => (Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : undefined);

/** Karte ids whose suggestions are fully unfolded ("n weitere anzeigen" was used). */
export const suggestAll = signal<string[]>(getJSON(KEY, VERSION, validate, []));

export const isSuggestAll = (karteId: string): boolean => suggestAll.value.includes(karteId);

export function setSuggestAll(karteId: string, all: boolean): void {
  const rest = suggestAll.peek().filter((id) => id !== karteId);
  suggestAll.value = all ? [...rest, karteId] : rest;
  setJSON(KEY, VERSION, suggestAll.peek());
}

/** Detail page (push navigation) shown inside the layer list; `from` is the label of the back button. */
export const detailPage = signal<{ karteId: string; layerId: string; from: string } | null>(null);
export const openDetail = (karteId: string, layerId: string, from: string) => (detailPage.value = { karteId, layerId, from });
export const closeDetail = () => (detailPage.value = null);

const FKEY = 'field-all';
/** Karte ids whose field list is fully unfolded. */
export const fieldAll = signal<string[]>(getJSON(FKEY, VERSION, validate, []));
export const isFieldAll = (karteId: string): boolean => fieldAll.value.includes(karteId);
export function setFieldAll(karteId: string, all: boolean): void {
  const rest = fieldAll.peek().filter((id) => id !== karteId);
  fieldAll.value = all ? [...rest, karteId] : rest;
  setJSON(FKEY, VERSION, fieldAll.peek());
}

/** Reorder mode of the layer menu (pencil in the bottom bar): grips next to every group and layer. */
export const editMode = signal(false);

export interface MenuOrder { groups?: string[]; layers?: Record<string, string[]> }
const OKEY = 'menu-order';
const validateOrder = (raw: unknown): Record<string, MenuOrder> | undefined =>
  raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, MenuOrder>) : undefined;
/** Own order of groups and of the layers inside them, per Karte id (the themes themselves come from the code). */
export const menuOrder = signal<Record<string, MenuOrder>>(getJSON(OKEY, VERSION, validateOrder, {}));

/** `ids` in the saved order; unknown saved ids are dropped, new ids keep their default place at the end. */
export function applyOrder(ids: string[], saved: string[] | undefined): string[] {
  if (!saved?.length) return ids;
  const known = saved.filter((id) => ids.includes(id));
  return [...known, ...ids.filter((id) => !known.includes(id))];
}

export function saveOrder(karteId: string, patch: { groups?: string[]; group?: { id: string; ids: string[] } }): void {
  const cur = menuOrder.peek()[karteId] ?? {};
  const next: MenuOrder = { ...cur };
  if (patch.groups) next.groups = patch.groups;
  if (patch.group) next.layers = { ...cur.layers, [patch.group.id]: patch.group.ids };
  menuOrder.value = { ...menuOrder.peek(), [karteId]: next };
  setJSON(OKEY, VERSION, menuOrder.peek());
}
