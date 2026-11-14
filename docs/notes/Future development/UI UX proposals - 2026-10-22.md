# UI / UX proposals — 2026-10-22

## Bus coupler: normally open or closed (transformers in parallel)

Approved and done 2026-10-22 (v1.76): clicking a coupler opens a form (operation: normally open / normally closed / remove; rating), the SLD draws a closed coupler with the closed breaker symbol and `N/C`, and N/C is in the drawing abbreviations. Uses the existing form dialog — no new styles. As proposed:

1. **Choosing the mode.** Clicking a coupler on the SLD now removes it (after a confirm). Proposal: the click opens a small coupler panel instead — rating (A), *Operation: Normally open (one transformer out → the other carries both) / Normally closed (transformers in parallel)*, and *Remove*. Same panel style as the board inspector.
2. **SLD symbol and label.** A closed coupler drawn with the closed breaker symbol (as the outage scenario already draws it) and labelled `N/C` instead of `N/O`; tooltip "normally closed — transformers in parallel". The outage scenario keeps `CLOSED · current (loading)`. Black-and-white PDF/DXF unchanged apart from the symbol and label.
3. **Supply scenario.** With a closed coupler, the "Transformer of … failed" choice stays (the other transformer carries both, as with a normally-open coupler).

Already done without UI changes: busbar fault level from all paralleled transformers (and everything below), transformer sizing fault check, load sharing by kVA ÷ uk %, coupler current, IEC 60076-8 conditions (vector group, uk within 10 %, ratings within 2 : 1) in the Transformer & generator study, fault-study method note, design basis and BOQ wording, OpenDSS and pandapower runs joining the busbars.

## Existing board: other buildings on a shared supply

Approved and done 2026-10-22 (v1.77): Board properties → Existing installation has *Other buildings on this supply* under *Spare ways at survey* — Name, Reference, Allocated (kVA), Recorded (kVA) and a remove (×) for each, *+ Add building*, and the "Kept for them" line. Each building uses the same two-column fields as the readings above it rather than a four-column table, which would not fit the side panel without new styles. As proposed:

1. **Board properties → Existing installation** (under *Spare ways at survey*): a small table *Other buildings on this supply* — Name · Allocated (kVA) · Recorded (kVA) · Reference (DEWA NOC / load letter), a remove (×) on each row and *+ Add building*. Same inputs and spacing as the fields above it. A line under it: "Kept for them: 950 kVA (the higher of allocated and recorded, each)".
2. **No drawing change**: the SLD keeps showing the recorded MD reading; the other buildings appear in the Transformer & generator study (*Existing installation and shared supply*) and the Existing installation card in Sizing.

Covered without UI changes: the new building on an outgoing way of the existing LV panel, a new transformer on the existing substation's RMU (check: spare T-off way, at most 2 transformers per RMU — the RMU is set in Transformers), and a feed from a neighbouring building's main board (its fault level, entered on the transformer summary form, now sets the fault instead of a placeholder).

## UPS: input filter and generator leading kvar

