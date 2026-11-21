#!/usr/bin/env python3
"""
v2.12 — Open Graph card generator (one-shot asset utility, not a gate).

Generates `public/images/og-card.png` (1200 × 630) — the image referenced
by og:image / twitter:image on the landing page. Regenerate only when the
brand palette or copy changes:

    python3 scripts/generate-og-card.py

Design notes (kept in sync with the landing story, D39):
  * background = the landing water tint (`--lnd-water` light scheme,
    oklch(0.945 0.02 210)) with the scenery island tint
    (`--lnd-island`, oklch(0.84 0.05 130)) as a soft arc — the card reads
    as a page of the landing page itself;
  * the app icon (`public/icons/icon-512.png`, emerald-700 #047857
    rounded square, white glyph) is the brand mark;
  * the wordmark + tagline mirror the hero H1 ("Group travel, sorted."),
    the feature line mirrors the manifest description, and the domain is
    the production host (pasyalph.com).

Requires Pillow + Noto Sans SC (both present in the build sandbox);
no other dependencies. The output is committed, so CI never runs this.
"""

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630

FONT_DIR = "/usr/share/fonts/truetype/chinese"
NOTO_BOLD = f"{FONT_DIR}/NotoSansSC-Bold.ttf"
NOTO_REG = f"{FONT_DIR}/NotoSansSC-Regular.ttf"

ICON_SRC = "public/icons/icon-512.png"
OUT = "public/images/og-card.png"


def oklch_to_srgb(l: float, c: float, h_deg: float) -> tuple[int, int, int]:
    """OKLCH → sRGB (8-bit), with gamut clipping. Reference: OKLab spec."""

    def encode(x: float) -> float:
        # linear → sRGB transfer (encode), with the linear segment
        if x <= 0.0031308:
            return 12.92 * x
        return 1.055 * x ** (1 / 2.4) - 0.055

    import math

    h = math.radians(h_deg)
    a_, b_ = c * math.cos(h), c * math.sin(h)
    l_ = l + 0.3963377774 * a_ + 0.2158037573 * b_
    m_ = l - 0.1055613458 * a_ - 0.0638541728 * b_
    s_ = l - 0.0894841775 * a_ - 1.2914855480 * b_
    l_c, m_c, s_c = l_**3, m_**3, s_**3
    lin = (
        +4.0767416621 * l_c - 3.3077115913 * m_c + 0.2309699292 * s_c,
        -1.2684380046 * l_c + 2.6097574011 * m_c - 0.3413193965 * s_c,
        -0.0041960863 * l_c - 0.7034186147 * m_c + 1.7076147010 * s_c,
    )
    return tuple(  # noqa: RUF032 / tuple for callers
        min(255, max(0, round(encode(v) * 255))) for v in lin
    )


# Palette (landing light scheme — LandingStory.vue custom properties)
WATER = oklch_to_srgb(0.945, 0.02, 210)  # --lnd-water
ISLAND = oklch_to_srgb(0.84, 0.05, 130)  # --lnd-island
EMERALD = (4, 120, 87)  # emerald-700 #047857 (manifest theme_color)
INK = (13, 13, 13)  # ≈ --background dark / neutral-900
INK_SOFT = (74, 74, 74)  # neutral-500-ish
INK_FAINT = (122, 122, 122)  # neutral-400-ish


def font(path: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(path, size)


def center_text(draw: ImageDraw.ImageDraw, y: int, text: str, f: ImageFont.FreeTypeFont, fill):
    """Draw `text` horizontally centered at top edge `y`."""
    bbox = draw.textbbox((0, 0), text, font=f)
    draw.text(((W - (bbox[2] - bbox[0])) / 2 - bbox[0], y), text, font=f, fill=fill)
    return bbox[3] - bbox[1]


def main() -> None:
    img = Image.new("RGB", (W, H), WATER)
    draw = ImageDraw.Draw(img)

    # Scenery echo: two soft island arcs along the bottom, island-tint at
    # low alpha (blend by hand — draw on an overlay for real alpha).
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.ellipse((-320, H - 130, 520, H + 190), fill=ISLAND + (110,))
    od.ellipse((760, H - 175, 1560, H + 160), fill=ISLAND + (80,))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img)

    # Centered stack — icon, wordmark, tagline, feature line, domain.
    icon = Image.open(ICON_SRC).convert("RGBA").resize((132, 132), Image.LANCZOS)
    img.paste(icon, ((W - 132) // 2, 78), icon)

    draw = ImageDraw.Draw(img)
    center_text(draw, 238, "Pasyal", font(NOTO_BOLD, 92), INK)
    center_text(draw, 360, "Group travel, sorted.", font(NOTO_REG, 42), INK_SOFT)
    center_text(draw, 436, "Shared expenses · Itinerary · Live location", font(NOTO_BOLD, 29), EMERALD)
    center_text(draw, 566, "pasyalph.com", font(NOTO_REG, 26), INK_FAINT)

    img.save(OUT, optimize=True)
    import os

    print(f"{OUT}: {img.size[0]}x{img.size[1]}, {os.path.getsize(OUT)} bytes")


if __name__ == "__main__":
    main()
