# GFD Studio E 2.212.0 — branding and migration audit

**Date:** 20 November 2026. **Scope:** GFD product identity, native files, compatibility, assets, packaging and recorded verification. This note does not assert branch publication, a public release or deployment.

## Product identity

| Boundary | Current identity |
| --- | --- |
| Application | **GFD Studio E** |
| Publisher | **Gerardo Faustin Designs Limited** |
| Founder / maintainer | **Gerardo Moises Faustin** |
| Repository | [ArchiCAD1/GFD-Studio-E](https://github.com/ArchiCAD1/GFD-Studio-E) |
| Package / version | `gfd-studio-e` / `2.212.0` |
| Application identifier | `com.gfdstudio.e` |
| Command line | `gfde` |
| New default projects folder | `GFD Studio E Projects` |
| New default database folder | `GFD Studio E Database` |
| Runtime bridge, storage and owned CAD identities | GFD / `gfde` / `GFDE` |

App titles, help, reports, export metadata, launchers, installer names, support links and source documentation have been updated together. The branding manifest and `src/brand.ts` record the public identity.

## Native files and interchange

| File or contract | Current identity | Compatibility |
| --- | --- | --- |
| Native project | `.gfde`, `format: "gfde.project"` | Legacy `.lvds` and project `.json` remain readable. |
| Portable backup | `.gfde-backup` | Previous backup envelopes remain importable. |
| Specification | `.gfde-spec`, `gfde-specification` | Legacy `.lvspec` / specification envelopes remain importable. |
| Exchange package | JSON using `gfde.exchange` | Legacy `lvds.exchange` inputs retain source evidence. |
| Design export | JSON using `gfde.design` | New exports emit the GFD identity. |
| Standard deliverables | DWG, DXF, PDF, XLSX, CSV, JSON, SVG and other supported standards | Their established extensions remain interoperable. |

Issued revision snapshots, imported source identifiers, third-party formats and electrical terms such as LV/MV/ELV retain their meaning. They are intentional historical or technical references.

## Existing data and save behaviour

Desktop profile migration discovers previous settings and browser stores, preserves originals and does not overwrite existing GFD data. Browser-store imports use a complete, stable copy; an interrupted or changing source can be retried. Existing project and database folder locations remain discoverable.

Desktop saves adopt `.gfde`, choose another available filename on collision, and retain the previous source as a backup. Browser saves also adopt a GFD filename for a migrated project, update its active index and recent list, preserve the old payload, and avoid replacing another project. GFD storage takes precedence; deletion markers prevent deleted projects from reappearing through migration.

**CLI compatibility:** editing an explicitly supplied legacy file path intentionally keeps that path stable while writing the GFD project payload. This preserves scripts, references and the change/backup ledger. To migrate its filename, open and save the project in GFD Studio E. Newly named native projects, downloads and backup outputs use GFD identities.

## Artwork and current documentation

The new mark uses original circuit-letter E geometry in navy, teal, amber and white. Browser/desktop icons and light/dark wordmarks replace the inherited product logo. `scripts/generate-brand-assets.py` is the reproducible source; see [the brand guide](brand/README.md).

The load-schedule and single-line-diagram documentation images were captured from GFD Studio E at **1600 × 1000** using the committed demonstration data. The offline harness verifies image dimensions and records product/version metadata. Documentation-only browser/release-note overlays are suppressed without clicking controls or opening user projects.

Both **six-page visual manuals** were regenerated, rendered and visually checked. They carry GFD titles, the 20 November 2026 GFD edition, Gerardo Faustin Designs Limited author metadata and GFD creator metadata. Callout legends use capture metadata. The sample floor-plan DXF was regenerated with the GFD demonstration title.

Obsolete inherited promotional screenshots, video, mockup renders and example PDFs were removed from active product files. Exact originals remain recoverable through Git and [the historical asset register](archive/upstream/asset-index.json). Functional fixtures, source evidence and the unbranded illustrative schedule used by the manual remain clearly identified.

## Verification record

| Check | Recorded result |
| --- | --- |
| Final production build, including TypeScript checking | Passed. |
| Linux directory package inspection | **217 inspected files, 15.1 MB reported application payload, 0 problems.** |
| Packaged command-line launch | Installed `gfde` reported **2.212.0**. |
| Packaged MCP smoke check | **21 tools** exposed by the checked configuration. |
| Browser migration and storage checks | **45 passed.** |
| Package-focused checks | **34 passed.** |
| Required external-engine reference checks | **10 passed** with SciPy **1.17.1**. |
| PDF regression checks | **37 passed**, completed before the environment restart. |
| Headless Electron checks | **14 passed**, completed before the environment restart. |
| Manual structure, public-content sync and branding gates | Passed; public-site tests **5/5**. |
| Artwork, captures and visual manuals | Visually reviewed; all **12 manual pages** checked. |

**Full final unit suite:** The final combined run was interrupted by a workspace restart. An earlier run recorded **5,219 passed and 3 stale branding-expectation failures**; those expectations were corrected afterward. Required external-engine and focused migration/package checks passed separately. A completed final all-suite result is not claimed.

### External-engine dependency correction

Two external-engine failures were reproduced on the original repository baseline with SciPy **1.17.0**. The project now pins **SciPy 1.17.1**, and the required reference suite passes with that pin. The upstream defect concerns incorrect inversion of complex symmetric matrices; see [SciPy issue #24359](https://github.com/scipy/scipy/issues/24359) and [the 1.17.1 release notes](https://docs.scipy.org/doc/scipy/release/1.17.1-notes.html).

Reinstall the repository requirements into the Python interpreter used by the external engines. **Python 3.11 or newer is required; the reference run used Python 3.12.** For an isolated shell environment:

```bash
python3 --version
python3 -m venv .venv-gfde-engines
. .venv-gfde-engines/bin/activate
python -m pip install --upgrade pip
python -m pip install --upgrade --force-reinstall -r engines/python/requirements.txt
```

On Windows, activate `.venv-gfde-engines\Scripts\Activate.ps1` instead. Use that interpreter for engine execution: installing into a different environment does not update the app's engine runtime. The requirements file pins the engine packages and SciPy and records allowed supporting-package ranges. Retain these requirements when reproducing the checks.

## Provenance and remaining release work

Original copyright/licence files remain intact. [NOTICE.md](../NOTICE.md) identifies the GFD distribution; [the original upstream notice](provenance/UPSTREAM-NOTICE.md) is preserved verbatim. [Source provenance](provenance/README.md) distinguishes GFD branding and modifications from inherited code, dependency licences and historical evidence. Rebranding does not transfer exclusive authorship of inherited source or itself validate electrical calculations.

Native macOS/Windows installers, platform signing/notarization and GitHub Pages deployment were **not performed or verified**. Linux package/PDF results do not imply those platform checks passed. GitHub's **About homepage metadata** is outside tracked source and still requires an authenticated repository-administration update; tracked source URLs and package metadata have been updated.

Confirm any branch/PR publication, release or deployment separately using its actual commit and platform evidence. Engineering scope continues to follow [the calculation methods and limitations](engineering/calculation-methods.md).

## Verified CAD source preparation

The rebuilt CAD WebAssembly is stored as deterministic gzip parts with a checksum manifest. `npm ci` and `npm run build` reconstruct the exact tested binary using the Node-only `scripts/prepare-cad.mjs`; no Rust toolchain or extra network request is needed for this step. A genuine Rust rebuild refreshes these source parts through `npm run build:cad`. The reconstructed binary SHA-256 is `84aee58758154917dc2b1c7161a885b88503721fd6f317ca9f9875b279b4647f`. All six preparation regressions and all 34 package regressions passed (40 tests total); actual postinstall reconstruction was verified byte-for-byte. Workspace disconnections interrupted the final full-suite and package reruns; the earlier complete production/package validations and the focused final checks are recorded separately above.
