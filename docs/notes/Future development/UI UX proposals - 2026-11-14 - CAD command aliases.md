# UI / UX proposal — Design CAD typed command aliases (2026-11-14)

Status: **A and B approved by the user on 2026-11-14** ("build it"), built in v2.144 (`feat/cad-command-aliases`).
C waits for the user's go-ahead, one step at a time.

## Decision (2026-11-14)

- Build only what people use today: names that are outdated or rarely typed are skipped, not built.
- Nothing 3D, ever: the app is 2D only.
- Built in v2.144: A without its rarely used names, and B as proposed. Typed only; no ribbon or menu entry was added.
  - A: `PT` `RC` `N` `SA` `OR` `SN` `EXP` `AE` `AT` `BC` `BS` `-B` `-I` `ISOLATE` `UNISOLATE`; `PLOT` `PP` `PRINT`
    (the Plot dialog on a layout or sheet; on Model, a PDF of the view); `PR` `PROPS` `PROPERTIES` `CH` (the
    properties palette); `OP` `OPTIONS` (Drafting settings, Cursor tab); `RE` `REGEN` `REA` `REGENALL` (accepted: the
    view redraws by itself). Found while building: Drafting settings already has a Units tab, so `UN` `UNITS` open it.
  - B: `TR` → Trim (Trace a room is `TRACE`) · `LA` → the layer palette (the side list is `LAYERS`) · `MA` → one Match
    (a drawn object clicked first goes to the properties match) · `AL` `ALIGN` → the new Align tool, the device row is
    `ALIGNH` · `T` unchanged.
  - Skipped as rarely used or outdated: `OF` (everyone types `O`; as an alias it would stop Tab completing OF to OFFSET), `AX` `DM` `LS` `TEDIT` `TX` `MO` `PRCLOSE` `R` `REDRAW`, the 12 old names, `GR`
    `PREFERENCES` `XB` `SSM`. `PRE` / `PREVIEW` wait: the Plot dialog's Preview button already does it; opening the
    preview directly can follow now that the layout plot work (PR 589) is in.
- C trimmed the same way (see the C table): dropped `DOUGHNUT` `DDCOLOR` `DDLTYPE` `DDUNITS` `DDRENAME` `VL` `ATI`
  `DJL` `DCE` `CM` `CL` `DOV` `QC`; C10 (scripts and command-line versions) only if scripts are wanted.

The user sent the alias list of a current industrial 2D drafting product (316 typed names) and asked what the app
already has, what clashes, and what could be added. The list is not copied into the repo. This note names only typed
words and the app's own commands. The app's table is `src/components/cad/cadCommands.ts`, and the layout commands are in
`layoutCmd` in `CadPage.tsx`.

## Summary

| Group | Typed names | What it needs |
| --- | --- | --- |
| Already in the app, same meaning | 76 | nothing |
| A — the app has the command, the alias is missing | 32 (+ 12 old names, + 5 nearest, optional) | one word each |
| B — same letters, a different meaning in the app | 5 to decide, 5 kept as the app has them | a decision |
| Planned in the Design CAD 2D gap plan (S12–S24) | 26 | names added to those steps |
| C — new tools worth adding | 59, in 10 steps | one step per PR |
| Skip | 96 | — |

Of the app's 162 typed commands, 75 use no name from the list. Some are full command names that an alias list does
not need (UNDO, GRID, LAYISO, QSELECT…). The rest are the app's own: devices, trays, cable routes, wiring, schedules,
rooms, lux, emergency lighting and the text macros. They stay as they are.

