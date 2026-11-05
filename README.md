# MARY JUUL

Webdesign og digital synlighed for lokale virksomheder. Frontend på Sites og Render. Den offentlige Render-tjeneste kører det rigtige hjemmesidetjek.

## Kørsel

Node.js 22 eller nyere. Ingen eksterne pakker kræves.

- `npm run build`: klargør `dist/` og opdaterer filversioner, så en tidligere cache ikke blander gammel JavaScript med nyt indhold.
- `npm run dev`: lokal server med mobilvisning på `/__preview?width=390`.
- `npm start`: webserver på `PORT` eller 10000.
- `npm test`: regressionstests af analyse, robots-regler, adresser og API.
- `node worker.js rapport`: afgrænset baggrundsrapport. `SITES` er en kommasepareret liste med offentlige adresser. Resultater skrives som JSON til stdout. Koden opretter ikke af sig selv en betalt Render-tjeneste.

## Hvad tjekket måler (API v3)

Kontrakt: `POST /api/check` med `{"url":"dinvirksomhed.dk"}`. Svaret har `version: "3"`, `access`, `scope`, `summary`, `checks`, `nextSteps`, `method` og `sources`. Der er ingen score.

Tjekket henter den indtastede side samt robots.txt, sitemap.xml og llms.txt. Hvert fund har en status:

- `ok`: fundet og dokumenteret (med `evidence`, det vi faktisk så).
- `warn`: bør undersøges eller forbedres (med `priority` 1-3).
- `unknown`: kunne ikke afklares, fx ved timeout eller blokering.
- `info`: generel anbefaling. Manglende FAQ og llms.txt er altid `info`.

Timeout, HTTP 401/403/429/503 og sikkerhedskontroller (fx Cloudflare) giver `access` = `timeout`/`blocked`/`unreachable`. Så er alle fund `unknown`, aldrig `warn`.

Tjekket måler ikke faktisk omtale i ChatGPT, Gemini eller andre AI-tjenester. Det står altid i `scope.notChecked`. Det kræver ingen API-nøgle og sender ingen modelkald.

DNS-adresser kontrolleres og fastlåses til hver netværksforbindelse. Private, loopback-, metadata- og reserverede adresser afvises, også efter viderestilling. Testene bruger en lokal testside via indsprøjtede kodeparametre (`fetchOptions`), som aldrig kan sættes fra en forespørgsel.

## Arbejdsforløb med fire roller (etape 1)

Ét Node-program. Rollerne er moduler i `workers/`, hver med sin `PLAYBOOK.md`:

1. `tjekker` – hjemmesidetjekket (check.js v3). Kun kode, ingen AI.
2. `strateg` – 3-5 prioriterede anbefalinger. Regler altid, AI valgfrit.
3. `indhold` – tekstforslag som kladder med `[UDFYLD: …]`. Skabeloner altid, AI valgfrit.
4. `kontrol` – faste regler + valgfri separat AI-gennemgang. Højst 2 rettelsesrunder.

Fælles vidensbase: `knowledge/mary-juul.md`.

### API
- `POST /api/jobs {"url":"…"}` → 202 `{id, state, stateLabel, steps}`. Samme CORS og IP-grænse som `/api/check`.
- `GET /api/jobs/:id` → offentlig status: tilstand, rigtige trin, v3-tjek og næste skridt. Kladder og rapport er ikke offentlige.
- `GET /api/admin/jobs`, `GET /api/admin/jobs/:id`, `GET /api/admin/jobs/:id/report`, `POST /api/admin/jobs/:id/approve` kræver `Authorization: Bearer <ADMIN_TOKEN>`. Uden `ADMIN_TOKEN` (mindst 16 tegn) er admin lukket.

Hent rapporten: `curl -H "Authorization: Bearer $ADMIN_TOKEN" https://maryjuul-ai-synlighed.onrender.com/api/admin/jobs/<id>/report > rapport.html`.

Tilstande: I kø, Under behandling, Klar, Kræver gennemgang, Kunne ikke gennemføres. Ingen procenter. Intet sendes eller udgives automatisk.

### Valg af teknik
Opgaverne kører som en baggrundskø i samme proces som webserveren. Det er simpelt og nok til få opgaver om dagen. En separat Render Background Worker med Render Key Value som kø giver først mening, når mængden kræver det.

- Samme adresse samme UTC-dag giver samme opgave (id = sha256 af adresse + dato). Gentagne klik og genstarter laver ikke dubletter.
- Højst `JOB_CONCURRENCY` (standard 2) samtidige opgaver, højst 50 i kø, 90 sekunder pr. opgave.
- Hver opgave gemmes som JSON i `DATA_DIR/jobs/` efter hvert trin (atomisk skrivning). Ved genstart fortsætter opgaver i kø. En opgave, der var i gang, startes igen én gang og markeres derefter som ikke gennemført.
- Render free har en midlertidig disk. Opgaver forsvinder ved ny deploy eller genstart af maskinen. For varig lagring: tilføj en Render Disk og sæt `DATA_DIR` til dens sti, eller flyt lageret til Render Postgres/Key Value senere.

### AI
Kun når `ANTHROPIC_API_KEY` og `AI_MODEL` er sat. Kaldes via fetch fra backend, aldrig fra temaet. Budget: `AI_MAX_CALLS_PER_JOB` (4), `AI_MAX_CALLS_PER_DAY` (50), 20 sekunders tidsgrænse og ét nyt forsøg. Sideindhold sendes som data i `<website_content>`, og svaret valideres som JSON. Fejler AI, bruges regler og skabeloner, og opgaven markeres "Kræver gennemgang".

### Miljøvariabler på Render
`CORS_ORIGINS`, `ADMIN_TOKEN`, `DATA_DIR` (valgfri), `JOB_CONCURRENCY` (valgfri), `ANTHROPIC_API_KEY` og `AI_MODEL` (valgfri, begge kræves for AI), `AI_MAX_CALLS_PER_JOB`, `AI_MAX_CALLS_PER_DAY` (valgfri).

## Udgivelse

Render følger `main` i dette repo. Kontroller at det konkrete commit er `live`; en accepteret deploy er ikke nok. `GET /healthz` returnerer version og Render-commit. Sites-publiceringen har sin egen kildehistorik. Kopiér frontendfiler og assets til `dist/` i Sites-kilden og udgiv via Sites.

Tilladte origins: `https://uc6nzz-fg.myshopify.com`, alle `https://<navn>.shopifypreview.com`, den tidligere chatgpt.site-adresse og dem i `CORS_ORIGINS` (kommasepareret, fx det rigtige domæne). Browserlokal afprøvning og Render bruger samme origin; Sites kalder Render direkte uden credentials.

Visuelle projekter er markerede koncepter, ikke kundecases. Interiørfoto: Unsplash, photo-1600210492486-724fe5c67fb0.

## GEO-principper i indhold og rapport

Kundespørgsmål følger behov, sammenligning og beslutning. Priser kobles til leverancer og aftalt omfang. Dokumentation og ensartede virksomhedsoplysninger behandles særskilt fra designkoncepter. Synlig FAQ og FAQPage-data indeholder de samme spørgsmål og svar.

Faktisk AI-omtale kræver særskilte, gentagne spørgsmål med gemte svar, kilder, tjeneste/model og tidspunkt. Hverken tjekket eller arbejdsforløbet måler AI-omtale. Den valgfrie AI bruges kun til prioritering og tekstforslag. Dokumentation: Google Search Central om AI-funktioner og oprindelig GEO-forskning (KDD 2024).
