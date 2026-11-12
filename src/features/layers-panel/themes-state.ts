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
