# P4 — Soft Fit Wide Pants · underdel · Chocolate Brown med Cream piping

**Kollektion:** PENNY · Collection 02 · Look 02 The Soft Fit Set
**Referencebillede (upload):** `references/ref-sheets/P4-penny-softfit-pants-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/penny-softfit-pants-front.jpg` og `assets/penny-softfit-pants-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Chocolate Brown med Cream piping, #4B2F23 / #F0E6D2): women's extra wide-leg trousers in deep chocolate brown (#4B2F23), soft double-knit with heavy fluid drape. A single THIN cream (#F0E6D2) piping runs along each outer side seam from waistband to hem. Soft elastic waistband with NO visible drawstring. In-seam side pockets. Very wide, long legs reaching the floor line. BACK: same waistband, cream piping visible on both outer side seams, no back pockets, identical leg width and length.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, burgundy, red, thick stripe, double stripe, piping on front center, visible drawstring, cargo pockets, back pockets, cuffs, joggers, logo
```

## Må IKKE ændres – kvalitetstjek
- [ ] Chocolate Brown (ikke bordeaux)
- [ ] TYND creme piping langs YDERSØMMEN på begge ben
- [ ] Ekstra vide, lange ben med flot fald
- [ ] Elastisk talje uden synlig snøre
- [ ] Ingen baglommer
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> penny-softfit-pants
node duo-studio/build.js
```
