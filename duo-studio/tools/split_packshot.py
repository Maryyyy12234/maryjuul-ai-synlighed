"""Del et 3:2 packshot (forside venstre, bagside højre) i to 3:4-filer.
Kun beskæring på midten – ingen skalering eller strækning af tøjet.
Brug:  python3 tools/split_packshot.py <input.jpg> <basisnavn>
       fx  python3 tools/split_packshot.py test.png holly-hoodie-blue
Gemmer assets/<basisnavn>-front.jpg og assets/<basisnavn>-back.jpg
"""
import sys, os
from PIL import Image

def split(src, base, outdir):
    im = Image.open(src).convert('RGB')
    w, h = im.size
    ratio = w / h
    if abs(ratio - 1.5) > 0.02:
        raise SystemExit(f'Billedet er {w}x{h} (forhold {ratio:.3f}). Det skal være 3:2 (1.5). Ingen filer gemt.')
    half = w // 2
    left = im.crop((0, 0, half, h))
    right = im.crop((w - half, 0, w, h))
    os.makedirs(outdir, exist_ok=True)
    paths = []
    for part, name in ((left, 'front'), (right, 'back')):
        p = os.path.join(outdir, f'{base}-{name}.jpg')
        part.save(p, quality=92, optimize=True, progressive=True)
        paths.append((p, part.size))
    return paths

if __name__ == '__main__':
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    here = os.path.dirname(os.path.abspath(__file__))
    for p, size in split(sys.argv[1], sys.argv[2], os.path.join(here, '..', 'assets')):
        print(p, size, f'forhold {size[0]/size[1]:.4f} (3:4 = 0.7500)')
