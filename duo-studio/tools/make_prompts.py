import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
A = ROOT + '/assets/'
REF = ROOT + '/references/'
PDIR = REF + 'prompts/'
SDIR = REF + 'ref-sheets/'
os.makedirs(PDIR, exist_ok=True); os.makedirs(SDIR, exist_ok=True)
FB = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 18)
FS = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 14)
SRC_BLUE = REF + 'source/holly-hoodie-blue-front-back.png'

def sheet(name, title, items):
    """Referenceark: originale godkendte billeder side om side (ingen opskalering ud over visning)."""
    H = 420
    ims = []
    for it in items:
        path, label = it[0], it[1]
        im = Image.open(path).convert('RGB')
        if len(it) > 2:
            l, t, r, b = it[2]; im = im.crop((int(im.width*l), int(im.height*t), int(im.width*r), int(im.height*b)))
        ims.append((im.resize((round(im.width * H / im.height), H), Image.LANCZOS), label))
    W = max(sum(i.width for i, _ in ims) + 20 * (len(ims) + 1), 900)
    c = Image.new('RGB', (W, H + 110), '#F5F0E9'); d = ImageDraw.Draw(c)
    while d.textlength(title, font=FB) > W - 40: title = title[:-2]
    d.text((20, 14), title, fill='#171411', font=FB)
    x = 20
    for im, label in ims:
        c.paste(im, (x, 48)); d.text((x, H + 56), label, fill='#171411', font=FS); x += im.width + 20
    out = SDIR + name + '.jpg'; c.save(out, quality=90)
    return 'references/ref-sheets/' + name + '.jpg'

COMMON = ("Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. "
          "LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, "
          "same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. "
          "Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, "
          "identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), "
          "soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, "
          "no labels, no watermark, no props.")
NEG_COMMON = "model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams"

HOLLY_HOODIE = ("women's cropped hoodie, medium-weight soft brushed sweatshirt fleece, matte texture. "
    "FRONT: center-front opening closed by EXACTLY THREE tied bows made of soft fabric tubing in the same color, evenly spaced from neckline to waist, "
    "small vertical keyhole openings between the bows (open, not covered, no underlayer). Attached hood. Long puff sleeves gathered at the shoulder seam, "
    "full balloon sleeves narrowing into ribbed cuffs. Curved princess seams defining the waist, gathered ruffled peplum hem below the waistline. "
    "BACK: clean plain back with the hood, curved back seams, gathered puff sleeve heads, ribbed cuffs and the same gathered peplum. "
    "ABSOLUTELY NO bow, tie, belt, sash or drawstring on the back.")
HOLLY_PANTS = ("women's extra wide-leg lounge pants, medium-weight soft brushed sweatshirt fleece, matte texture, same fabric as the matching bow hoodie. "
    "Wide soft elastic waistband with a fabric drawstring tied in ONE neat bow at center front, small metal-tipped aglets. Discreet in-seam side pockets. "
    "Very wide, long, relaxed straight-falling legs reaching the floor line, soft fluid drape, plain hems. "
    "BACK: same elastic waistband without drawstring, clean back, no back pockets, identical leg width and length as the front.")