Already the same (76): `L` `PL` `C` `A` `REC` `POL` `EL` `M` `CO` `CP` `RO` `MI` `SC` `S` `O` `F` `CHA`
`BR` `J` `X` `EX` `AR` `E` `H` `BH` `HE` `BO` `B` `I` `BE` `ATT` `ATE` `DLI` `DAL` `DCO` `DBA` `DRA` `DDI` `DAN` `D`
`DST` `ST` `DT` `MT` `ED` `LE` `PO` `DIV` `ME` `DR` `DI` `AA` `LI` `XR` `ER` `XA` `XC` `W` `Z` `P` `DS` `SE` `OS`
`MS` `PS` `MV` `LO` `TA` `UNHIDE` `PAINTER` `DELETE` `DDEDIT` `DDPTYPE` `BPOLY` `DXFOUT` `RECTANGLE`.

## A — aliases for commands the app already has

One word in the command's alias list each. No new tool, no ribbon change.

| Typed (new) | Goes to |
| --- | --- |
| `AE` · `AT` · `AX` | ATTEDIT · ATTDEF · ATTEXT |
| `-B` · `-I` | -BLOCK · -INSERT |
| `BC` · `BS` | BCLOSE · BSAVE (block editor) |
| `DM` | DIMSTYLE |
| `EXP` | EXPORT |
| `ISOLATE` · `UNISOLATE` | ISOLATEOBJECTS · UNISOLATEOBJECTS |
| `LS` | LIST (Inspect) |
| `N` · `SA` | NEW · SAVE |
| `OF` · `PT` · `RC` · `TX` · `TEDIT` | OFFSET · POINT · REVCLOUD · TEXT · TEXTEDIT |
| `OR` · `SN` | ORTHO (F8) · SNAP (F9) |
| `PP` · `PRINT` | PLOT. Typed PLOT works only on a sheet today; with these, all three do what the ribbon's Plot does (the Plot dialog on a layout or sheet, the PDF of the view on Model) |
| `PR` · `PROPS` · `CH` · `MO`, and `PROPERTIES` | Properties palette on (today only Ctrl/⌘+1) |
| `PRCLOSE`, and `PROPERTIESCLOSE` | Properties palette off |
| `PRE`, and `PREVIEW` | Plot › Preview, on a layout tab or sheet |
| `RE` · `REA` · `R`, and `REGEN` · `REGENALL` · `REDRAW` | repaint the view and say so (habit commands: the view already redraws itself) |

Optional, old names that still map cleanly (12): `DTEXT` → TEXT · `DDIM` → DIMSTYLE · `DDSTYLE` → STYLE · `BMAKE` →
BLOCK · `DXFIN` → OPEN · `EPDF` → EXPORTPDF · `VIEWPORTS` → VPORTS · `DIMHORIZONTAL`, `DIMVERTICAL`, `DIMROTATED` →
DIMLINEAR · `DDMODIFY`, `DDCHPROP` → Properties.

Optional, nearest tool only (5): `OP`, `GR`, `PREFERENCES` (and `OPTIONS`) → Drafting settings, as the app has no
single options dialog · `XB` (and `XBIND`) → References › Bind…, which binds the whole reference, not single layers
or blocks · `SSM` (and `SHEETSET`) → the Sheets list.

## B — same letters, different meaning

To decide:

| Typed | Usual meaning | The app today | Proposal |
| --- | --- | --- | --- |
| `TR` | Trim | Trace a room (ribbon: Trace … (TR)) | **`TR` → Trim.** It is one of the most typed aliases. Trace keeps `TRACE`; its tooltip shows (TRACE). `TM` stays a second name for Trim. |
| `LA` | Layer manager | Shows or hides the side Layers list; `LAYER`, `LM` open the manager | **`LA` → Layer manager**, as `LAYER`. The side list keeps `LAYERS`; the ribbon's Layers panel tooltip shows (LAYERS). |
| `MA` | Match the properties of any object | Match a device only; `MP`, `PAINTER` match drawn objects | **One Match:** `MA`, `MATCHPROP` look at the first object clicked. A device starts today's device match; a drawn object starts the properties match, as `MP`. |
| `AL`, `ALIGN` | Move, turn and optionally scale objects by one or two pairs of points | `ALIGN` puts the devices selected in a row (`ALIGNV` a column, `SPACE` even spacing) | **`AL`, `ALIGN` → a drafting Align** (new tool, see C6). The device row moves to `ALIGNH`, beside `ALIGNV`; the ribbon and right-click entries keep their labels. |
| `T` | Notes (multi-line text) | Single-line Text | **No change:** decided in the gap plan S6 (`T`, `DT`, `TEXT` single-line; `MT` Notes). |

