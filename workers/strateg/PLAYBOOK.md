# Worker 2: GEO-strategen

**Status:** Regelbaseret version implementeret og testet. AI-forbedring er implementeret og testet med en simuleret AI-tjeneste, men ikke afprøvet mod den rigtige Anthropic API (ingen nøgle og intet netværk i udviklingsmiljøet).

## Formål
Omsætte fundene til en prioriteret plan med 3-5 anbefalinger.

## Input
- Hjemmesidetjekkerens fund (`check`) og fakta (`facts`).
- Vidensbasen `knowledge/mary-juul.md`.
- Senere: verificerede oplysninger fra kunden om målgruppe og tilbud (ikke implementeret endnu).

## Arbejdsopgave
1. Tag fund med status `warn` i prioriteret rækkefølge (1 før 2 før 3).
2. Lav én anbefaling pr. fund: hvad der skal ændres, hvorfor, og hvad der kræves fra kunden.
3. Er der færre end 3, suppleres med faglige vurderinger, fx svar på typiske spørgsmål eller ens oplysninger på tværs af profiler.
4. Kan siden ikke undersøges, gives kun én anbefaling: find ud af, hvorfor adgangen blev afvist.
5. Foreslå 3 spørgsmål til en senere AI-test. De mærkes "Forslag – ikke afprøvet".
6. Hvis AI er slået til: bed AI om at forbedre formulering og prioritering. Svaret valideres. Er det ugyldigt, bruges den regelbaserede plan.

## Hver anbefaling
`{ id, change, basedOn: [fund-id], why, needsFromClient, kind }`
- `kind` er én af: `observeret` (et dokumenteret problem, status warn), `vurdering` (faglig vurdering), `kræver mere viden`.

## Tilladte værktøjer
- Fundene, fakta og vidensbasen.
- Valgfrit: Anthropic API via `workers/ai.js` (budget og tidsgrænse).
- Ingen hentning af hjemmesider, ingen søgning, ingen konkurrentdata.

## Regler
- Opfind ikke konkurrentresultater eller kunders søgeadfærd.
- Generelle råd må ikke mærkes som `observeret`.
- Ingen løfter om placering, garantier eller omtale i AI-svar.

## Manglende oplysninger og fejl
- Mangler noget fra kunden, står det i `needsFromClient`.
- AI-fejl eller ugyldigt AI-svar: regelbaseret plan bruges, og opgaven markeres "Kræver gennemgang".
- Afviser kvalitetskontrollen en anbefaling, fjernes den eller erstattes af den regelbaserede version.
