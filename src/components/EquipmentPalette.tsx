import { ask } from './ConfirmDialog';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  Activity, CircleDot, Link2, ShieldAlert, ToggleLeft, ZapOff, BatteryCharging, BatteryFull, Star, Cable, Car, Cog, Cpu, Database, Fan, Flame, Gauge, Lightbulb, PanelLeftClose, PanelLeftOpen, PanelRightClose, PanelRightOpen, Power, ShieldCheck, Snowflake, Sun, Waves, Zap,
  Bookmark, Box, Layers, Pencil, Copy, Download, Upload, Plus, Plug, Heater, PanelTop, Info, X, Search, ArrowLeftRight, Pin, PinOff, type LucideIcon
} from 'lucide-react';
import { armHint, dropHint, dropsOn, itemKey, PALETTE, type DropTarget, type PaletteEntry, type PaletteItem } from '../model/sldEdit';
import { BUILT_IN_PRESETS, presetCard, presetParts, type FeederPreset } from '../model/presets';
import { getArmedItem, getDragItem, setArmedItem, setDragItem, subscribeArmedItem } from '../diagram/dragItem';
import { hasSymbol, PaletteSymbol } from './paletteSymbols';

const ICON: Record<string, LucideIcon> = {
  'starter:DOL': Zap, 'starter:SD': Star, 'starter:SS': Gauge, 'starter:VFD': Activity,
  tie: Link2, transformer: Waves, 'board:MC': Gauge, cable: Cable, generator: Power, 'generator:ACB': Power, capacitor: BatteryCharging, 'board:UPS': BatteryFull,
  'load:motor': Cog, 'load:ahu': Fan, 'load:chiller': Snowflake, 'load:fire-pump': Flame, 'load:ev': Car,
  'load:pv': Sun, 'load:lighting': Lightbulb, 'load:it': Cpu, 'load:general': Zap,
  'acc:meter': Gauge, 'acc:ct-meter': CircleDot, 'acc:rcd': ShieldAlert, 'acc:isolator': ToggleLeft, 'acc:spd': ZapOff, 'acc:pmu': Activity, 'acc:cable-fr': Flame, 'acc:cable-lszh': Cable
};
/** A preset's icon from what it feeds: plug for sockets, heater, snowflake for AC / chillers, fan for AHU / FCU, panel for boards. */
function presetIcon(p: FeederPreset): LucideIcon {
  if (p.kind === 'board') return PanelTop;
  const name = (p.loadName ?? p.name).toLowerCase();
  if (p.loadType === 'sockets') return Plug;
  if (/heater/.test(name)) return Heater;
  if (p.loadType === 'hvac') return /split|chiller|\bac\b|a\/c/.test(name) ? Snowflake : Fan;
  return ICON[`load:${p.loadType}`] ?? Zap;
}
const iconOf = (i: PaletteItem): LucideIcon => (i.kind === 'preset' ? presetIcon(i.preset) : undefined) ?? ICON[itemKey(i)] ?? (i.kind === 'board' ? PanelTop : i.kind === 'device' ? ShieldCheck : i.kind === 'library' ? Database : Zap);

const presetEntry = (p: FeederPreset): PaletteEntry => ({ item: { kind: 'preset', preset: p }, label: p.name, title: `${presetParts(p)} — drop on a busbar; breaker and cable are sized` });

/** This viewer's palette preferences (side, pin, favourites, recent). */
function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try { const s = localStorage.getItem(key); return s ? (JSON.parse(s) as T) : initial; } catch { return initial; }
  });
  return [v, (next: T) => { setV(next); try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* preference only */ } }];
}

