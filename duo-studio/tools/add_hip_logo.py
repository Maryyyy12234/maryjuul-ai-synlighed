"""Tilføjer DUO / STUDIO-hoftelogo (tone-i-tone, broderet look) på et produktbillede, så det matcher modelbilledet.
Brug: python3 add_hip_logo.py <ind.jpg> <ud.jpg> <cx> <cy> <bredde> <fontmappe>"""
import sys, numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
src, dst, cx, cy, w, fdir = sys.argv[1], sys.argv[2], *map(int, sys.argv[3:6]), sys.argv[6]
im = Image.open(src).convert('RGB')
big = ImageFont.truetype(f'{fdir}/bodoni-moda-latin-700-normal.woff', 400)
sm = ImageFont.truetype(f'{fdir}/bodoni-moda-latin-600-normal.woff', 165)
duo = Image.new('L', (1600, 900), 0); stu = Image.new('L', (1600, 900), 0)
d1, d2 = ImageDraw.Draw(duo), ImageDraw.Draw(stu)
bb = d1.textbbox((0, 0), 'DUO', font=big); dw = bb[2] - bb[0]
d1.text((800 - dw / 2 - bb[0], 40 - bb[1]), 'DUO', font=big, fill=255)
duo = duo.filter(ImageFilter.MaxFilter(5))  # tykkere hårstreger = broderet, lavere kontrast som på modellen
lw = [d2.textbbox((0, 0), c, font=sm)[2] - d2.textbbox((0, 0), c, font=sm)[0] for c in 'STUDIO']
span = dw * 0.96; gap = (span - sum(lw)) / 5; x = 800 - span / 2; y0 = 40 + (bb[3] - bb[1]) + 60
for c, cw in zip('STUDIO', lw):
    b2 = d2.textbbox((0, 0), c, font=sm); d2.text((x - b2[0], y0 - b2[1]), c, font=sm, fill=255); x += cw + gap
stu = stu.filter(ImageFilter.MaxFilter(5))
box = Image.fromarray(np.maximum(np.asarray(duo), np.asarray(stu))).getbbox()
duo, stu = duo.crop(box), stu.crop(box)
h = round(duo.height * w / duo.width)
blur = ImageFilter.GaussianBlur(max(0.6, w / 220))
duo = duo.resize((w, h), Image.LANCZOS).filter(blur); stu = stu.resize((w, h), Image.LANCZOS).filter(blur)
x0, y0 = cx - w // 2, cy - h // 2
a = np.asarray(im).astype(float); reg = a[y0:y0 + h, x0:x0 + w]
lum = reg.mean(2, keepdims=True); base = lum.mean(); tex = (lum / base) ** 0.9
out = reg.copy()
for mask, col, op in [(stu, (64, 18, 20), 0.85), (duo, (96, 18, 26), 0.86)]:
    al = (np.asarray(mask).astype(float) / 255 * op)[..., None]
    out = out * (1 - al) + np.array(col, float) * tex * al
a[y0:y0 + h, x0:x0 + w] = out
Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(dst, quality=93, optimize=True, progressive=True)
print('ok', dst, (x0, y0, w, h))
