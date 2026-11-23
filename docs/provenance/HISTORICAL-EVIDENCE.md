# Historical development evidence

The following material was inherited from the source project at commit `1c47881360a4eeaa43e62235edcce0c21bfb7cf1`. It documents earlier development and is retained for traceability. It is not proof that a GFD build was tested, that an engineering method is validated, or that a GFD installer was released.

| Location | Purpose and treatment |
| --- | --- |
| `docs/archive/upstream/asset-index.json` | Commit-pinned paths to retired upstream screenshots, video, mockup renders and reports. Their binaries are absent from the current product tree and remain recoverable from Git history. |
| `docs/mockups/`, `docs/concepts/` | Inherited visual proposals and design examples. Text/vector source is maintained for GFD; obsolete raster renders now link to their original committed bytes. One unbranded illustrative load-schedule mockup remains because the manual generator uses it. |
| `docs/pdf-phase1/` through `docs/pdf-phase4/` | Earlier print-layout reviews. Before/after PDF examples link to the original committed bytes rather than being relabelled as new GFD output or included in the current product tree. |
| `docs/notes/`, `.archify/` | Historical issue notes, source reviews and generated architecture material. Pinned original-source references remain attributable to their actual source. |
| `tests/pdf/baselines/` | Inherited visual regression baselines. They are not current marketing and should only change after a reviewed rendering comparison. |

Current GFD visual manual sources are in `docs/manual/`. New captures use only the committed demonstration project in the offline documentation workflow. The generated manuals under `output/pdf/` carry GFD titles and metadata.

If an archived screenshot or report must be used as current GFD documentation, regenerate it from the GFD application and record the verification. Do not overlay a new brand on old evidence and represent that as a new execution.
