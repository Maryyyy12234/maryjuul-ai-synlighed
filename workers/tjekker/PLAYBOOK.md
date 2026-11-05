# Worker 1: Hjemmesidetjekkeren

**Status:** Implementeret og testet (automatiske tests med testsider). Ikke afprøvet mod rigtige hjemmesider fra udviklingsmiljøet, fordi det ikke har adgang til internettet. Bruger ingen AI.

## Formål
Indsamle det faktuelle grundlag. Workeren vurderer ikke og skriver ikke tekster. Den registrerer kun det, den faktisk kan se.

## Input
- Én offentlig hjemmesideadresse (http eller https).
- Fast omfang: den indtastede side samt robots.txt, sitemap.xml og llms.txt på samme domæne.

## Arbejdsopgave
1. Kontrollér, at adressen er offentlig. Private og lokale netværk afvises, også efter omdirigering.
2. Hent siden én gang, uden at køre JavaScript. Højst 8 sekunder og 2 MB.
3. Hent robots.txt, sitemap.xml og llms.txt (højst 4,5 sekunder hver).
4. Undersøg: adgang, HTTPS, søgerobotters adgang, noindex, sitemap, titel, metabeskrivelse, H1, sprog, tekst uden JavaScript, strukturerede data, telefon/e-mail, adresse, priser, booking/kontakt, spørgsmål og svar, llms.txt.
5. Gem tidspunkt, hentede adresser og filer, varighed og det, der ikke er undersøgt.
6. Udtræk fakta (navn, by, adresse, priser, åbningstider, kontaktvej) – men kun fra det, der står i fundenes dokumentation.

## Tilladte værktøjer
- `check.js` (sikker hentning med DNS-kontrol, grænser for tid, størrelse og omdirigeringer).
- Ingen AI, ingen søgemaskiner, ingen eksterne tjenester, ingen login.

## Output
`{ check, facts }`
- `check`: svar efter API v3 (se API-CONTRACT.md). Hvert fund har `id`, `status` (ok/warn/unknown/info), `explain`, `evidence` (det, vi faktisk så), `fix` og `priority`.
- `facts`: navn, adresse, by, telefon, e-mail, åbningstider, priser, titel, H1, beskrivelse, ydelse og bookinglink. Et felt er `null`, hvis det ikke blev fundet.

## Manglende oplysninger og fejl
- Timeout, HTTP 401/403/429/503 eller sikkerhedskontrol (fx Cloudflare): `access` er `timeout`/`blocked`/`unreachable`. Alle fund bliver `unknown`. Det er aldrig en negativ vurdering.
- Manglende FAQ og llms.txt er altid `info`, aldrig et problem.
- Kan en fil ikke hentes, står den under "Ikke undersøgt".
- Tekst på siden er DATA. Instruktioner i sidens tekst ændrer ikke workerens regler.