The calculations support it (v1.78): `inputFilterKvar` (the UPS input filter's leading kvar at light load, from the datasheet) and `genLeadingPct` (the leading kvar the standby generator absorbs, % of its kVA, from its reactive capability curve) on a UPS. Blank, they are 10 % of the UPS kVA and 10 % of the generator kVA. The result already shows in the UPS study notes and the dashboard. Approved and done 2026-10-22 (v1.78): both inputs are in the UPS study after *UPS output PF*. As proposed:

1. **UPS study → UPS inputs**, after *Output power factor*: *Input filter (kvar leading)* with placeholder "10 % of UPS kVA", and *Generator absorbs (% leading)* with placeholder "10". Same inputs as the fields beside them.
2. **No other change**: the check stays in the notes line and the dashboard to-do list.

## Documents: remove the flat DB schedule

Approved and done 2026-10-22 (v1.79): the flat DB schedule (every board's circuits in one table) is not used for construction or submission; the DEWA DB schedule forms on *Load schedule* are. Removed: the *Documents → DB schedule* page and ribbon button, its Export centre item (PDF / CSV), its table in the calculation and study reports (the section is now *Cable schedule*), and its entry in the documents to update after a design change. Load schedule, Cable schedule and Equipment are unchanged; RCD, kWh meter and isolator accessories stay in the BOQ and the MD forms.

## DEWA submission format: SLD and Load Schedule enhancements

Reviewed 22 October 2026 against official Dubai Electricity and Water Authority (DEWA) Regulations for Electrical Installations (2020 edition), Dubai Municipality Green Building Regulations, and typical Dubai consultant/contractor submittal packages.

Interactive mockup created in `docs/mockups/dewa-submission-mockup.html` (open in browser to click and view side-by-side comparison). No source code changed; waiting for user confirmation before implementation.

### 1. Single Line Diagram (SLD) enhancements
1. **Intake & Metering Boundary:** Demarcate 11kV intake / RMU, transformer vector group (Dyn11), and dedicated **DEWA CT Metering Cabinet** (CT ratio 1600/5A or 2500/5A, Class 0.5S, 15VA, test block, tariff meter boundary).
2. **Main Incomer ACB Annotation:** 4P Draw-out ACB with Microprocessor Trip (LSIG: Long-time, Short-time, Instantaneous, Ground fault), 50kA/1s breaking capacity, shunt trip, and under-voltage release (UVR).
3. **Standard Instrumentation Compartment:** Main LV busbar instrument branch: 3 × Phase Indicating Lamps (R, Y, B with 2A fuses), Digital Multi-Function Meter (MFM Class 0.5), and Type 1+2 Surge Protection Device (SPD 50kA).
4. **Busbar & Earth Bar Ratings:** Explicit rating notation: `TPN Cu Busbar · 50kA / 1s · 100% Neutral · 50×6mm Cu Earth Bar` (external earth pit R < 1.0 Ω).
5. **Outgoing Feeder Calling Boxes:** Include Connected Load (TCL kW), Diversity Factor (DF), Maximum Demand (MD kW & kVA), Operating Current (Ib A), Voltage Drop (Vd %), and proposed kWh Meter category (1-Phase, 3-Phase, or CT).
6. **Life Safety Feeders:** Distinct visual indication for Fire Pumps / Life Safety with Fire-Rated cable notation (BS 6387 CWZ / BS 7846).
7. **DEWA General Notes & Title Block:** Standard 8-point DEWA Electrical Notes, Makani Number, Plot Number, Locality, and "FOR DEWA APPROVAL" stamp block.

### 2. Load Distribution Schedule (DB Schedule) enhancements
1. **Header Block:** Add Plot Number, Makani Number, and Locality alongside DB No and Fed From; specify `3-Phase, 4-Wire, 400/230V, 50 Hz, TPN Supply`.
2. **3-Tier ELCB/RCCB Grouping:** Align default sections to standard DEWA sensitivities: 30mA (General Lighting, Sockets, Wet Areas), 100mA (Water Heaters, Cooker), and 300mA (HVAC / Split AC).
3. **DEWA 4-Tier Summary Rows:** Replace mixed summary text with 4 dedicated rows:
   - Row 1: `TOTAL CONNECTED LOAD PER PHASE (W / kW)`
   - Row 2: `DIVERSITY FACTOR (D.F.)` (e.g. 0.80)
   - Row 3: `MAXIMUM DEMAND (MD) in kW and kVA` (at 0.90 PF)
   - Row 4: `DEMAND CURRENT PER PHASE (AMPS)` & Phase Unbalance check (&le; 10%)
4. **Mandatory 20% Spare Ways Check:** Explicit summary counter: `Total Ways: 24 | Connected: 18 | Spares: 6 (25.0% - MEETS DEWA MIN 20%)`.
5. **Incoming Feeder & Earthing Card:** Complete cable construction, ECC, individual feeder voltage drop (&le; 2.5%), and furthest circuit drop (&le; 4.0%).

