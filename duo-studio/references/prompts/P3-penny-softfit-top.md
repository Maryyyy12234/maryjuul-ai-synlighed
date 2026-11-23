# P3 — Soft Fit Long Sleeve · overdel · Burgundy

**Kollektion:** PENNY · Collection 02 · Look 02 The Soft Fit Set
**Referencebillede (upload):** `references/ref-sheets/P3-penny-softfit-top-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/penny-softfit-top-front.jpg` og `assets/penny-softfit-top-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Burgundy, #6E1A26): women's fitted long-sleeve top in deep burgundy (#6E1A26), soft cotton-modal stretch interlock jersey, smooth matte surface. Wide elegant boat neckline, long slim sleeves, gently shaped waist, body length reaching the high hip so it covers the stomach (NOT cropped). BACK: plain back with the same wide boat neckline, same length.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, cropped top, bare midriff, crew neck, v-neck, off-shoulder, puff sleeves, ribbing, logo, brown, red
```

## Må IKKE ændres – kvalitetstjek
- [ ] Dyb bordeaux
- [ ] Bred bådudskæring
- [ ] Lange, smalle ærmer
- [ ] Kropsnær men ikke stram
- [ ] Længde til hoften – IKKE cropped, dækker maven
- [ ] Ingen logo eller tekst
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> penny-softfit-top
node duo-studio/build.js
```
