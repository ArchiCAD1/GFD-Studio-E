# GFD company logo

GFD Studio E uses the existing **Gerardo Faustin Designs Limited** company logo
supplied by Gerardo Moises Faustin. The authoritative artwork is
[`gfd-company-logo.png`](gfd-company-logo.png): the navy-and-gold house/GFD
monogram, its **GERARDO FAUSTIN / DESIGNS** lettering, and its complete light
background. It replaces the circuit-letter E symbol and substitute wordmarks.

## Preserve the original

Do not redraw, recolor, crop, stretch, remove the background, replace the
lettering, or make a different light/dark version. Display the complete artwork
at its original proportions. Identify the product as **GFD Studio E** in adjacent
interface text; do not add that text inside the company logo.

The supplied PNG is **1024 × 1024**, RGB, **1,002,944 bytes**. Its SHA-256 is:

```text
782f0667c14d89869ef609e7e1dac70029f3006dd03854cd2d3252f563caefec
```

The source file is byte-identical to the supplied original. Company-logo
metadata and the approved derivative hashes are recorded in
[`branding.json`](../../branding.json).

| Use | Asset | Treatment |
| --- | --- | --- |
| Authoritative company artwork and repository documentation | `docs/brand/gfd-company-logo.png` | Untouched original PNG |
| Application and public-site company logo | `public/gfd-company-logo.png` | Byte-for-byte copy of the original |
| Desktop packaging icon | `build/icon.png` | Byte-for-byte copy of the original |
| Browser/PWA small icon | `public/icon-192.png` | Complete canvas resized proportionally to 192 × 192 |
| Browser/PWA large icon and Electron window icon | `public/icon-512.png` | Complete canvas resized proportionally to 512 × 512 |

The original logo's navy and gold remain part of the image. Do not apply CSS
filters or opacity to recolor it for a theme. Preserve its white/light canvas in
both light and dark interfaces. Documentation captures must show the actual
application with this logo, and manuals must retain its colors.

## Rebuild and verify

The approved icon bytes were generated and verified with **Pillow 13.0.0**,
pinned in [`scripts/requirements-brand-assets.txt`](../../scripts/requirements-brand-assets.txt).
From the repository root, use a separate virtual environment for this recipe:

```sh
python3 -m venv tmp/brand-assets-venv
tmp/brand-assets-venv/bin/python -m pip install -r scripts/requirements-brand-assets.txt
tmp/brand-assets-venv/bin/python scripts/generate-brand-assets.py
```

On Windows, use `tmp/brand-assets-venv/Scripts/python.exe` in the last two
commands. This environment is separate from the visual-manual dependencies and
does not change system Python packages.

The script verifies the authoritative source hash, copies the full-size
original, and makes only proportional raster resizes using Lanczos resampling.
It validates the approved output hashes before replacing generated files and
fails if a different Pillow version produces different bytes, so that any
tooling change can be reviewed rather than silently altering the artwork.

Run `npm run check:branding` to verify the source checksum, exact full-size
copies, approved icon checksums and dimensions, and absence of the retired
circuit-letter E assets. No fonts, vector tracing, drawing, image-generation
service, or remote image download is used.

Upstream product artwork remains in Git history for historical provenance.
Company artwork identifies Gerardo Faustin Designs Limited; code licensing does
not grant permission to imply sponsorship or endorsement through that brand.
