# UI/UX proposals - native project format (.lvds) - 2026-11-14

Projects are saved as `.lvds` files (see `docs/project-safety.md`, File format). Both proposals
below were approved on 2026-11-15 and are implemented.

## 1. "Export JSON" in the app (done)

Project tab, between Save as and Share sample: "Export JSON" opens the usual Export save dialog
(filter "JSON", default name `<project>.json`) and writes the project as it is now. Also in the
command list as "Export JSON…". The command line keeps `lvds project-json <project>`.

## 2. Open a `.lvds` by double-click (done)

The installer registers `.lvds` to LV Design Studio (`fileAssociations` in `package.json`). A file
the app is started with, or (macOS) opened while it runs, opens like Open project…: by name inside
the projects folder, as a new unsaved project from elsewhere, after the "unsaved changes" question.

Left open: on Windows a `.lvds` double-clicked while the app is already running starts a second
window of the app (as a DWG / DXF does today). Opening it in the running window needs a
single-instance rule for the whole app, which also changes how drawings open - to decide separately.
