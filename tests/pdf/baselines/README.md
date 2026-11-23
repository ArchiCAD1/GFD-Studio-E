# GFD Studio E PDF baselines

The `linux` directory contains GFD Studio E output rendered with the repository's Electron runtime. Product version and test dates are fixed by `tests/pdf/visual.pdf.ts`; the images verify document geometry, page count, typography and report branding.

Run `npm run test:pdf` to compare the current render with the baseline. On a Linux machine without a display, use the repository's CI command with `xvfb-run`. Update images only for an intended, visually reviewed output change with `UPDATE_BASELINES=1 npm run test:pdf -- visual`.

The previous product's macOS images were retired during the GFD rebrand. They remain recoverable from [the original baseline commit](https://github.com/ArchiCAD1/GFD-Studio-E/tree/1c47881360a4eeaa43e62235edcce0c21bfb7cf1/tests/pdf/baselines/darwin). Generate and review fresh `darwin` baselines on macOS before claiming a macOS pixel-comparison pass. Linux images are not a substitute for macOS or Windows rendering verification.
