# GENFANG 2.0 – statusrapport

Dato: 7. november 2026 · Gren: `claude/charming-faraday-z1103s` · Mappe: `genfang-app/`

## 0. Udgangspunkt (hvad der fandtes før)

| Område | Før 2.0 |
|---|---|
| Login, sessioner, virksomhedsadskillelse, lås mod dobbelt-godkendelse, PWA | Virkede (18 unit + 20 e2e) |
| Svarudkast | **Hårdkodede tekster.** Sofies udkast sagde altid "i dag mellem kl. 14 og 16" – uden nogen kontrol. Det var årsagen til kl. 16.42-fejlen. |
| Workers | Kun statustekst – ingen logik, log eller fejlhåndtering |
| Akut, tilbudsstatusser, opfølgning, analytics, roller, ejerpanel, nødstop | Manglede |

## 1. Implementeret i 2.0

| # | Krav | Hvad er bygget | Status |
|---|---|---|---|
| 4 | Svar og booking | **Sikkerhedslag** (`src/lib/guard.ts`): finder tider og priser i teksten og kontrollerer lokal tid (Europe/Copenhagen, sommer/vintertid), åbningstider, ledige kalendertider og prisliste. Blokerer: tid i fortiden, opfundet tid, uden for åbningstid, dag uden tidsrum, ankomstløfter, priser uden grundlag, besøgsløfter i akutte sager. Kører igen på serveren i godkendelsesøjeblikket – fejl stopper godkendelsen (HTTP 422). Live-kontrol mens man redigerer. | Bygget + testet |
| 2 | AI-workers | Intake (klassificering, akut-genkendelse, kendt kunde, dubletter, manglende oplysninger), Responder (kun kalendertider og prisliste), Follow-up (ubesvarede tilbud, manglende svar, lovgrundlag, max 2), Analytics (kunderejse, perioder, forslag). Worker-log, fejlstatus, stop-status, side `/workers`. | Bygget som **regler uden sprogmodel** |
| 3 | Akutte sager | Vandskade, gaslugt, afløb der løber over → akut, sikker vejledning, automatisk eskalering til vagthavende, kvittering, ingen besøgsløfter. Manuel **Eskalér** på alle sager. | Bygget + testet (SMS/opkald ikke aktiv) |
| 5 | Tilbud | Statusser: kladde, afventer godkendelse, sendt, accepteret, afvist, udløbet (automatisk), faktureret (+ betalt). Pengetrappe: potentiel → accepteret → faktureret → betalt. Ejer godkender tilbud. | Bygget + testet |
| 6 | Opfølgning | Forslag efter 5 dage uden svar og ved manglende oplysninger. Lovgrundlag vises; reklame/3. opfølgning blokeres. Kun ejer kan godkende. | Bygget + testet (intet sendes) |
| 7 | Analytics | Kohorte fra henvendelse til tilbud/booking/accept; betalt omsætning efter betalingsdato. Procentpoint vs. relativ ændring, lige lange perioder, nul-division håndteret, advarsel ved lille datagrundlag, metode vises. | Bygget + testet på testdata |
| 1 | Dashboard | Kræver handling, resultater med datakilde-mærke (Testdata / Beregnet estimat / Verificeret), pengetrappe, insights, worker-status. | Bygget |
| 8 | Vækstforslag | Regelbaserede forslag med datagrundlag: kvittér eskalering, følg op på tilbud, svartid, åbningstid/vagt, tilbudsaccept, formular. | Bygget |
| 9 | Kundeoplevelse | Mindre overskrifter (≤ 34 px), skærpet kontrast (≥ 4,5:1 testet), fanebjælke dækker ikke indhold (testet), skjult på sagsside, knapper **Rediger**, **Godkend og send**, **Eskalér**, **Nyt udkast**, **Afvis**. | Bygget + testet |
| 10 | Ejerpanel | `/ejer` med separat login og adgangskode: virksomheder, MRR/ARR, omkostninger (estimat), dækningsbidrag, AI-forbrug, worker-status og fejl, køer, DPA-status, pause pr. virksomhed, **nødstop**. Ingen kundedata. Andre får 404. | Bygget + testet |
| 11 | Sikkerhed | Roller (ejer, medarbejder, GENFANG-ejer) håndhævet på serveren, auditlog (`/mere/audit`), GDPR-side med databehandlere, anonymisering af kunde, DPA-status, nødstop. | Bygget (se mangler) |
| 12 | Apps | Ét versioneret API (`/api/v1`) med cookie (web) og Bearer-token (native) – se afsnit 4. | Planlagt / API klar |

## 2. Testresultater

