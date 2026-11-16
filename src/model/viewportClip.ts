/** A clipped viewport (VPCLIP): a viewport of a layout whose outline is a polygon instead of its frame's rectangle. The
 * outline is kept with the viewport as corners in fractions of its frame — across from the frame's left edge and down
 * from its top edge, 0 … 1 — so it moves, resizes and rearranges with the frame. The frame is the outline's bounding
 * box. A point is inside by the even-odd rule, as the screen and the plot clip. 2D only. */

type Pt = [number, number];
/** The outline's corners in fractions of the frame: [across from the left, down from the top]. Three or more. */
export type VpClip = Pt[];
/** A frame on the paper, y down: left, top, width, height (mm). */
type Frame = [number, number, number, number];

/** The smallest frame side (mm) and outline area (mm²) a clipped viewport may have. */
const MIN_SIDE_MM = 2, MIN_AREA_MM2 = 4;

/** A polygon picked on the paper (mm, y down) as a frame and the outline in it. A corner picked twice running, and a last
 * corner on the first, count once. Undefined when what is left is no polygon: fewer than three corners, a frame under
 * 2 mm a side, or next to no area. */
export function clipFromPaper(picked: Pt[]): { box: Frame; clip: VpClip } | undefined {
  const pts: Pt[] = [];
  for (const p of picked) { const q = pts[pts.length - 1]; if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-6) pts.push(p); }
  if (pts.length > 1 && Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) <= 1e-6) pts.pop();
  if (pts.length < 3) return undefined;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  let area = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) area += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
  if (w < MIN_SIDE_MM || h < MIN_SIDE_MM || Math.abs(area) / 2 < MIN_AREA_MM2) return undefined;
  return { box: [x0, y0, w, h], clip: pts.map(([x, y]): Pt => [+((x - x0) / w).toFixed(5), +((y - y0) / h).toFixed(5)]) };
}

/** The outline's corners on the paper (mm, y down) for a frame. */
export const clipOnPaper = (clip: VpClip, [left, top, w, h]: Frame): Pt[] => clip.map(([fx, fy]): Pt => [left + fx * w, top + fy * h]);

/** An outline as it must be when read from a file or a template: three or more corners, each a pair of numbers 0 … 1. */
export const isVpClip = (v: unknown): v is VpClip => Array.isArray(v) && v.length >= 3
  && v.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === 'number' && n >= 0 && n <= 1));

/** Whether a point is inside a polygon (even-odd). */
export function insidePolygon([x, y]: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** The pieces of the segment a–b that lie inside a polygon, in order from a. */
export function segmentInPolygon(a: Pt, b: Pt, poly: Pt[]): [Pt, Pt][] {
  const dx = b[0] - a[0], dy = b[1] - a[1], ts = [0, 1];
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [px, py] = poly[j], ex = poly[i][0] - px, ey = poly[i][1] - py, den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue; // parallel to this side
    const t = ((px - a[0]) * ey - (py - a[1]) * ex) / den, u = ((px - a[0]) * dy - (py - a[1]) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((p, q) => p - q);
  const at = (t: number): Pt => [a[0] + t * dx, a[1] + t * dy], out: [Pt, Pt][] = [];
  let end = -1;
  for (let i = 0; i + 1 < ts.length; i++) {
    if (ts[i + 1] - ts[i] < 1e-9 || !insidePolygon(at((ts[i] + ts[i + 1]) / 2), poly)) continue;
    if (out.length && Math.abs(end - ts[i]) < 1e-9) out[out.length - 1][1] = at(ts[i + 1]); else out.push([at(ts[i]), at(ts[i + 1])]);
    end = ts[i + 1];
  }
  return out;
}