/** Palette categories: one list open at a time, each one or more PALETTE groups. */
const CATS: { id: string; label: string; groups: string[]; sym?: string; icon?: LucideIcon }[] = [
  { id: 'supply', label: 'Supply', groups: ['Supply'], sym: 'transformer' },
  { id: 'boards', label: 'Boards', groups: ['Distribution boards', 'Package panels'], sym: 'board:MDB' },
  { id: 'protection', label: 'Protection', groups: ['Protection'], sym: 'device:MCCB' },
  { id: 'metering', label: 'Metering', groups: ['Metering & accessories'], sym: 'acc:meter' },
  { id: 'cable', label: 'Cable', groups: ['Cable', 'Cable types'], sym: 'cable' },
  { id: 'starters', label: 'Starters', groups: ['Motor starters'], sym: 'load:motor' },
  { id: 'loads', label: 'Loads', groups: ['Loads'], sym: 'load:general' },
  { id: 'presets', label: 'Presets', groups: ['Feeder presets'], icon: Layers },
  { id: 'mine', label: 'My presets', groups: ['My presets'], icon: Bookmark },
  { id: 'components', label: 'Components', groups: ['My components'], icon: Box },
  { id: 'equipment', label: 'My equipment', groups: ['My equipment'], icon: Database }
];
const WHERE: Record<DropTarget['type'], string> = { bus: 'Busbar', feeder: 'Feeder', canvas: 'Canvas' };
const STRIP = 8;

/** Equipment library for building the SLD, a thin strip beside the
 * drawing: search, favourites ★ and recently used, then one symbol per
 * category. A category opens its list beside the strip. Drag an item onto a
 * busbar, a feeder or the empty canvas, or click it and then click the
 * drawing; the list closes after a pick unless pinned. Where it goes decides
 * how it connects, and along a busbar, where the new way goes. × qty on the
 * armed item; the user's own presets can be edited, duplicated, exported
 * and imported. */
