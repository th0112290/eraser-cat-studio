from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
STARTERS = ROOT / "refs" / "mascot_family_starters"
REFERENCE_PACK = ROOT / "refs" / "mascot_family_reference_pack" / "base"
INPUT_ROOT = ROOT / "refs" / "cat_quality_input"
CANVAS = 1024
BG = "#e6e6e6"
LINE = "#111111"
STROKE = 12
STROKE_THIN = 8


def new_canvas() -> tuple[Image.Image, ImageDraw.ImageDraw]:
    image = Image.new("RGBA", (CANVAS, CANVAS), BG)
    draw = ImageDraw.Draw(image)
    return image, draw


def save(path: Path, image: Image.Image) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path)


def rr(draw: ImageDraw.ImageDraw, box, radius, *, width: int = STROKE) -> None:
    draw.rounded_rectangle(box, radius=radius, outline=LINE, width=width)


def line(draw: ImageDraw.ImageDraw, pts, *, width: int = STROKE) -> None:
    draw.line(pts, fill=LINE, width=width, joint="curve")


def ellipse(draw: ImageDraw.ImageDraw, box, *, fill=LINE, width: int | None = None) -> None:
    if width is None:
        draw.ellipse(box, fill=fill)
        return
    draw.ellipse(box, outline=LINE, width=width)


def polygon(draw: ImageDraw.ImageDraw, pts, *, width: int = STROKE) -> None:
    draw.line(list(pts) + [pts[0]], fill=LINE, width=width, joint="curve")


def crop_from_reference(path: Path, box: tuple[int, int, int, int], scale: float = 0.88) -> Image.Image:
    image = Image.open(path).convert("RGBA").crop(box)
    target_w = int(CANVAS * scale)
    target_h = int(CANVAS * scale)
    image.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), BG)
    offset_x = (CANVAS - image.width) // 2
    offset_y = (CANVAS - image.height) // 2
    canvas.alpha_composite(image, (offset_x, offset_y))
    return canvas


