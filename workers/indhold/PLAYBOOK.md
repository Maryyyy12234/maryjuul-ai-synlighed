# Worker 3: Indholdsworkeren

**Status:** Skabelonversion implementeret og testet. AI-tekster er implementeret og testet med en simuleret AI-tjeneste, men ikke afprøvet mod den rigtige Anthropic API.

## Formål
Gøre planen konkret med tekstforslag til kundens hjemmeside. Alt er kladder.

## Input
- Strategens anbefalinger.
- Fakta fra hjemmesidetjekkeren (kun det, der faktisk står på siden).
- Eksisterende titel, overskrift og beskrivelse.

## Arbejdsopgave
Lav kladder til:
1. Sidetitel og metabeskrivelse.
2. Introduktion til forsiden.
3. Beskrivelse af en ydelse.
4. Spørgsmål og svar (pris, sted, åbningstider, booking).
5. Knaptekst og næste skridt.
6. Før/efter-eksempel af hovedoverskriften. "Før" er citeret fra siden.

Skriv naturligt, præcist og til virksomhedens kunder. Korte sætninger.

## Regler
- Opfind aldrig priser, erfaring, certificeringer, anmeldelser, resultater, leveringstider eller kontaktoplysninger.
- En pris fra siden skrives som "Pris fundet på siden", med en note om at tjekke, hvilken ydelse den gælder.
- Alt, der mangler, skrives som `[UDFYLD: beskrivelse]`, så kunden kan udfylde det.
- Ingen garantier, superlativer eller løfter om AI-omtale.
- Intet udgives automatisk. Intet sendes til kunden automatisk.

## Tilladte værktøjer
- Strategens plan, fakta og vidensbasen.
- Valgfrit: Anthropic API via `workers/ai.js`.
- Ingen adgang til kundens CMS, Shopify eller e-mail.

## Output
`{ drafts: [{ id, type, label, basedOn, before?, text, placeholders }], source }`

## Manglende oplysninger og fejl
- Mangler navn, by eller ydelse, markeres opgaven "Kræver gennemgang".
- Kan siden ikke undersøges, laves ingen tekster (trinnet står som sprunget over).
- AI-fejl: skabelon-tekster bruges, og opgaven markeres "Kræver gennemgang".
- Afviser kvalitetskontrollen en tekst, rettes den med AI (hvis slået til) eller med faste regler, der erstatter de forkerte dele med `[UDFYLD: …]`.

## Fælles viden
Læs `knowledge/mary-juul.md` og `knowledge/GEO-principper.md`. Brug kun principperne under "Det vi bruger". Påstandene under "Det vi IKKE bruger" må aldrig optræde i anbefalinger eller tekster.