Kept as the app has them (the usual meaning is rarely typed or is 3D):

| Typed | Usual meaning | The app keeps |
| --- | --- | --- |
| `CT` | Table style | Cable tray run |
| `TH` | 3D thickness | Text height |
| `LM` | Drawing limits | Layer manager |
| `TM` | Switch model / layout | Trim |
| `POLAR` | Opens Drafting settings | Polar tracking on / off (F10); `DS` opens the settings |

## Planned in the Design CAD 2D gap plan

Nothing new to decide. When each step is built, add the typed names marked "add".

| Typed | Step | |
| --- | --- | --- |
| `MLD` `MLA` `MLC` `MLS` | S12 Multileader | as planned |
| `MLE` (`MLEADEREDIT`) | S12 | add: add or remove leader lines (S12 has it on the right-click menu only) |
| `TB` | S13 Table | as planned |
| `TS` (`TABLESTYLE`) | S13 | add: the table style dialog |
| `PU` `-PU` | S16 Purge | as planned |
| `SPL` `SPE` | S18 Spline and Edit spline | as planned |
| `PE` `LEN` | S19 Edit polyline and Lengthen | as planned |
| `REG` | S20 Region | as planned |
| `DRE` `DDA` | S21 Associative dimensions | as planned |
| `IM` `-IM` (`IMAGE`) | S23 Image and PDF underlays | add: the images in the References palette, and the command-line version |
| `UC` `DDUCS` `DDUCSP` (`UCSMAN`) | S24 UCS | add: the named UCS dialog |
| `V` `DDVIEW` | S24 Named views | as planned |
| `-V` `VGO` `NVIEW` | S24 | add: `-VIEW` (command line), `VIEWGO` (restore a named view), `NEWVIEW` |

## C — new tools worth adding

Each step is one PR. Everything drawn saves to DXF / DWG; sheets and PDFs stay black-and-white.

