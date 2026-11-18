# UI UX proposal – Load schedule circuit tools and ELCB / RCD (2026-11-18)

Status: **mockup only, waiting for the user's decisions** (A–E below). Nothing is built.

Mockup: `docs/mockups/load-schedule-circuit-tools-mockup.html` (image: `load-schedule-circuit-tools-mockup.png`).

![Load distribution schedule with circuit tools above the grid](../../mockups/load-schedule-circuit-tools-mockup.png)

## Today

The user sent a picture of the DB load distribution schedule (DB-GF1) and asked for a redesign: there is no option on the page to add a circuit, a 3-pole ELCB / RCD, a 3-phase spare or a 1-phase spare.

- Add circuit (menu: 3-phase circuit) and Spare (menu: Space, 3-phase spare, 3-phase space) are only on the ribbon, Load schedule tab → Circuits and loads, since v2.109 (PR 535). The 3-phase and space choices sit behind the button's arrow. The page has no add buttons; the empty grid says "use Load schedule → Add circuit".
- ELCBs come only from the board setting "ELCB per" (6 circuits, 3 circuits, none), applied to the whole board (`elcbGroups`, `src/calc/loadSchedule.ts`). There is no way to put an ELCB on chosen ways, give a 3-phase circuit its own ELCB, or fit a 1-phase RCBO. `Feeder.rcdMa` exists but the schedule does not set it.
- The header uses five rows before the board bar: the title, a three-line intro, the Supply line, the tabs, and the board chips on a row of their own (225 px in the mockup). The user said it takes more space than needed (second picture, same day).

## Proposed (the header, items 1–2, on every form of this page; items 3–6 on the DB form only)

1. **One title row:** title, an **i** button that opens "How this page works" (the full intro text and the Project settings link), and the supply chain. The intro paragraph and the separate Supply line go.
2. **Tabs and board chips share one row.** When a board serves rooms, the rooms check becomes a short chip at the end of that row (full text on hover). Title to board bar: 225 px → 97 px, about 5 more circuit rows on screen.
3. A row of add buttons right above the grid, where the "Excel keys" hint is now: **1-phase circuit**, **3-phase circuit** · **ELCB / RCD** (menu) · **Spare 1-phase** (20 A SP), **Spare 3-phase** (32 A TP), **Space** (menu: 1-phase, 3-phase) · **Balance phases**. Phase load and imbalance stay at the right; the Excel keys hint moves behind a "?". The ribbon keeps its buttons; both run the same commands (`addCircuit`, `addSpareWay`, `balancePhases`).
4. **ELCB / RCD** (new data): a 3-phase ELCB over chosen ways, a 3-phase ELCB for the selected 3-phase circuit only, or a 1-phase RCBO in place of the selected circuit's MCB. Edit, remove, and "All automatic again". Dialog: ways from–to, poles (4P TP&N default, 3P), rating Auto (from the largest phase current, `STANDARD_ELCB_A`) or chosen, sensitivity Auto (lighting / power setting, design rules) or chosen.
5. Ways not under a hand-placed ELCB keep the board's "ELCB per" grouping, counted over the ways that are left. The board bar shows "+ n placed by hand".
6. In the grid a hand-placed ELCB has its own cell in the ELCB column; an RCBO shows in the MCB cell. Both print in the ELCB column of the PDF and Excel form and count in the BOQ, the enclosure device list and the earth-fault check (`rcdOf`).

## Decisions for the user

- **A.** 3-phase ELCB: 4-pole (TP&N, as the form prints today) by default with 3-pole as a choice, or 3-pole only?
- **B.** New rows in the next free way, as today (recommended), or after the selected row (renumbers every way below it)?
- **C.** 1-phase RCBO in place of the MCB: now, or only the 3-phase ELCB first?
- **D.** Intro text only behind the **i**: OK, or keep one short line under the title?
- **E.** Ribbon keeps Add circuit / Spare as they are (recommended).

## Suggested build steps (after approval)

1. Compact header and page add buttons (items 1–3): screen only, the commands already exist. The other forms (MD, TCL summary, riser) use the same `Page` header, so they get the i too unless you say otherwise.
2. Hand-placed ELCB / RCBO (items 4–6): `Board.elcbs` (ways, poles, rating, mA) and the RCBO on the feeder; `elcbGroups` takes them first; ELCB column, PDF, Excel form, BOQ, enclosure and earthing follow; tests for the grouping, ratings and exports.
