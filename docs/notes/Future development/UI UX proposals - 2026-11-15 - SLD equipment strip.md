# UI UX proposal – SLD equipment strip, and equipment on the Board tab (2026-11-15)

Status: **proposal, waiting for the user's decision.** Nothing is built.

Mockup: `docs/mockups/sld-equipment-strip-mockup.html` (image: `sld-equipment-strip-mockup.png`).

![The SLD equipment library as a thin strip, on the System and Board tabs](../../mockups/sld-equipment-strip-mockup.png)

The user's request: the equipment library is a wide panel and they do not like it; they asked for a small, thin, long strip instead. They can add equipment on the System diagram, but not on one board's own diagram (the Board tab), because the library is not there.

## Today

- The library is the second tab of the side panel, "Equipment", beside "Panels" (`PanelTree`'s `equipment` prop, `EquipmentPalette` docked). The panel is 230 px wide by default. It holds the search box, a favourites and recently used row, 11 category tiles four across, then the open category as tiles four across (Loads: 10 tiles in 3 rows).
- `App.tsx` passes the library only when `view === 'design' && diagramMode === 'system' && !sldFull`. In full screen the undocked library (`equipment(false)`) floats inside `.sld-edit`.
- The Board tab (`BoardSheetView`) draws with `SingleLineDiagram`, which takes no drops: no `onDropItem`, no busbar hit line, no click for an armed item. Only `SystemDiagram` takes drops.
- The ribbon's Supply and Devices menus arm the same items, but first switch to the System diagram (`system()` in the `sld.onArm` handler in `App.tsx`).
- The 2026-10-23 library proposal listed a collapsed rail as item 7 ("optional, later": a 46 px icon rail with a list per category). It was not built. This proposal makes that rail the library itself.

## Proposed

### 1. A 44 px equipment strip

On the System and Board tabs, a 44 px strip on the left edge of the drawing, from under the diagram tabs down to the results drawer.

- Top to bottom: Search; favourites ★ and recently used (the same 8 as today's row, fewer on a short window; the mockup draws 4); the categories as their symbols, the same as today's category tiles (11, or 10 when the database holds no equipment of your own); Hide at the foot.
- Category names and counts are in the hover tooltip ("Boards · 12").
- Clicking a category opens its list beside the strip, one column: symbol, name, where-it-drops dots. Feeder presets, My presets and Components open a wider list (about 270 px) for their two-line cards with edit, copy and delete.
- Clicking an item closes the list and arms it: the next click on the drawing places it. Drag works as today. A pin in the list's header keeps it open, to place several kinds.
- While an item is armed it is lit in the recent row, and a small chip at the drawing's top-left holds the × qty stepper (today it is on the armed tile) and Esc.
- Search opens the same list with the search field, with results from every category.
- The side panel shows Panels only. There is no Equipment tab, so you can change board while placing.
- On a short window the recent row folds first, then the strip scrolls. The strip with 4 recent items is about 580 px tall; with 8, about 700 px.
- Full screen uses the same strip instead of today's floating library.

The drawing gains about 186 px of width (230 px tab to 44 px strip).

### 2. Equipment on the Board tab

The same strip is on the Board tab. The board's own drawing takes drops and clicks:

- **On the busbar:** a new way on this board, where the marker shows (between two ways, with `before` as on the System diagram). This covers loads, boards, presets, components, My equipment, capacitor bank, SPD, PMU and generator.
- **On a way:** breaker type, kWh or CT meter, RCD, local isolator, cable type or cable edit on that circuit. A starter goes only on a motor way.
- **Greyed items:** anything this board cannot take is greyed in the list, with the reason as hover text: Meter cabinet (only on the System diagram's empty canvas); Transformer and Bus coupler / tie (main boards only); MDB, LV-MDB and LV-ACB (only under a meter cabinet). The check is `canDrop` against this board's busbar and its ways. On the System diagram nothing is greyed.
- **After a drop:** the view stays on this board and selects the new way, also when a sub-board was dropped. Today `showResult` selects a new board, which on the Board tab would jump to it. The new board opens from its link in the circuit table, as other sub-boards do now.
- **Final circuits:** a small single-phase way (20 A or less, `SLD_FINAL_CIRCUIT_MAX_A`) is not drawn on its own unless Show final circuits is on. It joins the "see the DB load schedule" box, and the status line says so.
- **Ribbon:** with the Board tab open, an item from Supply or Devices that this board can take stays on the Board tab. The others (Meter cabinet always; Transformer and Bus coupler on a board that is not a main board) switch to the System diagram as today.

## What stays the same

- Every item, its symbol, name and drop rules (`PALETTE`, `dropsOn`, `canDrop`, `dropMany`); breaker and cable sizing; undo.
- Favourites, recent and their preference keys (`palette.cat`, `palette.favs`, `palette.recent`), so saved favourites carry over.
- Preset and component editing, import and export, the hover card, shift-click × 3 and Esc.
- The Board tab's bar, phase loading, earth row, drawing and circuit table.
- Colours, fonts and tokens.

## Suggested steps

1. The strip and its lists on the System diagram. They replace the Equipment tab and the full-screen floating library.
2. Drops and clicks on the Board tab's drawing, greyed items, staying on the board, and the ribbon's Supply and Devices staying on the Board tab.

## Decisions

Suggested answers in bold.

1. Remove the side panel's Equipment tab once the strip is there, or keep both? **Remove**, so the library has one home.
2. Strip on the left edge of the drawing, or on the right beside the inspector? **Left**, beside the Panels tree, where the library is today.
3. Icons only (44 px), or a "Show names" option that widens the strip to about 72 px with short names under the symbols? **Icons only**, with names in the tooltip. The option can come later.
4. After a pick, close the list (the pin keeps it open), or keep it open until closed? **Close**, with the pin.
5. Board tab, sub-board dropped: stay on this board and select the new way, or open the new board? **Stay.**
6. Items this board cannot take: greyed with the reason, or hidden? **Greyed**, so the list keeps its shape from board to board.

## Implementation notes (if approved)

- `src/components/EquipmentPalette.tsx`: the strip and list layout, the open-list state, close on arm, the pin (new preference key `palette.pin`), and the placing chip with × qty. The tile grid goes.
- `src/App.tsx`: mount the strip beside `SystemDiagram` and `BoardSheetView`; remove `equipment` from `PanelTree`; full screen uses the strip; `showResult` keeps the board on the Board tab; the ribbon's `onArm` does not call `system()` there.
- `src/components/SingleLineDiagram.tsx` and `BoardSheetView.tsx`: a busbar hit line with the insert position (from the pointer between way centres), way targets, the armed click and `onDropItem`, with the same classes as `SystemDiagram` (`bus-hit`, drop highlight).
- `src/model/sldEdit.ts`: a helper for whether a board can take an item (its busbar or any of its ways) using `canDrop`, with the reason from `dropHint`.
- `src/styles.css`: strip and list rules with the existing tokens only.
- Tests: strip open, close, pin and arm; search; Board tab drop on the busbar with `before` and on a way; greyed items; staying on the board; the ribbon arm on the Board tab; the existing library tests updated.
- Manual: the SLD text and captures that show the side panel.
