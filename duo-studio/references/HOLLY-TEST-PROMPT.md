# Testbillede: HOLLY Bow Hoodie · Powder Blue

**Værktøj:** et billedværktøj, der kan bruge et referencebillede (fx Higgsfield gpt_image_2_6, Midjourney med image reference, ChatGPT-billeder).
**Reference:** upload `references/holly-powder-blue-ref.jpg`.
**Format:** 3:2 (fx 1536 × 1024 px). **Én generering.**

## Prompt (kopiér)

```
Professional e-commerce ghost-mannequin product photo, side-by-side on one 3:2 canvas.
LEFT HALF: front view. RIGHT HALF: back view of the exact same hoodie. Each garment centered in its own half, same scale, same height, generous margin, nothing crossing the middle.

Garment: women's cropped hoodie in soft powder blue (#B9CCE3), medium-weight brushed sweatshirt fleece, matte texture.
FRONT: center-front opening closed by EXACTLY THREE tied bows made of soft fabric tubing in the same powder blue, evenly spaced from neckline to waist; small vertical keyhole openings between the bows (open, not covered, no underlayer). Attached hood lying flat. Long puff sleeves gathered at the shoulder seam, narrowing to ribbed cuffs. Fitted defined waist with a short flared peplum hem.
BACK: clean back with the hood, center back seam, gathered puff sleeve heads, and the same peplum hem. No bows on the back.

Realistic stitching, realistic fabric weight and folds, consistent proportions between front and back.
Background: smooth seamless warm taupe studio backdrop (#B8A798), soft diffused even lighting, subtle natural shadow under each garment.
No model, no mannequin visible, no hands, no text, no logo, no labels, no watermark, no props.
```

## Negativ / undgå (hvis værktøjet har et felt til det)
```
model, person, skin, mannequin, text, logo, letters, watermark, two bows, four bows, buttons, zipper, closed front, underlayer, extra pockets, different colors, sage, white, cropped midriff on a person, moodboard, collage, flat lay
```

## Kvalitetstjek før godkendelse
- [ ] Præcis **3 sløjfer** foran, med åbninger imellem
- [ ] Hætte, pufærmer, ribkant ved ærmet og let peplum – både forfra og bagfra
- [ ] Samme længde, bredde og farve på forside og bagside
- [ ] Ingen sløjfer på bagsiden, ingen lynlås eller knapper
- [ ] Ingen tekst eller logo i billedet (det originale logo påføres bagefter)
- [ ] Ligner et produktfoto, ikke et moodboard
- [ ] Billedet er 3:2, og intet af tøjet krydser midten

## Når billedet er godkendt
Læg filen i projektet og kør:
```
python3 duo-studio/tools/split_packshot.py <fil.png> holly-hoodie-blue
node duo-studio/build.js
```
Det giver `holly-hoodie-blue-front.jpg` og `holly-hoodie-blue-back.jpg` (begge 3:4, kun beskåret – ikke strakt), og de vises automatisk på produktsiden. Billedet er stadig **konceptmateriale**.
