# Unsigned beta releases

LV Design Studio has two deliberately separate desktop release channels:

- **Beta** is an automated prerelease for active testing on Windows x64 and Apple-silicon macOS. It is unsigned and must not be used for production issue work.
- **Stable** is reserved for a future, manually approved process. A successful beta is never promoted to stable automatically.

No installer is committed to Git. GitHub Releases stores the `.exe`, `.dmg` and `SHA256SUMS.txt` assets. GitHub Pages contains only static product pages and a small beta manifest.

## How a beta is produced

`.github/workflows/beta-release.yml` starts only when a maintainer deliberately runs **Beta release** from the GitHub Actions page and confirms **Publish an unsigned beta from the latest CI-tested main commit**. The selected ref must be `main`. The workflow independently confirms that the exact commit has a successful push-triggered `CI` run before any native build starts.

The prepare job also checks existing valid beta prereleases. If one already targets the same source commit, the workflow completes without starting the Windows or macOS jobs. This prevents repeated manual clicks from uploading duplicate installers for unchanged source.

Windows packages are built on a Windows x64 runner and macOS packages on a GitHub-hosted M1/arm64 runner. Both unpacked applications pass `scripts/check-package.mjs` before their installers are uploaded. Build jobs have read-only repository permissions; only the final publish job receives `contents: write`.

The committed development version is not changed by the workflow. For package version `2.143.0`, run number `123` becomes `2.144.0-beta.123`. The next minor preserves the application's `2.144` display convention, and the GitHub run number makes every beta SemVer unique and ordered.

After publishing, the Pages workflow finds the greatest valid beta SemVer, validates its exact asset names and checksums, and generates:

- `/download/index.html`, with direct GitHub Release asset links;
- `/download/beta.json`, the data-only update manifest; and
- `/about/index.html`, from the reviewed public product content.

Every Pages deployment performs that lookup, so a later deployment from `main` retains the newest beta metadata. No credential is written to the site, and site visitors do not make runtime GitHub API requests.

## When to publish a beta

Normal pull-request and `main` CI continues for every change. Native installers are intentionally batched instead of being published after every successful merge.

Publish a beta when one or more changes need desktop testing, such as:

- a user-facing feature or coherent feature batch;
- calculation-engine, standards-compliance or engineering-validation changes;
- project data, database, import or export format changes;
- an important bug or security fix; or
- installer, updater, Electron or operating-system compatibility changes.

Documentation, test-only changes, refactors, spelling corrections and small internal fixes do not normally justify their own beta. A practical default is one beta every one or two weeks when test-worthy changes have accumulated, with an immediate manual beta for an urgent fix. Stable releases remain a separate future approval process.

## Installing the first beta

1. Open the project's [beta download page](https://pdhruv15.github.io/LV-Design-Studio/download/).
2. Back up existing LV Design Studio project JSON files.
3. Download the package for Windows x64 or Apple silicon.
4. Compare its SHA-256 value with the page or `SHA256SUMS.txt` in the same GitHub prerelease.
5. Open the normal installer or disk image and follow the operating system's prompts.

These builds have no Apple Developer ID signature, notarization or Windows code-signing certificate. Gatekeeper, SmartScreen and unknown-publisher warnings are therefore expected. Keep the operating system's protections enabled and make the installation decision from the verified project download page. The project does not provide instructions to bypass platform protection.

To verify a checksum without changing system security settings:

```text
macOS:   shasum -a 256 LV-Design-Studio-<version>-mac-arm64.dmg
Windows: Get-FileHash .\LV-Design-Studio-<version>-win-x64.exe -Algorithm SHA256
```

A matching checksum detects a changed or incomplete download; it is not a substitute for a publisher signature.

## Subsequent beta notifications

Only a packaged app whose own version contains `-beta.<number>` enables update checks. It waits until after Electron is ready, checks once shortly after startup, then at most twice per day. Development and stable builds make no update request.

The main process requests only the hard-coded HTTPS manifest under the project's GitHub Pages origin. Redirects are refused. The response has a short timeout and strict size, content-type, schema, date, commit and SemVer checks. Failures are quiet and never affect startup, project work or offline use.

When a newer beta exists, a native prompt offers **Open beta download page** or **Later**. The same version is not prompted twice in one app session. Choosing the download option opens only the hard-coded project page in the system browser.

The app does not download, execute, replace or install any file. It does not restart, touch unsaved work, render release notes, accept a manifest-controlled URL, contain a GitHub token, send telemetry or upload project data. Automatic installation is intentionally absent because unsigned replacement would weaken the operating system's trust decision and create an avoidable update supply-chain risk.

## Rollback and recovery

Project files are independent of the installed application. Keep a backup before beta testing and save important work before changing versions. Older beta installers and checksums remain attached to their immutable GitHub prereleases. To roll back, close LV Design Studio, use the operating system's normal uninstall or application replacement flow, then install the selected earlier package after checking its SHA-256 value.

If a beta cannot open a project correctly, do not overwrite the only copy. Preserve the JSON file, reproduce the problem with a copy, and report the beta version and source commit shown on the download page.

## Public product content

`docs/public-site/product.json` is the narrow, reviewed source of truth for public About copy and the README's introductory screenshot section. `scripts/public-site.mjs` escapes all text, accepts only declared fields and the exact screenshot naming convention, and never renders arbitrary repository Markdown or HTML.

Run `npm run sync:public-site` after changing that content. `npm run lint` includes `npm run check:public-site`, so CI fails if the committed README section drifts. Pages copies the existing files from `docs/screenshots`; replacing a reviewed screenshot updates the site on the next deployment without duplicating the image.