P = [
  dict(id='H1', coll='HOLLY · Collection 03', part='Bow Hoodie · overdel', color='Soft White', hex='#F3F0EA', out='holly-hoodie-white',
       garment=HOLLY_HOODIE, keep=['Præcis 3 sløjfer foran, jævnt fordelt','Åbninger mellem sløjferne (ingen underlag)','Hætte','Pufærmer med rynk + ribkant','Princess-sømme i taljen + rynket peplum','Bagside helt glat: ingen sløjfe/bånd/bælte','Samme proportioner som den godkendte Powder Blue-hoodie'],
       neg='two bows, four bows, buttons, zipper, closed front, underlayer, back bow, back tie, belt, sash, waist tie, drawstring on hoodie',
       refs=[(SRC_BLUE,'GODKENDT DESIGN · Powder Blue (form/konstruktion)'),(A+'holly-white.jpg','FARVE · Soft White (model)'),(A+'holly-d-bows-white.jpg','FARVE · Soft White sløjfer')]),
  dict(id='H2', coll='HOLLY · Collection 03', part='Bow Hoodie · overdel', color='Cherry Wine', hex='#651626', out='holly-hoodie-wine',
       garment=HOLLY_HOODIE, keep=['Præcis 3 sløjfer foran, jævnt fordelt','Åbninger mellem sløjferne (ingen underlag)','Hætte','Pufærmer med rynk + ribkant','Princess-sømme i taljen + rynket peplum','Bagside helt glat: ingen sløjfe/bånd/bælte','Samme proportioner som den godkendte Powder Blue-hoodie'],
       neg='two bows, four bows, buttons, zipper, closed front, underlayer, back bow, back tie, belt, sash, waist tie, drawstring on hoodie, bright red, purple',
       refs=[(SRC_BLUE,'GODKENDT DESIGN · Powder Blue (form/konstruktion)'),(A+'holly-wine.jpg','FARVE · Cherry Wine (model)'),(A+'holly-d-bows-wine.jpg','FARVE · Cherry Wine sløjfer')]),
  dict(id='H3', coll='HOLLY · Collection 03', part='Wide Pants · underdel', color='Soft White', hex='#F3F0EA', out='holly-pants-white',
       garment=HOLLY_PANTS, keep=['Ekstra vide, lange ben','Bred elastisk talje','Snøre bundet i ÉN sløjfe foran (synlig – det er Holly-designet)','Diskrete sidelommer i sømmen','Glat bagside uden lommer','Samme benbredde/længde forfra og bagfra','Samme stof og farve som Soft White-hoodien'],
       neg='cargo pockets, back pockets, cuffs, joggers, tapered legs, cropped legs, slit, belt loops, zipper fly, stripes, piping',
       refs=[(A+'holly-white.jpg','MODEL · Soft White'),(A+'holly-d-waist-white.jpg','TALJE · sløjfe foran'),(A+'holly-d-fabric-white.jpg','STOF')]),
  dict(id='H4', coll='HOLLY · Collection 03', part='Wide Pants · underdel', color='Powder Blue', hex='#B9CCE3', out='holly-pants-blue',
       garment=HOLLY_PANTS, keep=['Ekstra vide, lange ben','Bred elastisk talje','Snøre bundet i ÉN sløjfe foran (synlig – det er Holly-designet)','Diskrete sidelommer i sømmen','Glat bagside uden lommer','Samme benbredde/længde forfra og bagfra','Samme farve og stof som den godkendte Powder Blue-hoodie'],
       neg='cargo pockets, back pockets, cuffs, joggers, tapered legs, cropped legs, slit, belt loops, zipper fly, stripes, piping',
       refs=[(A+'holly-blue.jpg','MODEL · Powder Blue'),(A+'holly-d-waist-blue.jpg','TALJE · sløjfe foran'),(A+'holly-hoodie-blue-front.jpg','FARVE/STOF · godkendt hoodie')]),
  dict(id='H5', coll='HOLLY · Collection 03', part='Wide Pants · underdel', color='Cherry Wine', hex='#651626', out='holly-pants-wine',
       garment=HOLLY_PANTS, keep=['Ekstra vide, lange ben','Bred elastisk talje','Snøre bundet i ÉN sløjfe foran (synlig – det er Holly-designet)','Diskrete sidelommer i sømmen','Glat bagside uden lommer','Samme benbredde/længde forfra og bagfra','Samme stof og farve som Cherry Wine-hoodien'],
       neg='cargo pockets, back pockets, cuffs, joggers, tapered legs, cropped legs, slit, belt loops, zipper fly, stripes, piping, bright red, purple',
       refs=[(A+'holly-wine.jpg','MODEL · Cherry Wine'),(A+'holly-d-waist-wine.jpg','TALJE · sløjfe foran'),(A+'holly-d-fabric-wine.jpg','STOF')]),
  dict(id='P1', coll='PENNY · Collection 02 · Look 01 The Everywhere Set', part='Everywhere Tee · overdel', color='Butter Yellow med Burgundy halskant', hex='#F1DD8E / #6E1A26', out='penny-everywhere-tee',
       garment=("women's oversized boxy T-shirt in soft butter yellow (#F1DD8E), heavyweight cotton-modal jersey with fluid drape. Deep burgundy (#6E1A26) ribbed crew-neck collar band. "
                "Dropped shoulders, wide relaxed elbow-length short sleeves with plain hem, straight boxy body ending below the hip. The left chest area is left completely plain and empty (a logo is added later). "
                "BACK: plain butter yellow back with the burgundy collar band visible at the back neck, same width and length."),
       keep=['Butter Yellow krop','Bordeaux ribkant KUN i halsen','Sænkede skuldre, brede ærmer','Boxy, lang nok til at dække maven','Venstre bryst tomt (logo påføres bagefter)','Ingen print/tekst'],
       neg='logo, chest print, pocket, contrast sleeve hem, v-neck, cropped tee, fitted tee, white, cream',
       refs=[(A+'io2-l1top.jpg','MODEL · Look 01 tee (logo ignoreres)'),(A+'io2-d-neck.jpg','DETALJE · bordeaux halskant',(0,0,1,.55)),(A+'io2-l1.jpg','HELE LOOKET')]),
  dict(id='P2', coll='PENNY · Collection 02 · Look 01 The Everywhere Set', part='Everywhere Stripe Pants · underdel', color='Cream med Burgundy striber', hex='#F0E6D2 / #6E1A26', out='penny-everywhere-pants',
       garment=("women's extra wide-leg lounge trousers in warm cream (#F0E6D2) soft woven/fine-knit fabric with thin evenly spaced vertical burgundy (#6E1A26) pinstripes running the full length. "
                "Wide soft elastic waistband with NO visible drawstring (hidden adjustment inside). Discreet in-seam side pockets. Very wide, long, fluid legs reaching the floor line. "
                "BACK: same waistband, no back pockets, stripes continuing straight, identical leg width and length."),
       keep=['Creme bund med TYNDE lodrette bordeaux striber','Ekstra vide, lange ben','Elastisk talje UDEN synlig snøre','Diskrete sidelommer','Ingen baglommer','Striberne lige og jævne forfra og bagfra'],
       neg='visible drawstring, drawstring bow, aglets, thick stripes, horizontal stripes, checks, cargo pockets, back pockets, cuffs, tapered legs, logo',
       refs=[(A+'io2-l1pants.jpg','MODEL · Look 01 bukser',(0,.3,1,1)),(A+'io2-d-stripe.jpg','DETALJE · striber',(0,.62,.55,1)),(A+'io2-l1.jpg','HELE LOOKET')]),
  dict(id='P3', coll='PENNY · Collection 02 · Look 02 The Soft Fit Set', part='Soft Fit Long Sleeve · overdel', color='Burgundy', hex='#6E1A26', out='penny-softfit-top',
       garment=("women's fitted long-sleeve top in deep burgundy (#6E1A26), soft cotton-modal stretch interlock jersey, smooth matte surface. Wide elegant boat neckline, "
                "long slim sleeves, gently shaped waist, body length reaching the high hip so it covers the stomach (NOT cropped). "
                "BACK: plain back with the same wide boat neckline, same length."),
       keep=['Dyb bordeaux','Bred bådudskæring','Lange, smalle ærmer','Kropsnær men ikke stram','Længde til hoften – IKKE cropped, dækker maven','Ingen logo eller tekst'],
       neg='cropped top, bare midriff, crew neck, v-neck, off-shoulder, puff sleeves, ribbing, logo, brown, red',
       refs=[(A+'io2-l2top.jpg','MODEL · Look 02 top (OBS: skal være længere)'),(A+'io2-d-boat.jpg','DETALJE · bådudskæring'),(A+'io-softls.jpg','TIDLIGERE BOARD · længde/form')]),
  dict(id='P4', coll='PENNY · Collection 02 · Look 02 The Soft Fit Set', part='Soft Fit Wide Pants · underdel', color='Chocolate Brown med Cream piping', hex='#4B2F23 / #F0E6D2', out='penny-softfit-pants',
       garment=("women's extra wide-leg trousers in deep chocolate brown (#4B2F23), soft double-knit with heavy fluid drape. A single THIN cream (#F0E6D2) piping runs along each outer side seam from waistband to hem. "
                "Soft elastic waistband with NO visible drawstring. In-seam side pockets. Very wide, long legs reaching the floor line. "
                "BACK: same waistband, cream piping visible on both outer side seams, no back pockets, identical leg width and length."),
       keep=['Chocolate Brown (ikke bordeaux)','TYND creme piping langs YDERSØMMEN på begge ben','Ekstra vide, lange ben med flot fald','Elastisk talje uden synlig snøre','Ingen baglommer'],
       neg='burgundy, red, thick stripe, double stripe, piping on front center, visible drawstring, cargo pockets, back pockets, cuffs, joggers, logo',
       refs=[(A+'io2-l2pants.jpg','MODEL · Look 02 bukser'),(A+'io2-l2.jpg','HELE LOOKET'),(A+'io2-l2pants.jpg','DETALJE · creme piping langs ydersøm',(0,.55,1,1))]),
  dict(id='P5', coll='PENNY · Collection 02 · Look 03 The Off-Duty Set', part='Off-Duty Zip Jacket · overdel', color='Midnight Navy', hex='#1F2740', out='penny-offduty-zip',
       garment=("women's oversized boxy zip-up sweat jacket in midnight navy (#1F2740), structured loopback cotton fleece. High soft stand-up funnel collar (NO hood). "
                "Full-length front zipper with tonal navy tape and small metal puller. Dropped shoulders, wide slightly voluminous sleeves ending in ribbed cuffs, ribbed hem band. "
                "BACK: plain navy back with the high collar, same boxy width and length."),
       keep=['Midnight Navy (ingen grøn/sage)','Høj krave – INGEN hætte','Lynlås hele vejen foran','Sænkede skuldre, brede ærmer','Ribkanter ved ærmer og nederst','Ingen logo'],
       neg='hood, hoodie, sage green, green, grey, half zip, quarter zip, kangaroo pocket, logo, cropped',
       refs=[(A+'penny-l3top.jpg','MODEL · Look 03 ziptrøje'),(A+'penny-d-zip.jpg','DETALJE · krave og lynlås'),(A+'penny-l3.jpg','HELE LOOKET')]),
  dict(id='P6', coll='PENNY · Collection 02 · Look 03 The Off-Duty Set', part='Off-Duty Stripe Pants · underdel', color='Midnight Navy med fine striber', hex='#1F2740', out='penny-offduty-pants',
       garment=("women's relaxed extra wide-leg trousers in midnight navy (#1F2740) with fine evenly spaced vertical light pinstripes running the full length, soft fabric matching the navy zip jacket. "
                "Soft elastic waistband with NO visible drawstring. Discreet in-seam side pockets. Very wide, long legs reaching the floor line. "
                "BACK: same waistband, no back pockets, stripes continuing straight, identical leg width and length."),
       keep=['Midnight Navy med FINE lodrette striber','Ekstra vide, lange ben','Elastisk talje uden synlig snøre','Diskrete sidelommer','Ingen baglommer','Samme farve som ziptrøjen'],
       neg='sage green, green, grey, thick stripes, horizontal stripes, visible drawstring, cargo pockets, back pockets, cuffs, joggers, logo',
       refs=[(A+'penny-l3pants.jpg','MODEL · Look 03 bukser'),(A+'penny-d-stripe3.jpg','DETALJE · striber'),(A+'penny-l3.jpg','HELE LOOKET')]),
]

