# Project number and brief scope — proposal (2026-11-17)

Approved by the owner in chat on 17 Nov 2026.

Both changes come from decisions 2 and 3 in `Project folders - open decisions - 2026-11-17.md`.

## P1. Project number field

- New project, step 1 (Start): a text box "Project number (optional)" below the project name. Up to 40 characters.
- Project settings, Submission forms tab: a text box "Project number" before Plot no. Up to 40 characters.
- The number is kept on the project (`info.projectNo`). A project with no number of its own still uses the Project no. typed in Study reports.
- It fills `{ProjectNo}` in folder names, so the Project folder step suggests, for example, "P2611_Villa Jumeirah".
- Study reports and the reports exported from the catalogue use the project's number when their own Project no. field is empty. The Study reports field and the report layout are unchanged.

## P2. Four new scope items

The Scope step of the project brief gets four more items, all off by default:

- Fire alarm / Civil Defence
- ELV systems
- Tender stage
- Site supervision

They switch on the matching project folders (`scope:fire`, `scope:elv`, `stage:tender`, `service:supervision`). They do not change readiness, the suggested deliverables or the to-do lists. Existing projects are unchanged.
