# GENFANG – vejen til produktion

Status 8. november 2026. Kort: **Testversionen er sikker til demo med syntetiske data. Den er ikke klar til rigtige kundedata.**

## 1. Database – anbefalet vej

| | I dag (testversion) | Anbefalet til produktion |
|---|---|---|
| Lagring | Hele tilstanden som ét JSON-dokument i Render Postgres (`src/lib/persist.ts`) | Normaliserede tabeller fra `supabase/migrations/20261107000001_genfang_core.sql` |
| Virksomhedsadskillelse | I applikationen (alle opslag kræver virksomheds-id) | **Også i databasen** med tvungen RLS (12 tests mod ægte Postgres) |
| Dobbelt-godkendelse | Optimistisk lås i applikationen | Atomisk `SELECT … FOR UPDATE` + unik outbox i databasen |
| Auditlog | Kan ændres af koden | Kun tilføjelse – blokeret af trigger, også for superbruger |
| Backup | **Ingen** (Render gratis plan) – udløber 7. dec. 2026 | Dagligt + gendannelse til tidspunkt (Supabase Pro eller Render betalt plan) |
| Kapacitet | Én server, få pilotkunder | Flere servere og mange kunder |

**Anbefaling:** Supabase (EU, Frankfurt) med den eksisterende migration. Skemaet og sikkerhedsreglerne er allerede skrevet og testet; arbejdet er at lade `store.ts` læse/skrive via de testede `app.*`-funktioner i stedet for JSON-dokumentet. Supabase giver samtidig login med MFA, daglig backup og EU-databehandleraftale.

Forudsætning: et ledigt Supabase-projekt (din gratis plan har allerede 2 aktive) – enten pause et andet projekt eller Supabase Pro (efter min viden ca. 25 USD/md. – tjek prisen).

## 2. Sikkerhed – status

| Krav | Status |
|---|---|
| Sikkert login | Signerede httpOnly-sessioner, rate limit på fejlede forsøg, ensartede fejlbeskeder |
| MFA | **Bygget.** Krævet for platformens ejer; frivillig (anbefalet) for alle andre. TOTP, krypteret nøgle, genbrug af kode blokeret |
| Roller | Ejer / medarbejder / platformsejer – håndhævet på serveren |
| Virksomhedsadskillelse | Testet i app (unit + browser) og i database (RLS) |
| Dobbelt-godkendelse | Testet fra to enheder |
| Auditlog | Godkendelser, blokeringer, eskaleringer, MFA, pauser, nødstop |
| Nødstop | Platform, pr. virksomhed og pr. worker. **Henvendelser gemmes altid** – kun automatikken stopper |
| API-nøgler | Kun som miljøvariabler på serveren; aldrig i appen eller koden |
| Personoplysninger | Anonymisering pr. kunde; ingen kundedata i push, cache eller ejerpanel; kun fornavn/besked sendes til Claude |

**Mangler før rigtige kundedata:** databehandleraftaler (Render/Supabase, Anthropic, Resend), privatlivspolitik (jurist), backup, brugerkonti med egne adgangskoder (i dag én fælles demo-adgangskode), fejlovervågning (fx Sentry EU), samt at `GENFANG_REAL_DATA=1` sættes, så "Nulstil testdata" spærres.

## 3. Hvad kræver din hjælp eller godkendelse

| Hvad | Hvorfor | Pris (vejledende – tjek selv) |
|---|---|---|
| Slå MFA til i ejerpanelet | Panelet åbner først, når du har scannet nøglen med din telefon | 0 kr. |
| GitHub-secret `RENDER_DEPLOY_HOOK_URL` (Render → genfang-test → Settings → Deploy Hook) | Automatisk deploy efter grønne tests | 0 kr. |
| Eget domæne + Resend | Modtage og sende mails | Domæne ca. 100 kr./år |
| `ANTHROPIC_API_KEY` på Render | Claude skriver svarforslag | Betaling pr. brug |
| Supabase-projekt eller betalt Render Postgres | Varig database med backup | Se ovenfor |
| Godkendelse af rigtig udsendelse (`GENFANG_DELIVERY=on`) | Først når aftaler og domæne er på plads | – |