export default function EquipmentPalette({ accepts, onHint, library = [], presets = [], components = [], onEditComponent, onDeleteComponent, qty = 1, onQty, onDeletePreset, onEditPreset, onExportPresets, onImportPresets }: {
  /** The Board tab: only items that board can take are listed; a category with none leaves the strip,
   * except My presets and Components, which keep their + buttons. */
  accepts?: (item: PaletteItem) => boolean;
  /** Your own components (as presets with id cmp-<id>). */
  components?: FeederPreset[];
  onEditComponent?: (id: string | null) => void;
  onDeleteComponent?: (id: string) => void;
  onHint: (m: string) => void;
  /** The user's own equipment (Loads.xlsx). */
  library?: PaletteEntry[];
  /** The user's saved feeder presets. */
  presets?: FeederPreset[];
  qty?: number;
  onQty?: (n: number) => void;
  onDeletePreset?: (id: string) => void;
  /** Open the preset editor: an existing preset, a copy, or a new one. */
  onEditPreset?: (p: FeederPreset | null, mode: 'edit' | 'copy') => void;
  onExportPresets?: () => void;
  onImportPresets?: (text: string) => void;
}) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem('palette') !== 'closed'; } catch { return true; }
  });
  const showHide = () => {
    setOpen(!open);
    try { localStorage.setItem('palette', open ? 'closed' : 'open'); } catch { /* preference only */ }
  };
  const [query, setQuery] = useState('');
  const [side, setSide] = useStored<'left' | 'right'>('palette.side', 'left');
  const [pin, setPin] = useStored('palette.pin', false);
  /** The open list: a category id, 'search' or none. */
  const [list, setList] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [catTip, setCatTip] = useState<{ label: string; n: number; x: number; y: number } | null>(null);
  const asideRef = useRef<HTMLElement>(null);
  const [favs, setFavs] = useStored<string[]>('palette.favs', []);
  const [recent, setRecent] = useStored<string[]>('palette.recent', []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [tip, setTip] = useState<{ entry: PaletteEntry; x: number; y: number } | null>(null);

  // Armed item: the next click on the drawing places it. Esc, a second
  // click on the tile, or placing it disarms; the quantity goes back to 1.
  const armed = useSyncExternalStore(subscribeArmedItem, getArmedItem, getArmedItem);
  const armedKey = armed ? itemKey(armed) : null;
  const qtyRef = useRef(onQty);
  qtyRef.current = onQty;
  useEffect(() => () => setArmedItem(null), []);
  useEffect(() => subscribeArmedItem(() => { if (!getArmedItem()) qtyRef.current?.(1); }), []);
  useEffect(() => {
    if (!armed) return;
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setArmedItem(null); };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [armed]);

  const groups = useMemo(() => [
    { group: 'Feeder presets', entries: BUILT_IN_PRESETS.map(presetEntry) },
    { group: 'My presets', entries: presets.map(presetEntry) },
    { group: 'My components', entries: components.map((p) => ({ item: { kind: 'preset' as const, preset: p }, label: p.name, title: `${p.name} — your component: drop on a busbar; breaker and cable are sized` })) },
    ...PALETTE,
    ...(library.length ? [{ group: 'My equipment', entries: library }] : [])
  ].map((g) => (accepts ? { ...g, entries: g.entries.filter((e) => accepts(e.item)) } : g)), [presets, library, components, accepts]);
  const cats = CATS.filter((c) => c.groups.some((g) => groups.some((x) => x.group === g && (!accepts || x.entries.length > 0 || c.id === 'mine' || c.id === 'components'))));
  // A list whose category left the strip (another board) is closed.
  const openList = list === 'search' || cats.some((c) => c.id === list) ? list : null;
  const openCat = cats.find((c) => c.id === openList) ?? cats[0];
  const entriesOf = (c: (typeof CATS)[number]) => groups.filter((g) => c.groups.includes(g.group)).flatMap((g) => g.entries);
  const byKey = useMemo(() => new Map(groups.flatMap((g) => g.entries.map((e) => [itemKey(e.item), e] as const))), [groups]);
  const pick = (keys: string[]) => keys.map((k) => byKey.get(k)).filter((e): e is PaletteEntry => !!e);
  const strip = pick([...favs, ...recent.filter((k) => !favs.includes(k))]).slice(0, STRIP);
  const q = query.trim().toLowerCase();
  const results = openList === 'search' && q
    ? groups.flatMap((g) => g.entries).filter((e) => `${e.label} ${e.title}${e.item.kind === 'preset' ? ` ${(c => `${c.title} ${c.value ?? ''} ${c.parts.join(' ')}`)(presetCard(e.item.preset))}` : ''}`.replace(/\u00a0/g, ' ').toLowerCase().includes(q)).filter((e, i, a) => a.findIndex((x) => itemKey(x.item) === itemKey(e.item)) === i)
    : null;
  const shown = openList === 'search' ? results ?? [] : entriesOf(openCat);
  const isMine = openList === 'mine';
  const isComp = openList === 'components';
  const wide = isMine || isComp || openList === 'presets';

  const arm = (e: React.MouseEvent | React.KeyboardEvent, { item, label }: PaletteEntry) => {
    const key = itemKey(item);
    if (armedKey === key) { setArmedItem(null); onHint(''); return; }
    setArmedItem(item);
    onQty?.(e.shiftKey ? 3 : 1);
    setRecent([key, ...recent.filter((k) => k !== key)].slice(0, 6));
    onHint(armHint(item, label));
    setTip(null);
    if (!pin) setList(null);
  };
  const left = side === 'left';
  // Hover cards open over the drawing: right of a strip on the left, left of one on the right.
  const tipX = (r: DOMRect) => ((left ? r.right + 236 < window.innerWidth : r.left < 242) ? r.right + 6 : r.left - 236);
  const showTip = (entry: PaletteEntry) => (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ entry, x: tipX(r), y: r.top });
  };
  const catHover = (label: string, n: number) => (e: React.MouseEvent) => {
    const r = e.currentTarget.getBoundingClientRect();
    setCatTip({ label, n, x: tipX(r), y: r.top });
  };
  const toggle = (id: string) => { setList(openList === id ? null : id); setCatTip(null); };
  // An unpinned list closes on a click outside the strip.
  useEffect(() => {
    if (!openList || pin) return;
    const down = (e: PointerEvent) => { if (!asideRef.current?.contains(e.target as Node)) setList(null); };
    document.addEventListener('pointerdown', down);
    return () => document.removeEventListener('pointerdown', down);
  }, [openList, pin]);
  const listKeys = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || !openList) return;
    e.stopPropagation();
    if (query) setQuery(''); else setList(null);
  };
  /** Drag, click-to-arm, keyboard and hover behaviour shared by rows, cards and minis. */
  const handlers = (entry: PaletteEntry) => {
    const { item } = entry;
    const key = itemKey(item);
    return {
      draggable: true,
      role: 'button',
      tabIndex: 0,
      'aria-pressed': armedKey === key,
      'aria-label': `${entry.label} — ${entry.title}`,
      onDragStart: (e: React.DragEvent) => {
        setTip(null);
        setDragging(true);
        if (armedKey && armedKey !== key) setArmedItem(null);
        setDragItem(item);
        e.dataTransfer.setData('text/plain', key);
        e.dataTransfer.effectAllowed = 'copy';
        setRecent([key, ...recent.filter((k) => k !== key)].slice(0, 6));
      },
      onDragEnd: () => {
        // The diagram clears the item when it takes the drop; still
        // set means it was dropped somewhere it can't go.
        const missed = getDragItem() !== null;
        setDragItem(null);
        if (armedKey === key) setArmedItem(null);
        setDragging(false);
        if (!pin) setList(null);
        if (missed) onHint(dropHint(item));
      },
      onClick: (e: React.MouseEvent) => arm(e, entry),
      onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); arm(e, entry); } },
      onMouseEnter: showTip(entry),
      onMouseLeave: () => setTip(null)
    };
  };
  const favBtn = (key: string) => {
    const fav = favs.includes(key);
    return (
      <button className={`icon-btn fav${fav ? ' on' : ''}`} title={fav ? 'Remove from favourites' : 'Add to favourites'} onClick={(e) => { e.stopPropagation(); setFavs(fav ? favs.filter((k) => k !== key) : [...favs, key]); }}>
        <Star size={12} fill={fav ? 'currentColor' : 'none'} />
      </button>
    );
  };
  const qtyStep = onQty && (
    <span className="palette-q" onClick={(e) => e.stopPropagation()}>
      <button className="icon-btn" aria-label="One fewer" disabled={qty <= 1} onClick={() => onQty(Math.max(1, qty - 1))}>−</button>
      × {qty}
      <button className="icon-btn" aria-label="One more" disabled={qty >= 50} onClick={() => onQty(Math.min(50, qty + 1))}>+</button>
    </span>
  );
  const dots = (item: PaletteItem) => (
    <span className="palette-dots" aria-hidden>{dropsOn(item).map((t) => <i key={t} className={t} />)}</span>
  );
  const symbol = (item: PaletteItem, size?: number) => {
    const key = itemKey(item);
    if (hasSymbol(key)) return <PaletteSymbol k={key} size={size} />;
    const Icon = iconOf(item);
    return <Icon size={size ?? 20} strokeWidth={1.6} className="palette-ic" aria-hidden />;
  };

  const row = (entry: PaletteEntry) => {
    const { item, label } = entry;
    const key = itemKey(item);
    const on = armedKey === key;
    return (
      <div key={key} className={`eq-row${on ? ' armed' : ''}${favs.includes(key) ? ' is-fav' : ''}`} {...handlers(entry)}>
        {symbol(item, 18)}
        <span className="eq-rname">{label}</span>
        {on && qtyStep}
        {favBtn(key)}
        {dots(item)}
      </div>
    );
  };
  const card = (entry: PaletteEntry) => {
    const { item, label } = entry;
    if (item.kind !== 'preset') return row(entry);
    const key = itemKey(item);
    const on = armedKey === key;
    const fav = favs.includes(key);
    const mine = presets.some((p) => p.id === item.preset.id);
    const c = presetCard(item.preset);
    return (
      <div key={key} className={`palette-item has-card${fav ? ' is-fav' : ''}${on ? ' armed' : ''}`} {...handlers(entry)}>
        {symbol(item, 18)}
        <span className="palette-card">
          <span className="palette-l1"><span className="palette-name">{c.title}</span>{c.value && <span className="palette-val">{c.value}</span>}</span>
          {c.parts.length > 0 && <span className="palette-l2">{c.parts.join(' · ')}</span>}
          {on && qtyStep}
          {details === key && (
            <span className="palette-details" onClick={(e) => e.stopPropagation()}>
              {c.details.map(([k, v]) => <span key={k}><span className="m">{k}</span> {v}</span>)}
            </span>
          )}
        </span>
        <span className="palette-acts">
          <button className={`icon-btn${details === key ? ' on' : ''}`} title="Details: PF, phase, cable length and other defaults" aria-expanded={details === key} onClick={(e) => { e.stopPropagation(); setDetails(details === key ? null : key); }}><Info size={12} /></button>
          {item.preset.id.startsWith('cmp-') && onEditComponent && (
            <>
              <button className="icon-btn" title="Edit this component (updates every copy)" onClick={(e) => { e.stopPropagation(); onEditComponent(item.preset.id.slice(4)); }}><Pencil size={12} /></button>
              {onDeleteComponent && <button className="icon-btn" title="Delete the component" onClick={async (e) => { e.stopPropagation(); if (await ask(`Delete the component “${label}”? Copies on the SLD stay as ordinary loads.`)) onDeleteComponent(item.preset.id.slice(4)); }} aria-label={`Delete the component ${label}`}><X size={12} aria-hidden /></button>}
            </>
          )}
          {!item.preset.id.startsWith('cmp-') && onEditPreset && (
            mine
              ? <button className="icon-btn" title="Edit this preset" onClick={(e) => { e.stopPropagation(); onEditPreset(item.preset, 'edit'); }}><Pencil size={12} /></button>
              : <button className="icon-btn" title="Copy to My presets and edit" onClick={(e) => { e.stopPropagation(); onEditPreset(item.preset, 'copy'); }}><Copy size={12} /></button>
          )}
          {mine && onEditPreset && <button className="icon-btn" title="Duplicate" onClick={(e) => { e.stopPropagation(); onEditPreset(item.preset, 'copy'); }}><Copy size={12} /></button>}
          {mine && onDeletePreset && (
            <button className="icon-btn" title={`Delete the preset “${label}”`} onClick={async (e) => { e.stopPropagation(); if (await ask(`Delete the preset “${label}”?`)) onDeletePreset(item.preset.id); }} aria-label={`Delete the preset ${label}`}><X size={12} aria-hidden /></button>
          )}
          {favBtn(key)}
        </span>
      </div>
    );
  };

  if (!open) {
    return (
      <aside className={`eq-strip closed${side === 'right' ? ' right' : ''}`} aria-label="Equipment library">
        <button type="button" className="chip" title="Show the equipment strip" aria-label="Show the equipment strip" onClick={showHide}>{left ? <PanelLeftOpen size={16} /> : <PanelRightOpen size={16} />}</button>
      </aside>
    );
  }
  return (
    <aside ref={asideRef} className={`eq-strip${side === 'right' ? ' right' : ''}`} aria-label="Equipment library" data-doc-id="sld-equipment" onKeyDown={listKeys}>
      <div className="eq-rail">
        <button type="button" className={`eq-btn${openList === 'search' ? ' open' : ''}`} aria-label="Search the equipment library" title="Search the equipment library" aria-expanded={openList === 'search'} onClick={() => toggle('search')}><Search size={18} strokeWidth={1.6} aria-hidden /></button>
        <span className="eq-dv" />
        {strip.length > 0 && <>
          <div className="eq-recent" aria-label="Favourites and recently used">
            {strip.map((entry) => {
              const key = itemKey(entry.item);
              return (
                <div key={key} className={`eq-mini${armedKey === key ? ' armed' : ''}`} {...handlers(entry)}>
                  {favs.includes(key) && <span className="eq-mini-fav" aria-hidden>★</span>}
                  {symbol(entry.item, 18)}
                </div>
              );
            })}
          </div>
          <span className="eq-dv" />
        </>}
        <div className="eq-cats" role="group" aria-label="Equipment categories">
          {cats.map((c) => {
            const Icon = c.icon;
            const n = entriesOf(c).length;
            return (
              <button key={c.id} type="button" className={`eq-btn eq-cat${openList === c.id ? ' open' : ''}`} aria-label={`${c.label} (${n})`} aria-expanded={openList === c.id} onClick={() => toggle(c.id)} onMouseEnter={catHover(c.label, n)} onMouseLeave={() => setCatTip(null)}>
                {c.sym ? <PaletteSymbol k={c.sym} size={20} /> : Icon && <Icon size={20} strokeWidth={1.6} className="palette-ic" aria-hidden />}
                <svg className="eq-tri" viewBox="0 0 4 4" aria-hidden><path d="M4 0v4H0z" /></svg>
              </button>
            );
          })}
        </div>
        <span className="eq-sp" />
        <button type="button" className="eq-btn eq-foot" title={left ? 'Move the strip to the right of the drawing' : 'Move the strip to the left of the drawing'} aria-label={left ? 'Move the strip to the right of the drawing' : 'Move the strip to the left of the drawing'} onClick={() => setSide(left ? 'right' : 'left')}><ArrowLeftRight size={16} aria-hidden /></button>
        <button type="button" className="eq-btn eq-foot" title="Hide the equipment strip" aria-label="Hide the equipment strip" onClick={showHide}>{left ? <PanelLeftClose size={16} /> : <PanelRightClose size={16} />}</button>
      </div>
      {openList && (
        <div className={`eq-list${wide ? ' wide' : ''}${dragging ? ' dragging' : ''}`} role="group" aria-label={openList === 'search' ? 'Search results' : `${openCat.label} list`}>
          <div className="eq-lhead">
            {openList === 'search'
              ? <input className="palette-search" type="search" autoFocus aria-label="Search the equipment library" placeholder="Search… (AHU, RCD, SMDB)" value={query} onChange={(e) => setQuery(e.target.value)} />
              : <><span className="eq-ltitle">{openCat.label}</span><span className="m palette-count">{shown.length}</span></>}
            {isComp && onEditComponent && <button className="icon-btn" title="New component" onClick={() => onEditComponent(null)}><Plus size={13} /></button>}
            {isMine && <>
              {onEditPreset && <button className="icon-btn" title="New preset" onClick={() => onEditPreset(null, 'edit')}><Plus size={13} /></button>}
              {onExportPresets && presets.length > 0 && <button className="icon-btn" title="Export my presets to a file (share with the team)" onClick={onExportPresets}><Download size={13} /></button>}
              {onImportPresets && <button className="icon-btn" title="Import presets from a file" onClick={() => fileRef.current?.click()}><Upload size={13} /></button>}
              <input ref={fileRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f && onImportPresets) onImportPresets(await f.text());
                e.target.value = '';
              }} />
            </>}
            <button type="button" className={`icon-btn${pin ? ' on' : ''}`} aria-pressed={pin} title={pin ? 'Unpin: the list closes after a pick' : 'Pin: keep the list open after a pick'} onClick={() => setPin(!pin)}>{pin ? <PinOff size={13} /> : <Pin size={13} />}</button>
            <button type="button" className="icon-btn" title="Close the list (Esc)" aria-label="Close the list" onClick={() => setList(null)}><X size={13} aria-hidden /></button>
          </div>
          {openList === 'search' && q && <div className="eq-ghead">Results for “{query.trim()}” · {shown.length}</div>}
          {openList === 'search' && !q && <p className="m palette-tip">Type to search every category.</p>}
          {isComp && !shown.length && <p className="m palette-tip">Click + to make your own equipment with inputs, formulas and an SLD label.</p>}
          {isMine && !shown.length && <p className="m palette-tip">Select a feeder and “Save as preset”, click + or import a file.</p>}
          {openList === 'search' && q && !shown.length && <p className="m palette-tip">Nothing matches.</p>}
          <div className="eq-rows">{shown.map((e) => (e.item.kind === 'preset' ? card(e) : row(e)))}</div>
          <p className="m palette-legend"><span><i className="bus" />busbar</span><span><i className="feeder" />feeder</span><span><i className="canvas" />canvas</span><span className="sp">drag, or click then click</span></p>
        </div>
      )}
      {armed && !openList && (
        <div className="eq-placing" role="status">
          {symbol(armed, 16)}
          <span>{byKey.get(itemKey(armed))?.label ?? 'Item'}</span>
          {qtyStep}
          <button type="button" className="icon-btn" title="Cancel (Esc)" onClick={() => { setArmedItem(null); onHint(''); }}>Esc</button>
        </div>
      )}
      {tip && (
        <div className="palette-tipcard" role="tooltip" style={{ left: tip.x, top: tip.y }}>
          <b>{tip.entry.label}</b>
          <span>{tip.entry.title}</span>
          <span className="palette-where">{(['bus', 'feeder', 'canvas'] as const).map((t) => <span key={t} className={dropsOn(tip.entry.item).includes(t) ? 'yes' : ''}>{WHERE[t]}</span>)}</span>
          <span className="m">Drag it there, or click it then click the drawing. Shift-click: × 3.</span>
        </div>
      )}
      {catTip && (
        <div className="palette-tipcard" role="tooltip" style={{ left: catTip.x, top: catTip.y }}>
          <b>{catTip.label} · {catTip.n}</b>
          <span className="m">Click to open the list</span>
        </div>
      )}
    </aside>
  );
}
