# UI/UX proposals - native project format (.lvds) - 2026-11-14

Projects are now saved as `.lvds` files (see `docs/project-safety.md`, File format). Two things
that would complete it need a decision, because they change what the app shows or how it opens.

## 1. "Export JSON" in the app

- Now: a plain `.json` copy is available from the command line / MCP only
  (`lvds project-json <project>`, tool `export_project_json`).
- Proposed: one entry beside the existing exports on the Project tab, "Export JSON…", which opens
  the usual Export save dialog (filter "JSON", default name `<project>.json`) and writes the same
  data as the `.lvds` file. No other change to the tab.

## 2. Open a `.lvds` by double-click

- Now: `.lvds` files open from the dashboard and from Open project…; Windows / macOS do not yet
  start the app when one is double-clicked.
- Proposed: register `.lvds` to LV Design Studio in the installer (`fileAssociations` in
  `package.json`, as already done for DWG / DXF) and open the file when the app starts with one,
  or when one is opened while it runs. With unsaved changes in the open project, the existing
  "unsaved changes" question is shown first. A file outside the projects folder opens as a new,
  unsaved project, as Open project… does today.
