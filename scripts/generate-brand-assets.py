#!/usr/bin/env python3
"""Build GFD Studio E's original vector marks and raster app icons.

The paths below are the source of truth; no inherited product artwork is used.
Pillow is used only to rasterize the same new geometry and wordmark for packaging.
Run: python3 scripts/generate-brand-assets.py
"""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
NAVY, TEAL, GOLD, WHITE = "#102A3A", "#21C6B7", "#F2BC52", "#FFFFFF"


def emblem_svg():
    return f'''<rect width="512" height="512" rx="112" fill="{NAVY}"/>
<path d="M138 144H336V184H182V236H300V276H182V328H336V368H138Z" fill="{WHITE}"/>
<path d="M336 164H378M300 256H350M336 348H378" fill="none" stroke="{TEAL}" stroke-width="18"/>
<circle cx="384" cy="164" r="22" fill="{TEAL}"/>
<circle cx="356" cy="256" r="22" fill="{TEAL}"/>
<circle cx="384" cy="348" r="22" fill="{TEAL}"/>
<path d="M90 112H114V400H90Z" fill="{GOLD}"/>'''


def svg(content, width, height, title):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" width="{width}" height="{height}" role="img" aria-labelledby="title">
<title id="title">{title}</title>
{content}
</svg>\n'''


def emblem(size):
    # Supersampling keeps the terminal circles and diagonal edges crisp at 192px.
    scale = 4
    img = Image.new("RGBA", (512 * scale, 512 * scale))
    draw = ImageDraw.Draw(img)
    box = lambda coords: tuple(v * scale for v in coords)
    draw.rounded_rectangle(box((0, 0, 512, 512)), radius=112 * scale, fill=NAVY)
    points = [(138,144),(336,144),(336,184),(182,184),(182,236),(300,236),
              (300,276),(182,276),(182,328),(336,328),(336,368),(138,368)]
    draw.polygon([(x * scale, y * scale) for x, y in points], fill=WHITE)
    for x1, x2, y in [(336, 384, 164), (300, 356, 256), (336, 384, 348)]:
        draw.line(box((x1, y, x2, y)), fill=TEAL, width=18 * scale)
        draw.ellipse(box((x2 - 22, y - 22, x2 + 22, y + 22)), fill=TEAL)
    draw.rectangle(box((90, 112, 114, 400)), fill=GOLD)
    return img.resize((size, size), Image.Resampling.LANCZOS)


def wordmark_svg(dark=False):
    bg, fg, secondary = (NAVY, WHITE, "#A8C5D5") if dark else (WHITE, NAVY, "#526C7B")
    return svg(f'''<rect width="1400" height="400" fill="{bg}"/>
<g transform="translate(44 48) scale(0.59375)">{emblem_svg()}</g>
<text x="404" y="188" font-family="DejaVu Sans,Arial,sans-serif" font-size="112" font-weight="700" fill="{fg}">GFD</text>
<text x="408" y="268" font-family="DejaVu Sans,Arial,sans-serif" font-size="60" fill="{fg}">Studio E</text>
<path d="M410 308H480" stroke="{TEAL}" stroke-width="6"/>
<text x="506" y="316" font-family="DejaVu Sans,Arial,sans-serif" font-size="23" letter-spacing="2" fill="{secondary}">ELECTRICAL DESIGN</text>''', 1400, 400, "GFD Studio E - electrical design")


def wordmark(dark=False):
    bg, fg, secondary = (NAVY, WHITE, "#A8C5D5") if dark else (WHITE, NAVY, "#526C7B")
    img = Image.new("RGB", (1400, 400), bg)
    mark = emblem(304)
    img.paste(mark, (44, 48), mark)
    draw = ImageDraw.Draw(img)
    regular = "DejaVuSans.ttf"
    bold = "DejaVuSans-Bold.ttf"
    draw.text((404, 188), "GFD", font=ImageFont.truetype(bold, 112), fill=fg, anchor="ls")
    draw.text((408, 268), "Studio E", font=ImageFont.truetype(regular, 60), fill=fg, anchor="ls")
    draw.line((410, 308, 480, 308), fill=TEAL, width=6)
    x = 506
    font = ImageFont.truetype(regular, 23)
    for char in "ELECTRICAL DESIGN":
        draw.text((x, 316), char, font=font, fill=secondary, anchor="ls")
        x += draw.textlength(char, font=font) + 2
    return img


def main():
    brand = ROOT / "docs/brand"
    brand.mkdir(parents=True, exist_ok=True)
    icon = svg(emblem_svg(), 512, 512, "GFD Studio E")
    for path in [ROOT / "public/icon.svg", brand / "gfd-studio-e-icon.svg"]:
        path.write_text(icon, encoding="utf-8")
    for size in (192, 512):
        emblem(size).save(ROOT / f"public/icon-{size}.png")
    emblem(1024).save(ROOT / "build/icon.png")
    for dark in (False, True):
        suffix = "-dark" if dark else ""
        (brand / f"gfd-studio-e-logo{suffix}.svg").write_text(wordmark_svg(dark), encoding="utf-8")
        wordmark(dark).save(brand / f"gfd-studio-e-logo{suffix}.png")
    print("GFD Studio E icons and wordmarks generated.")


if __name__ == "__main__":
    main()
