"""Del et packshot med forside (venstre) og bagside (højre) i to 3:4-filer.
Virker for både 3:2- og 2:3-billeder. Tøjet skæres aldrig og skaleres aldrig:
hver halvdel beskæres om tøjet med luft omkring og fyldes ud med baggrundsfarven til 3:4.

Brug:  python3 tools/split_packshot.py <input> <basisnavn> [outmappe]
       fx  python3 tools/split_packshot.py test.png holly-hoodie-blue
Gemmer <outmappe eller assets>/<basisnavn>-front.jpg og -back.jpg
"""
import sys, os
from statistics import median
from PIL import Image, ImageChops

def bg_color(im):
    w, h = im.size
    pts = [im.getpixel((x, y)) for x in (4, w // 2, w - 5) for y in (4, h - 5)]
    return tuple(int(median(p[i] for p in pts)) for i in range(3))

def garment_box(half, bg, inner_trim):
    w, h = half.size
    work = half.crop((0, 0, w, h))
    diff = ImageChops.difference(work, Image.new('RGB', work.size, bg)).convert('L')
    mask = diff.point(lambda v: 255 if v > 28 else 0)
    # fjern evt. skillelinje i midten af lærredet
    l, r = inner_trim
    if l: mask.paste(0, (0, 0, l, h))
    if r: mask.paste(0, (w - r, 0, w, h))
    return mask.getbbox()

def to_34(half, box, bg, margin=0.08):
    """Beskær om tøjet med ægte baggrund; mangler der bredde, forlænges kun kantpixels
    (baggrund) blødt ud til siden. Tøjet selv skaleres eller strækkes aldrig."""
    from PIL import ImageFilter
    w, h = half.size
    x0, y0, x1, y1 = box
    gh = y1 - y0
    ch = int(gh * (1 + 2 * margin))
    cw = round(ch * 3 / 4)
    cy = (y0 + y1) // 2
    top = max(0, min(h - ch, cy - ch // 2))
    strip = half.crop((0, top, w, top + ch))
    if cw <= w:
        cx = (x0 + x1) // 2
        left = max(0, min(w - cw, cx - cw // 2))
        return strip.crop((left, 0, left + cw, ch))
    pad_l = (cw - w) // 2; pad_r = cw - w - pad_l
    canvas = Image.new('RGB', (cw, ch), bg)
    for x, src_x, pw in ((0, 0, pad_l), (pad_l + w, w - 1, pad_r)):
        if pw > 0:
            col = strip.crop((src_x, 0, src_x + 1, ch)).resize((pw + 24, ch)).filter(ImageFilter.GaussianBlur(10))
            canvas.paste(col.crop((12, 0, 12 + pw, ch)), (x, 0))
    canvas.paste(strip, (pad_l, 0))
    return canvas

def split(src, base, outdir):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    bg = bg_color(im)
    half_w = w // 2
    halves = [(im.crop((0, 0, half_w - 4, h)), (0, 0)), (im.crop((w - half_w + 4, 0, w, h)), (0, 0))]
    os.makedirs(outdir, exist_ok=True)
    out = []
    for (half, trim), name in zip(halves, ('front', 'back')):
        box = garment_box(half, bg, trim)
        if not box:
            raise SystemExit(f'Fandt intet tøj i {name}-halvdelen. Ingen filer gemt.')
        if box[0] <= 2 or box[2] >= half.size[0] - 2:
            raise SystemExit(f'Tøjet i {name}-halvdelen rører kanten/midten – kan ikke deles uden at skære i tøjet.')
        res = to_34(half, box, bg)
        p = os.path.join(outdir, f'{base}-{name}.jpg')
        res.save(p, quality=92, optimize=True, progressive=True)
        out.append((p, res.size, box))
    return out

if __name__ == '__main__':
    if len(sys.argv) not in (3, 4):
        raise SystemExit(__doc__)
    here = os.path.dirname(os.path.abspath(__file__))
    outdir = sys.argv[3] if len(sys.argv) == 4 else os.path.join(here, '..', 'assets')
    for p, size, box in split(sys.argv[1], sys.argv[2], outdir):
        print(p, size, f'forhold {size[0]/size[1]:.4f} (3:4 = 0.7500)', 'tøj', box)
