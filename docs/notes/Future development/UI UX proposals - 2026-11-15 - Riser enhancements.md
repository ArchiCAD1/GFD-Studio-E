# UI UX proposal – Riser enhancements: busbar riser, earth riser, boards by level (2026-11-15)

Status: **waiting for approval**. Nothing is built.

Mockup: `docs/mockups/riser-enhancements-mockup.html` (image: `riser-enhancements-mockup.png`). Its figures come from the app's G+10 mock-up (Busbar riser page → G+10 mock-up: MDB-1 on a 1500 kVA transformer, 415 V, 45 °C, eleven SMDBs, a 630 A copper busway). They were worked out with the app's own functions. Rows marked "example" are added only to show a check.

![Busbar riser page, where the busway shows, earthing checks and the sheets, proposed](../../mockups/riser-enhancements-mockup.png)

## Today

The three risers work (v2.149; the riser code is unchanged since 2026-11-09). The status check on 2026-11-15 found these gaps:

1. **A board on a tap-off is calculated through its own cable from the source board.** The busway is not in its voltage drop, fault level or earth fault loop. In the G+10 mock-up, the L10 SMDB shows 0.07 % at the board; with the busway it is 0.79 %. Its fault level shows 25.52 kA; with the busway it is 17.60 kA. The busway's drop appears only on its own row of the Voltage drop page.
2. **Diversity is counted twice.** The IEC 61439 factor (0.6 for 11 tap-offs) is applied on top of each board's maximum demand, which already includes the boards' demand factors (0.8 in the mock-up). MDB-1's MD form counts the same boards at 1.0. G+10: Ib 463.74 A, 500 A breaker, 630 A copper. At 1.0: Ib 772.89 A, 800 A breaker, 1000 A copper.
3. **The tap-off unit is chosen from the floor current, not from the MCCB inside it.** In the G+10 mock-up, a 100 A tap-off unit holds a 160 A MCCB.
4. **All floors use one floor height** (3.6 m). The mock-up's ground floor is 4.5 m, so the L10 tap-off is really at 36.9 m, not 36.0 m.
5. **The source board lists one way per tap-off board.** MDB-1's MD form has 11 rows named "Busbar tap-off to …", not one busway way.
6. **The Busbar riser drawing leaves some things out without a note:** tap-offs typed as a load with no board, and panels with no Level.
7. **Bug:** the Boards by level sheet prints the busway rating (630 A) at the busway's breaker. The Busbar riser page, the Individual feeders riser and the riser form all give the feeding breaker (500 A).
8. **Earth riser cable sizes are not checked.** The riser cable (1C 95 mm²) and the LV room cable (1C 150 mm²) are typed text. Riser problems (no Level, no riser on the level, wrong riser) appear only as notes on the sheet, not in the Checks tab.
9. **The BOQ has no earth riser items.** The only earthing item is the main earth terminal bar of each main board.

## Proposed

### A. Calculations

**A1. The busway in the network.** A board on a tap-off is a floor of a busbar riser whose source is the board's supply. Such a board is fed through the busway:

- **Voltage drop at the board** = the drop to the source board + the busway's drop up to its tap-off (the riser's own sections, ENG-011) + the tap-off cable. Its final circuits follow from that.
- **Fault level** at the tap-off and at the board = the source impedance + the busway's R and X up to the tap-off + the tap-off cable. R is taken at 20 °C for the maximum fault, as it is for cables.
- **Earth fault loop:** worked out the same way, using the busway's PE. The busway data gets a new column, PE resistance (mΩ/m), with a typical value until the manufacturer's figure is entered.
- **The tap-off cable:** the board's incoming feeder is the cable from the tap-off box. A check flags one longer than 15 m: "Is this the cable from the tap-off box? The busway up to Level 10 is counted separately."
- **The tap-off MCCB** (the breaker of the incoming feeder) is checked against the fault at its own tap-off, not at the source board.

| G+10 board | Busway to its tap-off | Vd at the board, today → proposed | Final circuit Vd, today → proposed | Fault at the board, today → proposed |
|---|---|---|---|---|
| Ground floor SMDB | 15 m (feed) | 0.06 % → 0.39 % | 0.38 % → 0.70 % | 26.48 → 23.88 kA |
| L05 SMDB | 33.9 m | 0.07 % → 0.69 % | 0.40 % → 1.01 % | 25.52 → 19.94 kA |
| L10 SMDB | 51.9 m | 0.07 % → 0.79 % | 0.40 % → 1.12 % | 25.52 → 17.60 kA |

**A2. The tap-off unit is chosen from its MCCB.** Its rating becomes the next standard size at or above the MCCB in it, and at or above the floor current ÷ 0.85 as now. A floor with a typed load keeps today's rule. G+10: 160 A on L01–L10 (today 100 A) and 250 A on the ground floor (today 125 A).

**A3. Each floor uses its own height.** The riser takes each level's height from Building information, and "One height for all" stays as a choice. G+10: the top tap-off moves to 36.9 m, the length to 52.9 m, and the drop at the top tap-off to 0.72 % (today 0.70 %).

