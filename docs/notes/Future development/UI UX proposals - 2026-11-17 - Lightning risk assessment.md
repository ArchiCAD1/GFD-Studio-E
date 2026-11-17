# Lightning risk assessment — proposal (2026-11-17)

A preliminary risk assessment at the top of the lightning protection study. It works out the minimum protection class and passes it to the layout below. Mockup approved by the owner on 2026-11-17 ("go ahead with your recommendation"), with the changes listed under "Owner's decisions".

## Rules it follows

- A standard industry calculation, for one risk component only: physical damage from a direct strike. Strikes near the building and on incoming lines are not covered, so the class is a minimum.
- No value of a standard is built in. The engineer enters the lightning activity, the location and loss factors, the damage probability of each class and the tolerable risk. A missing value shows DATA REQUIRED.
- Built in: the arithmetic, and the geometry of the collection area (the roof outline pushed out by three times the building height).

## Owner's decisions

- The page and the report do not show where the factors came from: no "source" field, no "origin" column, no standard number in the risk section.
- Both carry this line: "Standard industry calculation. The input data and the results must be verified by a qualified engineer against the applicable standard." (`RISK_NOTE` in the engine.)
- Factor labels are plain descriptions (fire risk factor, typical loss), not the symbols of a standard.
- Collection area, three choices: roof outline (the main method, exact for any shape), rectangle (quick study before a roof plan exists), entered area (cases the app cannot model). For an outline the page also shows footprint + 3H × perimeter + 9πH² as a cross-check.

## The page (Studies → Lightning protection)

1. **Result cards**, before the existing ones: risk without protection, minimum protection class, direct strikes on the building ("1 in 41 years").
2. **Risk assessment — preliminary** card:
   - Lightning activity: thunderstorm days, strike point ratio, measured strike density (optional, replaces the first two).
   - Building: shape choice; length, width and height from the Building card, or the roof outline from Design CAD, or an entered area.
   - Factors entered by you: location factor, fire risk factor, fire provisions factor, special hazard factor, typical loss, tolerable risk.
   - Load preset / Save as preset, for the engineer's own factor sets.
   - A plan sketch of the collection area beside the inputs.
3. **Working** table: step, formula, result.
4. **Risk for each protection class** table: no protection and classes IV to I, damage probability (entered), risk per year, against the tolerable risk; the minimum class marked. Sensitivity multiplier on the strike density with its result. A "Use Class … in this study" button fills the existing protection class field.
5. **Export full report**: a new "Risk assessment" section, first in the report — inputs, collection area sketch, working with the figures, the class table, sensitivity, result, and the verification line. In the Excel export, a sheet with live formulas. Black-and-white.

## Stages

1. **Engine** — `src/calc/lightningRisk.ts` with tests. No UI, no project data. (PR #645.)
2. **Project data and the study page** — inputs saved with the project (`lightning.risk`); the card, tables and result cards above; rectangle and entered area. The result cards and the risk checks show once something is entered, so a study without a risk assessment is unchanged. (Done.)
3. **Report** — the risk section in the PDF, Word and Excel exports: three sections first in the report (inputs, working, risk for each class), the collection area sketch in the PDF, a "Risk assessment" sheet with live formulas in the workbook. Only when a risk assessment has been entered, so other reports are unchanged. The lightning report has no PDF baseline, so none is needed. (Done.)
4. **Roof outline** — the outline from Design CAD as the collection area, and the offset drawing in the report: on the page, choose "Roof outline", the drawing and one of the closed polylines drawn over it, then "Take roof outline" (a copy; take it again after changing the drawing). Arc segments are taken as straight. A new study still starts on the rectangle, because an outline needs a drawing first. (Done.)

5. **Presets** — the engineer's own factor sets, kept on this computer (`lvds.lightningRiskPresets`, synced through Library.json) and loaded into any project: a preset list with Load and Delete, a name and Save as preset. A preset holds the factors only, not the site or the building. None is built in. (Done.)

6. **Parts with their own height** — with a roof outline, any other closed outline or circle on the same drawing (a tower, a lift overrun, a mast) can be added as a part with its own height above ground. Each part reaches 3 × its own height; overlaps count once. On the page: "Add as a part with its own height", a table of parts (roof area, height, Remove), and each part drawn on its own band; the same in the report. Taking the roof outline again drops the parts. The owner asked for this item ("NEXT", 2026-11-17) without a mockup. (Done.)

## Later

- The other risk components: strikes near the building and on incoming lines.
