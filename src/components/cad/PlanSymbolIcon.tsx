import { symbolBox, symbolGeom } from '../../model/planSymbols';

/** A plan symbol on a palette button: drawn at 4 px per paper mm in the button's colour, so the symbols keep their
 * sizes beside each other. The text size is an inline style: the app's `svg text` rule sets 11 px, which in this
 * viewBox would be 11 mm and beats a font-size attribute. */
export default function PlanSymbolIcon({ id, tag }: { id: string; tag?: string }) {
  const g = symbolGeom(id, 0, 0, 1, tag), b = symbolBox(id, tag);
  if (!g || !b) return null;
  const pad = 0.3, w = b.x1 - b.x0 + 2 * pad, h = b.y1 - b.y0 + 2 * pad;
  return (
    <svg aria-hidden="true" width={w * 4} height={h * 4} viewBox={`${b.x0 - pad} ${-b.y1 - pad} ${w} ${h}`}>
      {g.paths.map((p, i) => <path key={`p${i}`} d={`M${p.pts.map((q) => `${q[0]} ${-q[1]}`).join('L')}${p.closed ? 'Z' : ''}`} style={p.fill ? { fill: 'currentColor' } : undefined} />)}
      {g.circles.map((c, i) => <circle key={`c${i}`} cx={c.c[0]} cy={-c.c[1]} r={c.r} style={c.fill ? { fill: 'currentColor' } : undefined} />)}
      {g.texts.map((t, i) => <text key={`t${i}`} x={t.at[0]} y={-t.at[1] + t.h / 2} style={{ fontSize: t.h / 0.716 }} textAnchor={t.side ? 'start' : 'middle'}>{t.s}</text>)}
    </svg>
  );
}
