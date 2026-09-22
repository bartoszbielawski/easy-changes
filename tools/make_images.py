"""Draw the PNG images that can't be SVG: the link-preview card (og:image) and the
home-screen icon. Social sites and iOS ignore SVG, so these are rendered from the
same shapes as img/logo.svg. Re-run after changing the logo or its colours:

    python tools/make_images.py

Needs Pillow and the Segoe UI fonts that ship with Windows.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path("C:/Windows/Fonts")

# Dark theme tokens from css/styles.css (--bg, --text, --muted, --accent, --accent-contrast).
BG, TEXT, MUTED, ACCENT, ON_ACCENT = "#161513", "#ece8e1", "#a39d93", "#fb923c", "#1b1107"
SS = 4  # draw at 4x and scale down, since Pillow's shapes aren't antialiased


def cubic(p0, p1, p2, p3, steps=40):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d
                  for a, b, c, d in zip(p0, p1, p2, p3))
            for t in (i / steps for i in range(steps + 1))]


# The pick outline from img/logo.svg, with its relative and shorthand curves made absolute.
PICK = (cubic((16, 30.5), (10, 24.5), (2.5, 15.5), (2.5, 9.2))
        + cubic((2.5, 9.2), (2.5, 4), (8, 1.5), (16, 1.5))
        + cubic((16, 1.5), (24, 1.5), (29.5, 4), (29.5, 9.2))
        + cubic((29.5, 9.2), (29.5, 15.5), (22, 24.5), (16, 30.5)))
ARROW = cubic((9.5, 16.5), (11, 10.5), (16, 8.5), (21.5, 9.5))
HEAD = [(18.5, 6.8), (21.8, 9.6), (18.8, 12.8)]


def draw_pick(draw, x, y, size):
    """Draw the 32-unit logo with its top-left corner at (x, y), `size` pixels wide."""
    k = size / 32
    pt = lambda p: (x + p[0] * k, y + p[1] * k)
    draw.polygon([pt(p) for p in PICK], fill=ACCENT)
    w = 2 * k
    for line in (ARROW, HEAD):
        pts = [pt(p) for p in line]
        draw.line(pts, fill=ON_ACCENT, width=round(w), joint="curve")
        for px, py in (pts[0], pts[-1]):  # round caps
            draw.ellipse((px - w / 2, py - w / 2, px + w / 2, py + w / 2), fill=ON_ACCENT)
    cx, cy = pt((9.3, 18.3))
    r = 2.4 * k
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), fill=ON_ACCENT)


def render(size, paint):
    big = Image.new("RGB", (size[0] * SS, size[1] * SS), BG)
    paint(ImageDraw.Draw(big), SS)
    return big.resize(size, Image.LANCZOS)


def card(draw, s):
    draw_pick(draw, 110 * s, 165 * s, 300 * s)
    title = ImageFont.truetype(str(FONTS / "segoeuib.ttf"), 96 * s)
    body = ImageFont.truetype(str(FONTS / "segoeui.ttf"), 40 * s)
    small = ImageFont.truetype(str(FONTS / "segoeui.ttf"), 28 * s)
    draw.text((480 * s, 200 * s), "Easy Changes", font=title, fill=TEXT)
    draw.text((484 * s, 330 * s), "The easiest way to play", font=body, fill=MUTED)
    draw.text((484 * s, 384 * s), "any chord progression on guitar", font=body, fill=MUTED)
    draw.text((484 * s, 480 * s), "Voicings · capo and key · harmony · scales", font=small, fill=ACCENT)


def icon(draw, s):
    draw_pick(draw, 22 * s, 22 * s, 136 * s)


if __name__ == "__main__":
    out = ROOT / "img"
    render((1200, 630), card).save(out / "og-image.png", optimize=True)
    render((180, 180), icon).save(out / "apple-touch-icon.png", optimize=True)
    for name in ("og-image.png", "apple-touch-icon.png"):
        print(name, (out / name).stat().st_size, "bytes")
