# DUO STUDIO – nye billeder i fuld opløsning (v2)

**Hvorfor:** Modelbillederne og detaljerne på siden er udsnit fra gamle moodboards (270–490 px brede). De vises i 400–700 px og bliver derfor slørede. AI-opskalering hjælper lidt, men nye billeder i fuld opløsning er den rigtige løsning.

**Værktøj:** ChatGPT (gratis/abonnement). **Format: 2:3 lodret (1024 × 1536)** for modeller, **1:1** for detaljer.
**Upload altid referencen** (packshot fra `assets/`) sammen med prompten, så designet holdes præcist.

## Fælles regler (står i alle prompts)
- Fotorealistisk, editorial e-commerce, blødt dagslys, rolig varm taupe/beige studiobaggrund (#B8A798–#D8CEC3).
- Én model, hele kroppen synlig, naturlig hud, naturlige hænder.
- **Ingen tekst, intet logo, ingen bogstaver, intet vandmærke** (det originale DUO STUDIO-logo sættes på bagefter).

## Prioritet 1 – erstatter de mest slørede billeder

### H-M1 / H-M2 / H-M3 · Holly på model (Soft White / Powder Blue / Cherry Wine)
Upload: `assets/holly-hoodie-<farve>-front.jpg` + `assets/holly-pants-<farve>-front.jpg`
```
Editorial full-body fashion photo of one woman wearing the exact hoodie and wide-leg pants from the reference images, in [COLOUR] (#HEX) only. Hoodie: EXACTLY THREE tied bows at the centre front with small open gaps between them, hood up behind the head lying flat, puff sleeves gathered at the shoulder with ribbed cuffs, princess seams and a short gathered peplum at the waist. Pants: extra wide-leg sweatpants with an elastic waist and ONE visible drawstring tied in a bow. Hoodie covers the stomach. Relaxed natural pose, front view, white sneakers. Warm taupe seamless studio background, soft daylight, photorealistic fabric texture. No text, no logo, no letters, no watermark. Portrait 2:3.
```
Erstatter: `holly-white.jpg`, `holly-blue.jpg`, `holly-wine.jpg`

### P-M1 / P-M2 / P-M3 · Penny-sæt på model
Upload: packshots af top + bukser for looket (`assets/penny-…-front.jpg`)
```
Editorial full-body fashion photo of one woman wearing the exact two-piece set from the reference images: [LOOK]. Relaxed confident pose, front view, minimal white sneakers or bare feet. The top covers the stomach. No visible drawstring on the pants. Warm cream seamless studio background, soft daylight, photorealistic fabric. No text, no logo, no letters, no watermark. Portrait 2:3.
```
- Look 01: Butter Yellow oversized tee with deep burgundy rib neckline + cream extra wide pants with thin burgundy vertical stripes → erstatter `io2-l1.jpg`
- Look 02: deep burgundy fitted long-sleeve boat-neck top (covers the stomach) + chocolate brown extra wide pants with thin cream piping on the outer side seam → erstatter `io2-l2.jpg`
- Look 03: midnight navy boxy zip jacket with high collar (no hood) + midnight navy extra wide pants with fine lighter vertical pinstripes → erstatter `penny-l3.jpg` *(lav først P6-packshot)*

### N-M1 · Noir på model (Black)
Upload: `assets/alma-front.jpg`, `assets/freja-front.jpg`, `assets/cleo-pair.jpg`
```
Editorial full-body evening fashion photo of one woman wearing the exact black outfit from the reference images: a long tailored black vest with a deep V-neck and floral lace panels ONLY at the sides, long enough to cover the stomach; wide black tailored trousers with lace panels ONLY along the outer side seams (never on the front); pointed black slingback heels with black lace panels and small silver buckles, NO stones or crystals. Elegant calm pose, dark warm studio background, soft directional light. No text, no logo, no watermark. Portrait 2:3.
```
Erstatter: kampagnebillederne `look-*.jpg` (som har kendte fejl)

## Prioritet 2 – detaljer (1:1)
```
Macro close-up product detail photo of [DETAIL] from the reference image, same colour and fabric, soft daylight, shallow depth of field, photorealistic texture. No text, no logo, no watermark. Square 1:1.
```
- Holly: "the three tied front bows with open gaps between them" → `holly-d-bows-<farve>.jpg`
- Holly: "the single tied drawstring bow at the waist of the wide pants" → `holly-d-waist-<farve>.jpg`
- Penny: "the thin cream piping along the outer seam of chocolate brown pants" → `io2-d-piping.jpg`
- Penny: "the deep burgundy rib neckline of the butter yellow tee" → `io2-d-neck.jpg`
- Penny: "the fine burgundy vertical stripes on cream fabric" → `io2-d-stripe.jpg`

## Stadig mangler
- **P6 Off-Duty Pants packshot** (se prompt i `prompts/P6-penny-offduty-pants.md` + rettelse i chatten: ægte Midnight Navy, ingen pressefolder).

## Kvalitetstjek før godkendelse
- Holly: præcis 3 sløjfer foran med åbninger · glat bagside · 1 sløjfe på bukserne
- Penny: ingen synlig snøre · toppe dækker maven · aldrig Sage Green
- Noir: blonde kun i siderne/ydersøm · ingen sten på Cleo
- Ingen tekst eller AI-logo i billedet
