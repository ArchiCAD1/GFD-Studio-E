---
title: UI UX proposals — compact colour picker and reorderable CAD ribbon panels
date: 2026-11-16
status: proposed — waiting for approval
tags:
  - future-development
  - UI
  - Design CAD
---

# UI / UX proposals — 2026-11-16

The user reported that the Design CAD colour picker expands far beyond a usable dialog size when it is opened from the ribbon. They also asked to move the Layers panel, and other CAD ribbon panels, into a preferred order.

Interactive mockup: [cad-colour-picker-ribbon-order-mockup.html](../../mockups/cad-colour-picker-ribbon-order-mockup.html). Static preview: [cad-colour-picker-ribbon-order-mockup.svg](../../mockups/cad-colour-picker-ribbon-order-mockup.svg).

No UI change is approved or implemented by this note.

## 1. Compact colour picker

### Problem observed

The picker opened from the ribbon inherits the ribbon tool-button minimum sizes. Its 1–255 colour cells therefore expand into a very tall and wide panel instead of remaining a compact colour grid. The panel is clipped by the window, and the fields for an index number and a true colour are difficult to reach.

The likely collision is between the general `.ribbon-group button` rule and the nested buttons in `.cad-colour-pop` / `.cad-colour-cell` in `src/styles.css`. The same `ColourPicker` is used by the layer manager, Properties palette and ribbon, so the correction must be scoped without changing the appearance of ribbon tools.

### Proposed appearance and behaviour

- Use one compact picker, about 420 × 420 px at 100% zoom, capped to the available viewport on smaller windows.
- Keep it beside the colour field when room exists; otherwise place it to the left or above so the whole picker remains visible.
- Add two clear tabs:
  - **Index colour** — ByLayer / As drawn, standard colours 1–9, the complete 10–249 grid, greys 250–255, and an index field accepting 1–255.
  - **True colour** — colour well, Hex, Red, Green and Blue fields, with a selected-colour preview.
- Show the current and proposed colour, its index or RGB value, and **OK** and **Cancel**. Double-clicking an index cell may select it and close the picker.
- Keep keyboard use: Tab through controls, arrow keys within the index grid, Enter to accept, and Escape to cancel.
- Keep colour storage and output unchanged: index colours remain index values, true colours remain RGB, ByLayer / As drawn retain their current meaning, and printed reports remain black-and-white.

Text mockup:

```text
Select colour                                      ×
┌ Index colour ┐  True colour
│ ByLayer   1 2 3 4 5 6 7 8 9   250 … 255         │
│ [compact 24-column × 10-row index colour grid]   │
│ Index: [  42 ]   Current: ■   Selected: ■        │
└─────────────────────────────── Cancel   OK ──────┘
```

The True colour tab uses the same frame and replaces the grid with the colour well and Hex / RGB fields.

## 2. Reorderable CAD ribbon panels

### Scope

Allow the user to rearrange whole panels inside each Design CAD sub-tab. For example, **Layers** can be dragged from its current place after Blocks to the left or right of Draw, Modify, Properties or Measure and view. Individual tools inside a panel, the File menu and the main application tabs stay fixed in the first version.

### Proposed controls

- Drag a panel by its caption to another position in the same Design CAD sub-tab. A vertical insertion marker shows the result before drop.
- Right-click a panel caption for **Move left**, **Move right** and **Reset panel order**. This provides an accessible alternative to dragging.
- Add **Reset all CAD ribbon panels** to the existing App preferences area.
- Save the order as an application preference on this computer. A project file does not carry a user's personal ribbon arrangement.
- Preserve today's order when no preference exists. Ignore missing panel IDs and append newly introduced panels, so upgrades do not break saved preferences.
- Use the chosen order when the ribbon decides which panels fold on narrow windows. The panel the user placed earlier should remain visible before a later panel is folded.
- Keep keyboard navigation, Show labels, responsive folding and every command unchanged.

## Acceptance checks after approval

1. Opening a colour field from the ribbon, layer palette or Properties palette never produces a picker larger than the available window.
2. Every index from 1 to 255, ByLayer / As drawn and a true RGB colour can be entered and selected with mouse or keyboard.
3. The picker stays fully visible when opened near every window edge and at the supported zoom levels.
4. Layers can be moved to the first, middle or last panel position; the order survives an app restart and Reset restores the default.
5. A saved order remains valid when Show labels changes the Design CAD sub-tabs or when a future version adds a panel.
6. Existing colour parsing, CAD colour storage, ribbon commands and black-and-white printing tests continue to pass.

## Decisions required

1. Approve the compact two-tab colour picker described above?
2. Approve reordering whole Design CAD ribbon panels within their current sub-tab, saved per computer, with drag, Move left / right and Reset?

Up: [[Future development]]
