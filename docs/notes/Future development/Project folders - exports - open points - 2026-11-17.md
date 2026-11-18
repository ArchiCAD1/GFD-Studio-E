# Project folders — exports (F2): points for the owner (2026-11-17)

Raised while building F2 ("Exports save into the right folder") and decision 1 option B (a copy of the project file). What was built takes the safe minimum below; each point can be changed later.

## 1. The sequence number in file names

The office naming rule has `{Seq:3}`. The app has no document register yet, so the number comes from a fixed list per document type (`SEQUENCE` in `src/model/outputRoles.ts`): for calculations 001 concept report, 002 building summary, 003 calculation report, 004 voltage drop, and so on; for schedules 001 load schedules, 002 cable schedule… A transmittal uses its own number (T-003), a drawing its sheet number.

Option: a project document register that gives each document its own number, editable by the user.

## 2. Exported drawings: work in progress or issued

Only the PDFs made by **Issue sheets…** (with "make the PDFs") go to the `drawingsIssued` folder, under `{Stage}/Rev-{Rev}`. Every other drawing export (Export set, PDF per sheet, board sheets, SLD export, ELV plans, layout plots) goes to `drawingsWip`. The drawing register goes to `drawingsIssued`.

## 3. Folders made for each building

A role inside a folder repeated for each building (the multi-building template's Calcs, Drawings, Schedules, BOQ) is not used: a save does not say which building it is for, so those exports open in the Projects folder as before.

Option: ask for the building, or take it from the board or sheet being exported.

## 4. Naming rules without a number

The "Simple" rule (`{ProjectShort}_{Type}_{Rev}`) gives every calculation report the same name (`Villa_CAL_B.pdf`). The save dialog asks before replacing a file, so nothing is lost, but the names do not tell the reports apart.

Option: warn in the template editor when a rule has no `{Seq}`, `{Number}` or `{Study}`.

## 5. Not built: copies of superseded drawings

F2 also says: when drawings are issued, **copy** (never move) the previous revision's issued files to the `drawingsSuperseded` folder. Not built in this change; it is the next step.
