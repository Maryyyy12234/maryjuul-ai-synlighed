# H1 — Bow Hoodie · overdel · Soft White

**Kollektion:** HOLLY · Collection 03
**Referencebillede (upload):** `references/ref-sheets/H1-holly-hoodie-white-ref.jpg`
**Format:** 3:2 (fx 1536 × 1024). Én generering.
**Output (deles bagefter):** `assets/holly-hoodie-white-front.jpg` og `assets/holly-hoodie-white-back.jpg`

## Prompt (kopiér)
```
Professional e-commerce ghost-mannequin product photo, side-by-side on ONE 3:2 landscape canvas. LEFT HALF: front view. RIGHT HALF: back view of the exact same garment. Each view centered in its own half, same scale, same height, the whole garment visible with generous margin on all sides, nothing crossing the vertical middle. Photorealistic studio product photography, realistic fabric texture, realistic stitching and seams, natural folds and weight, identical proportions, length and color in front and back view. Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow. No model, no visible mannequin, no hands, no text, no letters, no logo, no labels, no watermark, no props.

Garment (Soft White, #F3F0EA): women's cropped hoodie, medium-weight soft brushed sweatshirt fleece, matte texture. FRONT: center-front opening closed by EXACTLY THREE tied bows made of soft fabric tubing in the same color, evenly spaced from neckline to waist, small vertical keyhole openings between the bows (open, not covered, no underlayer). Attached hood. Long puff sleeves gathered at the shoulder seam, full balloon sleeves narrowing into ribbed cuffs. Curved princess seams defining the waist, gathered ruffled peplum hem below the waistline. BACK: clean plain back with the hood, curved back seams, gathered puff sleeve heads, ribbed cuffs and the same gathered peplum. ABSOLUTELY NO bow, tie, belt, sash or drawstring on the back.
```

## Undgå (negativ prompt)
```
model, person, hands, visible mannequin, text, letters, logo, brand name, watermark, label, props, flat lay, moodboard, collage, cropped garment, garment cut off at edges, different colors front and back, extra pockets, extra seams, two bows, four bows, buttons, zipper, closed front, underlayer, back bow, back tie, belt, sash, waist tie, drawstring on hoodie
```

## Må IKKE ændres – kvalitetstjek
- [ ] Præcis 3 sløjfer foran, jævnt fordelt
- [ ] Åbninger mellem sløjferne (ingen underlag)
- [ ] Hætte
- [ ] Pufærmer med rynk + ribkant
- [ ] Princess-sømme i taljen + rynket peplum
- [ ] Bagside helt glat: ingen sløjfe/bånd/bælte
- [ ] Samme proportioner som den godkendte Powder Blue-hoodie
- [ ] Forside venstre, bagside højre – samme produkt, samme længde, bredde og farve
- [ ] Hele tøjet synligt, intet krydser midten
- [ ] Ingen model, tekst, vandmærke eller logo

## Efter godkendelse
```
python3 duo-studio/tools/split_packshot.py <fil.png> holly-hoodie-white
node duo-studio/build.js
```
