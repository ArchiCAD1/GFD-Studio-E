# GFD Studio E source and branding provenance

## Maintainer and product identity

**GFD Studio E** is the electrical design product maintained by **Gerardo Moises Faustin / Gerardo Faustin Designs Limited** in [ArchiCAD1/GFD-Studio-E](https://github.com/ArchiCAD1/GFD-Studio-E).

The native project extension is `.gfde`, the command-line tool is `gfde`, the package is `gfd-studio-e`, and the application identifier is `com.gfdstudio.e`. The GFD product identity applies to the application, generated deliverables, installers, documentation and newly saved projects. Standard engineering formats such as IFC, DWG, DXF, PDF, XLSX, CSV, JSON and SVG retain their interoperable extensions.

## Inherited source

This distribution derives from **LV Design Studio**, originally authored by **Palanisami Govindasamy** and distributed from [Pdhruv15/LV-Design-Studio](https://github.com/Pdhruv15/LV-Design-Studio). The branding overhaul began from commit [`1c47881360a4eeaa43e62235edcce0c21bfb7cf1`](https://github.com/ArchiCAD1/GFD-Studio-E/tree/1c47881360a4eeaa43e62235edcce0c21bfb7cf1).

The original code licence remains **MIT OR Apache-2.0**. [LICENSE-MIT](../../LICENSE-MIT), [LICENSE-APACHE](../../LICENSE-APACHE) and the [original upstream notice](UPSTREAM-NOTICE.md) retain the original rights and attribution. [NOTICE.md](../../NOTICE.md) identifies the GFD distribution and its dependencies. Renaming this fork does not transfer authorship or exclusive ownership of inherited source, standards, manufacturers' data or dependencies.

The bundled CAD reader uses acadrust and retains its third-party notices. Built package dependency notices remain part of the distribution. These notices are deliberate provenance records, not missed branding replacements.

## GFD changes

The GFD branding update introduces the GFD product name and publisher identity, original circuit-letter E artwork, `.gfde` project naming, GFD package/application/CLI identities, GFD output branding and project metadata, GFD repository/support links, GFD documentation and compatibility paths for older project data. The precise modified files and their changes are recorded by Git; the inherited commit history is preserved.

The new vector logo and icon are generated from original geometry in [scripts/generate-brand-assets.py](../../scripts/generate-brand-assets.py). They do not reuse the original product's transformer symbol mark. See the [brand asset guide](../brand/README.md).

## Historical evidence

Inherited mockups, before/after reports, architecture reviews and audit screenshots are development records. They are **not evidence of GFD testing, GFD release readiness or new engineering validation**. Retired screenshots and example PDFs are indexed by exact historical commit, and removed from active product documentation. Functional regression baselines remain test evidence; historical content is never altered to imply that GFD ran those checks. See [the historical evidence register](HISTORICAL-EVIDENCE.md).

The former promotional video has been retired from active marketing, and its unmodified source remains in Git history. Current promotional pages use the GFD wordmark and freshly captured GFD documentation views. Any legacy format names in migration adapters, migration tests and this provenance record are intentional compatibility or attribution references.

## Engineering status

The rebrand changes product identity. It does not itself establish electrical-code compliance, authority approval, numerical validation or professional certification. The existing [calculation methods and limits](../engineering/calculation-methods.md) continue to define the engineering scope.
