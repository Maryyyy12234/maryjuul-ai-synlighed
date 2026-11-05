# Worker 4: Kvalitetskontrollen

**Status:** Faste regler implementeret og testet. Den separate AI-gennemgang er implementeret og testet med en simuleret AI-tjeneste, men ikke afprøvet mod den rigtige Anthropic API.

## Formål
Gennemgå leverancen som et selvstændigt trin, før MARY JUUL ser den.

## Input
- Hjemmesidetjekkerens fund og dokumentation.
- Strategens anbefalinger.
- Indholdsworkerens kladder.

## Faste regler (afgør resultatet)
1. Hver anbefaling skal henvise til et eksisterende fund.
2. En anbefaling mærket `observeret` skal bygge på et fund med status `warn`. Generelle råd må ikke fremstå som fund.
3. Der skal være mindst én og højst fem anbefalinger.
4. Tal i tekstforslag skal stå i det, tjekket fandt på siden. Ellers er de opfundet.
5. E-mails og links i tekstforslag skal være fundet på siden.
6. Forbudte formuleringer: garanti, nr. 1, førsteplads, altid, 100 %, "bedste i", førende, "nævnt/anbefalet i ChatGPT" og lignende løfter.
7. Anbefalinger må ikke være så lange, at de er svære at forstå.

## Separat gennemgang (valgfri)
Når reglerne er bestået, og AI er slået til, laver en separat AI-gennemgang en ekstra læsning. Den kan kun tilføje punkter til menneskelig vurdering. Den kan aldrig godkende noget. Et ekstra AI-svar er ikke dokumentation for, at alt er korrekt.

## Ved fejl
- Fejlen sendes tilbage til strategen eller indholdsworkeren med en præcis begrundelse.
- Højst 2 rettelsesrunder. Derefter rettes de forkerte dele med faste regler, og opgaven markeres "Kræver gennemgang".

## Tilladte værktøjer
- Kun data fra opgaven. Ingen hentning af hjemmesider.
- Valgfrit: Anthropic API via `workers/ai.js` til den separate gennemgang.

## Output
`{ passed, issues: [{ target, itemId, rule, reason }], warnings, aiNotes, rounds }`

## Fælles viden
Læs `knowledge/mary-juul.md` og `knowledge/GEO-principper.md`. Brug kun principperne under "Det vi bruger". Påstandene under "Det vi IKKE bruger" må aldrig optræde i anbefalinger eller tekster.

## Leverandørpåstande
Kontrollen afviser de udokumenterede påstande fra GEO-principper.md, fx "konverterer 4,4 gange bedre", "80-90 % af købsrejser", "rank #1", procent af "AI-markedet" og "AI-score".
