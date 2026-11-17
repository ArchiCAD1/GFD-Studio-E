import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { colourIndex, colourLabel, INDEX_COLOURS, indexColour, NAMED_COLOURS, parseColour, colourCss } from '../../model/cadColours';

type PickerTab = 'index' | 'true';
type RgbFields = { r: string; g: string; b: string };

const rgbFields = (colour: string): RgbFields => ({
  r: String(parseInt(colour.slice(1, 3), 16)),
  g: String(parseInt(colour.slice(3, 5), 16)),
  b: String(parseInt(colour.slice(5, 7), 16))
});
const trueColourOf = (value: string | undefined) => colourCss(value) ?? INDEX_COLOURS[7];
const within = (n: number, low: number, high: number) => Math.max(low, Math.min(n, high));

/** The layer and object colour dialog. It is portalled out of a ribbon panel so ribbon button sizing cannot enlarge its
 * cells, and placed beside the field while kept wholly inside the window. Changes apply with OK; Cancel and Escape leave
 * the colour alone. */
export function ColourPicker({ label, value, blank = 'ByLayer', varies, onChange }: { label: string; value: string | undefined; blank?: string; varies?: boolean; onChange: (c: string | undefined) => void }) {
  const initialTrue = trueColourOf(value);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<PickerTab>(value && colourIndex(value) === undefined ? 'true' : 'index');
  const [indexChoice, setIndexChoice] = useState<number | undefined>(colourIndex(value));
  const [indexText, setIndexText] = useState(colourIndex(value)?.toString() ?? '');
  const [indexValid, setIndexValid] = useState(true);
  const [trueChoice, setTrueChoice] = useState(initialTrue);
  const [hexText, setHexText] = useState(initialTrue.toUpperCase());
  const [rgb, setRgb] = useState<RgbFields>(() => rgbFields(initialTrue));
  const [trueValid, setTrueValid] = useState(true);
  const [position, setPosition] = useState({ left: 8, top: 8, ready: false });
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  const openPicker = () => {
    if (open) { setOpen(false); return; }
    const n = colourIndex(value), c = trueColourOf(value);
    setTab(value && n === undefined ? 'true' : 'index');
    setIndexChoice(n); setIndexText(n?.toString() ?? ''); setIndexValid(true);
    setTrueChoice(c); setHexText(c.toUpperCase()); setRgb(rgbFields(c)); setTrueValid(true);
    setPosition({ left: 8, top: 8, ready: false });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const node = e.target as Node;
      if (!trigger.current?.contains(node) && !pop.current?.contains(node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); setOpen(false); } };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key); };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const t = trigger.current?.getBoundingClientRect(), p = pop.current?.getBoundingClientRect();
      if (!t || !p) return;
      const pad = 8, gap = 4;
      const left = within(t.left, pad, Math.max(pad, window.innerWidth - p.width - pad));
      const below = t.bottom + gap;
      const top = below + p.height <= window.innerHeight - pad ? below : Math.max(pad, t.top - p.height - gap);
      setPosition({ left, top, ready: true });
      pop.current?.focus({ preventScroll: true });
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, tab]);

  const chooseIndex = (n: number | undefined) => { setIndexChoice(n); setIndexText(n?.toString() ?? ''); setIndexValid(true); };
  const changeIndex = (text: string) => {
    setIndexText(text);
    if (!text.trim()) { setIndexChoice(undefined); setIndexValid(true); return; }
    const n = colourIndex(parseColour(text));
    setIndexValid(n !== undefined);
    if (n !== undefined) setIndexChoice(n);
  };
  const chooseTrue = (colour: string) => {
    const parsed = colourCss(parseColour(colour));
    if (!parsed) return;
    setTrueChoice(parsed); setHexText(parsed.toUpperCase()); setRgb(rgbFields(parsed)); setTrueValid(true);
  };
  const changeHex = (text: string) => {
    setHexText(text);
    const parsed = parseColour(text), colour = parsed && colourIndex(parsed) === undefined ? colourCss(parsed) : undefined;
    setTrueValid(!!colour);
    if (colour) { setTrueChoice(colour); setRgb(rgbFields(colour)); }
  };
  const changeRgb = (key: keyof RgbFields, text: string) => {
    const next = { ...rgb, [key]: text };
    setRgb(next);
    const values = [next.r, next.g, next.b];
    const valid = values.every((part) => /^\d{1,3}$/.test(part) && Number(part) <= 255);
    setTrueValid(valid);
    if (valid) {
      const colour = parseColour(values.join(','))!;
      setTrueChoice(colour); setHexText(colour.toUpperCase());
    }
  };
  const candidate = tab === 'index' ? (indexChoice === undefined ? undefined : indexColour(indexChoice)) : trueChoice;
  const valid = tab === 'index' ? indexValid : trueValid;
  const commit = (next = candidate) => { if (!valid) return; onChange(next); setOpen(false); };
  const currentSwatch = colourCss(value), selectedSwatch = colourCss(candidate);

  const cell = (n: number, main = false) => (
    <button key={n} type="button" data-colour-index={n} className={`cad-colour-cell${indexChoice === n ? ' on' : ''}`} style={{ background: INDEX_COLOURS[n] }}
      title={colourLabel(indexColour(n))} aria-label={`Colour ${n}`} onClick={() => chooseIndex(n)} onDoubleClick={() => { onChange(indexColour(n)); setOpen(false); }}
      onKeyDown={main ? (e) => {
        const row = (n - 10) % 10, col = Math.floor((n - 10) / 10);
        const next = e.key === 'ArrowRight' && col < 23 ? n + 10 : e.key === 'ArrowLeft' && col > 0 ? n - 10
          : e.key === 'ArrowDown' && row < 9 ? n + 1 : e.key === 'ArrowUp' && row > 0 ? n - 1 : n;
        if (next !== n) {
          e.preventDefault(); pop.current?.querySelector<HTMLButtonElement>(`[data-colour-index="${next}"]`)?.focus();
        }
      } : undefined} />
  );
  // 10–249: one column per hue (24), one row per shade (10).
  const grid = Array.from({ length: 10 }, (_, row) => Array.from({ length: 24 }, (_, col) => 10 + col * 10 + row));

  const dialog = open && (
    <div ref={pop} className="cad-colour-pop" role="dialog" aria-labelledby="cad-colour-title" tabIndex={-1}
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}>
      <div className="cad-colour-head"><strong id="cad-colour-title">Select colour</strong><button type="button" aria-label="Close colour picker" onClick={() => setOpen(false)}><X size={15} aria-hidden /></button></div>
      <div className="cad-colour-tabs" role="tablist" aria-label="Colour kind">
        <button type="button" role="tab" aria-selected={tab === 'index'} onClick={() => setTab('index')}>Index colour</button>
        <button type="button" role="tab" aria-selected={tab === 'true'} onClick={() => setTab('true')}>True colour</button>
      </div>
      {tab === 'index' ? (
        <div className="cad-colour-panel" role="tabpanel" aria-label="Index colour">
          <div className="cad-colour-row cad-colour-basics">
            <button type="button" className={`cad-colour-blank${indexChoice === undefined ? ' on' : ''}`} onClick={() => chooseIndex(undefined)}>{blank}</button>
            {Array.from({ length: 9 }, (_, i) => cell(i + 1))}<span className="sp" />{Array.from({ length: 6 }, (_, i) => cell(250 + i))}
          </div>
          <div className="cad-colour-grid">{grid.flat().map((n) => cell(n, true))}</div>
          <label className="cad-colour-field">Index number<input aria-label={`${label} index number`} placeholder="1–255" inputMode="numeric" value={indexText}
            aria-invalid={!indexValid} onChange={(e) => changeIndex(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} /></label>
        </div>
      ) : (
        <div className="cad-colour-panel cad-true-colour" role="tabpanel" aria-label="True colour">
          <input className="cad-colour-well" type="color" aria-label={`${label} true colour well`} value={trueChoice} onChange={(e) => chooseTrue(e.target.value)} />
          <div className="cad-colour-common" aria-label="Common true colours">
            {NAMED_COLOURS.map((c) => <button key={c.id} type="button" className={`cad-colour-cell${trueChoice === c.id ? ' on' : ''}`} style={{ background: c.id }} title={c.label} aria-label={c.label} onClick={() => chooseTrue(c.id)} />)}
          </div>
          <div className="cad-colour-rgb">
            <label>Hex<input aria-label={`${label} hex`} value={hexText} aria-invalid={!trueValid} onChange={(e) => changeHex(e.target.value)} /></label>
            {(['r', 'g', 'b'] as const).map((key) => <label key={key}>{key.toUpperCase()}<input aria-label={`${label} ${key}`} inputMode="numeric" value={rgb[key]} aria-invalid={!trueValid} onChange={(e) => changeRgb(key, e.target.value)} /></label>)}
          </div>
        </div>
      )}
      <div className="cad-colour-preview">
        <span><i style={{ background: currentSwatch ?? 'transparent' }} className={currentSwatch ? undefined : 'none'} />Current<strong>{colourLabel(value, blank)}</strong></span>
        <span><i style={{ background: selectedSwatch ?? 'transparent' }} className={selectedSwatch ? undefined : 'none'} />Selected<strong>{colourLabel(candidate, blank)}</strong></span>
      </div>
      <div className="cad-colour-actions"><button type="button" onClick={() => setOpen(false)}>Cancel</button><button type="button" className="primary" disabled={!valid} onClick={() => commit()}>OK</button></div>
    </div>
  );

  return (
    <span className="cad-colour">
      <button ref={trigger} type="button" className="cad-colour-btn" aria-label={label} aria-haspopup="dialog" aria-expanded={open} onClick={openPicker}>
        <i style={{ background: colourCss(value) ?? 'transparent' }} className={colourCss(value) ? undefined : 'none'} />{varies ? 'varies' : colourLabel(value, blank)}
      </button>
      {dialog && createPortal(dialog, document.body)}
    </span>
  );
}
