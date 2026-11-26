// Content that, on phones, shows inside the app's sheet instead of in a popover over it (Popover `page`).
import { signal } from '@preact/signals';

export interface SheetPanel { key: string; label: string; class?: string; close(): void }
/** The panel that wants to show; the sheet gives it a page of its own. */
export const sheetPanel = signal<SheetPanel | null>(null);
/** The element of that page the panel's content goes into. */
export const sheetPanelHost = signal<HTMLElement | null>(null);
