# Kassesystemer (POS-integration)

Status: november 2026. Shopify er den eneste integration, der er bygget. De andre er markeret "Kommer senere" og kan ikke forbindes.

## 1. Hvad virker – og hvad er kun testet mod en simuleret Shopify

| Del | Status |
|---|---|
| Fælles POS-model (forbindelse, lokation, produkt, variant, ordre, linje, betalingsstatus, refusion, lagerstatus, synk-kørsel, webhook-hændelse) | ✅ Bygget + testet |
| Shopify OAuth: state, HMAC-tjek, butiksadresse-tjek, udløbende tokens, automatisk fornyelse | ✅ Bygget + testet mod simuleret Shopify |
| Tokens krypteret i hvile (AES-256-GCM, nøgle uden for databasen) | ✅ Bygget + testet |
| Første import, løbende synk, afstemning, paginering, throttling, genforsøg ved 5xx | ✅ Bygget + testet mod simuleret Shopify |
| Webhooks: signaturtjek, dubletkontrol, kø med genforsøg, gammel version overskriver ikke ny | ✅ Bygget + testet |
| Varianter (størrelse/farve), flere lokationer, rabatter, moms, retur, delvis retur, annullering, tidszone | ✅ Bygget + testet |
| Fordeling: LAGER, PULS, INDSIGT, OVERBLIK | ✅ Bygget + testet |
| Ejeren vælger, hvilke apps der får data; afbryd (med/uden sletning) | ✅ Bygget + testet |
| 4 workers: Sales Monitor, Inventory Monitor, Business Insights, Operations | ✅ Bygget + testet (regler i kode, ingen sprogmodel) |
| Integrationscenter (desktop + mobil) | ✅ Bygget, tjekket med skærmbilleder |
| Database-tabeller + RLS | ✅ Testet i lokal Postgres 16 |
| **Test mod en rigtig Shopify-butik** | ❌ **Ikke gjort.** Kræver Partner-app og nøgler (se afsnit 4) |
| **Data gemmes i Postgres** | ❌ **Ikke bygget.** Motoren holder data i hukommelsen; alt forsvinder ved genstart |
| **Login** | ❌ Ikke bygget. Serveren har én fast udviklingssession og nægter at starte i produktion |
| Rigtigt jobsystem (kø, overvågning, stop) | ❌ Ikke bygget. Serveren bruger simple timere |
| Zettle, Lightspeed, Shopbox, CSV | ❌ Ikke bygget. Kun forberedt i connector-registret |

**Vigtigt:** "Testet" betyder testet mod en simuleret Shopify, der svarer som Shopifys API. Felterne er tjekket mod Shopifys officielle skema (Admin GraphQL 2026-10). Men en integration er først færdig, når den er testet mod en rigtig udviklingsbutik.

## 2. Sådan virker det

```
Kasse (Shopify POS)  ──webhook (signeret)──►  /webhooks/shopify  ──►  kø
                                                                       │ henter altid den aktuelle tilstand via GraphQL
                                                                       ▼
                                                     POS-motor (én normaliseret kopi pr. virksomhed)
                         ┌───────────────────────┬───────────────┼─────────────────────┐
                         ▼                       ▼               ▼                     ▼
                       LAGER                   PULS           INDSIGT              OVERBLIK
             lagerantal som optælling   registreret salg   analyse pr. vare,    opgaveforslag via
             (kassen er master)         (ikke bogført)     størrelse, butik     Inventory Monitor
```

**Webhooks bruges kun som signal.** Vi stoler ikke på indholdet. Vi henter ordren eller lagerstatus igen fra Shopify. Så kan rækkefølge, gentagelser og forsinkelser ikke give forkerte tal.

**Ingen dobbelt lagertræk.** Shopify trækker selv lageret, når kassen sælger. LAGER kopierer Shopifys tal som en optælling (`type: count`, `source: shopify`). Et salg trækker aldrig noget fra i LAGER. Det er testet: kun ordre-webhooken → LAGER uændret; lager-webhooken → LAGER = Shopifys tal.

**Kassedata er ikke regnskab.** PULS viser "Registreret salg fra kassesystemet efter rabatter og returer, ekskl. moms. Det er IKKE modtagne betalinger, bankindestående eller bogført omsætning."

**Valutaer lægges aldrig sammen.** Alle tal grupperes pr. valuta.

**Datoer følger butikkens tidszone.** Et salg kl. 00:30 dansk tid tæller på den danske dato.

### Datadeling
Ejeren vælger pr. forbindelse, hvilke apps der må bruge kassedata (LAGER, PULS, INDSIGT, OVERBLIK). Slås en app fra, ser den intet. Er en app ikke aktiveret, får den intet.

### Afbrydelse
- Adgangsnøglen slettes med det samme.
- Nye webhooks markeres "ignored".
- Historiske data bliver stående og markeres som historiske, medmindre ejeren vælger "Slet også de hentede kassedata".
- Ejeren skal også afinstallere appen i Shopify for at fjerne adgangen helt i butikken.
- `app/uninstalled` fra Shopify afbryder automatisk. `shop/redact` sletter alle data.

### GDPR
Vi henter **ingen kundedata** (navn, e-mail, adresse) fra kassen. Kun ordrelinjer, beløb og lager. Det holder os uden for Shopifys krav om "protected customer data" og gør `customers/redact` og `customers/data_request` trivielle. Ingen kortdata: betalingsstatus gemmes kun som tekst (fx `PAID`).

## 3. AI-workers

