# GENFANG – App-releaseplan

Kort: **PWA nu → Expo (iOS/Android) bagefter → Tauri (Mac/Windows) til sidst, hvis kunderne beder om det.**
Backend og AI-workers skal ikke omskrives på noget tidspunkt. Alle apps taler med det samme HTTPS-API.

---

## 1. Hvad der er bygget nu (fase 1 – PWA)

| Del | Status |
|---|---|
| Installérbar PWA (manifest, ikoner, maskable ikon, Apple touch icon, genveje) | Bygget og testet i Chromium |
| Service worker (statiske filer + offline-side, aldrig kundedata) | Bygget og testet |
| Mobilnavigation: bundfaner på telefon, sidebar på desktop, safe-area til iPhone-notch | Bygget og testet (iPhone 13-, Pixel 7- og desktopvisning) |
| Forside: akutte sager, afventende godkendelser, nye henvendelser, tilbud, worker-status | Bygget og testet |
| Godkend/afvis svarudkast med redigering, beskyttet mod dobbelt-godkendelse fra flere enheder | Bygget og testet |
| Versioneret API `/api/v1/*` med cookie (web) **og** Bearer-token (fremtidige native apps) | Bygget; cookie-delen testet |
| Push: tilladelse kun efter tryk, neutral låseskærmstekst | Bygget; **afsendelse ikke aktiveret** |
| Data | **Syntetiske** – den rigtige GENFANG-backend var ikke tilgængelig |

**Ikke testet**: rigtig iPhone/Android-enhed, installation fra Safari's "Føj til hjemmeskærm", rigtig push-levering.
Det kræver en fysisk telefon og en offentlig HTTPS-adresse (Vercel-testversionen).

### Næste skridt for PWA
1. Find den rigtige GENFANG-kodebase og erstat `src/lib/store.ts` med kald til Supabase (samme funktionsnavne).
2. Test på din egen iPhone og en Android-telefon via den beskyttede Vercel-adresse.
3. Gennemfør `docs/SIKKERHED.md` (blokerende punkter) før første rigtige kunde.

---

## 2. Push-notifikationer – undersøgelse

