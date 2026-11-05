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

## Udgivelse

Render følger `main` i dette repo. Kontroller at det konkrete commit er `live`; en accepteret deploy er ikke nok. `GET /healthz` returnerer version og Render-commit. Sites-publiceringen har sin egen kildehistorik. Kopiér frontendfiler og assets til `dist/` i Sites-kilden og udgiv via Sites.

Tilladte origins: `https://uc6nzz-fg.myshopify.com`, alle `https://<navn>.shopifypreview.com`, den tidligere chatgpt.site-adresse og dem i `CORS_ORIGINS` (kommasepareret, fx det rigtige domæne). Browserlokal afprøvning og Render bruger samme origin; Sites kalder Render direkte uden credentials.

Visuelle projekter er markerede koncepter, ikke kundecases. Interiørfoto: Unsplash, photo-1600210492486-724fe5c67fb0.

## GEO-principper i indhold og rapport

Kundespørgsmål følger behov, sammenligning og beslutning. Priser kobles til leverancer og aftalt omfang. Dokumentation og ensartede virksomhedsoplysninger behandles særskilt fra designkoncepter. Synlig FAQ og FAQPage-data indeholder de samme spørgsmål og svar.

Rapportens `geoPlan` indeholder konkrete indholdsopgaver og tydeligt markerede manuelle opgaver. Canonical-adresser, eksterne links og datoer registreres som observationer uden point. Et link beviser ikke troværdighed, og en dato beviser ikke friskhed. Eksterne referencer følges ikke af tjekket.

Faktisk AI-omtale kræver særskilte, gentagne spørgsmål med gemte svar, kilder, tjeneste/model og tidspunkt. Denne API foretager ingen sådanne AI-kald og fremstiller ikke teknisk score som AI-placering. Dokumentation: Google Search Central om AI-funktioner og oprindelig GEO-forskning (KDD 2024).
