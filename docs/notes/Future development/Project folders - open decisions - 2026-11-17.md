# Project folders — decisions for the owner (2026-11-17)

Raised while building F1 and F3 of `UI UX proposals - 2026-11-09 - Project folders.md`. Nothing here is built.

## 1. Where the project file lives

F1 says: "With a project folder, the project file is saved in the folder that has the `projectFile` role."

Not built. Today every project file lives in the one Projects folder, and the projects list, recovery copies, trash, archive and the "changed on disk" guard all read that folder. Moving a project's file into its own job folder changes all of them.

Options:

- **A. Keep project files in the Projects folder (as built now).** The job folder holds inputs and outputs only. Simple and safe; the `projectFile` folder stays empty.
- **B. Save a copy into the `projectFile` folder on each save.** The Projects folder stays the working place; the job folder always has the latest copy for backup or hand-over. Small change.
- **C. Move the project file into the job folder.** The projects list then has to remember where each project is on this computer. Largest change, and the most to test.

Recommendation: B.

## 2. Folder conditions the brief does not know

The brief's scope has Solar PV and UPS, so folders marked `scope:pv` and `scope:standby` start ticked from it. It has nothing for `scope:fire`, `scope:elv`, `stage:tender` or `service:supervision`, so those folders start unticked and the user ticks them on the Project folder step.

Option: add these four to the brief's scope list, so they also drive readiness and deliverables. That changes the Scope step's wording and list, so it needs its own approval.

## 3. The project number

Folder names use `{ProjectNo}`. A project has no project number of its own; the only one is typed in Study reports. The Project folder step therefore suggests the folder name from the project's name alone and lets the user type the rest.

Option: add "Project number" to the New project wizard's first step and to Project settings, and use it in folder names, file names and reports.

## 4. Where the folder is, per computer

The project file stores the folder template (a copy) and the project's own changes, not the folder's path. The path is remembered on each computer, like the paths of plan files. A project opened on a second computer shows "Choose the folder on this computer…". This keeps personal paths out of project files.
