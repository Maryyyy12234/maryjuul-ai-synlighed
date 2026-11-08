# Betalinger, Dankort og kortterminaler

Status: november 2026. Vi **læser** betalingsdata fra eksisterende udbydere. Vi behandler aldrig kortbetalinger, styrer ingen terminaler og gemmer aldrig kortdata.

## 1. Kort fortalt

| Del | Status |
|---|---|
| Fælles Payment Connector Engine (flere udbydere pr. virksomhed) | ✅ Bygget + testet |
| Nets / MyNets: sikker CSV-import med forhåndsvisning, kolonnevalg, validering, dubletkontrol, fejlrapport, historik og annullér | ✅ Bygget + testet med eksempelfiler |
| Nets / MyNets: **rigtigt filformat** | ⚠️ **Ikke bekræftet.** Kolonnenavnene er ikke offentligt dokumenteret. Vi gætter ud fra overskrifter, og brugeren kan rette dem. Kræver en rigtig eksport fra en kunde |
| SumUp: OAuth, transaktioner, refunderinger, chargebacks, udbetalinger og gebyrer via API | ✅ Bygget + testet mod simuleret SumUp |
| SumUp mod rigtig konto | ❌ Ikke testet. Kræver SumUp-app og nøgler. developer.sumup.com var blokeret i udviklingsmiljøet |
| Afstemning: kassesalg ↔ kortbetalinger | ✅ Bygget + testet (17 scenarier) |
| PULS → Betalinger (dashboard + arbejdsliste) | ✅ Bygget, desktop + mobil tjekket |
| Integrationer → Betalinger og terminaler | ✅ Bygget |
| 3 workers: Payment Reconciliation, Settlement Monitor, Payment Insights | ✅ Bygget + testet (regler i kode, ingen sprogmodel) |
| Database-tabeller + RLS | ✅ Testet i lokal Postgres 16 |
| Zettle, Verifone, Worldline | ❌ "Integration under udvikling". Ingen knap |
| XLSX, XML og SFTP fra Nets | ❌ Ikke bygget. CSV virker. XLSX → gem som CSV |
| Data gemt i Postgres / login | ❌ Ikke koblet på (samme som resten af platformen) |
| Direkte terminalstyring | ❌ Bevidst ikke bygget (se afsnit 7) |

## 2. Research pr. udbyder

Markering: **V** = verificeret i officiel kilde, **S** = fundet via søgning (ikke åbnet direkte), **?** = ikke afklaret.

| | Nets / Nexi (MyNets) | SumUp | Zettle (PayPal POS) | Verifone | Worldline |
|---|---|---|---|---|---|
| API til historiske transaktioner | ? Ikke offentligt. Kræver aftale | **V** `GET /v2.1/merchants/{code}/transactions/history` | **S** Finance API v2 | **S** Reporting API (Verifone Central) | **S** Reporting-/Accept Transactions API |
| Udbetalinger/afregning | **S** Afregningsrapporter i MyNets | **V** `GET /v1.0/merchants/{code}/payouts` | **S** Payout-endpoint | **S** Settlement-rapporter | **S** Settlement Report |
| Gebyrer | **S** I afregningsrapporten | **V** `fee` pr. udbetalingspost | **S** `PAYMENT_FEE` | ? | **S** Gebyr-totaler |
| Webhooks | ? | **V** Kun checkouts/læsere – **ikke** terminalbetalinger. Vi poller | ? | ? | ? |
| OAuth | – (fil) | **S** Ja (`/authorize`, `/token`) – skal bekræftes | **S** Ja (`READ:FINANCE`) | ? | ? (passcode-baseret i NA) |
| Partneraftale | ? Sandsynligt for API/SFTP | ? Ikke for egen konto | ? App-registrering | **?** Sandsynligt | **?** Sandsynligt |
| Certificering | Nej for rapporter | Nej for rapport-API | Nej for Finance API | Ja for terminal-integration | Ja for terminal-integration |
| Sandbox | ? | **S** Testkonti findes | ? | ? | ? |
| Danske virksomheder | Ja (Dankort-indløser) | ? Bekræft. SDK'ens korttyper har **ingen DANKORT**-værdi | **S** Danmark understøttet | ? Nordisk dok. ikke fundet | ? Flere platforme |
| Eksport | **S** CSV, XLS/XLSX, XML, PDF | **V** Payouts også som CSV | ? | **S** CSV | ? |
| Automatisk filoverførsel | **S** SFTP (kræver opsætning hos Nets) | – | – | ? | ? |
| API-type | Rapportering | Rapportering + checkout + terminal (Reader API) | Rapportering | Begge | Begge |

