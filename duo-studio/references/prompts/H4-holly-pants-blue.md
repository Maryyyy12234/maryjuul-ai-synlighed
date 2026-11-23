# H4 — Wide Pants · underdel · Powder Blue

**Kollektion:** HOLLY · Collection 03
**Referencebillede (upload):** `references/ref-sheets/H4-holly-pants-blue-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/holly-pants-blue-front.jpg` og `assets/holly-pants-blue-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Powder Blue, #B9CCE3): women's extra wide-leg lounge pants, medium-weight soft brushed sweatshirt fleece, matte texture, same fabric as the matching bow hoodie. Wide soft elastic waistband with a fabric drawstring tied in ONE neat bow at center front, small metal-tipped aglets. Discreet in-seam side pockets. Very wide, long, relaxed straight-falling legs reaching the floor line, soft fluid drape, plain hems. BACK: same elastic waistband without drawstring, clean back, no back pockets, identical leg width and length as the front.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, cargo pockets, back pockets, cuffs, joggers, tapered legs, cropped legs, slit, belt loops, zipper fly, stripes, piping
```

## Må IKKE ændres – kvalitetstjek
- [ ] Ekstra vide, lange ben
- [ ] Bred elastisk talje
- [ ] Snøre bundet i ÉN sløjfe foran (synlig – det er Holly-designet)
- [ ] Diskrete sidelommer i sømmen
- [ ] Glat bagside uden lommer
- [ ] Samme benbredde/længde forfra og bagfra
- [ ] Samme farve og stof som den godkendte Powder Blue-hoodie
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> holly-pants-blue
node duo-studio/build.js
```