rows = []
for p in P:
    rs = sheet(p['id'] + '-' + p['out'] + '-ref', f"DUO STUDIO · {p['id']} · {p['part']} · {p['color']} · REFERENCE (konceptmateriale)", p['refs'])
    prompt = f"{COMMON}\n\nGarment ({p['color']}, {p['hex']}): {p['garment']}"
    keep = '\n'.join(f'- [ ] {k}' for k in p['keep'])
    md = f"""# {p['id']} — {p['part']} · {p['color']}

**Kollektion:** {p['coll']}
**Referencebillede (upload):** `{rs}`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/{p['out']}-front.jpg` og `assets/{p['out']}-back.jpg`

## Prompt (kopiér)
```
{prompt}
```

## Undgå (negativ prompt)
```
{NEG_COMMON}, {p['neg']}
```

## Må IKKE ændres – kvalitetstjek
{keep}
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> {p['out']}
node duo-studio/build.js
```
"""
    open(PDIR + f"{p['id']}-{p['out']}.md", 'w').write(md)
    rows.append((p, rs))

ov = ["# DUO STUDIO — 11 produktprompts (oversigt)\n",
      "Godkendt fast reference: **HOLLY Bow Hoodie · Powder Blue** (`references/source/holly-hoodie-blue-front-back.png`).",
      "11 genereringer → 22 visninger (front + back). Alle billeder er **konceptmateriale**. Generér én ad gangen og godkend før den næste.\n",
      "| # | Kollektion | Produktdel | Farve | Referenceark | Output front / back | Vigtigste tjek |", "|---|---|---|---|---|---|---|"]