**Dankort er en betalingsordning, ikke en platform.** Dankort-betalinger i fysiske butikker indløses typisk af Nets/Nexi og findes derfor i MyNets-rapporter. Co-brandede kort (Visa/Dankort) markeres som `VISA_DANKORT`.

**Et terminal-API er ikke et rapport-API.** SumUps Reader API kan starte en betaling på en terminal, men vi bruger kun transaktions- og udbetalings-API'et.

**En kortterminal alene er ikke nok til lager.** Terminalen kender kun beløbet. Hvilke varer der er solgt, kommer fra kassesystemet. Derfor får LAGER aldrig betalingsdata.

## 3. Sådan virker det

```
Kassesystem (Shopify POS)  ──►  kassesalg + ordrebetalinger  ─┐
                                                              ├─►  Afstemning  ──►  PULS (arbejdsliste)
SumUp API / Nets CSV       ──►  kortbetalinger, refunderinger, ┘                    OVERBLIK (opgaveforslag)
                                chargebacks, gebyrer, udbetalinger ──►  PULS (dashboard) · INDSIGT (analyse)
```

### Afstemning
1. **Brugerens bekræftelser** først.
2. **Sikker reference:** samme reference i kassen (`paymentId`) og hos udbyderen → *Matchet* eller *Afventer afregning*. Afviger beløbet → *Afvigelse*.
3. **Forslag:** samme type, valuta og beløb, højst 10 min. fra hinanden og samme butik (hvis terminalen er koblet til en butik) → **altid** *Kræver gennemgang*. Mangler udbyderens fil klokkeslæt, bruges datoen. Flere mulige → brugeren vælger selv.
4. **Resten:** kassebetaling uden kortbetaling → *Afventer betaling* i 48 timer, derefter *Kræver gennemgang*. Kortbetaling uden kassesalg → *Ukendt*. Chargebacks og mulige dubletter (samme beløb, samme terminal, < 60 sek.) → *Kræver gennemgang*.

Kontant del af en delt betaling afstemmes ikke. To kort på samme ordre afstemmes hver for sig. Kun kassebetalinger fra den periode, hvor der findes betalingsdata, afstemmes.

**Intet tælles dobbelt.** Afstemningen kobler kun poster sammen. Kassesalg kommer altid fra kassen, kortbetalinger altid fra udbyderen. Testet: PULS' kassesalg er uændret, efter at kortbetalinger er hentet.

### Udbetalinger
Udbetalinger samles i bundter (reference + dato). For hvert bundt: **brutto − gebyrer − fradrag = netto**. Settlement Monitor tjekker regnestykket og markerer forsinkelser, når en betaling ikke er udbetalt efter (udbetalingstid + 2) dage. "Afventer udbetaling" er *ikke* penge på kontoen.

Gebyrer vises kun, hvis de findes i udbyderens data. Mangler de, står der "Ukendt", ikke 0 kr.

## 4. Betalingssikkerhed

- **Ingen kortdata:** ingen kortnumre (heller ikke maskerede), CVV/CVC, PIN, magnetstribe- eller chipdata. Vi beder heller ikke API'er om dem.
- **CSV-import:**
  - Kolonner med navne som *kortnummer, PAN, CVV, PIN, udløb* blokeres og kan ikke vælges.
  - Kolonner, der ikke vælges, gemmes aldrig.
  - En række, hvor en valgt kolonne indeholder noget, der ligner et rigtigt kortnummer (13–19 cifre med gyldigt Luhn-tjek), afvises helt.
- **Database:**
  - `card_scheme` må kun indeholde store bogstaver (fx `VISA`). Et kortnummer afvises af databasen.
  - Unik nøgle på (forbindelse, type, reference) forhindrer dubletter.
- **Tokens:** krypteret med AES-256-GCM. Tabellen har RLS uden policies, så klienter kan ikke læse den.
- **Adgang:**
  - Kun ejeren kan forbinde, afbryde og styre datadeling.
  - Ejer og administrator kan importere.
  - Kun mennesker kan bekræfte et match.
- **Ingen handlinger med penge:** workers kan kun oprette opgaveforslag og notifikationer. Refundering, udbetaling og ændring af aftaler findes ikke i koden.
- **PCI DSS:** Når vi ikke gemmer, behandler eller sender kortdata, er vi i udgangspunktet uden for kortdata-miljøet. **Det er ikke en PCI-godkendelse.** Få det vurderet, før I markedsfører løsningen som PCI-egnet.

## 5. Opsætning

### Nets / MyNets (virker nu)
1. Integrationer → Betalinger og terminaler → Nets → **Manuel import**.
2. I MyNets: Transaktioner → vælg periode og salgssted → eksportér som **CSV**.
3. Upload, kontrollér kolonner og fejl, tryk **Importér**.
4. Kobl terminalerne til butikkerne for mere sikre forslag.

