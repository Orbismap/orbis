// A key the user can enter to unlock or boost sources. One file per key in ./defs; registry.ts collects them.
export type KeyGroupId = 'verkehr' | 'kameras' | 'wetter' | 'karte' | 'dienste';

export interface KeyDef {
  /** = file name; also the name in `settings.keys` */
  id: string;
  /** provider or service name, shown in the list */
  name: string;
  group: KeyGroupId;
  /** one German sentence: what the user gains ("Schiffe weltweit statt nur Ostsee") */
  unlocks: string;
  /** provider page where the key is created */
  url: string;
  /** numbered how-to, one sentence each, without numbers (the UI numbers them) */
  steps: string[];
  placeholder?: string;
  /** returns true for plausible values; the UI shows "Das sieht nicht nach einem gültigen Schlüssel aus" otherwise */
  validate?: (value: string) => boolean;
  /** 'url' for endpoints the user hosts (default 'key') */
  kind?: 'key' | 'url';
}
