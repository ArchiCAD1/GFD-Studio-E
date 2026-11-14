# UI / UX proposal — Layout, viewport and template tools on Output (2026-11-14)

Status: **approved on 2026-11-14 ("Go ahead"). Batch 1 (items 1, 3, 4, 6, 8, 10) built in v2.136. Batch 2 (items 5, 9, 12) approved the same day ("go ahead with batch 2") and built in v2.141 on `feat/cad-layout-batch2`. Items 2, 7, 11, 13 and the open points below wait.**

The user's condition: the arrangement must stay close to what people who know current industrial 2D drafting products expect, without copying one, so nobody has to hunt for a tool. Output therefore reads **Layout · Layout viewports · Plot · Publish · Export**, the typed commands keep their usual names (LAYOUT, MV, VPORTS, VPSCALE, VPLOCK, VPMAX / VPMIN, PAGESETUP, SCALELISTEDIT), and the same entries are on a layout tab's right-click menu.

Picture of the built ribbon (printed with the PDF check's hidden renderer, not the app): `docs/mockups/cad-output-layout-tools-v2.136.png`.

## Built (v2.136, batch 1)

- **Ribbon** (`src/components/Ribbon.tsx`): the Layout and Layout viewports panels moved from *Electrical, ELV & sheets* to Output, every tool named (1,281 px on a layout, inside a 1,366 px window). With Show labels on they have a **Layout** sub-tab between Sheets and Output, because Output would be about 1,420 px.
  - Layout: New layout ▾ (New layout, From template…, the four plan sheets), Page setup, Save as template.
  - Layout viewports: Viewport, Arrange ▾, Legend, Notes, Scale ▾ (with Scale list…), Lock, Fit, Copy, Align ▾, Maximise, Frame prints.
- **Arrangements** (`src/model/planViewports.ts`, VPORTS 1 / 2V / 2H / 3L / 3R / 3A / 3B / 4 / KEY): viewports there keep their scale and view and take the frames in order; missing ones show what the first shows; a key plan is at five times the plan's scale or more. 5 mm gap. On plan sheets and on layouts made with +.
- **Viewport tools on plan sheets:** VPFIT, VPCOPY, VPALIGN H / V (with Viewport 1), VPMAX / VPMIN, VPFRAME; the project's scale list (`plot.scales`, SCALELISTEDIT).
- **Layouts made with +** (`src/model/drawingLayouts.ts`): Page setup (paper A4 to A0, landscape or portrait; viewports keep place and scale), VPORTS, VPFIT, VPSCALE with one viewport, VPMAX.
- **Layout templates** (`src/model/layoutTemplates.ts`, library key `lvds.layoutTemplates`): from a plan sheet, a layout made with +, or the file's own layout; a new layout of the drawing or a plan sheet from one; `.layout.json` export and import.
- **Page setups** (`src/model/plotSetup.ts`, library key `lvds.pageSetups`): Import… (a page-setup file or a project file), Export…, Save to library, Add from library. Pen tables go with them, matched by name.

### Built differently from the list

- Item 3: **+** still makes an A3 layout at once; the paper is set in Page setup afterwards, as drafting programs usually do. No question on every +.
- Item 4: the gap is fixed at 5 mm; an arrangement always fills the layout, not a window picked on the paper.
- Item 6: Maximise shows the viewport's area on the Model tab (layers frozen in that viewport are not applied there); it does not enlarge the viewport on the paper. Align is always with Viewport 1.
- Item 8: a template keeps the name of the named page setup; the new plan sheet follows a setup of that name when the project has one.
- Item 10: a page setup whose name is already in the project is left as it is (not replaced).
- Checked by tests and a printed picture of the ribbon only: the screens were not opened in the app (project rules).

## Built (v2.141, batch 2)

Pictures (printed with the PDF check's hidden renderer, not the app): the new screens `docs/mockups/cad-layout-batch2-screens-v2.141.png`; a layout made with + of the sample villa as it plots `docs/mockups/cad-layout-plot-sample-v2.141.png`.

- **Item 5, viewports on layouts made with +** (`src/model/drawingLayouts.ts`, `src/components/cad/CadFilePaper.tsx`): a frame is picked by its edge and dragged to move (its view goes with it); its corners resize it (the model stays where it is on the paper); MV makes one from two corners, showing the whole drawing at the scale it fits; Esc stops MV. A double-click inside works in it (MS): the wheel and a drag move its view; a double-click outside, PS or the status bar's PAPER / MODEL button goes back. VPSCALE, VPLOCK, VPFIT, VPCOPY, VPALIGN, VPMAX and VPFRAME act on the viewport worked in, else the one picked, else the only one. A picked viewport shows its properties in the palette (scale, locked, frame prints, delete); the same entries are on its right-click menu. Viewports are named by their place (Viewport 1, 2 …); `locked` and `frame` are kept on the viewport.
- **Item 9, layouts from another drawing** (LAYOUT I; New layout → From another drawing…; a tab's and the paper's right-click menu): a DWG or DXF is picked, its layouts are listed with paper and viewports, the ones ticked are added with their paper and viewport frames at their scales, centred on this drawing. A name already taken becomes the next LayoutN. They can be kept as layout templates as well. The other drawing is read and closed again.
- **Item 12, plot on every layout tab** (`src/docs/layoutPlot.ts`, `LayoutPlotDialog`): Plot on a layout made with + and on the file's own layouts, from the ribbon, the tab's menu, the paper's menu, PLOT and Export → PDF of this layout. One page the size of the layout's paper (any size, either way up) as PDF; a printer for A4 and A3 either way up, A2 and A1 landscape. Black on white: the model through each viewport at 0.18 mm, what is on the paper at 0.25 mm, texts at their height. A frame prints only where Frame prints is on. Preview shows the PDF first.
- **Layers:** a layer of the drawing turned off or frozen in the app is hidden on these layouts and their plots (before, layouts showed the layers as the file had them).

### Built differently from the list (batch 2)

- Item 5: working inside a viewport moves its view only. Drawing is done on the Model tab (Maximise goes there with the viewport's area). A new viewport (MV) shows the whole drawing; it does not take another viewport's scale.
- Item 5: the file's own layouts stay as saved. To change one, save it as a template (LAYOUT S) and make a layout from it.
- Item 9: DWG and DXF only. The desktop file dialog does not offer DWT; a template drawing saved as DWG works.
- Item 12: page setup on a layout made with + is still its paper only; the file's own layouts keep the paper the file gives (A3 when it gives none). No pen table, lineweights or plot stamp on these plots yet.
- Item 12: Publish and Batch plot still list plan sheets only (see the open points).
- Checked by tests and the two pictures only: the screens were not opened in the app (project rules).

### Open after batch 2 (for the user to decide)

1. **What a layout made with + shows.** It shows, and plots, the drawing file's own lines and texts. Devices, wiring and objects drawn in the app are not on it; they are on the project's plan sheets. Show them on these layouts too? (Medium to large: the plan drawn through each viewport, on screen and in the plot.)
2. **Pens on these plots.** One thin black line today. Pen tables and lineweights by layer or colour belong with [[UI UX proposals - 2026-11-10 - Batch plot CAD options]], whose five decisions are still open.
3. **Batch plot and Publish** listing the layouts made with + and the file's own: decision 1 of the same proposal.
4. **DWT** in the file dialog for From another drawing… (a small change in the desktop shell).

## Why

The user asked for more layout, viewport-arrangement and template / import tools in Design CAD, placed on the **Output** sub-tab, and for a list before anything is added.

## Today (v2.133)

- **Output** has three panels: Plot (Plot, Preview, Page setups, Pen tables, Printers), Publish (Publish, Batch plot) and Export (PDF, DXF, DWG, Register).
- **Layouts** (New layout) and **Viewports** (Viewport, Legend, Notes, Scale, Lock) are on *Electrical, ELV & sheets*; Viewports shows only on a layout tab.
- Three kinds of layout tab under a drawing:
  - **Plan sheets of the level** (`DrawingSheet.viewports`, `src/model/planViewports.ts`): MV, MS / PS, VPSCALE, VPLOCK, legend and notes tables, page setup, plot.
  - **Layouts made with +** (`src/model/drawingLayouts.ts`): always A3 landscape with one viewport; rename, copy, move, delete. Their viewports cannot be changed, and they have no page setup or plot.
  - **The file's own layouts** (`src/model/fileLayouts.ts`): shown as saved.
- Templates: title block templates (library, DWG / DXF import), named page setups (this project only), pen tables (CTB import), layer-mapping templates. There is no layout template and no import of layouts or page setups.

## The list

| # | Feature | What it does | Size |
|---|---|---|---|
| 1 | Layouts and Viewports panels on Output | Move both panels from *Electrical, ELV & sheets* to Output, so layout → viewport → plot is one tab. No new function. | Small |
| 2 | Layout manager | One list of the drawing's layouts with paper, scale and page setup: rename, copy, reorder, delete, apply a page setup to many. Today only on a tab's right-click. | Medium |
| 3 | Paper for a new layout | Paper size and portrait / landscape when a layout is made with +, and changed later. Today always A3 landscape. | Small |
| 4 | Viewport arrangements (VPORTS) | Single, two side by side, two stacked, three (large one left, right, above or below), four equal, plan + key plan; a gap between them. Replaces the layout's viewports or fills a window picked on the paper. | Medium |
| 5 | Viewports on layouts made with + | Pick, move, resize, new (MV), delete, scale, lock, and MS / PS. Today these work on plan sheets only. | Large |
| 6 | More viewport tools | Copy viewport; Fit (the whole drawing at the nearest standard scale); Align (line up the views of two viewports); Maximise / restore (VPMAX / VPMIN); more scales and a custom scale list; Frame prints on the ribbon. | Medium |
| 7 | Clipped viewport (VPCLIP) | A viewport with a polygon outline. | Large |
| 8 | Layout templates | Save a layout as a template (paper, viewport arrangement and scales, legend and notes tables, page setup) and make a new layout from one. Kept in the library (LV Database), with export / import as a file. | Medium |
| 9 | Import layouts from another drawing | Pick a DWG / DXF / DWT, tick its layouts; they are added here with their paper and viewport frames. The border comes from the title block template, not from that file's paper space. | Medium |
| 10 | Import / export page setups (PSETUPIN) | Named page setups from another project or a file, and into the library. | Small |
| 11 | STB pen tables | Import named plot styles (STB) beside CTB. | Small |
| 12 | Plot and page setup for + and file layouts | Plot, Preview and Page setup on every layout tab, not plan sheets only. Overlaps [[UI UX proposals - 2026-11-10 - Batch plot CAD options]] (mockups shown, awaiting approval); build together. | Large |
| 13 | Layouts in Save DXF / DWG | Layouts made here written as real paper-space layouts with viewports (phase 2 of [[UI UX proposals - 2026-11-07 - Model and layout space]]). Needs the Rust writer and `npm run build:cad`. | Large |

## Recommended order

- **Batch 1 (project data only, no engine change):** 1, 3, 4, 6, 8, 10.
- **Batch 2:** 5, 9, 12 (with the Batch plot CAD options).
- **Later:** 2, 7, 11, 13.

## Decisions for the user

1. Which items to build (numbers, or "batch 1").
2. Item 1: move the Layouts and Viewports panels to Output (recommended: a tool sits on one sub-tab only), or leave them on *Electrical, ELV & sheets* and add only the new tools to Output?

## Build notes

- Output is the narrowest sub-tab today; measure its width after adding panels and keep it within 1,366 px (fold small tools into lists if not).
- Arrangements and templates write `PlanViewport[]` on plan sheets and `DrawingViewport[]` on + layouts; no drawing file is changed.
- Prints stay black-and-white. 2D only.
