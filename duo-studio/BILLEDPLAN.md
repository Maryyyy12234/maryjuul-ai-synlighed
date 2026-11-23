# DUO STUDIO – billedproduktionsplan (NOIR · PENNY · HOLLY)

Status: hjemmesiden er godkendt. Denne plan dækker kun billeder.
Alle AI-billeder er **koncepter** – ikke fotos af fremstillede varer – og skal fortsat mærkes sådan på siden.

## Værktøjsstatus (verificeret)
- Higgsfield **prisberegner virker**: `gpt_image_2_6` = **0,75 credits pr. billede** (testet i 3:2, 3:4 og 16:9).
- Higgsfield **generate_image og media_upload findes ikke** i denne session. Der kan altså hverken laves billeder eller uploades referencebilleder.
- Prisen er beregnet uden referencebilleder. Skal genereres med referencer (anbefalet for at holde designet præcist), skal prisen bekræftes igen, før der bruges credits.

---

## 1–4. Status på eksisterende billeder

### NOIR (Black = hovedfarve)
| Fil | Hvad | Status |
|---|---|---|
| alma-front, alma-back, alma-lace | Alma packshot + blonde | ✅ Korrekt – behold |
| freja-front, freja-back, freja-lace | Freja packshot + blonde | ✅ Korrekt – behold |
| cleo-pair, cleo-side, cleo-front, cleo-back, cleo-lace | Cleo 5 vinkler + blonde | ✅ Korrekt – behold |
| look-red, look-brunette, look-curls, look-bob | Kampagne på model (AI) | ❌ Erstattes: maven synlig, blonder foran på bukserne, sko med sten |
| noir-body1 (Black) | 5 kropstyper (AI) | ⚠️ Koncept – kan beholdes, lav opløsning |
| noir-body2/3, noir-allcolors | Chocolate / Midnight Navy (AI) | ⚠️ Kun koncept – ikke købsklare |

**Mangler:** korrekte kampagnebilleder på model (Black).

### PENNY (3 sæt · 6 dele · 12 front/back-visninger)
| Fil | Hvad | Status |
|---|---|---|
| io2-l1, io2-l1top, io2-l1pants | Look 01 på model (AI-reference) | ✅ Godkendt reference – behold som modelbillede |
| io2-d-neck, io2-d-logo1, io2-d-stripe | Look 01 detaljer | ✅ Behold som konceptdetaljer |
| io2-l2, io2-l2top, io2-l2pants | Look 02 på model | ❌ Erstattes: toppen viser maven |
| io2-d-boat, io2-d-hiplogo2 | Look 02 detaljer | ✅ Behold |
| io2-d-piping | Piping close-up | ❌ Erstattes: piping vist på **bordeaux** stof, bukserne er chocolate |
| io-softls, io-softls-back | Soft Fit top fra tidligere board | ❌ Erstattes af nye packshots (pasform ikke bekræftet) |
| penny-l3, penny-l3top, penny-l3pants, penny-d-zip, penny-d-stripe3 | Look 03 navy (udsnit af board) | ⚠️ Korrekt design, men lav opløsning – reference indtil nye billeder |
| penny-body1 / 2 / 3 | Kropstype-rækker | ⚠️ 1: synlig snøre i bukserne · ❌ 2: maven synlig · ✅ 3: ok |
| penny-hero | Forsidecollage af board-modeller | ⚠️ Erstattes når nye modelbilleder findes |
| io2-l3*, io2-d-zip, io2-d-stripe3, io2-d-rib3, io2-hero | Sage Green Look 03 | 🚫 Forældet – bruges ikke på siden |
| io-* (hoodie, halfzip, shorts, …) | Gamle 8 konceptstyles | 🚫 Forældet – bruges ikke på siden |

**Mangler (12):** `penny-everywhere-tee-front/back`, `penny-everywhere-pants-front/back`, `penny-softfit-top-front/back`, `penny-softfit-pants-front/back`, `penny-offduty-zip-front/back`, `penny-offduty-pants-front/back` (.jpg)

### HOLLY (1 sæt · 2 dele · 3 farver · 12 front/back-visninger)
| Fil | Hvad | Status |
|---|---|---|
| holly-white / blue / wine | Model, regular (udsnit) | ⚠️ Korrekt design, meget lav opløsning |
| holly-body1 / 2 / 3 | 5 kropstyper pr. farve | ⚠️ Korrekt design, lav opløsning |
| holly-d-bows-*, holly-d-back-*, holly-d-waist-*, holly-d-fabric-* | Detaljer pr. farve | ⚠️ Korrekte, lav opløsning |

**Mangler (12):** `holly-hoodie-{white|blue|wine}-front/back`, `holly-pants-{white|blue|wine}-front/back` (.jpg)

Opdateret liste over hver plads kan ses på siden under `#billeder`.

---

## 5. Hvad hver generering skal indeholde

**Format og opdeling:** packshots laves i **3:2 med forside venstre og bagside højre**. Hver halvdel er præcis **3:4**, så én generering giver to filer. Opdelingen sker kun ved **beskæring på midten** – ingen skalering eller strækning. Står tøjet skævt i forhold til midten, tilføjes baggrund i stedet for at ændre proportioner.

