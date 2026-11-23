# UI UX proposal – Riser enhancements: busbar riser, earth riser, boards by level (2026-11-15)

Status, 2026-11-15:
- The user said "This is okay" and asked that an SMDB feeding four or five panels be covered: that is Part D.
- They then asked about risers with no busbar, about diversity on the riser schematic, and about the link with the Load schedule: Parts E and F.
- Decision 1 was answered with "Go ahead … keep in mind it should work [for] different electrical panel load and bus bar size". The first build (F1, F2, B1's diversity choice and typical-data line, A2, C2 and the demo's tap-off breakers) is in PR 608, branch `feat/riser-one-maximum-demand` (v2.159).
- The other steps wait.

Mockup: `docs/mockups/riser-enhancements-mockup.html` (image: `riser-enhancements-mockup.png`). Its figures come from the app's G+10 mock-up (Busbar riser page → G+10 mock-up: MDB-1 on a 1500 kVA transformer, 415 V, 45 °C, eleven SMDBs, a 630 A copper busway). They were worked out with the app's own functions. Rows marked "example" are added only to show a check.

![Busbar riser page, where the busway shows, earthing checks and the sheets, proposed](https://raw.githubusercontent.com/ArchiCAD1/GFD-Studio-E/1c47881360a4eeaa43e62235edcce0c21bfb7cf1/docs/mockups/riser-enhancements-mockup.png)

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

**C3. Earth riser sheet** (corrected 2026-11-15: most of it exists already).
- The sheet already has a floor earth bar schedule (Level, Floor earth bar, Panels, Floor sheet).
- Its note 6 already bonds the cable containment, busbar trunking and riser steelwork to each floor earth bar.
- Only two things are new:
  - a Panel conductors column in that schedule, giving the conductor sizes on each bar;
  - the riser cable's vertical length in the notes (36.9 m from the level heights, as in C4).

**C4. BOQ, group I (earthing):**
- Floor earth bars with two test links (11 in the G+10).
- The earth riser cable: the vertical length from the levels + 0.5 m at each bar, 42.4 m in the G+10.
- The LV room cable (length to site).
- The panel earth conductors by size: 1 × 70 mm² and 10 × 35 mm² (length to site).

### D. An SMDB that feeds four or five panels (added 2026-11-15)

The user asked how the risers show an SMDB on one level that feeds four or five other panels. Two samples were drawn with the app's own sheet printer, using the G+10 mock-up's L05 SMDB:

- **Sample 1, same floor:** BLD-G10-SMDB-L05 feeds three DBs (63, 63 and 40 A), an MCC (63 A) and a UPS board (40 A), all on L05.
- **Sample 2, floors above too:** the same SMDB feeds a DB and the MCC on L05, and one DB each on L06, L07 and L08.

Today:

| Part | Sample 1 (same floor) | Sample 2 (floors above) |
|---|---|---|
| Boards by level sheet | The SMDB's box branches to boxes grouped by kind: one box lists the three DBs, then the MCC and the UPS. The board summary counts them (DB 3, MCC 1, UPS 1). The branches show no breaker or cable and the boxes show no rating, and the 40 A DB is grouped with the 63 A ones. | The SMDB becomes a main panel with its own busbar, in its own column ("From BLD-G10-SMDB-L05"). The three cables up share one line marked 3×, with a flag to the next sheet, and the riser table lists Cable C1, 4C 16 mm², L06–L08. The two L05 panels hang on one drawn breaker, and the flag letter covers the match-line text. |
| Busbar riser drawing | The five panels sit in a row on the L05 line. Their cable texts overlap, and the lines run through the boxes in between. | The two L05 panels sit in a row in the same way. The cables to L06–L08 rise in their own columns. |
| Individual feeders riser | Correct by design: the SMDB is drawn with its busbar and one breaker and cable per panel. The sheet grows to A2. | The same. |
| Earth riser and floor earthing | Correct. Each panel's earth bar goes to the SMDB's earth bar with its own CPC (1C 16 or 10 mm²), shown on the floor earthing sheet with its panel earthing schedule. The riser sheet counts 6 panels at L05. | The panels on L06–L08 go to their own floor earth bars. |
| Calculations | The L05 tap-off carries the SMDB's whole demand: 83.2 kW (44 kW + 39.2 kW from the five panels) at 129.6 A, so the tap-off unit is 160 A. | The same, at 86.4 kW. |

Proposed:

**D1. Boards by level: each outgoing of an SMDB gets its own breaker and label,** as a main panel's outgoings do.
- Each branch shows its breaker and cable ("63 A · 4C 16 mm²"), and each box shows the panel's rating.
- A box groups panels only when the kind, breaker and cable all match, and it gives the count ("DB ×2"). A typical row shows them once.

**D2. Bug:** the match-line text moves clear of the flags.

**D3. Busbar riser drawing:** an SMDB's panels on its own floor are drawn as a short stack on one branch, each with its cable text, as on the Boards by level sheet. No line passes through a box.

**D4.** The tap-off schedule (C1) and the Boards on this riser card name the panels behind each tap-off, for example "BLD-G10-SMDB-L05 + 5 panels (DB ×3, MCC, UPS) · 83.2 kW".

**Covered by the other items:**
- With A1, the five panels' voltage drop and fault level include the busway up to L05, because they are fed through the SMDB.
- With A4, the most onerous panel check includes panels earthed through another panel's bar.

The Individual feeders riser and the earthing sheets need no change.

### E. No busbar: a cable from the MDB to each floor (added 2026-11-15)

Sample: the G+10 mock-up with the busway removed. Each SMDB is fed by its own cable from MDB-1, 15 m + the floor height + 3 m long.

Today:

- **Calculations: correct by design.** Each cable is a feeder of MDB-1 in the network, with its own voltage drop, fault level, cable and breaker checks, earth loop, and a row on MDB-1's MD form in the Load schedule. G+10:
  - cables: 4C 70 mm², 22.5 m (L01) to 54.9 m (L10), on 160 A breakers;
  - voltage drop at the board: 0.21 % to 0.51 %;
  - fault level: 19.61 kA to 12.08 kA.
- **Boards by level:**
  - L01–L10 is one typical row. The ten cables are one line marked 10× from one breaker labelled "10× 160 A", and the riser table reads Cable C1, 4C 70 mm², L01–L10, 37 m.
  - The sheet does not show each floor's cable length, voltage drop or fault level.
  - Floors whose cables differ (say, upsized upper floors) still group as typical, because the grouping ignores the cable. The type then reads "4C 70 mm² …".
- **Individual feeders riser:** every cable is drawn separately with its breaker and cable, on A2 paper.
- **Busbar riser drawing (as a cable chain):** each cable has its own column with its size and length.
- **Earth riser:** the same as with a busbar.

Proposed:

**E1. A feeder schedule under the drawing**, the cable counterpart of C1's tap-off schedule. Its columns are Floor, Board, Breaker, Cable, Length, Vd at the board and Isc at the board, with one row per floor.

**E2. A typical row groups floors only when their cables and breakers match.** An upsized floor gets its own row.

D1 applies here too: the ground floor SMDB's branch shows its breaker and cable.

### F. Diversity on the riser schematic, and the link with the Load schedule (added 2026-11-15)

Today the same G+10 busway has three different maximum demands:

| Where | How the demand is worked out | G+10 |
|---|---|---|
| Busbar riser page | The sum of each board's maximum demand (500 kW) × IEC 61439 diversity 0.6 | 300 kW → 463.74 A → 500 A breaker → 630 A copper |
| Load schedule → Busbar riser form (the DEWA form) | The sum of each tap-off's TCL × its DF (625 kW × 0.8) | 500 kW (772.89 A), printed under the form's own "500 A" incomer and "630A … BUS RISER", both taken from the page |
| MDB-1's MD form | Eleven separate feeders, each at its panel's MDL | +500 kW on MDB-1 |

- **The riser schematic shows none of this.**
  - Boards by level prints no loads.
  - The Busbar riser drawing gives each board's rating and kW, and the Individual feeders riser gives each panel's TCL.
  - No riser sheet gives a riser's total, DF or diversity.
- **With cables instead of a busbar,** each cable carries its own board's demand. Diversity between floors appears only on MDB-1's MD form (DF 0.8) and the TCL summary.

Proposed:

**F1. One maximum demand per riser, the same everywhere.** It is the busbar riser form's figure: the sum of each tap-off's MD from its own MD form (TCL × DF).
- The Busbar riser page sizes the busway and its breaker from that figure.
- The source board's MD form carries it (as one busway line, with B4).
- The schematic prints it.
- G+10: 625 kW × 0.8 = 500 kW → 772.89 A → 800 A breaker → 1000 A copper. This is decision 1's suggested answer.

**F2. An extra riser diversity stays possible** (the IEC table, or a typed factor). When used, it shows as its own row everywhere, so the figures never disagree: on the page, on the riser form ("Riser diversity 0.6 → MD 300 kW"), on the source board's MD form and on the schematic.

**F3. On the riser schematic:**
- a load box at the start of each riser: "TCL 625 kW · DF 0.80 · MD 500 kW · Ib 772.89 A — 800 A MCCB — busway 1000 A Cu", with one more line when a riser diversity applies;
- TCL, DF, MD and Ib columns in the riser table, for every busbar riser and cable group;
- each main panel's TCL, DF and MDL, as on the SLD's panel header;
- each floor's TCL, DF and MD in the tap-off and feeder schedules (C1, E1).

**F4. One chain links the schematic and the Load schedule:**
- DB schedules → each panel's MD form (TCL, DF, MD) → the busbar riser form (one row per tap-off; its total is the riser MD) or the source board's MD form (one row per cable) → the TCL summary and the transformer.
- The riser sheets print the same figures. Printed values are already part of a sheet's fingerprint, so an issued riser sheet shows as changed when a load schedule changes them.

## What stays the same

- The layout of every page and sheet, apart from the items above. Exports stay black and white.
- **The data:** projects open as before and nothing is asked again.
- **Except the figures:** A1–A3 change the voltage drop and fault figures of projects with busbar risers. What's new will say so, and the Out of date banner appears on the reports.
- The earthing schematic, the Individual feeders riser and the riser form.

## Suggested steps

Each step is one PR with tests.

1. A1, A2 and the two drawing bugs (the C2 breaker label and the D2 match line).
2. One maximum demand per riser: F1 and F2 with B1, A3 and B2, including the Load schedule's busbar riser form.
3. A4 and B3 (earth riser checks).
4. The riser sheets: C1, D1, D3, D4, E1, E2 and F3 (with `npm run test:pdf`).
5. The earth riser sheet and the BOQ: C3 and C4.
6. B4, if chosen.

## Decisions

1. **The riser's maximum demand (Part F)** — **answered 2026-11-15: one maximum demand from the MD forms**, working for any panel load and busbar size; the demo's breakers may be adjusted.
   - The sum of the tap-offs' MD from their MD forms, as the busbar riser form already shows (suggested; G+10: 500 kW, 1000 A copper on an 800 A breaker).
   - Keep the IEC table (today; 300 kW, 630 A copper on a 500 A breaker), shown as its own riser diversity row on the forms and the schematic.
2. **Is the board's incoming feeder the cable from the tap-off box?** Suggested: **yes**, with the check above 15 m.
3. **One way on the source board (B4):** build it after step 1 (suggested), build it now, or don't build it?
4. **Earth riser cable rule:** as in A4 (suggested), or only the largest panel CPC?
5. ~~On the sheet, bond the busway housing to each floor earth bar?~~ **Answered:** the earth riser sheet already says so in its note 6, so nothing is added.
6. **BOQ allowance for the riser cable:** 0.5 m at each bar (suggested), or a percentage?
7. **Steps and order:** as above?
8. **Grouping on the Boards by level sheet** (panels in D1, floors in E2):
   - Group only when the kind, breaker and cable match, with a count (suggested).
   - Or keep grouping by kind, with the range of ratings.
