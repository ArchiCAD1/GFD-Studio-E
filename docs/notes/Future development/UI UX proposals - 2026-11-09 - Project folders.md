# UI/UX proposal — Project folders (F1–F4)

**Status:** proposed. Merging this note is the owner's approval of sections F1–F4.
**Date:** 2026-11-09 (committed 2026-11-17)
**Related:** `UI UX proposals - 2026-11-09 - Project folders customisation.md` (C1–C8, approved in PR #484), `CLAUDE-CODE-STEPS - Project folder customisation.md`, `folder-templates.json`.

This is the base feature that the customisation screens (C1–C8) build on: a job folder created from a folder template, and exports that save into the folder of their role. The data model for it is already on main (PR #491: `src/model/folderTemplates.ts`, `src/model/folderRoles.ts`).

## Today

- One flat Projects folder (Preferences) holds every project file side by side.
- Every PDF, Excel, CSV and DXF save dialog opens in that same folder.
- There is no per-job folder, no subfolders and no file naming rule.

## F1 — New project wizard: "Project folder" step

A new step before "Create".

- **Template**: a dropdown of the folder templates (built-in and the user's own); the default is the template marked ★ in Preferences.
- **Location**: the parent folder, with **Browse…**; it starts at the Projects folder.
- **Folder name**: a preview made from the template's root pattern, for example `{ProjectNo}_{ProjectShort}` → `P2611_Villa-Jumeirah-Plot-345`. Editable; cleaned to a Windows-safe name as the user types.
- **Tree**: the folders the template will create, each with a tick box. Folders with an "only when" rule (PV, standby, fire, ELV, tender, supervision) start ticked or unticked from the project brief; the user can change any of them.
- **Count line**: "N folders will be created. Nothing existing is moved or deleted."
- Buttons: Back · **Skip folders** (the project is created the way it is today) · Create project.
- With a project folder, the project file is saved in the folder that has the `projectFile` role.

## F2 — Exports save into the right folder

- A save dialog opens in the folder of the output's role: the voltage drop report in the `calcVd` folder, the BOQ in the `boq` folder, and so on. The suggested file name comes from the template's naming rule (C4), for example `P2611-E-CAL-VD-01-B.pdf`.
- The user can still choose another folder. That choice is remembered for this project and this role.
- A role with no folder, or a project with no project folder, behaves the way it does today.
- **On issuing drawings**: create `{Stage}/Rev-{Rev}` under the `drawingsIssued` folder and save the issued PDFs there; **copy** (never move) the previous revision's issued files to the `drawingsSuperseded` folder; put the transmittal PDF in `TR-{TrNo}` under the `transmittals` folder.

## F3 — Overview: "Project folder" card

- The folder path with an **Open** button.
- Status: "N of M folders present"; missing folders listed, with the reason when the brief changed (for example "supervision was added to the brief").
- A note of files lying in the job root, with a suggested folder. Information only.
- Buttons: **Create missing folders** · Open folder · **Change template…** (C8) · Customise (C6).
- A project without a folder shows "No project folder" with **Create project folder…** (opens the F1 step on its own).

## F4 — Safety rules

- The app only **creates** folders. It never deletes, moves or renames the user's folders or files.
- Folder names are cleaned for Windows and synced drives: none of `< > : " / \ | ? *`, no trailing dot or space, no reserved names (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`).
- The full path stays under 200 characters; the wizard warns before creating.
- All disk access is in the Electron main process, through IPC checked in `electron/ipcValidate.cjs`, staying inside the chosen job folder and never following links.
- The browser version cannot create folders on disk: it offers the tree as a ZIP of empty folders.

## Build order after approval

1. Create the job folder: F1 and F3 (`folders:create`, `folders:status`).
2. Exports into role folders: F2.
3. Customisation Steps 4–6 (C5–C8).

## Out of scope

Moving existing files into the new structure, cloud storage APIs, and per-user permissions.