- **iPhone**: Web push virker kun, når appen er **installeret på hjemmeskærmen** (iOS 16.4+). I Safari-fanen findes det ikke. Appen viser derfor "Installer appen først" på iPhone.
- **Android/Chrome, desktop**: virker i browser og installeret app.
- **Krav**: VAPID-nøglepar. Den offentlige nøgle i `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, den private kun på serveren. Udsendelse via `web-push`-biblioteket fra en server-rute/worker, når Worker 01 markerer en sag som akut.
- **Privatliv**: payload indeholder kun et antal (`{ count: 1 }`). Service workeren skriver selv teksten "Ny akut sag venter. Åbn appen for detaljer." – så selv en kompromitteret payload ikke kan vise kundedata på låseskærmen.
- **Omkostning**: 0 kr. (Apple/Google/Mozilla push-tjenester er gratis).

---

## 3. Fase 2 – Expo / React Native (rigtig iOS- og Android-app)

### Hvorfor Expo
- Én TypeScript-kodebase til iPhone og Android, rigtige native komponenter (ikke WebView).
- **EAS Build** bygger iOS-appen i skyen – man behøver ikke selv eje en Mac til at bygge (men en Mac/iPhone er stærkt anbefalet til test).
- Push via `expo-notifications` (APNs + FCM), tokens i `expo-secure-store` (Keychain/Keystore).

### Hvad der genbruges uden omskrivning
| Fra web-appen | I Expo-appen |
|---|---|
| `/api/v1/*` (samme endpoints, samme JSON) | Kaldes med `Authorization: Bearer <token>` |
| Login-ruten (`X-GENFANG-Client: native` → token i svar) | Token gemmes i SecureStore, aldrig AsyncStorage |
| `src/lib/types.ts` | Flyttes til `packages/types` og importeres af begge |
| Godkendelseslogik + optimistisk lås | Uændret på serveren – appen sender `expectedVersion` og håndterer 409 |
| Designtokens (farver, typografi) i `globals.css` | Flyttes til `packages/design` som JS-objekt |
| AI-workers, database, cron | **Uændret** – kører server-side |

### Anbefalet struktur (først når fase 2 starter)
```
apps/web        ← nuværende genfang-app (Next.js på Vercel)
apps/mobile     ← Expo Router
packages/types  ← src/lib/types.ts
packages/api-client ← typed fetch-klient + fejlformat
packages/design ← tokens
```
Indfør først monorepo, når mobilappen faktisk bygges – ellers er det kompleksitet uden gevinst.

### Arbejdsestimat (realistisk)
- Login, oversigt, sag + godkendelse, tilbud, push: **3–5 uger** deltid med AI-hjælp.
- TestFlight + Google Play intern test: ca. 1 uge inkl. review-ventetid.

### Server-ændringer der skal til
- Supabase Auth i stedet for demo-login (Expo understøtter det direkte).
- Push-token-tabel (`device_tokens`: tenant_id, user_id, platform, token) + afsendelse fra workeren.
- Kortere access token + refresh token til native.

---

## 4. Fase 3 – Tauri 2 (Mac og Windows)

**Anbefaling: vent.** Den installérbare PWA virker allerede som desktop-app i Chrome og Edge (Windows/Mac) og giver sidebar-layout.
Byg kun Tauri, hvis betalende kunder efterspørger det (fx tastaturgenveje, systembakke, offline-krav).

Hvis det bygges: React/Vite-frontend der kalder samme `/api/v1`, token i OS-nøglering (Tauri `stronghold`/keyring-plugin), ingen privilegerede Tauri-kommandoer eksponeret, signerede opdateringer (Tauri updater kræver signatur – usignerede opdateringer må aldrig slås til).

---

## 5. Butikker og betaling – vigtigt

GENFANG er B2B SaaS. Kilder er gennemgået, men **reglerne ændrer sig hyppigt og afhænger af land – bekræft altid mod de officielle tekster og evt. App Review før lancering.**

- **Apple 3.1.3(b) "Multiplatform services"**: apps må give adgang til et abonnement købt andre steder (fx på web), hvis man **ikke** sælger eller linker til køb inde i iOS-appen. Det er den mest realistiske vej for GENFANG.
- **Apple 3.1.3(c) "Enterprise services"**: snæver undtagelse for apps solgt direkte til organisationer til deres egne ansatte. Et multi-tenant SaaS solgt til mange firmaer passer ikke nødvendigvis – regn ikke med den.
- **USA**: siden 2025 tillader Apple eksterne købslinks på den amerikanske butik. Det gælder ikke automatisk i Danmark/EU.
- **Google Play**: salg af digitale tjenester i appen kræver som udgangspunkt Google Play Billing. Nye undtagelser gælder primært USA (2025–2027) og EØS-programmer.

**Plan**: Mobilapps er "login-only" – ingen pris, ingen køb-knap, ingen links til betaling. Kunden opretter abonnement på web (Stripe), når betaling er juridisk og forretningsmæssigt klar. Live betaling forbliver slået fra indtil da.

---

## 6. Konti, signering og omkostninger

| Hvad | Hvorfor | Pris (ca., verificér) |
|---|---|---|
| Vercel Hobby | PWA-testversion | 0 kr. (kommercielt brug kræver Pro, ca. 20 USD/md) |
| Apple Developer Program | TestFlight, App Store, push på iOS, notarisering af Mac-app | 99 USD/år ≈ 700 kr. |
| Google Play Console | Android-distribution og interne tests | 25 USD én gang ≈ 175 kr. |
| Expo EAS | Cloud-builds | Gratis plan med begrænsede builds |
| Windows code signing | Undgå SmartScreen-advarsler (kun ved Tauri) | Fx Azure Trusted Signing ca. 10 USD/md |
| D-U-N-S-nummer | Kræves for at udgive som virksomhed hos Apple/Google | Gratis, men kræver registreret virksomhed (CVR) |

**Opret ikke konti med opdigtede virksomhedsoplysninger.** Udgiv som virksomhed, når CVR er på plads – ellers vises dit personlige navn i butikken.

---

## 7. Blokerende punkter før release

1. Rigtig GENFANG-backend skal kobles på (koden var ikke tilgængelig).
2. Sikkerhedspunkterne i `docs/SIKKERHED.md`.
3. Privatlivspolitik + databehandleraftaler (krævet af både Apple og Google).
4. Test på fysiske enheder.
5. Afklaring af betaling i butikkerne (afsnit 5).
6. Din eksplicitte godkendelse før produktion, butiksindsendelse eller live betaling.

### Kilder (gennemgået 7. nov. 2026)
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple forum om 3.1.1 og web-checkout: https://developer.apple.com/forums/thread/828238
- Apple-ændringer i USA 2025: https://www.macrumors.com/2025/05/01/apple-updates-u-s-app-review-guidelines-epic/
- Google Play betalingspolitik: https://play.google.com/about/monetization-ads/payments
- Google Play ændringer i USA: https://support.google.com/googleplay/android-developer/answer/17161464
- Next.js PWA-guide (fulgt ved implementering): `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md`
