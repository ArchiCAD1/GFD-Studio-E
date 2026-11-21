# Memory, speed, security and AI tokens — proposal (2026-11-16)

Study of v2.161.0 (commit `25f67c3`). Figures are from `npm run bench` and one extra measurement on a 2-core
cloud Linux machine with the networks in `tests/fixtures`: they show where the cost is, not what a desktop PC does.
Nothing here changes the screen layout, colours or workflow.

## Measured

| Measure | 100 panels | 500 panels | 1,000 panels |
|---|---|---|---|
| Project file, no revisions | 0.23 MB | 1.17 MB | 2.34 MB |
| Full calculation run (F5) | 23 ms | 75 ms | 154 ms |
| Memory held by 100 undo steps | 0.9 MB | 4.2 MB | 8.3 MB |
| Calculation report (HTML build) | 0.95 s | 5.0 s | 10.8 s |
| Whole SLD drawn once (no view culling) | 0.36 s | 2.0 s | 4.5 s |

Ten issued revisions make the file 11 times larger (200 panels: 0.47 MB → 5.13 MB; 1,000 panels: 2.34 MB → 25.78 MB),
and about 90 % of that is repeated content. The save limit is 50 MB (`electron/limits.cjs`).

Leave alone: calculations, undo history, zoom, lazy loading of screens and export libraries, the CAD reader worker.

## Memory and speed

