import type { SystemLayout } from '../../diagram/layout';
import type { PickItem } from '../../model/sldMenuEdit';

/** Where each pickable load and board sits on the single line diagram, in drawing units: the point a window pick tests and a
 * zoom fits. A way sits at its symbol, a board with a busbar at the middle of its busbar. */
export interface PickPoint { item: PickItem; x: number; y: number }

export function pickPoints(layout: SystemLayout, elcbRowOf: Map<string, number>): PickPoint[] {
  const out: PickPoint[] = [];
  for (const n of layout.feeders) {
    const f = n.feeder, ex = elcbRowOf.get(f.boardId) ?? 0;
    const board = n.childBoardId ?? f.feedsBoardId;
    const incomer = !!n.childBoardId && !n.panelBoardId;
    out.push({ item: board ? { kind: 'board', id: board } : { kind: 'feeder', id: f.id }, x: n.x, y: n.busY + (incomer ? 34 : 94 + ex) });
  }
  for (const b of layout.boards) if (!b.boxed && !b.terminal) out.push({ item: { kind: 'board', id: b.board.id }, x: (b.busX1 + b.busX2) / 2, y: b.busY });
  return out;
}

export interface Rect { x0: number; y0: number; x1: number; y1: number }

/** The items whose point lies inside the window (corners in any order), each once. */
export function pickInWindow(points: PickPoint[], r: Rect): PickItem[] {
  const x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), y0 = Math.min(r.y0, r.y1), y1 = Math.max(r.y0, r.y1);
  const seen = new Set<string>(), out: PickItem[] = [];
  for (const p of points) {
    if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
    const key = `${p.item.kind}:${p.item.id}`;
    if (!seen.has(key)) { seen.add(key); out.push(p.item); }
  }
  return out;
}

/** Adds items to a list of picks, without repeating any. */
export function mergePicks(list: PickItem[], more: PickItem[]): PickItem[] {
  const out = [...list];
  for (const m of more) if (!out.some((x) => x.kind === m.kind && x.id === m.id)) out.push(m);
  return out;
}

/** The view that shows the picked items' points with a margin, in the shape of the screen (units); undefined with nothing to show. */
export function zoomBox(points: PickPoint[], picked: PickItem[], aspect: number, margin = 100): { x: number; y: number; w: number; h: number } | undefined {
  const mine = points.filter((p) => picked.some((q) => q.kind === p.item.kind && q.id === p.item.id));
  if (!mine.length) return undefined;
  // A way is hung from its busbar: take the busbar's height too, so the whole way is in view.
  const xs = mine.map((p) => p.x), ys = mine.map((p) => p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys) - 100, maxY = Math.max(...ys);
  let w = Math.max(maxX - minX + margin * 2, 400), h = Math.max(maxY - minY + margin * 2, 300);
  if (w / h < aspect) w = h * aspect; else h = w / aspect;
  return { x: (minX + maxX) / 2 - w / 2, y: (minY + maxY) / 2 - h / 2, w, h };
}