| Suite | Resultat |
|---|---|
| TypeScript (`tsc --noEmit`) + produktionsbuild | Grøn |
| Unit-tests (`npm test`) | **60/60** |
| Database-tests (`npm run test:db`, ægte Postgres via PGlite) | **12/12** |
| – heraf sikkerhedslag inkl. kl. 16.42-regression | 16 |
| – Responder mod sikkerhedslag: hver halve time i 14 dage (>2.000 udkast) | 1 (alle bestået) |
| – domæne: isolering, roller, akut, tilbud, opfølgning, nødstop, ejerpanel, GDPR | 27 |
| – analytics: procentpoint, relativ ændring, nul-division, kohorte, betalingsdato | 10 |
| – sessioner og rate limiting | 7 |
| Browser-tests (`npm run test:e2e`, Chromium, iPhone 13, Pixel 7, desktop) med testur torsdag kl. 16.54 | **23/23** |

**Central regression** – testet på tre niveauer:
1. Sikkerhedslaget: "i dag mellem kl. 14 og 16" kl. 16.42 → `tid_i_fortiden` (+ 6 skrivemåder, + samme tekst næste morgen → `tid_ikke_i_kalender`).
2. Domænet: `decide()` returnerer `blocked`, status uændret, intet i outbox, hændelsen logges.
3. Browser + API: knappen er deaktiveret med forklaring; direkte POST giver HTTP 422.

**Ikke testet**: fysiske telefoner, rigtig installation fra Safari, rigtig push-levering, Vercel-deployment.

## 3. Ikke aktivt endnu (integrationer)

| Integration | Status |
|---|---|
| Rigtig database | **Skema + RLS færdigt og testet** (`supabase/migrations`, 12 tests mod ægte Postgres, se `docs/DATABASE.md`). Ikke koblet til appen endnu – mangler valg af Supabase-projekt. Appen kører stadig på syntetiske data i hukommelsen. Ingen separat GENFANG-kodebase blev fundet i GitHub, Supabase eller Vercel. |
| Sprogmodel (Claude) til svarudkast | Ikke aktiv – Responder er skabelonbaseret. Ingen AI-omkostninger |
| Mail ind/ud, hjemmesideformular, telefoni | Ikke aktiv – `/api/v1/intake` simulerer |
| Kalender (Google/Outlook/Ordrestyring) | Testkalender – ikke forbundet |
| SMS/opkald til vagt | Blokeret (`blokeret_testversion`) |
| Push-afsendelse | Abonnement gemmes, afsendelse slået fra |
| Økonomisystem (e-conomic/Dinero) | Ikke forbundet – derfor er intet "Verificeret" |
| Stripe-abonnementer | Ikke aktiv |
| Varig auditlog og delt rate limiting | Hukommelse pr. instans |
| Vercel-testversion | Ikke deployet. Vercel-forbindelsen kan kun liste projekter – oprettelse afvises (403). |

## 4. Fælles API til web, iOS, Android, Windows og macOS

Al forretningslogik ligger i `src/lib` (rene TypeScript-funktioner uden React). Alle klienter bruger samme endpoints og fejlkoder:
`400 invalid · 401 unauthorized · 403 forbidden · 404 not_found · 409 conflict · 422 blocked (sikkerhedslag) · 423 stopped (nødstop) · 429 rate_limited`.

| Metode | Endpoint | Rolle |
|---|---|---|
| POST | `/api/v1/auth/login` (`X-GENFANG-Client: native` → token) / `logout` | alle |
| GET | `/api/v1/overview` | ejer, medarbejder |
| GET | `/api/v1/inquiries?filter=aabne`, `/api/v1/inquiries/:id` | ejer, medarbejder |
| POST | `/api/v1/inquiries/:id/decision` · `/check` · `/draft` · `/escalate` · `/ack` | ejer, medarbejder |
| POST | `/api/v1/inquiries/:id/anonymize` | ejer |
| GET/POST | `/api/v1/quotes`, `/api/v1/quotes/:id/decision` | se / ejer |
| GET/POST | `/api/v1/followups`, `/api/v1/followups/:id/decision` | ejer |
| GET | `/api/v1/analytics?days=30`, `/api/v1/audit` | ejer |
| GET | `/api/v1/workers` | ejer, medarbejder |
| POST | `/api/v1/intake` | ejer (simulering) |
| GET/POST | `/api/v1/admin/overview`, `/admin/emergency-stop`, `/admin/tenants/:id/pause` | GENFANG-ejer |

Plan: flyt `src/lib/types.ts`, `guard.ts`, `workers/*` og `permissions.ts` til `packages/` når Expo-appen startes. Sikkerhedslaget kan da også køre på telefonen for hurtig feedback – men serveren kontrollerer altid igen.

## 5. Anbefalet næste skridt

1. Find og tilknyt den rigtige GENFANG-kodebase/database. Erstat `store.ts`-implementeringen – kontrakten og testene bevares.
2. Forbind én kalender og én mailindbakke hos én pilotkunde (VVS, 3–15 ansatte).
3. Underskriv databehandleraftale og privatlivspolitik (jurist) før første rigtige kundedata.
4. Mål i 30 dage uden at ændre noget, så sammenligningen bliver ægte – først da kan tal mærkes "Verificeret".
