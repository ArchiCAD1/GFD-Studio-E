import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronRight } from 'lucide-react';
import type { CtxEntry, CtxHead, CtxItem } from './cadContextMenu';
import { MENU_ICONS } from './cadMenuIcons';
import { useListPlace, useMenuPlace } from './cadMenuPlace';

/** Design CAD: the right-click menu on the drawing (cadContextMenu.ts and its siblings build the entries): a header
 * naming what is picked, rows with the ribbon's icon and the key on the right, checks for switches that are on, and
 * lists (two levels) beside their row, opened by hovering, a click or Right. The keys: Up / Down, Home / End, Right,
 * Left, Enter / Space, Esc and a letter. */
type Opened = { i: number; row: HTMLElement };

export default function CadMenu({ left, top, head, items, label, onPick, onClose }: { left: number; top: number; head?: CtxHead; items: CtxEntry[]; label: string; onPick: (x: CtxItem) => void; onClose?: () => void }) {
  const [open, setOpen] = useState<Opened | null>(null), [open2, setOpen2] = useState<Opened | null>(null);
  const [focusReq, setFocusReq] = useState<{ lvl: number } | null>(null);
  const menu = useRef<HTMLDivElement>(null), list = useRef<HTMLDivElement>(null), list2 = useRef<HTMLDivElement>(null);
  const place = useMenuPlace(menu, left, top, items);
  const listPlace = useListPlace(menu, open?.row ?? null, list, open?.i);
  const sub1 = open ? items[open.i] : undefined, subs = sub1 && sub1 !== '-' ? sub1.sub : undefined;
  const item2 = open2 && subs ? subs[open2.i] : undefined, subs2 = item2 && item2 !== '-' ? item2.sub : undefined;
  const list2Place = useListPlace(menu, subs2 ? open2?.row ?? null : null, list2, open2?.i, list);
  useEffect(() => { menu.current?.focus({ preventScroll: true }); }, []);
  // After a list opens by the keyboard, its first row has the focus.
  useEffect(() => {
    if (!focusReq) return;
    const el = focusReq.lvl === 1 ? list.current : list2.current;
    if (el) enabled(el)[0]?.focus({ preventScroll: true });
  }, [focusReq]);

  const enabled = (el: HTMLElement) => [...el.children].filter((c): c is HTMLButtonElement => c instanceof HTMLButtonElement && !c.disabled);
  const levelOf = (el: Element | null) => { const l = el?.closest('[data-lvl]'); return l ? { el: l as HTMLElement, lvl: Number(l.getAttribute('data-lvl')) } : null; };
  const run = (x: CtxItem) => { if (!x.off) onPick(x); };
  /** Opens the list of a row: level 0 rows open the first list, rows of that list the second. */
  const openList = (lvl: number, i: number, row: HTMLElement, byKey = false) => {
    if (lvl === 0) { setOpen({ i, row }); setOpen2(null); if (byKey) setFocusReq({ lvl: 1 }); } else { setOpen2({ i, row }); if (byKey) setFocusReq({ lvl: 2 }); }
  };
  const rowIndex = (row: HTMLElement) => Number(row.dataset.i);
  const subOf = (lvl: number, i: number): CtxEntry[] | undefined => { const e = (lvl === 0 ? items : lvl === 1 ? subs : subs2)?.[i]; return e && e !== '-' ? e.sub : undefined; };

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const here = levelOf(e.target as Element) ?? { el: menu.current!, lvl: 0 }, rows = enabled(here.el), at = rows.indexOf(e.target as HTMLButtonElement);
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    const focusAt = (n: number) => rows[(n + rows.length) % rows.length]?.focus({ preventScroll: true });
    switch (e.key) {
      case 'ArrowDown': stop(); focusAt(at < 0 ? 0 : at + 1); return;
      case 'ArrowUp': stop(); focusAt(at < 0 ? -1 : at - 1); return;
      case 'Home': stop(); focusAt(0); return;
      case 'End': stop(); focusAt(-1); return;
      case 'ArrowRight': {
        stop();
        const row = e.target as HTMLElement;
        if (at >= 0 && here.lvl < 2 && subOf(here.lvl, rowIndex(row))) openList(here.lvl, rowIndex(row), row, true);
        return;
      }
      case 'ArrowLeft': {
        stop();
        if (here.lvl === 2) { const r = open2?.row; setOpen2(null); r?.focus({ preventScroll: true }); }
        else if (here.lvl === 1) { const r = open?.row; setOpen(null); setOpen2(null); r?.focus({ preventScroll: true }); }
        return;
      }
      case 'Enter': case ' ': {
        stop();
        if (at < 0) return;
        const row = e.target as HTMLElement;
        if (here.lvl < 2 && subOf(here.lvl, rowIndex(row))) openList(here.lvl, rowIndex(row), row, true); else row.click();
        return;
      }
      case 'Escape': {
        stop();
        if (open2) { const r = open2.row; setOpen2(null); r.focus({ preventScroll: true }); }
        else if (open) { const r = open.row; setOpen(null); r.focus({ preventScroll: true }); }
        else onClose?.();
        return;
      }
      default:
        if (e.key.length === 1 && /\S/.test(e.key) && rows.length) {
          stop();
          const c = e.key.toLowerCase(), order = [...rows.slice(at + 1), ...rows.slice(0, at + 1)];
          order.find((r) => r.querySelector('.lb')?.textContent?.toLowerCase().startsWith(c))?.focus({ preventScroll: true });
        }
    }
  }

  const icon = (x: CtxItem) => { if (x.now) return <Check size={14} strokeWidth={2.2} aria-hidden />; const I = x.icon && MENU_ICONS[x.icon]; return I ? <I /> : null; };
  /** One row, of the menu (level 0) or of a list. */
  const row = (x: CtxItem, lvl: number, i: number, opened: boolean) => (
    <button key={`${i}-${x.label}`} data-i={i} role={x.on !== undefined ? 'menuitemcheckbox' : 'menuitem'} aria-checked={x.on} aria-haspopup={x.sub ? 'menu' : undefined} aria-expanded={x.sub ? opened : undefined} disabled={x.off}
      className={[x.lv && 'lv', x.bad && 'bad'].filter(Boolean).join(' ') || undefined}
      onMouseEnter={(e) => { if (lvl === 0) { if (x.sub) openList(0, i, e.currentTarget); else { setOpen(null); setOpen2(null); } } else if (lvl === 1) { if (x.sub) openList(1, i, e.currentTarget); else setOpen2(null); } }}
      onClick={(e) => { if (x.sub) { if (lvl === 0) { if (open?.i === i) { setOpen(null); setOpen2(null); } else openList(0, i, e.currentTarget); } else if (open2?.i === i) setOpen2(null); else openList(1, i, e.currentTarget); } else run(x); }}>
      <span className={`ic${x.now ? ' now' : ''}`}>{icon(x)}</span><span className="lb">{x.label}</span>
      {(x.now || x.key) && <small className="k">{x.now ? x.key ?? 'now' : x.key}</small>}
      {/* The check's slot on every row with a key, so the keys line up whether a row is on or not. */}
      {!x.sub && (x.key || x.now || x.on !== undefined) && <span className="ck">{x.on && <Check size={12} strokeWidth={2.2} aria-hidden />}</span>}
      {x.sub && <span className="ch"><ChevronRight size={14} strokeWidth={1.8} aria-hidden /></span>}
    </button>
  );
  const entries = (list: CtxEntry[], lvl: number, opened: number | undefined) => list.map((x, i) => (x === '-' ? <span key={`-${i}`} className="cad-ctx-bar" /> : row(x, lvl, i, opened === i)));
  const HeadIcon = head?.icon && MENU_ICONS[head.icon];
  return (
    <div ref={menu} className="cad-ctx vert cad-menu" role="menu" aria-label={label} data-lvl={0} tabIndex={-1} style={place} onKeyDown={onKey} onMouseDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      {head && <div className="cad-menu-hd">{HeadIcon && <HeadIcon />}<b>{head.title}</b>{head.detail && <span> · {head.detail}</span>}</div>}
      {head?.second && <div className={`cad-menu-hd2${head.secondTone ? ` ${head.secondTone}` : ''}`}>{head.second}</div>}
      {entries(items, 0, open?.i)}
      {subs && sub1 && sub1 !== '-' && (
        <div ref={list} className="cad-ctx-list cad-menu-list" role="menu" aria-label={sub1.label} data-lvl={1} style={listPlace}>{entries(subs, 1, open2?.i)}</div>
      )}
      {subs2 && item2 && item2 !== '-' && (
        <div ref={list2} className="cad-ctx-list cad-menu-list" role="menu" aria-label={item2.label} data-lvl={2} style={list2Place}>{entries(subs2, 2, undefined)}</div>
      )}
    </div>
  );
}
