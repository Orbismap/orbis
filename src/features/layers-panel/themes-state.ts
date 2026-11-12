import { signal } from '@preact/signals';
import { getJSON, setJSON } from '../../core/storage';

const KEY = 'themes-open';
const VERSION = 1;
type OpenMap = Record<string, string[]>;

const validate = (raw: unknown): OpenMap | undefined => {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: OpenMap = {};
  for (const [k, v] of Object.entries(raw)) if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
  return out;
};

/** Open topics per Karte id. A Karte without an entry shows its first topic open. */
export const openThemes = signal<OpenMap>(getJSON(KEY, VERSION, validate, {}));

export const isThemeOpen = (karteId: string, themeId: string, firstId: string | undefined): boolean =>
  (openThemes.value[karteId] ?? (firstId ? [firstId] : [])).includes(themeId);

export function setThemeOpen(karteId: string, themeId: string, open: boolean, firstId?: string): void {
  const cur = openThemes.peek()[karteId] ?? (firstId ? [firstId] : []);
  const next = open ? [...cur.filter((t) => t !== themeId), themeId] : cur.filter((t) => t !== themeId);
  openThemes.value = { ...openThemes.peek(), [karteId]: next };
  setJSON(KEY, VERSION, openThemes.peek());
}

/** Detail page (push navigation) shown inside the layer list; `from` is the label of the back button. */
export const detailPage = signal<{ karteId: string; layerId: string; from: string } | null>(null);
export const openDetail = (karteId: string, layerId: string, from: string) => (detailPage.value = { karteId, layerId, from });
export const closeDetail = () => (detailPage.value = null);
