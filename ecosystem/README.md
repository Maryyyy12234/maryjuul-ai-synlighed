# Økosystem: OVERBLIK · PULS · LAGER · INDSIGT

Fælles kerne til fire forretningsapps for små danske virksomheder.
Status: **domænekerne, database og kasseintegration (Shopify POS) er bygget og testet mod en simuleret Shopify. Der er intet login, ingen betaling, og data gemmes endnu kun i hukommelsen.**

Nyt: **Betalinger og kortterminaler** (Nets/MyNets-import, SumUp, afstemning i PULS). Se [docs/PAYMENTS.md](docs/PAYMENTS.md). Demo: http://127.0.0.1:4100/puls/betalinger

**Kassesystemer (POS).** Se [docs/POS_INTEGRATION.md](docs/POS_INTEGRATION.md). Prøv det med `npm run demo:ui` og åbn http://127.0.0.1:4100/integrationer/kassesystemer

Mappen er adskilt fra MARY JUUL-siden. Intet her påvirker den side, der kører på Render.

---

## 1. Ærlig vurdering før vi bygger mere

**Fire apps er for meget at starte med.** Hver app konkurrerer med etablerede produkter:

| App | Kunden har typisk allerede |
|---|---|
| OVERBLIK | Trello, Asana, Planday, Google Kalender, et papir på væggen |
| PULS | Dashboards i Dinero eller e-conomic, revisoren |
| LAGER | Shopifys indbyggede lager og mange lagerapps i Shopify App Store |
| INDSIGT | Shopify Analytics, Google Analytics |

*(Listen er en markedsantagelse og er ikke undersøgt i detaljer endnu.)*

Det betyder ikke, at idéen er dårlig. Men vi vinder ikke ved at have fire apps. Vi vinder kun, hvis én app løser ét problem bedre for én bestemt kundetype.

Vurdering af tid: fire apps med login, Stripe, Shopify- og Dinero-integration, AI og flot UI tager **mange måneder** for én person med AI. Imens tjener du 0 kr.

Det går også imod dine egne principper: *"Én god forretning før ti ufærdige projekter"* og *"Test efterspørgslen, før vi bygger en stor app"*.

### Min anbefaling

1. **Byg ikke alle fire nu.** Kernen er lavet, så de kan tilføjes senere uden at starte forfra.
2. **Hvis du vil videre med økosystemet: start med LAGER til små Shopify-webshops.**
   - Problemet er konkret: udsolgte varer betyder tabt salg, og for store indkøb binder penge.
   - Det passer til dine Shopify-evner.
   - Gevinsten kan måles i kroner.
   - Shopify har en officiel API med læseadgang til ordrer og lager.
3. **Test efterspørgslen uden en app først** (se afsnit 4).
4. **Overvej om dette skal vente**, til AI-synlighed/MARY JUUL har fået første betalende kunde. Det er det projekt, der allerede er live i dette repo.

---

## 2. Hvad er bygget, og hvad virker

| Del | Status |
|---|---|
| Virksomheder (tenants), brugere, roller (ejer/admin/medarbejder/observatør) | ✅ Bygget + testet |
| Adgang pr. app (fx OVERBLIK uden PULS) | ✅ Bygget + testet |
| Aktivere/deaktivere apps hver for sig | ✅ Bygget + testet (uden betaling) |
| Branche → anbefalede apps (låser intet) | ✅ Bygget + testet |
| Eksplicit datadeling mellem apps med samtykketekst | ✅ Bygget + testet |
| Revisionslog på alle ændringer | ✅ Bygget + testet |
| Godkendelsescenter (hvad/hvorfor/hvem/data/effekt + historik) | ✅ Bygget + testet |
| AI-workers kan foreslå, men aldrig godkende | ✅ Bygget + testet |
| Penge i øre, procent med 0-beskyttelse, moms | ✅ Bygget + testet |
| LAGER: produkter, lokationer, sporbare bevægelser, idempotens, Shopify-som-master | ✅ Bygget + testet |
| LAGER: salgshastighed, genbestillingspunkt, indkøbsforslag | ✅ Bygget + testet |
| PULS: CSV-import af fakturaer, periodesammenligning, forfaldne fakturaer | ✅ Bygget + testet |
| PULS: viser ikke overskud, hvis udgifter mangler | ✅ Bygget + testet |
| OVERBLIK: opgaver, status, dagens overblik (maks. 5 punkter) | ✅ Bygget + testet |
| INDSIGT: omsætningsændring via godkendt datadeling | ✅ Bygget (meget lille) |
| Workflow: lav beholdning → forslag → opgave → godkendelse → indkøbs**kladde** | ✅ Bygget + testet |
| Postgres-skema med Row Level Security | ✅ Testet i lokal Postgres 16 |
| Kassesystemer: Shopify POS-forbindelse, synk, webhooks, fordeling til 4 apps, 4 workers | ✅ Bygget + testet mod simuleret Shopify (se docs/POS_INTEGRATION.md) |
| Integrationscenter (Kassesystemer) | ✅ Bygget (udviklingsserver uden login) |
| Betalinger: Nets/MyNets CSV-import, SumUp API, afstemning, PULS → Betalinger, 3 workers | ✅ Bygget + testet mod simulerede udbydere (se docs/PAYMENTS.md) |
| MyNets' rigtige filformat og SumUp mod rigtig konto | ❌ Ikke bekræftet |
| Øvrig brugerflade (app-center, OVERBLIK m.fl.) | ❌ Ikke bygget |
| Data gemt i Postgres | ❌ Ikke koblet på endnu (tabeller + RLS er testet) |
| Login (Supabase Auth) | ❌ Ikke bygget |
| Stripe-abonnementer | ❌ Ikke bygget |
| Shopify-integration testet mod rigtig butik | ❌ Kræver Partner-app og nøgler |
| Dinero / e-conomic | ❌ Ikke bygget. Kræver adgang fra leverandøren |
| Sprogmodel (LLM) i workers | ❌ Ikke bygget. Workers er regler i kode |
| PDF-rapporter, budget, gentagne opgaver, kunderegister | ❌ Ikke bygget (tabeller findes) |
| Afsendelse af indkøbsordre til leverandør | ❌ Bevidst ikke bygget |