**Næste skridt:** Få en rigtig MyNets-eksport (transaktioner + afregning) fra en kunde, og gem den som fast skabelon. Spørg Nexi om SFTP-levering og API-aftale.

### SumUp (bygget, ikke testet mod rigtig konto)
1. Opret en app hos SumUp (developer.sumup.com) med redirect `https://DIN-ADRESSE/integrations/sumup/callback`.
2. Scopes: `transactions.history`, `payouts.read`, `user.profile_readonly`.
3. Sæt `SUMUP_CLIENT_ID` og `SUMUP_CLIENT_SECRET` på serveren (aldrig i frontend).
4. **Tillad `developer.sumup.com`** i udviklingsmiljøets netværk, så OAuth-adresserne og scope-navnene kan bekræftes mod dokumentationen.
5. Bekræft at danske SumUp-konti modtager Dankort, og hvordan de vises (`card_type`).

## 6. Workers

| Worker | Gør | Må |
|---|---|---|
| Payment Reconciliation | Afstemmer, forklarer afvigelser, finder dubletter og chargebacks | Opgaveforslag i OVERBLIK (uden dubletter), notifikation |
| Settlement Monitor | Brutto/netto pr. udbetaling, forsinkelser, manglende afregningsdata | Opgaveforslag, notifikation |
| Payment Insights | Volumen, refunderingsandel og gebyrsats mod forrige periode | Rapportkladde |

## 7. Direkte terminalintegration – teknisk vurdering (ikke bygget)

| Emne | Vurdering |
|---|---|
| Protokoller | Nordisk standard er **Nets/Nexi Terminal API** (tidligere *baxi*), Verifone/Worldline har egne SDK'er, og cloud-terminaler styres via REST (fx SumUp Reader API). Bekræft hos hver udbyder |
| Certificering | Integration mod en terminal kræver typisk certificering hos udbyderen for hver integration og version |
| Partneraftaler | Partnerskab med indløser/terminaludbyder. Ofte med krav til support og volumen |
| Hardware | Godkendte terminaler leveret af udbyderen. Vi må ikke selv lave hardware |
| Sikkerhed | Kortdata håndteres i terminalen (P2PE). Integrationen sender kun beløb og modtager resultat. Fejl giver dobbelte betalinger og retursager → kræver idempotens, timeout-regler og kvitteringsflow |
| Omkostninger | Certificering og partnerskab koster tid og ofte penge. Ukendt beløb. Kræver supportberedskab |
| Ansvar | Vi bliver en del af betalingsflowet. Ved fejl er butikken uden mulighed for at tage imod betalinger |
| Relevans | Kun relevant, hvis vi selv bygger et kassesystem. Det gør vi ikke |

**Anbefaling:** Byg det ikke. Læs data fra eksisterende kasse og udbyder. Hvis det bliver aktuelt, skal det være et separat produkt med egen juridisk og teknisk vurdering.

## 8. Tests

`test/payments.test.js` (17 tests) dækker blandt andet:

- **SumUp:** OAuth, paginering, løbende synk, fornyelse af adgang, serverfejl og tilbagekaldt adgang.
- **Kortdata:** kun kortets brand gemmes.
- **Afstemning:** reference, forslag, afvisning, flere mulige betalinger, afvigelse, delt betaling, to kort, refundering, chargeback, ukendt, dublet og 48-timers grænsen.
- **Dobbelttælling:** intet tælles dobbelt, og LAGER påvirkes ikke.
- **Udbetalinger:** bundter med gebyrer og fradrag samt forsinkelse.
- **Nets CSV:** blokerede kortkolonner, Luhn-tjek, ugyldig dato og beløb, dubletter i fil og mellem importer, annullering, XLSX-fil afvist, tom fil og fil uden klokkeslæt.
- **Flere udbydere:** SumUp og Nets i samme virksomhed.
- **Adgang:** anden virksomhed, datadeling slået fra, afbrydelse.
- **Workers:** opgaver uden dubletter og "løst".

Database: `db/payments_rls_test.sql`.

## Kilder
- [Nets: Settlement report tutorial](https://support.nets.eu/article/settlement-report-tutorial)
- [Nets: Where can I see my transactions?](https://support.nets.eu/article/where-can-i-see-my-transactions)
- [SumUp API (transactions, payouts)](https://developer.sumup.com/api/transactions) og den officielle TypeScript-SDK `@sumup/sdk` 0.2.3 (typer og endpoints læst lokalt)
- [Zettle Finance API (GitHub)](https://github.com/iZettle/api-documentation/tree/master/finance-api)
- [Verifone Central: generated reports](https://verifone.cloud/docs/portal/reports/generated-reports)
- [Worldline Accept Transactions API](https://financial-services.developer.worldline.com/acquiring/transactions)