| Worker | App | Må | Grundlag |
|---|---|---|---|
| Sales Monitor | INDSIGT | Læse | Periodesammenligning, bedst sælgende, kategorier ±15 % og ≥ 500 kr., usædvanlig dag (> 2× gennemsnit, ≥ 7 dage) |
| Inventory Monitor | LAGER | Indkøbsforslag til godkendelse, opgaveforslag i OVERBLIK, notifikation | Udsolgt, under minimum, eller rækker ≤ 7 dage (kræver ≥ 14 dages historik og ≥ 3 salg) |
| Business Insights | INDSIGT | Rapportkladde | Konklusion, nøgletal, vækst/fald, handlinger med tal bag, usikkerhed, kilder |
| Operations | OVERBLIK | Notifikation | Forslag der har ventet > 3 dage, ventende godkendelser |

Ingen sprogmodel endnu. Alle tal og tekster laves i kode. Workers kan ikke godkende, købe, betale eller ændre noget i kassen. Er en app ikke aktiveret, stopper workeren med en forklaring.

## 4. Hvad du skal sætte op for at forbinde en rigtig butik

1. **Shopify Partner-konto** (gratis): partners.shopify.com.
2. **Opret en app** i Dev Dashboard. Vælg en *udviklingsbutik* til test.
3. **Adgange (scopes):** `read_products`, `read_inventory`, `read_locations`, `read_orders`.
   - `read_orders` giver kun de seneste 60 dages ordrer. Ældre kræver `read_all_orders`, som Shopify skal godkende.
4. **Redirect URL:** `https://DIN-ADRESSE/integrations/shopify/callback`.
5. **Compliance-webhooks** (obligatoriske for offentlige apps) i app-konfigurationen: `customers/data_request`, `customers/redact`, `shop/redact` → `https://DIN-ADRESSE/webhooks/shopify`.
6. **Miljøvariabler på serveren** (aldrig i frontend eller repo):
   ```
   SHOPIFY_CLIENT_ID=...
   SHOPIFY_CLIENT_SECRET=...
   TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))")
   APP_URL=https://din-adresse
   ```
7. **HTTPS-adresse:** Shopify kræver HTTPS for webhooks. Lokalt kan du bruge en tunnel (fx Cloudflare Tunnel).
8. Kør `node server.js` og åbn `/integrationer/kassesystemer`.

Skal bekræftes mod en rigtig butik, før vi kalder det færdigt:
- Fornyelse af token (`grant_type=refresh_token`). Implementeret efter Shopifys dokumentation, men kun testet mod simulatoren.
- At `retailLocation` er udfyldt på POS-ordrer i den konkrete butik.
- At `currentSubtotalPriceSet` og `currentTotalTaxSet` stemmer med Shopify-rapporterne for en dansk butik med priser inkl. moms.
- Offentlig app (flere butikker) kræver Shopifys app-gennemgang. En "custom app" til én butik gør ikke.

## 5. Andre kassesystemer (forberedt, ikke bygget)

Nye systemer tilføjes som en connector med samme form som `src/pos/connectors/shopify.js`:
`authUrl`, `verifyCallback`, `exchangeCode`, `refresh`, `verifyWebhook`, `webhookMeta`, `webhookToAction` og `api()` med `locations`, `products`, `inventory`, `orders`, `order`. Motoren, apps og workers skal ikke ændres.

| System | Næste skridt |
|---|---|
| Zettle (PayPal POS) | Afklar partneradgang, OAuth og webhooks. Afklar lager pr. butik. |
| Lightspeed Retail | Afklar hvilken serie (X/R) danske butikker bruger, og partnerkrav. |
| Shopbox | Kontakt Shopbox om API-adgang, godkendelse og webhooks. |
| CSV | Definér skabelon og importflow for butikker uden API. |

Oplysningerne om disse systemer kommer fra din egen research og er ikke verificeret af mig.

**Kortterminal alene er ikke nok.** En terminal ved kun, at der er betalt et beløb, ikke hvilken vare der er solgt. Butikken skal have et kassesystem med varedata.

## 6. Tekniske risici

1. **Hukommelseslager:** Alt forsvinder ved genstart. Næste skridt er at koble motoren til tabellerne i `db/pos_schema.sql`.
2. **Ingen login:** Serveren må kun køre lokalt.
3. **Shopify-afhængighed:** API-versioner udløber efter ca. 12 måneder. Opdatér `API_VERSION` hvert kvartal.
4. **Store butikker:** Første import henter alt i én kørsel. Ved mange tusinde ordrer bør Shopifys Bulk Operations bruges.
5. **Prisberegning:** Linjebeløb ekskl. moms er beregnet ud fra Shopifys momslinjer, fordelt forholdsmæssigt ved delvis retur. Kan afvige med få øre fra Shopifys egne rapporter.

## Filer

```
src/pos/connectors/shopify.js   OAuth, webhooks, GraphQL-klient, normalisering
src/pos/connectors/index.js     register over kassesystemer (kun Shopify bygget)
src/pos/engine.js               POS-motor: forbindelser, synk, webhook-kø, fordeling til LAGER
src/pos/views.js                læsemodeller for PULS og INDSIGT
src/pos/workers.js              4 workers
src/pos/crypto.js               kryptering af tokens
src/pos/demo/                   DEMO: simuleret Shopify + tøjbutik
server.js, ui/                  Integrationscenter (udvikling, uden login)
db/pos_schema.sql               tabeller + RLS
test/pos.test.js                end-to-end-tests (22 stk.)
src/payments/                   betalinger: se docs/PAYMENTS.md
```