| Step | Typed | For LV drawings | Size |
| --- | --- | --- | --- |
| C1 | `DO` → DONUT · `XL` → XLINE (and `RAY`) | junction dots on wiring, earth points; construction lines to set out grids and tray runs | small |
| C2 | `G` → GROUP (and `UNGROUP`) | keep a board and its label, or a set of riser symbols, together without making a block; saved as groups (a change in the Rust writer) | medium |
| C3 | `LAS` → LAYERSTATE, and layers frozen per layout viewport | one base plan with saved layer states for power, lighting, small power and ELV; a layer off in one viewport only | medium |
| C4 | `COL`, `COLOUR` → COLOR · `LT`, `LTYPE` → LINETYPE · `LTS` → LTSCALE · `LW`, `LINEWEIGHT` → LWEIGHT | current colour, linetype and lineweight for new objects (By layer by default); a linetype list that loads .lin files; the linetype scale, fixed at 1:100 today | medium |
| C5 | `BA` → BASE · `REN` → RENAME (`UN`, `UNITS` built in v2.144: the Units tab) | the base point used when the drawing is inserted or attached; one rename dialog for layers, blocks, styles and layouts | small to medium |
| C6 | `MEA` → MEASUREGEOM · `OO` → OOPS (`AL`, `ALIGN` built in v2.144) | one measure command (Distance, Radius, Angle, Area; uses DI and AREA); the last objects erased brought back after other commands | small |
| C7 | `AD` → ATTDISP | block attributes shown or hidden on the plan (double-click already edits a block's attributes) | small |
| C8 | `DAR` → DIMARC · `DOR` → DIMORDINATE · `DED` → DIMEDIT · `JOG`, `DJO` → DIMJOGGED | arc length on curved runs, ordinate set-out, text angle and oblique, jogged radius | medium |
| C9 | `SP` → SPELL | the spelling of texts, notes and attributes checked offline | medium |
| C10 | Only if scripts are wanted: `SCR` → SCRIPT, and the command-line versions `-AR` `-AT` `-ATT` `-ATE` `ATTE` `-BO` `-H` `-MT` `-T` `-OS` `-P` `-W` `-XR` `-XB` `-CH` `-LA` `-LT` `-UN` `-REN` | a text file of commands run in order (also useful with the headless CLI); prompts only, no dialog | medium |
| Later | `DL`, `DLU` → DATALINK | a table linked to a Sheets / Excel range, after S13 | — |

Not in the list (they are full commands, not aliases) but expected: `U` (undo one step) and `ID` (the coordinates of a
point). Both are small and could join A.

Suggested order now that A and B are built: C6, C1, C5, C4, C3, C2, C7, C8, C9, then C10 only if scripts are wanted.

## Skip (96)

| Why | Typed |
| --- | --- |
| 3D, shading, isometric (wait for a BIM link) | `3P` `HI` `SH` `SHADE` `VP` `-VP` `DDVPOINT` `WHEEL` `IN` `SU` `UNI` `IS` `3DCONFIG` `-3DCONFIG` |
| Dynamic blocks and constraints (out of scope in the gap plan) | `AC` `PARAM` `BVS` `CBAR` `CSETTINGS` `DELCON` `PAR` `-PAR` |
| The other program's online services, viewers and palettes | `P2D` `P2DCLOSE` `ESHOT` `NSHOT` `GEO` `EPDFSHX` `QVD` `QVDC` `QVL` `QVLC` `AV` `CE` `DC` `DCENTER` `ADCENTER` `CONTENT` `TP` `TO` `CLI` `POFF` `PON` `QP` `MSM` `DRM` |
| Obsolete, system settings, or covered by another command | `BM` `QT` `RI` `SET` `MR` `D1` `-G` `-GROUP` `BUPDATE` `MTEDIT` `DDINSERT` `DDPLOTSTAMP` `MENULOAD` `MENUUNLOAD` `RASTERPREVIEW` `AUTOCOMPLETE` `AUTOCOMPLETEMODE` `AUTOCOMPLETEDELAY` |
| File formats and data exchange the app does not use | `WI` `WO` `IO` `PA` `IMP` `EDWF` `EDWFX` `DWFOUT` `-QPUB` |
| Not needed on electrical drawings | `TOL` `SO` `GD` (prints as grey only) `RD` `REV` `TI` (the Model and layout tabs do it) |
| Old or unusual names | `DAD` `DN` `DX` `SAVEURL` `OPENURL` `INSERTURL` `DDATTDEF` `DDATTEXT` `DDLMODES` `DDOSNAP` `BMOD` `DDATTE` `DDRMODES` |
| Quit from the command line | `EXIT` |
| Names that carry the other product's name | 3 typed names. Never added. |

## Copyright and naming

- Typed command names and one-letter aliases (`M` for Move, `CO` for Copy) are a way of operating a program, and too
  short to be a work. Copyright does not cover them: TRIPS Art. 9(2) (expressions, not "methods of operation"), UAE
  Federal Decree-Law 38/2021 Art. 3, US Court of Appeals, First Circuit, 49 F.3d 807 (1995: a program's menu command
  words are a method of operation) and EU Court of Justice C-406/10 (2012: a program's functionality and file formats
  are not protected). Every current
  industrial 2D drafting product uses the same letters, so users expect them.
- What is protected, and not copied: the other program's alias file itself (its text, comments and layout), its help
  and prompts word for word, its icons and dialogs, and its product and feature names (trademarks). The app keeps its
  own table in `cadCommands.ts`, its own descriptions, prompts and icons, and never names another product.
- This is general information, not legal advice. A short check by an IP lawyer before a commercial release is worth it
  for the CAD module as a whole (names, file formats, icons).
