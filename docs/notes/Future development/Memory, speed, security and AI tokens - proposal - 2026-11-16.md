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
| M1 | Store revisions as differences (shared table of panels and circuits), schema 3 → 4 with migration | File with ten revisions about 9–10 times smaller; open, save, recovery copy and backup shrink with it | **Needs approval of the schema step** |
| M2 | Build the calculation report in a Web Worker, then cache the HTML per panel | No window freeze (today up to 10.8 s); rebuild after one edit 80–90 % faster (estimate) | Not started |
| M3 | Memoise SLD panels so one edit redraws one panel | To be measured first: the SLD already draws only what is in view, so the gain is on what is on screen | Measure before starting |
| M4 | Web version: projects in IndexedDB, not `localStorage` (about 5 MB per site) | No practical size cap | Not started |
| M5 | Load revision content and old release notes only when their screen opens | Smaller start-up memory | Not started |
| M6 | Auto-run waits for a pause on large projects; recovery copy only when the project changed; revision file size in the benchmark | Typing stays responsive on 1,000-panel projects | PR opened |

## Security

Already in place: sandboxed window, context isolation, CSP without remote content or `eval`, sender and size checks on
every IPC channel, link-safe atomic writes, PDF window without JavaScript or network, MCP read-only unless `--write`,
local API on 127.0.0.1 with a token, secret scan, `npm audit` allowlist, privacy scan, branch protection on `main`
(required check and review), SHA-256 of each beta installer on the download page.

| # | Gap | Proposal | Status |
|---|---|---|---|
| S1 | Installers are unsigned | Sign releases; a free programme for open-source projects, as there are no paid services | **Needs a decision** |
| S3 | A cloud AI on the MCP server reads real names and addresses | `lvds mcp --anonymize`, reusing `src/model/anonymize.ts` | **Needs a decision: default on or off** |
| S4 | Text from imported DWG, Excel and exchange files reaches the AI in tool results | One cleaning function with a length cap on every free-text field; a test that fails on raw text | Not started |
| S5 | No Electron fuses set | `electronFuses` in the build: no `NODE_OPTIONS`, no inspect arguments, app only from ASAR; run-as-Node stays (the `lvds` launcher needs it) | PR opened as a draft: needs a launch test on Windows and Mac |
| S6 | Backups are plain files in a synced folder | Optional password on `.lvds-backup` (WebCrypto AES-GCM) | Not started |

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
| T5 | `lvds mcp --tools <groups>` | about 13,000 tokens of tool definitions with `--write` | about half or less for a design session | PR opened |
| T6 | `fields` option and header + value rows in list results | full object per row | 40–60 % fewer (estimate) | Not started |
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

1. Quick wins: T2–T5, M6, S5.
2. Storage: M1, then M4.
3. Responsiveness: M2, M5, M3 after measuring.
4. AI and distribution: S3, S4, T6, T7, T1, S1, S6.
