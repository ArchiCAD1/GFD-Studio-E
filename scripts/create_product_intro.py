#!/usr/bin/env python3
"""Render the LV Design Studio 30-second product intro as raw BGRA frames.

The companion Swift encoder reads the stream and writes an H.264 MP4. Keeping
the renderer dependency-light (Pillow only) makes the video reproducible on the
same macOS development machines used for the desktop application.
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH = 1920
HEIGHT = 1080
FPS = 24
DURATION = 30

NAVY = (15, 42, 68)
NAVY_2 = (24, 57, 87)
GOLD = (245, 179, 1)
SLATE = (91, 113, 134)
INK = (27, 43, 58)
MUTED = (99, 118, 136)
PALE = (241, 245, 248)
LINE = (219, 227, 233)
WHITE = (255, 255, 255)

FONT_PATH = "/System/Library/Fonts/Avenir Next.ttc"


def font(size: int, weight: str = "regular") -> ImageFont.FreeTypeFont:
    indexes = {"bold": 0, "demi": 2, "medium": 5, "regular": 7}
    return ImageFont.truetype(FONT_PATH, size, index=indexes[weight])


FONTS = {
    "eyebrow": font(24, "demi"),
    "title": font(76, "bold"),
    "title_small": font(66, "bold"),
    "body": font(31, "regular"),
    "chip": font(23, "demi"),
    "tiny": font(20, "medium"),
    "brand": font(92, "bold"),
    "brand_light": font(92, "regular"),
    "hero": font(84, "bold"),
}


def clamp(value: float, low: float = 0.0, high: float = 1.0) -> float:
    return max(low, min(high, value))


def ease(value: float) -> float:
    value = clamp(value)
    return 1 - (1 - value) ** 3


def smooth(value: float) -> float:
    value = clamp(value)
    return value * value * (3 - 2 * value)


def mix(a: float, b: float, amount: float) -> float:
    return a + (b - a) * amount


def text_width(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont) -> float:
    return draw.textlength(text, font=face)


def wrap_text(draw: ImageDraw.ImageDraw, text: str, face: ImageFont.FreeTypeFont, width: int) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in text.split():
        candidate = f"{current} {word}".strip()
        if current and text_width(draw, candidate, face) > width:
            lines.append(current)
            current = word
        else:
            current = candidate
    if current:
        lines.append(current)
    return lines


def draw_wrapped(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    face: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    width: int,
    spacing: int,
) -> int:
    x, y = xy
    for line in wrap_text(draw, text, face, width):
        draw.text((x, y), line, font=face, fill=fill)
        box = draw.textbbox((x, y), line, font=face)
        y += box[3] - box[1] + spacing
    return y


def rounded_mask(size: tuple[int, int], radius: int) -> Image.Image:
    mask = Image.new("L", size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return mask


def screenshot_card(path: Path, width: int) -> Image.Image:
    source = Image.open(path).convert("RGB")
    height = round(width * source.height / source.width)
    source = source.resize((width, height), Image.Resampling.LANCZOS)
    frame = 12
    radius = 24
    canvas = Image.new("RGBA", (width + 64, height + 78), (0, 0, 0, 0))
    shadow = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    shadow_mask = Image.new("L", (width + 2 * frame, height + 2 * frame), 0)
    ImageDraw.Draw(shadow_mask).rounded_rectangle(
        (0, 0, shadow_mask.width - 1, shadow_mask.height - 1), radius=radius, fill=120
    )
    shadow_mask = shadow_mask.filter(ImageFilter.GaussianBlur(16))
    shadow.paste((12, 29, 46, 110), (20, 26), shadow_mask)
    canvas.alpha_composite(shadow)
    shell = Image.new("RGBA", (width + 2 * frame, height + 2 * frame), WHITE + (255,))
    shell_mask = rounded_mask(shell.size, radius)
    canvas.paste(shell, (20, 14), shell_mask)
    image_mask = rounded_mask((width, height), radius - 8)
    canvas.paste(source, (20 + frame, 14 + frame), image_mask)
    return canvas


def alpha_paste(base: Image.Image, overlay: Image.Image, xy: tuple[int, int], opacity: float = 1.0) -> None:
    if opacity <= 0:
        return
    if opacity < 1:
        overlay = overlay.copy()
        overlay.putalpha(overlay.getchannel("A").point(lambda value: round(value * opacity)))
    base.alpha_composite(overlay, xy)


class Assets:
    def __init__(self) -> None:
        self.icon = Image.open(ROOT / "public/icon-512.png").convert("RGBA").resize((156, 156), Image.Resampling.LANCZOS)
        screenshots = ROOT / "docs/screenshots"
        self.sld = screenshot_card(screenshots / "01-single-line-diagram.png", 1080)
        self.schedule = screenshot_card(screenshots / "02-load-schedule.png", 1100)
        self.transformer = screenshot_card(screenshots / "03-transformer-generator.png", 720)
        self.pfc = screenshot_card(screenshots / "04-power-factor-correction.png", 720)
        self.earthing = screenshot_card(screenshots / "05-earthing-with-panel-tree.png", 720)
        self.reports = screenshot_card(screenshots / "06-study-reports.png", 1080)
        self.overview = screenshot_card(screenshots / "10-overview-design-stages.png", 1220)


def base_frame(dark: bool = False) -> Image.Image:
    colour = NAVY if dark else WHITE
    image = Image.new("RGBA", (WIDTH, HEIGHT), colour + (255,))
    draw = ImageDraw.Draw(image)
    if dark:
        for x in range(-200, WIDTH + 200, 160):
            draw.line((x, 0, x + 580, HEIGHT), fill=(31, 63, 93), width=1)
    else:
        for x in range(0, WIDTH, 96):
            draw.line((x, 0, x, HEIGHT), fill=(247, 249, 251), width=1)
        for y in range(0, HEIGHT, 96):
            draw.line((0, y, WIDTH, y), fill=(247, 249, 251), width=1)
    return image


def draw_brand(draw: ImageDraw.ImageDraw, xy: tuple[int, int], colour: tuple[int, int, int]) -> None:
    x, y = xy
    draw.text((x, y), "LV", font=FONTS["brand"], fill=colour)
    offset = round(text_width(draw, "LV", FONTS["brand"])) + 24
    draw.text((x + offset, y), "Design", font=FONTS["brand_light"], fill=colour)
    draw.text((x + 5, y + 116), "S T U D I O", font=font(33, "demi"), fill=SLATE if colour == NAVY else WHITE)
    draw.rounded_rectangle((x + 6, y + 168, x + 118, y + 178), radius=5, fill=GOLD)


def draw_eyebrow(draw: ImageDraw.ImageDraw, text: str, xy: tuple[int, int], dark: bool = False) -> None:
    x, y = xy
    draw.rounded_rectangle((x, y + 6, x + 42, y + 12), radius=3, fill=GOLD)
    draw.text((x + 58, y - 4), text, font=FONTS["eyebrow"], fill=WHITE if dark else SLATE)


def draw_chips(draw: ImageDraw.ImageDraw, labels: list[str], xy: tuple[int, int], progress: float, dark: bool = False) -> None:
    x, y = xy
    for index, label in enumerate(labels):
        reveal = ease((progress - index * 0.14) / 0.55)
        if reveal <= 0:
            continue
        width = round(text_width(draw, label, FONTS["chip"])) + 42
        y_offset = round((1 - reveal) * 18)
        fill = (35, 67, 97) if dark else PALE
        text_fill = WHITE if dark else NAVY
        draw.rounded_rectangle((x, y + y_offset, x + width, y + 48 + y_offset), radius=24, fill=fill)
        draw.text((x + 21, y + 9 + y_offset), label, font=FONTS["chip"], fill=text_fill)
        x += width + 14


def draw_progress(draw: ImageDraw.ImageDraw, t: float, dark: bool = False) -> None:
    colour = (50, 79, 106) if dark else LINE
    draw.rounded_rectangle((96, 1008, 1824, 1016), radius=4, fill=colour)
    draw.rounded_rectangle((96, 1008, round(mix(96, 1824, t / DURATION)), 1016), radius=4, fill=GOLD)


def scene_intro(local: float, assets: Assets) -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    p = ease(local / 0.95)
    icon_x = round(mix(380, 446, p))
    alpha_paste(image, assets.icon, (icon_x, 310), p)
    draw_brand(draw, (650, round(mix(350, 322, p))), NAVY)
    line_p = ease((local - 0.45) / 1.0)
    draw.rounded_rectangle((448, 555, round(mix(448, 1474, line_p)), 562), radius=4, fill=GOLD)
    tagline_p = ease((local - 0.8) / 0.75)
    draw.text(
        (WIDTH // 2, round(mix(648, 622, tagline_p))),
        "Low-voltage electrical design in one workspace.",
        font=font(38, "medium"),
        fill=INK,
        anchor="mm",
    )
    draw.text(
        (WIDTH // 2, 700),
        "SLD  •  Schedules  •  Calculations  •  Drawings  •  Reports",
        font=FONTS["chip"],
        fill=MUTED,
        anchor="mm",
    )
    for index, x in enumerate((200, 310, 1610, 1720)):
        node_p = ease((local - 1.0 - index * 0.08) / 0.8)
        if x < WIDTH // 2:
            end = round(mix(0, 250, node_p))
            draw.line((0, 195 + index * 42, end, 195 + index * 42), fill=LINE, width=3)
            draw.ellipse((end - 7, 188 + index * 42, end + 7, 202 + index * 42), fill=GOLD)
        else:
            start = round(mix(WIDTH, 1670, node_p))
            draw.line((start, 760 + (index - 2) * 42, WIDTH, 760 + (index - 2) * 42), fill=LINE, width=3)
            draw.ellipse((start - 7, 753 + (index - 2) * 42, start + 7, 767 + (index - 2) * 42), fill=GOLD)
    return image


def scene_network(local: float, assets: Assets) -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    p = ease(local / 0.75)
    card_x = round(mix(1940, 740, p))
    alpha_paste(image, assets.sld, (card_x, 134), p)
    text_x = round(mix(50, 110, p))
    draw_eyebrow(draw, "CONNECTED DESIGN", (text_x, 216))
    draw_wrapped(draw, (text_x, 286), "Build the network once.", FONTS["title"], NAVY, 540, 8)
    draw_wrapped(
        draw,
        (text_x, 500),
        "Boards, feeders and single-line diagrams stay connected to the same project data.",
        FONTS["body"],
        MUTED,
        510,
        13,
    )
    draw_chips(draw, ["SLD", "Board hierarchy", "IEC / DEWA"], (text_x, 732), local / 1.7)
    draw_progress(draw, 4.5 + local)
    return image


def scene_schedule(local: float, assets: Assets) -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    p = ease(local / 0.75)
    card_x = round(mix(-1180, 54, p))
    alpha_paste(image, assets.schedule, (card_x, 152), p)
    text_x = round(mix(1890, 1302, p))
    draw_eyebrow(draw, "LIVE SCHEDULES", (text_x, 212))
    draw_wrapped(draw, (text_x, 282), "Keep every schedule in step.", FONTS["title_small"], NAVY, 500, 7)
    draw_wrapped(
        draw,
        (text_x, 505),
        "Connected loads, demand and phase balance move with the design.",
        FONTS["body"],
        MUTED,
        480,
        12,
    )
    colours = ((222, 83, 79), (238, 190, 45), (55, 105, 159))
    labels = ("R", "Y", "B")
    widths = (330, 292, 315)
    for index, (label, colour, width) in enumerate(zip(labels, colours, widths)):
        y = 720 + index * 55
        draw.text((text_x, y - 5), label, font=FONTS["chip"], fill=INK)
        draw.rounded_rectangle((text_x + 48, y, text_x + 398, y + 18), radius=9, fill=PALE)
        bar_p = ease((local - 0.55 - index * 0.1) / 0.9)
        draw.rounded_rectangle((text_x + 48, y, text_x + 48 + round(width * bar_p), y + 18), radius=9, fill=colour)
    draw_progress(draw, 9 + local)
    return image


def scene_studies(local: float, assets: Assets) -> Image.Image:
    image = base_frame(dark=True)
    draw = ImageDraw.Draw(image)
    draw_eyebrow(draw, "COORDINATED STUDIES", (108, 186), dark=True)
    draw_wrapped(draw, (108, 258), "Check the design from every angle.", FONTS["title_small"], WHITE, 610, 8)
    draw_wrapped(
        draw,
        (108, 486),
        "Size equipment and review voltage, fault, earthing and power quality in one model.",
        FONTS["body"],
        (193, 207, 219),
        570,
        13,
    )
    draw_chips(draw, ["Transformer", "Earthing", "Power factor"], (108, 736), local / 1.8, dark=True)
    cards = [
        (assets.pfc, (1168, 438), -0.2),
        (assets.earthing, (1030, 258), -0.1),
        (assets.transformer, (832, 86), 0.0),
    ]
    for index, (card, final_xy, delay) in enumerate(cards):
        p = ease((local - 0.05 - index * 0.16) / 0.8)
        x = round(mix(1940, final_xy[0], p))
        y = round(mix(final_xy[1] + 34, final_xy[1], p))
        alpha_paste(image, card, (x, y), p)
    draw_progress(draw, 13.5 + local, dark=True)
    return image


def scene_reports(local: float, assets: Assets) -> Image.Image:
    image = base_frame()
    draw = ImageDraw.Draw(image)
    p = ease(local / 0.75)
    card_x = round(mix(1940, 742, p))
    alpha_paste(image, assets.reports, (card_x, 145), p)
    draw_eyebrow(draw, "DELIVERABLES", (108, 214))
    draw_wrapped(draw, (108, 286), "Turn calculations into clear outputs.", FONTS["title_small"], NAVY, 550, 8)
    draw_wrapped(
        draw,
        (108, 526),
        "Prepare study reports, schedules, drawings and quantities from the current design model.",
        FONTS["body"],
        MUTED,
        520,
        13,
    )
    draw_chips(draw, ["PDF", "Excel", "Drawing sheets"], (108, 756), local / 1.7)
    draw_progress(draw, 18 + local)
    return image


def scene_offline(local: float, assets: Assets) -> Image.Image:
    image = base_frame(dark=True)
    draw = ImageDraw.Draw(image)
    p = ease(local / 0.75)
    card_x = round(mix(1900, 648, p))
    alpha_paste(image, assets.overview, (card_x, 110), p)
    panel = Image.new("RGBA", (680, 860), (15, 42, 68, 244))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle((0, 0, 679, 859), radius=30, outline=(63, 91, 117), width=2)
    alpha_paste(image, panel, (72, 88), 1)
    draw_eyebrow(draw, "OFFLINE-FIRST", (116, 174), dark=True)
    draw_wrapped(draw, (116, 250), "Your work stays under your control.", FONTS["title_small"], WHITE, 560, 8)
    draw_wrapped(
        draw,
        (116, 488),
        "No sign-in required. Projects remain local files you can manage and archive.",
        FONTS["body"],
        (202, 215, 226),
        540,
        13,
    )
    draw_chips(draw, ["Local files", "Open source"], (116, 706), local / 1.5, dark=True)
    draw.text((116, 832), "Engineer verification remains essential.", font=FONTS["tiny"], fill=(157, 177, 194))
    draw_progress(draw, 22.5 + local, dark=True)
    return image


def scene_outro(local: float, assets: Assets) -> Image.Image:
    image = base_frame(dark=True)
    draw = ImageDraw.Draw(image)
    p = ease(local / 0.85)
    icon = assets.icon.resize((132, 132), Image.Resampling.LANCZOS)
    alpha_paste(image, icon, (round(mix(260, 360, p)), 278), p)
    brand_x = round(mix(1760, 548, p))
    draw_brand(draw, (brand_x, 272), WHITE)
    underline = ease((local - 0.45) / 0.8)
    draw.rounded_rectangle((360, 515, round(mix(360, 1560, underline)), 523), radius=4, fill=GOLD)
    title_p = ease((local - 0.65) / 0.8)
    draw.text(
        (WIDTH // 2, round(mix(660, 630, title_p))),
        "From concept to issued drawing.",
        font=FONTS["hero"],
        fill=WHITE,
        anchor="mm",
    )
    draw.text(
        (WIDTH // 2, 740),
        "One connected workflow for low-voltage electrical design.",
        font=font(34, "regular"),
        fill=(197, 211, 222),
        anchor="mm",
    )
    draw.text(
        (WIDTH // 2, 842),
        "OPEN SOURCE   •   NO SIGN-IN   •   LOCAL PROJECT FILES",
        font=FONTS["chip"],
        fill=GOLD,
        anchor="mm",
    )
    draw.text(
        (WIDTH // 2, 949),
        "First-pass design checks. Final engineering verification is required.",
        font=FONTS["tiny"],
        fill=(143, 165, 184),
        anchor="mm",
    )
    draw_progress(draw, 26 + local, dark=True)
    return image


SCENES = [
    (0.0, 4.5, scene_intro),
    (4.5, 9.0, scene_network),
    (9.0, 13.5, scene_schedule),
    (13.5, 18.0, scene_studies),
    (18.0, 22.5, scene_reports),
    (22.5, 26.0, scene_offline),
    (26.0, 30.0, scene_outro),
]


def render_frame(t: float, assets: Assets) -> Image.Image:
    for index, (start, end, renderer) in enumerate(SCENES):
        if t < end or index == len(SCENES) - 1:
            current = renderer(t - start, assets)
            transition = 0.42
            if index < len(SCENES) - 1 and t > end - transition:
                next_start, _, next_renderer = SCENES[index + 1]
                following = next_renderer(t - next_start, assets)
                amount = smooth((t - (end - transition)) / transition)
                current = Image.blend(current, following, amount)
            return current.convert("RGB")
    raise AssertionError("unreachable")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--fps", type=int, default=FPS)
    parser.add_argument("--duration", type=float, default=DURATION)
    parser.add_argument("--preview-time", type=float)
    parser.add_argument("--preview-output", type=Path)
    args = parser.parse_args()

    assets = Assets()
    if args.preview_time is not None:
        if args.preview_output is None:
            parser.error("--preview-output is required with --preview-time")
        render_frame(args.preview_time, assets).save(args.preview_output)
        return 0

    frame_count = round(args.fps * args.duration)
    for index in range(frame_count):
        frame = render_frame(index / args.fps, assets)
        sys.stdout.buffer.write(frame.convert("RGBA").tobytes("raw", "BGRA"))
        if index % args.fps == 0:
            print(f"Rendered {index // args.fps:02d}/{round(args.duration):02d}s", file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