**Fælles regler (sættes i hvert prompt):** samme baggrund `#B8A798` (varm taupe), blødt diffust studielys, ghost mannequin, intet model, ingen tekst i billedet, **intet logo** (det originale DUO STUDIO-logo sættes på bagefter i den rigtige placering, så AI ikke opfinder et forkert logo).

### A. Packshots – SKAL laves (12 genereringer → 24 filer)

| # | Fil (venstre / højre) | Indhold |
|---|---|---|
| P1 | penny-everywhere-tee-front / -back | Oversized boxy tee, Butter Yellow, dyb bordeaux ribkant i halsen, sænkede skuldre, brede ærmer, længde under hoften. Glat bagside. |
| P2 | penny-everywhere-pants-front / -back | Ekstra vide bukser, creme med fine lodrette bordeaux striber, blød elastisk talje, **ingen synlig snøre**, diskrete sidelommer, bagside uden lommer. |
| P3 | penny-softfit-top-front / -back | Kropsnær langærmet top, dyb bordeaux, bred bådudskæring, smalle ærmer, let taljeret, **længde der dækker maven (til hoften)**. |
| P4 | penny-softfit-pants-front / -back | Ekstra vide bukser, chocolate brown, **tynd creme piping langs ydersømmen**, elastisk talje uden synlig snøre, sidelommer. |
| P5 | penny-offduty-zip-front / -back | Oversized boxy ziptrøje, **Midnight Navy**, høj blød krave, tonal lynlås hele vejen, sænkede skuldre, ribkanter ved ærmer og nederst. Ingen hætte. |
| P6 | penny-offduty-pants-front / -back | Ekstra vide bukser, Midnight Navy med fine lodrette lysere striber, elastisk talje uden synlig snøre, diskrete lommer. |
| H1–H3 | holly-hoodie-{white,blue,wine}-front / -back | Hoodie med **præcis tre bundne sløjfer foran med små åbninger imellem** (som referencen – ikke lukket), pufærmer med rynk, markeret talje med let peplum, hætte. Bagside: glat med hætte og peplum. Én farve pr. generering. |
| H4–H6 | holly-pants-{white,blue,wine}-front / -back | Ekstra vide sweatbukser, elastisk talje med **én bundet snøre-sløjfe foran** (den er en del af designet her), sidelommer. Én farve pr. generering. |

### B. Detaljer – anbefales (4 genereringer)
| # | Indhold | Erstatter |
|---|---|---|
| D1 | Close-up af creme piping på **chocolate** sweatstof | io2-d-piping |
| D2–D4 | HOLLY detaljeark pr. farve i 2×2: sløjfer foran, peplum bagfra, sløjfe i taljen, stofstruktur → beskæres til 4 filer | holly-d-* (lav opløsning) |

### C. Modeller og kropstyper – anbefales (10 genereringer)
| # | Indhold | Erstatter |
|---|---|---|
| M1–M4 | NOIR kampagne, Black: Alma lang nok til at dække maven, blonde **kun i siderne**, Freja med blonde **kun langs ydersømmen**, Cleo **uden sten**, små sølvspænder. 4 forskellige modeller/kropstyper. | look-red, look-brunette, look-curls, look-bob |
| M5 | PENNY Look 02 på model, top der dækker maven | io2-l2, io2-l2top, io2-l2pants |
| M6–M7 | PENNY kropstype-rækker Look 01 og Look 02 (5 kroppe, 16:9): petite, curvy, regular, plus, tall | penny-body1, penny-body2 |
| M8–M10 | HOLLY kropstype-rækker i Soft White, Powder Blue og Cherry Wine (16:9) – præcis tre sløjfer på alle | holly-body1/2/3 |

---

## 6. Pris (verificeret 0,75 credits pr. generering)

| Pakke | Genereringer | Credits |
|---|---|---|
| A. Packshots PENNY (P1–P6) | 6 | **4,50** |
| A. Packshots HOLLY (H1–H6) | 6 | **4,50** |
| B. Detaljer (D1–D4) | 4 | 3,00 |
| C. Modeller og kropstyper (M1–M10) | 10 | 7,50 |
| **I alt** | **26** | **19,50** |

Buffer: regn med ca. 20 % ekstra (ca. 4 credits) til at lave et billede om, hvis kontrollen nedenfor afviser det. Ingen genereringer sker uden godkendelse af den konkrete pris.

**Minimum for at få alle 24 front/back-visninger:** pakke A = 12 genereringer = **9,00 credits**.

---

## Kvalitetskontrol før et billede godkendes
- Samme antal sløjfer (Holly: præcis 3 foran + 1 i taljen på bukserne).
- Samme syninger, udskæringer, piping- og stribeplacering som referencen.
- Bukseform: ekstra vid, ingen ændring mellem forside og bagside.
- Ingen synlig snøre på PENNY-bukser. Ingen sten på Cleo.
- Ingen AI-logoer (originalt logo påføres bagefter).
- Realistiske kropsproportioner, naturlig hud, ingen forvrængede hænder.
- Farver matcher: Butter Yellow, Burgundy, Chocolate, Cream, Midnight Navy, Soft White, Powder Blue, Cherry Wine.

## Sådan kommer billederne på siden
1. Gem filerne i `duo-studio/assets/` med navnene ovenfor (.jpg).
2. Kør `node build.js`.
3. Billederne vises automatisk forrest i galleriet. Tjek `#billeder`.
