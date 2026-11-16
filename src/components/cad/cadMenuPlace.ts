import { useLayoutEffect, useState, type CSSProperties, type RefObject } from 'react';

/** Design CAD: keeps a right-click menu, and the list opened beside one of its rows, inside the drawing area. The area
 * clips whatever runs past its edges (`.cad-stage{overflow:hidden}`), so a menu opened low in the drawing used to lose
 * its last rows. Pure placement first, then the hooks that measure the menu and apply it. */

/** Between the cursor and the menu, and from the area's edges (px). */
export const MENU_GAP = 4;

export interface Size { width: number; height: number }
export interface Box extends Size { left: number; top: number }
export interface Place { left: number; top: number; maxHeight?: number }

/** One axis: after the cursor when it fits there, before it when that fits, else against the far edge (never past the
 * near one). */
function along(c: number, len: number, span: number, gap: number): number {
  if (c + gap + len <= span - gap) return c + gap;
  if (c - gap - len >= gap) return c - gap - len;
  return Math.max(gap, span - gap - len);
}

/** The menu opened at the cursor (`at`, in the area): right and down from it; near the right edge to the left of it,
 * near the bottom above it; taller than the area: at its top with the height capped, so the menu scrolls. */
export function placeMenu(at: readonly [number, number], size: Size, area: Size, gap = MENU_GAP): Place {
  const left = along(at[0], size.width, area.width, gap);
  const room = area.height - 2 * gap;
  if (size.height > room) return { left, top: gap, maxHeight: Math.max(0, room) };
  return { left, top: along(at[1], size.height, area.height, gap) };
}

/** The list (▸) of a row: right of the menu with its first entry level with the row, or left of the menu when there is
 * no room on the right (over the menu at the area's right edge when there is room on neither side); moved up to stay
 * inside, its height capped. All boxes in one frame (here the window's: the list is `position: fixed`, so the menu's
 * own scrolling does not clip it). `inset` is the list's padding and border above its first entry. */
export function placeList(menu: Box, row: Box, size: Size, area: Box, gap = MENU_GAP, inset = 4): Place {
  let left = menu.left + menu.width + gap;
  if (left + size.width > area.left + area.width - gap) left = menu.left - gap - size.width;
  if (left < area.left + gap) left = Math.max(area.left + gap, area.left + area.width - gap - size.width);
  const room = area.height - 2 * gap;
  if (size.height > room) return { left, top: area.top + gap, maxHeight: Math.max(0, room) };
  const top = Math.max(area.top + gap, Math.min(row.top - inset, area.top + area.height - gap - size.height));
  return { left, top };
}

const boxOf = (r: DOMRect): Box => ({ left: r.left, top: r.top, width: r.width, height: r.height });
const sameStyle = (a: CSSProperties, b: CSSProperties) => a.left === b.left && a.top === b.top && a.maxHeight === b.maxHeight && a.position === b.position;

/** The menu's place, measured after it is laid out (before it shows): `left` / `top` are where it would open (the
 * cursor plus MENU_GAP), `key` changes when its entries do. Off (`on` false) or without layout (tests), as given. */
export function useMenuPlace(ref: RefObject<HTMLElement | null>, left: number, top: number, key: unknown, on = true): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({ left, top });
  useLayoutEffect(() => {
    const el = ref.current, area = el?.offsetParent as HTMLElement | null | undefined;
    let next: CSSProperties = { left, top };
    if (on && el && area && area.clientWidth > 0 && area.clientHeight > 0) {
      // The whole height, also when the menu was capped before.
      const height = el.scrollHeight + el.offsetHeight - el.clientHeight;
      const p = placeMenu([left - MENU_GAP, top - MENU_GAP], { width: el.offsetWidth, height }, { width: area.clientWidth, height: area.clientHeight });
      next = { left: p.left, top: p.top, ...(p.maxHeight !== undefined ? { maxHeight: p.maxHeight, overflowY: 'auto' } : {}) };
    }
    setStyle((s) => (sameStyle(s, next) ? s : next));
  }, [ref, left, top, key, on]);
  return style;
}

/** The list opened beside a row of the menu (`row` the row's element, null when none is open). */
export function useListPlace(menu: RefObject<HTMLElement | null>, row: HTMLElement | null, list: RefObject<HTMLElement | null>, key: unknown): CSSProperties | undefined {
  const [style, setStyle] = useState<CSSProperties | undefined>(undefined);
  useLayoutEffect(() => {
    const m = menu.current, l = list.current, area = m?.offsetParent as HTMLElement | null | undefined;
    let next: CSSProperties | undefined;
    if (m && l && row && area && area.clientWidth > 0 && area.clientHeight > 0) {
      const p = placeList(boxOf(m.getBoundingClientRect()), boxOf(row.getBoundingClientRect()), { width: l.offsetWidth, height: l.offsetHeight }, boxOf(area.getBoundingClientRect()));
      next = { position: 'fixed', left: p.left, top: p.top, ...(p.maxHeight !== undefined ? { maxHeight: p.maxHeight } : {}) };
    }
    setStyle((s) => (s && next && sameStyle(s, next) ? s : next));
  }, [menu, row, list, key]);
  return style;
}
