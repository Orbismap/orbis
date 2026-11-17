// Multiple choice for filter options (option type `multi`). The stored value is a string: 'all' (no filter) or the chosen values
// joined by commas ('wind,solar'). Every consumer reads it through `multiValues`, so layers never parse the string themselves.
export const MULTI_ALL = 'all';

/** The chosen values, or null for "all" (no filter). */
export function multiValues(v: unknown): string[] | null {
  const s = String(v ?? MULTI_ALL).trim();
  // 'alle': the stored default of the layer "orte" from before it was a multiple choice
  if (!s || s === MULTI_ALL || s === 'alle') return null;
  const list = s.split(',').filter((x) => x && x !== MULTI_ALL);
  return list.length ? list : null;
}

/** Does the value pass the option? */
export const multiHas = (v: unknown, value: string): boolean => {
  const list = multiValues(v);
  return list === null || list.includes(value);
};

/**
 * Tap on a row. "Alle" resets. From "all" the first tap picks just that value (the usual case: show only wind), further taps add
 * or remove; removing the last one or choosing every value goes back to "all".
 */
export function toggleMulti(current: unknown, value: string, allValues: readonly string[]): string {
  if (value === MULTI_ALL) return MULTI_ALL;
  const list = multiValues(current);
  if (list === null) return value;
  const next = list.includes(value) ? list.filter((x) => x !== value) : [...list, value];
  if (!next.length || allValues.every((a) => next.includes(a))) return MULTI_ALL;
  return next.join(',');
}