**Vigtigt:** "AI-workers" er i dag deterministiske regler. Det er med vilje. Tal og beslutningsgrundlag skal komme fra kode. En sprogmodel kan senere skrive forklaringen, men må aldrig opfinde tallene.

---

## 3. Sådan kører du det

Kræver Node.js 22. Ingen pakker skal installeres.

```bash
cd ecosystem
npm test       # 65 tests
npm run demo:ui  # Integrationscenter med DEMO-tøjbutik
npm run demo   # viser workflowet i terminalen
```

Databasetest (kræver Postgres):

```bash
createdb eco
psql -d eco -f db/local_auth_stub.sql   # kun lokalt; Supabase har auth.uid()
psql -d eco -f db/schema.sql
psql -d eco -f db/pos_schema.sql
psql -d eco -f db/payments_schema.sql
psql -d eco -f db/rls_test.sql          # skal slutte med "RLS-TEST OK"
psql -d eco -f db/pos_rls_test.sql      # skal slutte med "POS-RLS-TEST OK"
psql -d eco -f db/payments_rls_test.sql # skal slutte med "BETALINGS-RLS-TEST OK"
```

### Filer

```
src/money.js      penge i øre, procent, moms
src/platform.js   virksomheder, roller, apps, datadeling, revisionslog
src/approvals.js  godkendelsescenter
src/lager.js      LAGER
src/puls.js       PULS
src/overblik.js   OVERBLIK
src/indsigt.js    INDSIGT (lille)
src/workers.js    Inventory Planner, Operations Assistant
db/schema.sql     Supabase/Postgres-skema med RLS
db/rls_test.sql   bevis for at virksomhed A ikke kan se B
```

---

## 4. Næste skridt: test efterspørgsel (0–250 kr.)

Mål: find ud af, om 3 webshops vil betale, **før** vi bygger brugerflade og Shopify-app.

1. **Find 20 små danske Shopify-webshops** med fysiske varer og 50–500 produkter (keramik, tøj, kaffe, hudpleje).
2. **Skriv til dem** med ét konkret tilbud:
   > "Jeg laver en gratis genbestillingsrapport til din webshop. Du sender mig en eksport af ordrer og lager fra Shopify. Du får en liste over, hvilke varer der løber tør inden for 14 dage, og hvad du bør bestille."
3. **Lav rapporten med denne kerne.** Det mangler kun en CSV-import af Shopify-eksporten (ca. en dags arbejde).
4. **Spørg bagefter:** "Vil du have den hver uge for 299 kr./md.?"
5. **Kriterium:** 3 ud af 20 siger ja og betaler → så bygger vi Shopify-appen og brugerfladen. Under 3 → vi stopper eller ændrer målgruppen, før vi har brugt måneder.

### Regnestykke (estimat, ikke løfte)

| Kunder | Pris/md. ekskl. moms | Omsætning/md. |
|---|---|---|
| 5 | 299 kr. | 1.495 kr. |
| 17 | 299 kr. | 5.083 kr. |
| 40 | 299 kr. | 11.960 kr. |

Omkostninger ved få kunder: Supabase og Vercel kan starte gratis. Shopify Partner-konto er gratis. Fra cirka 10–20 kunder skal du regne med betalte planer og Stripe-gebyrer. Efter skat beholder du væsentligt mindre end omsætningen. Spørg en revisor, når du nærmer dig 50.000 kr. i årlig omsætning (momsgrænsen).

---

## 5. Plan hvis testen lykkes

| Fase | Indhold | Mål |
|---|---|---|
| 1 | Shopify-CSV-import + ugentlig rapport (manuelt sendt) | 3 betalende |
| 2 | Next.js + Supabase (EU) + login + LAGER-skærme | Kunderne bruger appen selv |
| 3 | Shopify-app med læseadgang (OAuth, webhooks, afstemning) | Ingen manuel CSV |
| 4 | Stripe-abonnement pr. app | Automatisk betaling |
| 5 | Sprogmodel skriver forklaringer; tal fra kode | Bedre rapporter |
| 6 | OVERBLIK eller INDSIGT som tilkøb, hvis kunderne beder om det | Mersalg |

PULS kommer sidst. Dinero/e-conomic kræver godkendelse som integrationspartner, og økonomital kræver ekstra omhu med ansvar og GDPR.

### Sikkerhed – status

- Tenant-isolation i databasen (RLS) er testet lokalt. Den skal testes igen i et rigtigt Supabase-projekt.
- Lagerbevægelser og revisionslog kan ikke ændres eller slettes (database-trigger).
- Integrationstokens må kun ligge krypteret server-side (Supabase Vault). Det er ikke bygget.
- **Ikke** GDPR-dokumenteret endnu. Før første kunde med persondata: databehandleraftale, privatlivspolitik og liste over underleverandører (Supabase, Vercel, Stripe).
- Overvej ApS og ansvarsforsikring, før kunder træffer indkøbsbeslutninger på baggrund af dine tal.

---

## Note om masterprompten

Masterprompten indeholdt to versioner efter hinanden. Den sidste stoppede midt i INDSIGT (afsnit 7.5, "Report Generator"). Afsnit om rapporter, design og test efter dette punkt er ikke modtaget.
