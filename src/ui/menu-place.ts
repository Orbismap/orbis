// Where a menu goes that opens at a button: on the side of the button with more room, never past the screen.
export interface Box { left: number; right: number; top: number; bottom: number }
export interface MenuPlace { left: number; width: number; top?: number; bottom?: number; /** height available there */ room: number }

const EDGE = 8;
const GAP = 6;
const WIDTH = 288;

export function placeMenu(anchor: Box, view: { width: number; height: number }, align: 'start' | 'end'): MenuPlace {
  const width = Math.min(WIDTH, view.width - 2 * EDGE);
  const left = Math.max(EDGE, Math.min(view.width - EDGE - width, align === 'end' ? anchor.right - width : anchor.left));
  const below = view.height - anchor.bottom;
  const room = Math.max(below, anchor.top) - GAP - EDGE;
  return below >= anchor.top ? { left, width, top: anchor.bottom + GAP, room } : { left, width, bottom: view.height - anchor.top + GAP, room };
}