**A4. The earth riser cables are checked**, following IEC 60364-5-54 for a protective conductor shared by several circuits:

- The riser cable is checked against the most onerous panel above the LV room's floor. The LV room cable is checked against every panel on the riser.
- The size needed is the larger of two figures: Table 54.2 applied to the panel's incoming line conductor, and the adiabatic size from its earth fault current and disconnection time. Both use the earthing study's own figures, with k = 143.
- The typed text stays. The check only flags a size that is too small, and offers "Use 70 mm²".
- G+10 results:
  - The riser cable needs 50 mm² (L01 SMDB, 17.52 kA for 0.1 s: adiabatic 38.74 mm²), so the 95 mm² passes.
  - The LV room cable needs 70 mm² (ground floor SMDB, 4C 120 mm², Table 54.2), so the 150 mm² passes.

### B. Screens

**B1. Busbar riser page:**
- **Diversity** becomes a choice:
  - **Same as <source>'s MD form**: the default when every floor is a board.
  - **IEC 61439 by tap-offs**: the default when floors are typed loads.
  - **Typed**.
- The Load card says which diversity is used. It warns when the IEC factor is applied on top of the boards' maximum demand, and gives the result with the other choice next to a "Use 1.0" button.
- **Floor heights:** From the levels · One height.
- **Floors table:** new columns Isc at the tap-off, Tap-off MCCB (its rating, with ✓ when its Icu covers the fault) and Vd at the board. The tap-off column shows the A2 rating.
- **Busway card:** "Typical busway data — confirm with the manufacturer" until the data are entered. The report already says this.
- **A new card, Boards on this riser:** each board's voltage drop and fault level, today and with the busway, plus the tap-off cable check.

**B2. Where the busway shows:**
- The Voltage drop page's board rows include the busway; the tooltip splits the drop.
- Board properties show "Fed from MDB-1 through <riser>, tap-off at <level>", with the tap-off cable and its 15 m check.
- The fault levels on the SLD and the board sheets follow A1.

**B3. Earthing:**
- The settings drawer shows the size each riser cable needs.
- The Checks tab gets an Earth riser group: cable sizes, panels with no Level, no riser on the level, and a chosen riser that does not serve the level. These count in the tab's badge and appear in the Dashboard to-dos.

**B4. One way on the source board** (later, see decision 3). The MD form and the SLD show the riser as one outgoing way: the feeding breaker, the busway and its tap-offs, with the boards under it. Diversity is then applied once.

### C. Sheets (black and white)

**C1. Busbar riser sheet:**
- A tap-off schedule under the drawing: Floor, Board, Tap-off unit, MCCB, Isc at the tap-off and Vd at the board.
- Notes for tap-offs with a load and no board, and for panels with no Level.

**C2. Boards by level:**
- The busway's breaker shows the feeding breaker (500 A), not the busway rating (630 A).
- A note gives the panel schedule sheets and the earth riser sheet.

**C3. Earth riser sheet:**
- A floor earth bar schedule: Tag, Level, Panels, Panel conductors and Bonding.
- When a busbar riser serves the building, its housing (PE) is bonded to the floor earth bar on every floor. This is drawn as one short line per floor, with a note.

**C4. BOQ, group I (earthing):**
- Floor earth bars with two test links (11 in the G+10).
- The earth riser cable: the vertical length from the levels + 0.5 m at each bar, 42.4 m in the G+10.
- The LV room cable (length to site).
- The panel earth conductors by size: 1 × 70 mm² and 10 × 35 mm² (length to site).

## What stays the same

- The layout of every page and sheet, apart from the items above. Exports stay black and white.
- **The data:** projects open as before and nothing is asked again.
- **Except the figures:** A1–A3 change the voltage drop and fault figures of projects with busbar risers. What's new will say so, and the Out of date banner appears on the reports.
- The earthing schematic, the Individual feeders riser and the riser form.

## Suggested steps

Each step is one PR with tests.

1. A1, A2 and the C2 breaker label (calculations and the bug).
2. A3, B1 and B2.
3. A4 and B3.
4. C1, C3 and C4 (with `npm run test:pdf`).
5. B4, if chosen.

## Decisions

1. **Diversity default when every floor is a board:**
   - Same as the source board's MD form (suggested; G+10: 1000 A copper on an 800 A breaker).
   - Keep the IEC table (today; 630 A copper on a 500 A breaker).
2. **Is the board's incoming feeder the cable from the tap-off box?** Suggested: **yes**, with the check above 15 m.
3. **One way on the source board (B4):** build it after step 1 (suggested), build it now, or don't build it?
4. **Earth riser cable rule:** as in A4 (suggested), or only the largest panel CPC?
5. **On the sheet, bond the busway housing to each floor earth bar** when a busbar riser serves the building? Suggested: **yes**.
6. **BOQ allowance for the riser cable:** 0.5 m at each bar (suggested), or a percentage?
7. **Steps and order:** as above?
