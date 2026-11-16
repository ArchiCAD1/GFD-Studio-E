# UI / UX proposal — Layout, viewport and template tools on Output (2026-11-14)

Status: **approved on 2026-11-14 ("Go ahead"). Batch 1 (items 1, 3, 4, 6, 8, 10) built in v2.136. Batch 2 (items 5, 9, 12) approved the same day ("go ahead with batch 2") and built in v2.143. Open points 1 and 4 after batch 2 (the design on these layouts, DWT) chosen on 2026-11-15 and built in v2.147. Items 2 and 11 (layout manager, named plot styles) built in v2.149 ("Next", 2026-11-15). Item 7 (clipped viewport) built in v2.161 on `feat/cad-vpclip` ("go ahead", 2026-11-16). Item 13 and open points 2 and 3 wait.**

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

## Built (v2.143, batch 2)

Pictures (printed with the PDF check's hidden renderer, not the app): the new screens `docs/mockups/cad-layout-batch2-screens-v2.143.png`; a layout made with + of the sample villa as it plots `docs/mockups/cad-layout-plot-sample-v2.143.png`.

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

1. ~~**What a layout made with + shows.**~~ Chosen 2026-11-15 ("Design on + layouts"), built in v2.147: see below.
2. **Pens on these plots.** The drawing file's lines are one thin black line; the design prints at the set's default pens (v2.147). A pen table per layout, lineweights by layer or colour, and the drawing file's lines in grey under the design belong with [[UI UX proposals - 2026-11-10 - Batch plot CAD options]], whose five decisions are still open.
3. **Batch plot and Publish** listing the layouts made with + and the file's own: decision 1 of the same proposal.
4. ~~**DWT** in the file dialog for From another drawing…~~ Built in v2.147.

## Built (v2.147, the design on layouts)

Picture (printed with the PDF check's hidden renderer, not the app): a layout made with + of the sample villa as it plots, a plan at 1:75 and a key plan at 1:500, with devices, wiring, a tray, a cable route and drawn text: `docs/mockups/cad-layout-design-plot-sample-v2.147.png`.

- **The design through every viewport** (`fileDesignOf`, `fileDesignSvg` in `src/docs/planLayout.ts`; `layoutDesign` in `src/docs/layoutPlot.ts`; `design` on `CadFilePaper`): a layout of the drawing shows what was made in the app over the drawing file's own lines, as the Model tab does: the devices of the level the drawing shows (lighting, power and ELV together), its DBs with their names, wiring, home runs and circuit tags, the tray runs and cable routes drawn on the file with their labels, the references under the plan that print, and the drawn work (lines, text, notes, dimensions, leaders, hatches, points, block inserts). The plot prints the same pieces.
- **Sizes and pens as on a plan sheet:** symbols and tags keep their paper size at any viewport scale; lines print at the set's default pens. A viewport at half the first one's scale or less is a key plan: no tags or DB names.
- **Layers:** drawn work on a layer that is off, frozen or set not to print stays off, as on a plan sheet.
- **The drawing file's own layouts too:** they show the model through their viewports, so the design is on them as well.
- **DWT:** New layout → From another drawing… offers drawing templates (DWT) as well as DWG and DXF. Only there: a template is read and closed again, never opened as the drawing worked on.
- **Fixed on the way:** Arrange → Plan and key plan on a layout made with + set the key plan from what its own small frame would fit (1:2000 for the sample villa). It now goes by the plan's scale, as on a plan sheet (1:75 → 1:500).

### Built differently (v2.147)

- No room outlines or room names from Building information: on these layouts the architect's plan is the drawing itself.
- While a view is dragged inside a viewport, its design moves with it and what comes into the frame is drawn when the drag ends.
- A device whose circuit is no longer in the design is left off, as on a plan sheet.
- No legend or notes table on these layouts: they stay on the project's plan sheets.
- Checked by tests and the picture only: the screens were not opened in the app (project rules).

## Built (v2.149, items 2 and 11)

Picture of the two dialogs (printed with the PDF check's hidden renderer, not the app): `docs/mockups/cad-layout-manager-plot-styles-v2.149.png`.

- **Item 2, Layout manager** (LAYOUTMANAGER, LAYOUT M; Output → Layout → Layout manager; a layout tab's and the paper's right-click menu; `src/components/cad/cadLayoutManager.ts`, `LayoutManagerDialog`): every layout tab of the drawing in tab order: the drawing file's own layouts, the layouts made with +, the level's plan sheets, each with its paper, what it shows and its page setup. Ticked layouts are copied or deleted together; one is renamed in its row, moved up or down among its kind, or opened (a double-click opens too). A named page setup is given to the plan sheets ticked. Each action is one undo step.
- **Item 11, named plot styles** (`parseStb`, `tableFromStb`, `withStyle` in `src/model/plotSetup.ts`; `PenTableDialog`): Pen tables → Import CTB / STB… reads an STB file. Its styles are kept with the pen table, and a Plot style column gives one to each kind of line: the line takes the style's width (the default pen's when the style uses the object's own lineweight) and its screening. A width or ink changed by hand takes the style off that line.
- **Fixed on the way:** the CTB import looked for the screening under a name plot style files do not use, so every colour came in at full black; it now reads it as files have it. A width outside the usual list now shows in the table.

### Built differently (v2.149)

- The drawing file's own layouts are listed and can be opened, not changed: they are as saved in the file.
- A page setup applies to plan sheets only; a layout made with + still has its paper only (pens for these layouts are open point 2).
- An STB's styles are given to the app's kinds of line by the user; nothing is matched by name. Styles are not read from the layers of a drawing.
- Checked by tests and the picture only: the screens were not opened in the app (project rules). The STB and CTB readers were checked against files made in the tests, laid out as an open-source reader of these files describes them, not against a file saved by a CAD program.

## Built (v2.161, item 7)

Picture (printed with the PDF check's hidden renderer, not the app): a layout made with + of the sample villa as it plots, its plan viewport clipped on a slant, with a key plan beside it: `docs/mockups/cad-vpclip-plot-sample-v2.161.png`.

- **Item 7, clipped viewport** (VPCLIP; Output → Layout viewports → Clip; the viewport's right-click menu and its properties; `src/model/viewportClip.ts`): a viewport of a plan sheet or of a layout made with + takes an outline clicked corner by corner on the paper. Enter or C closes it (three corners or more), U takes the last corner back, Esc cancels. VPCLIP D takes it off.
- **What an outline is:** corners kept in fractions of the viewport's frame, so it moves, resizes, copies and rearranges with the frame. The frame becomes the outline's bounding box and the model stays where it was on the paper.
- **Cut everywhere it shows:** the plan sheet and its PDF, the paper view of a layout made with +, the design over it and its plot. The outline is what prints as the frame when Frame prints is on.
- **Picked by its outline:** a double-click works in the viewport only inside its outline; the part of its frame cut away belongs to whatever is under it. While working in a clipped viewport on a plan sheet, the live model is cut at the outline too.
- **Layout templates** keep a viewport's outline.

### Built differently (v2.161)

- The outline is made of straight sides clicked on the paper. An outline taken from a drawn object (a circle, a closed polyline) is not offered.
- A clipped viewport is still moved and resized by its rectangular frame (the outline's bounding box); the outline's own corners are not dragged. To change the shape, clip it again.
- On a plan sheet exported as DXF or DWG, the design's lines (rooms, references, wiring, trays, routes) are cut at the outline and symbols outside it are left out. Lines and text drawn by hand are cut on screen and in the PDF only, as they already are at a rectangular viewport's edge.
- The drawing file's own layouts are not clipped here, and an outline saved in a drawing file's own viewport is not read.
- Checked by tests and the picture only: the screens were not opened in the app (project rules).

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
