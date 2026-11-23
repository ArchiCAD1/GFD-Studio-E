#!/usr/bin/env python3
"""Package the supplied GFD company logo without altering its artwork.

The canonical PNG and full-size copies remain byte-identical to the supplied
original. Only the complete canvas is resized proportionally for small icons.
Run: python3 scripts/generate-brand-assets.py
"""
from hashlib import sha256
from io import BytesIO
import json
from pathlib import Path
import shutil

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]


def main():
    logo = json.loads((ROOT / "branding.json").read_text(encoding="utf-8"))["companyLogo"]
    source = ROOT / logo["source"]
    original = source.read_bytes()
    if sha256(original).hexdigest() != logo["sha256"]:
        raise ValueError("The company logo differs from the approved original; do not redraw or replace it.")

    outputs = []
    with Image.open(BytesIO(original)) as image:
        if image.format != "PNG" or image.size != (logo["width"], logo["height"]):
            raise ValueError("The company logo must retain its original PNG format and canvas.")
        for icon in logo["icons"]:
            size = (icon["width"], icon["height"])
            if size[0] * image.height != size[1] * image.width:
                raise ValueError("Icon dimensions must preserve the complete logo's proportions.")
            resized = image.resize(size, Image.Resampling.LANCZOS)
            output = BytesIO()
            resized.save(output, format="PNG")
            content = output.getvalue()
            if sha256(content).hexdigest() != icon["sha256"]:
                raise ValueError(f"Generated {icon['path']} differs from its approved bytes; review the Pillow version.")
            outputs.append((ROOT / icon["path"], content))

    # Validate everything before replacing the generated files. The original,
    # including its background, lettering, colors and full canvas, is untouched.
    for destination in (ROOT / logo["publicAsset"], ROOT / "build/icon.png"):
        shutil.copyfile(source, destination)
    for destination, content in outputs:
        destination.write_bytes(content)
    print("GFD company logo verified; exact full-size copies and proportional app icons generated.")


if __name__ == "__main__":
    main()