def crop_primary_component_from_reference(
    path: Path,
    approx_box: tuple[int, int, int, int],
    scale: float = 0.88,
    margin: int = 18,
) -> Image.Image:
    image = Image.open(path).convert("RGBA").crop(approx_box)
    width, height = image.size
    pixels = image.load()
    bg = pixels[0, 0]

    mask = [[False for _ in range(width)] for _ in range(height)]
    for y in range(height):
        for x in range(width):
            r, g, b, _ = pixels[x, y]
            delta = (abs(r - bg[0]) + abs(g - bg[1]) + abs(b - bg[2])) / 3
            mask[y][x] = delta > 20

    visited = [[False for _ in range(width)] for _ in range(height)]
    best_bbox = None
    best_score = float("-inf")
    center_x = width / 2
    center_y = height / 2

    for y in range(height):
        for x in range(width):
            if visited[y][x] or not mask[y][x]:
                continue

            queue = [(x, y)]
            visited[y][x] = True
            min_x = max_x = x
            min_y = max_y = y
            area = 0
            accum_x = 0
            accum_y = 0
            cursor = 0

            while cursor < len(queue):
                px, py = queue[cursor]
                cursor += 1
                area += 1
                accum_x += px
                accum_y += py
                min_x = min(min_x, px)
                max_x = max(max_x, px)
                min_y = min(min_y, py)
                max_y = max(max_y, py)

                for nx, ny in ((px - 1, py), (px + 1, py), (px, py - 1), (px, py + 1)):
                    if nx < 0 or ny < 0 or nx >= width or ny >= height:
                        continue
                    if visited[ny][nx] or not mask[ny][nx]:
                        continue
                    visited[ny][nx] = True
                    queue.append((nx, ny))

            if area < 120:
                continue

            comp_x = accum_x / area
            comp_y = accum_y / area
            distance = abs(comp_x - center_x) + abs(comp_y - center_y)
            score = area - distance * 1.3
            if score > best_score:
                best_score = score
                best_bbox = (min_x, min_y, max_x + 1, max_y + 1)

    if best_bbox is None:
        return crop_from_reference(path, approx_box, scale=scale)

    min_x, min_y, max_x, max_y = best_bbox
    cropped = image.crop(
        (
            max(0, min_x - margin),
            max(0, min_y - margin),
            min(width, max_x + margin),
            min(height, max_y + margin),
        )
    )
    target_w = int(CANVAS * scale)
    target_h = int(CANVAS * scale)
    cropped.thumbnail((target_w, target_h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (CANVAS, CANVAS), BG)
    offset_x = (CANVAS - cropped.width) // 2
    offset_y = (CANVAS - cropped.height) // 2
    canvas.alpha_composite(cropped, (offset_x, offset_y))
    return canvas


def draw_tail_dust(draw: ImageDraw.ImageDraw, anchor_x: int, anchor_y: int, flip: int = 1) -> None:
    line(
        draw,
        [
            (anchor_x, anchor_y),
            (anchor_x + 26 * flip, anchor_y - 12),
            (anchor_x + 52 * flip, anchor_y + 10),
            (anchor_x + 74 * flip, anchor_y + 26),
        ],
        width=STROKE,
    )
    line(
        draw,
        [
            (anchor_x + 18 * flip, anchor_y + 6),
            (anchor_x + 42 * flip, anchor_y + 36),
            (anchor_x + 62 * flip, anchor_y + 44),
        ],
        width=STROKE_THIN,
    )
    ellipse(draw, (anchor_x + 56 * flip - 30, anchor_y + 16, anchor_x + 56 * flip + 18, anchor_y + 56), width=STROKE_THIN)
    ellipse(draw, (anchor_x + 74 * flip - 10, anchor_y + 38, anchor_x + 74 * flip + 16, anchor_y + 64), width=STROKE_THIN)


def draw_body_front(draw: ImageDraw.ImageDraw) -> None:
    rr(draw, (290, 286, 740, 586), 52)
    rr(draw, (410, 586, 620, 846), 36)
    rr(draw, (374, 604, 426, 748), 26)
    rr(draw, (604, 604, 656, 748), 26)
    rr(draw, (436, 820, 500, 922), 24)
    rr(draw, (530, 820, 594, 922), 24)


def draw_body_three_quarter(draw: ImageDraw.ImageDraw) -> None:
    rr(draw, (304, 304, 742, 588), 48)
    rr(draw, (432, 588, 626, 844), 34)
    rr(draw, (396, 622, 446, 746), 24)
    rr(draw, (606, 604, 654, 726), 22)
    rr(draw, (454, 820, 514, 918), 22)
    rr(draw, (548, 810, 608, 902), 22)


def draw_body_profile(draw: ImageDraw.ImageDraw) -> None:
    rr(draw, (374, 320, 634, 584), 42)
    rr(draw, (442, 584, 556, 842), 30)
    rr(draw, (514, 616, 560, 756), 22)
    rr(draw, (456, 812, 514, 912), 20)


def cat_three_quarter() -> Image.Image:
    image, draw = new_canvas()
    draw_body_three_quarter(draw)
    polygon(draw, [(362, 308), (326, 214), (432, 304)])
    polygon(draw, [(590, 300), (644, 208), (714, 294)])
    line(draw, [(376, 284), (360, 242)], width=STROKE_THIN)
    line(draw, [(624, 278), (646, 242)], width=STROKE_THIN)
    ellipse(draw, (438, 394, 470, 454))
    ellipse(draw, (564, 402, 592, 448))
    line(draw, [(514, 452), (560, 452)], width=STROKE_THIN)
    line(draw, [(410, 460), (374, 452)], width=STROKE_THIN)
    line(draw, [(410, 490), (376, 500)], width=STROKE_THIN)
    line(draw, [(592, 456), (626, 448)], width=STROKE_THIN)
    line(draw, [(592, 484), (624, 484)], width=STROKE_THIN)
    draw_tail_dust(draw, 630, 694)
    return image


def cat_profile_template() -> Image.Image:
    image, draw = new_canvas()
    rr(draw, (334, 318, 596, 584), 40)
    polygon(draw, [(382, 322), (350, 238), (430, 314)])
    polygon(draw, [(442, 320), (486, 238), (532, 308)])
    ellipse(draw, (390, 402, 420, 454))
    line(draw, [(370, 470), (354, 478)], width=STROKE_THIN)
    line(draw, [(446, 470), (484, 470)], width=STROKE_THIN)
    line(draw, [(446, 496), (482, 500)], width=STROKE_THIN)
    line(draw, [(336, 508), (318, 492), (318, 462), (334, 446)], width=STROKE)
    rr(draw, (404, 584, 514, 842), 30)
    line(draw, [(456, 646), (456, 756)], width=STROKE)
    line(draw, [(456, 756), (490, 756)], width=STROKE)
    rr(draw, (414, 810, 470, 910), 20)
    draw_tail_dust(draw, 500, 734)
    return image


def dog_front() -> Image.Image:
    image, draw = new_canvas()
    draw_body_front(draw)
    ellipse(draw, (262, 242, 334, 382), width=STROKE)
    ellipse(draw, (692, 242, 764, 382), width=STROKE)
    ellipse(draw, (438, 404, 470, 458))
    ellipse(draw, (558, 404, 590, 458))
    rr(draw, (478, 446, 558, 506), 28)
    ellipse(draw, (506, 460, 530, 482))
    line(draw, [(518, 482), (518, 498)], width=STROKE_THIN)
    line(draw, [(500, 502), (536, 502)], width=STROKE_THIN)
    draw_tail_dust(draw, 646, 720)
    return image


def dog_three_quarter() -> Image.Image:
    image, draw = new_canvas()
    draw_body_three_quarter(draw)
    ellipse(draw, (286, 254, 360, 386), width=STROKE)
    ellipse(draw, (644, 264, 696, 364), width=STROKE)
    ellipse(draw, (442, 398, 474, 456))
    ellipse(draw, (560, 406, 588, 448))
    rr(draw, (498, 446, 572, 500), 24)
    ellipse(draw, (524, 458, 548, 480))
    line(draw, [(536, 480), (536, 494)], width=STROKE_THIN)
    line(draw, [(520, 498), (548, 500)], width=STROKE_THIN)
    draw_tail_dust(draw, 636, 694)
    return image


def dog_profile() -> Image.Image:
    image, draw = new_canvas()
    draw_body_profile(draw)
    ellipse(draw, (338, 298, 410, 430), width=STROKE)
    line(draw, [(628, 402), (680, 402), (706, 420), (682, 444), (628, 444)], width=STROKE)
    ellipse(draw, (468, 396, 498, 446))
    ellipse(draw, (646, 414, 672, 436), width=STROKE_THIN)
    line(draw, [(660, 436), (660, 454)], width=STROKE_THIN)
    line(draw, [(646, 454), (676, 454)], width=STROKE_THIN)
    draw_tail_dust(draw, 548, 716)
    return image


def wolf_front() -> Image.Image:
    image, draw = new_canvas()
    draw_body_front(draw)
    polygon(draw, [(336, 290), (304, 194), (398, 286)])
    polygon(draw, [(636, 286), (674, 194), (734, 292)])
    line(draw, [(342, 268), (328, 230)], width=STROKE_THIN)
    line(draw, [(664, 266), (678, 230)], width=STROKE_THIN)
    ellipse(draw, (438, 404, 470, 458))
    ellipse(draw, (558, 404, 590, 458))
    polygon(draw, [(500, 448), (536, 448), (552, 478), (518, 494), (484, 478)])
    line(draw, [(518, 494), (518, 508)], width=STROKE_THIN)
    line(draw, [(498, 512), (538, 512)], width=STROKE_THIN)
    draw_tail_dust(draw, 646, 720)
    return image


def wolf_three_quarter() -> Image.Image:
    image, draw = new_canvas()
    draw_body_three_quarter(draw)
    polygon(draw, [(360, 312), (328, 216), (420, 306)])
    polygon(draw, [(606, 298), (648, 208), (706, 286)])
    line(draw, [(364, 290), (350, 252)], width=STROKE_THIN)
    line(draw, [(628, 278), (646, 242)], width=STROKE_THIN)
    ellipse(draw, (440, 396, 472, 452))
    ellipse(draw, (556, 404, 584, 446))
    polygon(draw, [(512, 446), (548, 452), (560, 478), (528, 492), (496, 484)])
    line(draw, [(526, 492), (536, 506)], width=STROKE_THIN)
    draw_tail_dust(draw, 636, 694)
    return image


def wolf_profile() -> Image.Image:
    image, draw = new_canvas()
    draw_body_profile(draw)
    polygon(draw, [(406, 320), (378, 228), (454, 314)])
    polygon(draw, [(484, 312), (520, 228), (562, 300)])
    line(draw, [(628, 392), (690, 402), (726, 426), (696, 454), (632, 462)], width=STROKE)
    ellipse(draw, (468, 396, 498, 446))
    polygon(draw, [(650, 412), (676, 420), (662, 440), (636, 434)], width=STROKE_THIN)
    draw_tail_dust(draw, 548, 716)
    return image


def main() -> None:
    cat_front = crop_primary_component_from_reference(
        INPUT_ROOT / "01_main_style" / "ChatGPT Image 2026년 3월 6일 오후 02_10_14.png",
        (420, 180, 1140, 950),
        scale=0.9,
    )
    cat_profile = cat_profile_template()
    cat_threeq = cat_three_quarter()

    outputs = {
        STARTERS / "cat" / "front.png": cat_front,
        STARTERS / "cat" / "threeQuarter.png": cat_threeq,
        STARTERS / "cat" / "profile.png": cat_profile,
        STARTERS / "dog" / "front.png": dog_front(),
        STARTERS / "dog" / "threeQuarter.png": dog_three_quarter(),
        STARTERS / "dog" / "profile.png": dog_profile(),
        STARTERS / "wolf" / "front.png": wolf_front(),
        STARTERS / "wolf" / "threeQuarter.png": wolf_three_quarter(),
        STARTERS / "wolf" / "profile.png": wolf_profile(),
        REFERENCE_PACK / "front.png": cat_front,
        REFERENCE_PACK / "threeQuarter.png": cat_threeq,
        REFERENCE_PACK / "profile.png": cat_profile,
    }

    for path, image in outputs.items():
        save(path, image)
        print(path)


if __name__ == "__main__":
    main()
