# P6 — Off-Duty Stripe Pants · underdel · Midnight Navy med fine striber

**Kollektion:** PENNY · Collection 02 · Look 03 The Off-Duty Set
**Referencebillede (upload):** `references/ref-sheets/P6-penny-offduty-pants-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/penny-offduty-pants-front.jpg` og `assets/penny-offduty-pants-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Midnight Navy med fine striber, #1F2740): women's relaxed extra wide-leg trousers in midnight navy (#1F2740) with fine evenly spaced vertical light pinstripes running the full length, soft fabric matching the navy zip jacket. Soft elastic waistband with NO visible drawstring. Discreet in-seam side pockets. Very wide, long legs reaching the floor line. BACK: same waistband, no back pockets, stripes continuing straight, identical leg width and length.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, sage green, green, grey, thick stripes, horizontal stripes, visible drawstring, cargo pockets, back pockets, cuffs, joggers, logo
```

## Må IKKE ændres – kvalitetstjek
- [ ] Midnight Navy med FINE lodrette striber
- [ ] Ekstra vide, lange ben
- [ ] Elastisk talje uden synlig snøre
- [ ] Diskrete sidelommer
- [ ] Ingen baglommer
- [ ] Samme farve som ziptrøjen
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> penny-offduty-pants
node duo-studio/build.js
```
