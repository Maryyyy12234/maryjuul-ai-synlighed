# P1 — Everywhere Tee · overdel · Butter Yellow med Burgundy halskant

**Kollektion:** PENNY · Collection 02 · Look 01 The Everywhere Set
**Referencebillede (upload):** `references/ref-sheets/P1-penny-everywhere-tee-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/penny-everywhere-tee-front.jpg` og `assets/penny-everywhere-tee-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Butter Yellow med Burgundy halskant, #F1DD8E / #6E1A26): women's oversized boxy T-shirt in soft butter yellow (#F1DD8E), heavyweight cotton-modal jersey with fluid drape. Deep burgundy (#6E1A26) ribbed crew-neck collar band. Dropped shoulders, wide relaxed elbow-length short sleeves with plain hem, straight boxy body ending below the hip. The left chest area is left completely plain and empty (a logo is added later). BACK: plain butter yellow back with the burgundy collar band visible at the back neck, same width and length.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, logo, chest print, pocket, contrast sleeve hem, v-neck, cropped tee, fitted tee, white, cream
```

## Må IKKE ændres – kvalitetstjek
- [ ] Butter Yellow krop
- [ ] Bordeaux ribkant KUN i halsen
- [ ] Sænkede skuldre, brede ærmer
- [ ] Boxy, lang nok til at dække maven
- [ ] Venstre bryst tomt (logo påføres bagefter)
- [ ] Ingen print/tekst
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> penny-everywhere-tee
node duo-studio/build.js
```
