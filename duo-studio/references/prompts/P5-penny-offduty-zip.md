# P5 — Off-Duty Zip Jacket · overdel · Midnight Navy

**Kollektion:** PENNY · Collection 02 · Look 03 The Off-Duty Set
**Referencebillede (upload):** `references/ref-sheets/P5-penny-offduty-zip-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/penny-offduty-zip-front.jpg` og `assets/penny-offduty-zip-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Midnight Navy, #1F2740): women's oversized boxy zip-up sweat jacket in midnight navy (#1F2740), structured loopback cotton fleece. High soft stand-up funnel collar (NO hood). Full-length front zipper with tonal navy tape and small metal puller. Dropped shoulders, wide slightly voluminous sleeves ending in ribbed cuffs, ribbed hem band. BACK: plain navy back with the high collar, same boxy width and length.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, hood, hoodie, sage green, green, grey, half zip, quarter zip, kangaroo pocket, logo, cropped
```

## Må IKKE ændres – kvalitetstjek
- [ ] Midnight Navy (ingen grøn/sage)
- [ ] Høj krave – INGEN hætte
- [ ] Lynlås hele vejen foran
- [ ] Sænkede skuldre, brede ærmer
- [ ] Ribkanter ved ærmer og nederst
- [ ] Ingen logo
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> penny-offduty-zip
node duo-studio/build.js
```
