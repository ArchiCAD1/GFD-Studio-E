# GFD Studio E brand assets

The GFD Studio E mark is an original **circuit-letter E**: a white E conductor feeds three teal terminals, with an amber vertical accent on a navy field. It identifies Gerardo Faustin Designs Limited's electrical design workspace.

| Use | Source or generated asset |
| --- | --- |
| Browser favicon and app mark | `public/icon.svg` |
| Browser raster icons | `public/icon-192.png`, `public/icon-512.png` |
| Desktop packaging icon | `build/icon.png` (1024 x 1024) |
| Brand icon | `docs/brand/gfd-studio-e-icon.svg` |
| Light wordmark | `docs/brand/gfd-studio-e-logo.svg`, `.png` |
| Dark wordmark | `docs/brand/gfd-studio-e-logo-dark.svg`, `.png` |

## Palette

| Colour | Hex | Purpose |
| --- | --- | --- |
| Navy | `#102A3A` | App-icon field, dark wordmark background and primary type |
| Teal | `#21C6B7` | Circuit terminals and secondary accent |
| Amber | `#F2BC52` | Signature vertical accent |
| White | `#FFFFFF` | Electrical E and reversed lettering |

The app icon is vector geometry with no font dependency. Wordmarks use DejaVu Sans with Arial/sans-serif fallbacks in the SVG; the committed PNGs provide consistent raster rendering. Keep sufficient clear space and preserve proportions. Engineering reports continue to use their established black-and-white output format.

## Rebuild

Run `python3 scripts/generate-brand-assets.py` from the repository root. It requires Pillow and DejaVu Sans fonts. The script generates the SVG geometry and raster versions from the same coordinates, so packaging never depends on an inherited logo or on a remote image service.

The previous product logo and promotional video are no longer active GFD assets. They remain available in the unmodified upstream Git history solely as historical provenance.
