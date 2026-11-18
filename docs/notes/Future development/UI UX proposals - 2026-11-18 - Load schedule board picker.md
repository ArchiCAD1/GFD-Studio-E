# UI UX proposal – Load schedule board picker for many panels (2026-11-18)

Status: **proposed**, waiting for the user's decisions A–E. Nothing is built.

Mockup: `docs/mockups/load-schedule-board-picker-mockup.html` (image: `load-schedule-board-picker-mockup.png`).

![Load schedule with a board picker instead of one button per panel](../../mockups/load-schedule-board-picker-mockup.png)

## Today

The user sent a picture of the DB tab of a project with 84 DBs (DB-83 open). The page shows one button per panel of the open tab (`.ls-panels` in `src/components/docs/LoadScheduleView.tsx`).
- 84 buttons wrap into six rows beside the tabs, so the schedule starts far down the page. At 1952 px wide the mockup measures 174 px for the tabs and buttons; the user's window shows six rows.
- The buttons follow the supply order (`scheduleGroups`, `src/model/scheduleGroups.ts`): DB-GF1, DB-41 … DB-83, DB-1 … DB-40, which is hard to scan.
- Almost every button carries "!" (schedule not filled yet), so the marks say little.
- The same happens on any tab with many panels (SMDB, MCC, Emergency, Other).

## Proposed (every tab of the page)

1. **One row on every tab.** The panel buttons stay while they all fit on the row beside the tabs, as on the MDB, SMDB and MCC tabs today. The switch is by window width, not a fixed count.
2. **When they do not fit**, the row shows **◀ panel ▾ ▶**: the open panel, its floor and its place in the list (e.g. "DB-83 · Sixth floor · 84 of 84"). ◀ ▶ step through the list, as the ribbon's previous / next do.
3. **"! 83 of 84 not filled"** and **Next not filled**: jump to the next panel whose schedule is empty (`incompleteSchedules`).
4. **The list** opens below the panel name (click, or Ctrl/⌘ K). It has:
   - a search box (number, name or room);
   - a "Not filled only" tick;
   - groups by floor from Building information (`Board.level`), else by the fed-from panel (`upstreamId`), else one list;
   - the "!" marks;
   - keys: type to filter, arrows, Enter, Esc.
5. **Number order** in the list (DB-1, DB-2 … DB-83 within a floor). ◀ ▶ follow the list.
6. Space: 174 px → 32 px at 1952 px wide, about 5 more circuit rows; about 7 on the user's window.

## Decisions for the user

- **A.** Many panels: the ◀ panel ▾ ▶ picker with the list (recommended), or one row of buttons that scrolls sideways with ◀ ▶ at its ends?
- **B.** When to switch: when the buttons no longer fit on the row (recommended), or above a fixed count (say 12)?
- **C.** Groups in the list: floor, else fed-from panel (recommended), or no groups?
- **D.** Order: number order in the list and for ◀ ▶ (recommended), or keep the supply order?
- **E.** The select at the top right (every panel of the project): keep it (recommended), or remove it because the list can find any panel?

## Build steps (after approval)

1. The picker and list in `LoadScheduleView.tsx` (a small `BoardPicker` component), the fit measurement on the `.ls-nav` row, Next not filled, and tests. Screen only: the data and exports do not change.
