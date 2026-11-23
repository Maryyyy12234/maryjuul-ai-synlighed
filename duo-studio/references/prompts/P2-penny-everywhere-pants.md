# P2 — Everywhere Stripe Pants · underdel · Cream med Burgundy striber

**Kollektion:** PENNY · Collection 02 · Look 01 The Everywhere Set
**Referencebillede (upload):** `references/ref-sheets/P2-penny-everywhere-pants-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/penny-everywhere-pants-front.jpg` og `assets/penny-everywhere-pants-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Cream med Burgundy striber, #F0E6D2 / #6E1A26): women's extra wide-leg lounge trousers in warm cream (#F0E6D2) soft woven/fine-knit fabric with thin evenly spaced vertical burgundy (#6E1A26) pinstripes running the full length. Wide soft elastic waistband with NO visible drawstring (hidden adjustment inside). Discreet in-seam side pockets. Very wide, long, fluid legs reaching the floor line. BACK: same waistband, no back pockets, stripes continuing straight, identical leg width and length.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, visible drawstring, drawstring bow, aglets, thick stripes, horizontal stripes, checks, cargo pockets, back pockets, cuffs, tapered legs, logo
```

## Må IKKE ændres – kvalitetstjek
- [ ] Creme bund med TYNDE lodrette bordeaux striber
- [ ] Ekstra vide, lange ben
- [ ] Elastisk talje UDEN synlig snøre
- [ ] Diskrete sidelommer
- [ ] Ingen baglommer
- [ ] Striberne lige og jævne forfra og bagfra
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> penny-everywhere-pants
node duo-studio/build.js
```