for p, rs in rows:
    ov.append(f"| [{p['id']}](prompts/{p['id']}-{p['out']}.md) | {p['coll'].split(' ·')[0]} | {p['part']} | {p['color']} | `{rs.split('/')[-1]}` | `{p['out']}-front.jpg` / `{p['out']}-back.jpg` | {p['keep'][0]}; {p['keep'][1]} |")
ov += ["\n## Anbefalet rækkefølge",
       "1. H1, H2 (samme hoodie – direkte sammenlignelig med den godkendte Powder Blue)",
       "2. H4 (bukser i Powder Blue – matcher den godkendte hoodie), derefter H3, H5",
       "3. P1–P6 (ét look ad gangen: P1+P2, P3+P4, P5+P6)",
       "\n## Fælles regler i alle prompts",
       "- 3:2, forside venstre / bagside højre, hele tøjet synligt, ensartet taupe baggrund (#B8A798)",
       "- Fotorealistisk stof og syninger, samme proportioner i begge visninger",
       "- Ingen model, tekst, vandmærke eller AI-logo (det originale DUO STUDIO-logo påføres bagefter på P1/P2/P4/P5)",
       "\n## Bemærk",
       "- HOLLY-bukser har en **synlig** snøre-sløjfe i taljen (det er Holly-designet). PENNY-bukser har **skjult** justering.",
       "- P3: referencebilledet viser maven – prompten kræver længde til hoften.",
       "- P4: piping-nærbilledet i de gamle billeder er bordeaux – bukserne skal være chocolate."]
open(REF + 'PROMPTS-OVERSIGT.md', 'w').write('\n'.join(ov) + '\n')
print('ok', len(rows))
