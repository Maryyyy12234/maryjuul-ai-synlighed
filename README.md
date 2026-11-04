# MARY JUUL

Webdesign og digital synlighed for lokale virksomheder. Frontend på Sites og Render. Den offentlige Render-tjeneste kører det rigtige hjemmesidetjek.

## Kørsel

Node.js 22 eller nyere. Ingen eksterne pakker kræves.

- `npm run build`: klargør `dist/` og opdaterer filversioner, så en tidligere cache ikke blander gammel JavaScript med nyt indhold.
- `npm run dev`: lokal server med mobilvisning på `/__preview?width=390`.
- `npm start`: webserver på `PORT` eller 10000.
- `npm test`: regressionstests af analyse, robots-regler, adresser og API.
- `node worker.js rapport`: afgrænset baggrundsrapport. `SITES` er en kommasepareret liste med offentlige adresser. Resultater skrives som JSON til stdout. Koden opretter ikke af sig selv en betalt Render-tjeneste.

## Hvad tjekket måler

Én HTML-side samt robots.txt og den valgfrie llms.txt. En vægtet teknisk tjekliste: HTTPS (10), læsbar tekst (15), titel/beskrivelse (10), H1 (10), viewport (10), noindex (10), søgerobotter (15), virksomhedsdata (10), kontakt (10). Ukendte robots-forhold udelades af nævneren og vises tydeligt. Svar på kundespørgsmål, priser og llms.txt er supplerende oplysninger uden point.

Før/efter-eksemplet er illustrativt og bygger på en fiktiv salon. Projektvinduerne viser de faktiske visuelle koncepter.

Scoren er ikke en måling af omtale, kildeandel, sentiment, faktisk indeksering, mobiloplevelse, Core Web Vitals eller salg. Den kræver ingen OpenAI-nøgle og sender ikke modelkald. Faktisk GEO-måling skal undersøge relevante spørgsmål, bevare de modtagne svar/kilder samt registrere tjeneste, model, tidspunkt og antal gentagelser.

DNS-adresser kontrolleres og fastlåses til hver netværksforbindelse. Private, loopback-, metadata- og reserverede adresser afvises, også efter viderestilling. Forespørgsler har tids-, størrelses-, samtidigheds- og IP-grænser. Rapporter gemmes ikke i en database.

## Udgivelse

Render følger `main` i dette repo. Kontroller at det konkrete commit er `live`; en accepteret deploy er ikke nok. `GET /healthz` returnerer version og Render-commit. Sites-publiceringen har sin egen kildehistorik. Kopiér frontendfiler og assets til `dist/` i Sites-kilden og udgiv via Sites.

Tilladte eksterne frontend-origins er eksplicit angivet i server.js. Flere kan angives kommasepareret i `CORS_ORIGINS`. Browserlokal afprøvning og Render bruger samme origin; Sites kalder Render direkte uden credentials.

Visuelle projekter er markerede koncepter, ikke kundecases. Interiørfoto: Unsplash, photo-1600210492486-724fe5c67fb0.