| # | Proposal | Expected | Status |
|---|---|---|---|
| M1 | Revisions in the file keep each distinct panel, circuit and section once, file format 3 → 4 | Ten revisions: 5.13 MB → 0.59 MB (200 panels), 25.78 MB → 3.02 MB (1,000 panels); recovery copy shrinks with it | **Approved 2026-11-16.** PR #625 |
| M2 | Calculation report: (1) the calculation and the written sections are reused for a project object, so typing the document number rewrites only page 1; (2) numbers are formatted with one kept formatter per number of decimals (`src/util/format.ts`) | (1) 300 panels: one letter typed 3.0 s → 5 ms. (2) First build: 0.95 s → 0.14 s (100 panels), 5.0 s → 0.59 s (500), 10.8 s → 1.19 s (1,000) | Done. A Web Worker is no longer needed for this; it would also not be safe (the calculations read cable tables, breaker database, catalogue and sizing settings loaded in the window) |
| M3 | SLD redraw after one edit | Measured (`npm run bench`, "one edit with the SLD open", whole drawing in view): 0.47 s (100 panels), 2.3 s (500), 4.7 s (1,000) on the test machine, with React in development mode. The number formatter took 17 % of a draw and is fixed (whole SLD 2.13 s → 1.73 s at 500 panels). What is left is React creating the drawing's elements, not the app's own code (about 15 %) | Measured and partly done. Memoising each panel is a deep change to `SystemDiagram.tsx`; measure in the installed app (production React) before deciding |
| M4 | Web version: project files and the trash in IndexedDB, not `localStorage` (about 5 MB per site) | No practical size cap; projects saved before are read and move over at the next save | Done (PR #660). Recovery copies stay in `localStorage` (written at once when the window closes) |
| M5 | Release notes (`src/model/whatsNew.ts`) are read only when this version was not seen yet or What's new is opened | 138 kB (45 kB compressed) out of the code loaded at start | Done. The revisions half is covered by M1: an opened revision shares its panels and circuits with the design, so there is little left to load late |
| M6 | Auto-run waits for a pause on large projects; recovery copy only when the project changed; revision file size in the benchmark | Typing stays responsive on 1,000-panel projects | PR #622 |

## Security

Already in place: sandboxed window, context isolation, CSP without remote content or `eval`, sender and size checks on
every IPC channel, link-safe atomic writes, PDF window without JavaScript or network, MCP read-only unless `--write`,
local API on 127.0.0.1 with a token, secret scan, `npm audit` allowlist, privacy scan, branch protection on `main`
(required check and review), SHA-256 of each beta installer on the download page.

| # | Gap | Proposal | Status |
|---|---|---|---|
| S1 | Installers are unsigned | Sign releases | **Decided 2026-11-16: stay unsigned while the app is a beta** (signing costs money on both systems); look again when the product is final |
| S3 | A cloud AI on the MCP server reads real names and addresses | `gfde mcp` hides project and file names, parties, addresses and people by default (`src/headless/privacy.ts`); `--show-names` sends them | **Approved 2026-11-16.** Done; panel, circuit, level and room names are still sent |
| S4 | Text from imported DWG, Excel and exchange files reaches the AI in tool results | The server tells the AI that text in results is data; every text loses hidden characters and is cut at 1,000 characters (`src/headless/untrusted.ts`) | Done. Lowers the risk, does not remove it: changes still preview first |
| S5 | No Electron fuses set | `electronFuses` in the build: no `NODE_OPTIONS`, no inspect arguments, app only from ASAR; run-as-Node stays (the `gfde` launcher needs it) | **Waits for S1 (when the product is final).** On Apple silicon a flipped fuse needs the app signed again (ad hoc), and `beta-release.yml` requires the Mac beta to fail `codesign --verify`. Decide together with signing |
| S6 | Backups are plain files in a synced folder | Optional password on `.gfde-backup` (WebCrypto AES-GCM) | Not started |

Dropped after checking the code: showing the checksum in the update prompt. The update manifest (`beta.json`) is
data-only with five fixed fields and older betas refuse any other field; the prompt opens the download page, which
already shows the SHA-256 and how to verify it.

## AI tokens

Estimated at 4 characters per token.

| # | Proposal | Today | After | Status |
|---|---|---|---|---|
| T1 | Split `src/components/cad/CadPage.tsx` by feature (then `App.tsx`, `Ribbon.tsx`, `SystemDiagram.tsx`) | about 100,000 tokens to read | 10,000–20,000 per CAD task | Not started |
| T2 | One start-up note: `AGENTS.md`; old status list archived | about 5,400 tokens, partly out of date | about 1,000 | Done in this PR |
| T3 | Read the module document for the task only | — | — | Done in this PR (rule in `AGENTS.md`) |
| T4 | Module test file with a short reporter while working, full suite once | — | — | Done in this PR (rule in `AGENTS.md`) |
| T5 | `gfde mcp --tools <groups>` | about 13,000 tokens of tool definitions with `--write` | about 4,900 with `--tools core` (19 tools) | PR #621 |
| T6 | Lists of records as columns and rows on MCP (`src/headless/compact.ts`); `--full-rows` sends records | full object per row | measured: `list_panels` 47 % smaller, `circuit_results` 40 %, `get_panel` 38 %, `run_checks` 20 % | Done. A `fields` option to pick columns is not built |
| T7 | High-level build tools first ([[AI agent proposal]]) | about 3,000 calls per G+10 | about 150 | Not started |

## Which model for which task

| Task | Model tier |
|---|---|
| Overseer: planning, splitting work, PR review across modules | Strongest; keep its context to plans and diffs |
| Calculation engine changes, file format change (M1), security work | Strongest |
| Feature work inside one module, bug fixes, tests; CAD, specification and sheets agents | Mid |
| Release notes, version bumps, lint fixes, renames, doc sync, file search | Small |
| In-app assistant: read-only questions | Small |
| In-app assistant: build a design with high-level tools | Mid |
| In-app assistant: final review before issue | Strongest |
| Confidential projects | Local model, or cloud with `--anonymize` |

## Order

1. Quick wins: T2–T5, M6 (PRs #620, #621, #622).
2. Storage: M1, then M4.
3. Responsiveness: M2, M5, M3 after measuring.
4. AI and distribution: S3, S4, T6, T7, T1, S1 with S5, S6.

## Later (not part of this work)

- Compare two versions of a file — two CAD files, or two SLDs — and show the differences. To be planned in its own session and branch, with a UI proposal first.
