# Sikkerhed – GENFANG mobil-app

Status for testversionen og hvad der skal på plads, før rigtige kunder kobles på.
Intet her er en certificering. Det er en teknisk tjekliste.

## Implementeret og testet

| Område | Hvad | Test |
|---|---|---|
| Login | Signeret session (HMAC-SHA256), httpOnly + Secure + SameSite=Lax cookie, 8 timers levetid | unit + e2e |
| Forfalskning | Ændret tenant-id eller signatur afvises; udløbne tokens afvises | unit + e2e |
| Virksomhedsisolering | Alle opslag kræver tenant-id. Andres sager giver 404 (lækker ikke eksistens) – side, API og godkendelse | unit + e2e |
| Dobbelt-godkendelse | Optimistisk lås (version) + status-tjek + højst ét outbox-job pr. sag. Dobbelttryk sender kun én forespørgsel | unit + e2e |
| CSRF | POST med cookie kræver samme Origin | e2e |
| Rate limiting | Login: 5 pr. e-mail / 20 pr. IP pr. 15 min. Godkendelser: 30/min pr. bruger | unit + e2e |
| Brute force / timing | Adgangskode sammenlignes i konstant tid; samme fejl for ukendt e-mail og forkert kode | unit |
| Cache | API: `no-store`. Service worker cacher aldrig `/api` eller HTML-sider. Offline vises neutral side | e2e |
| Push | Kun tilladelse efter tryk. Låseskærmstekst er altid neutral ("Ny akut sag venter") – aldrig navn/adresse/besked. Push-endpoint valideres mod kendte push-tjenester. Notifikationsklik kan kun åbne godkendte stier | unit + kode |
| Headers | X-Frame-Options DENY, frame-ancestors 'none', nosniff, HSTS, Referrer-Policy, Permissions-Policy, noindex | e2e |
| Udgående kommunikation | Godkendte svar registreres som `blokeret_testversion`. Intet sendes | unit |
| Hemmeligheder | Ingen API-nøgler i klientkode. Produktion nægter at starte login uden `SESSION_SECRET`/`DEMO_PASSWORD` | kode |

## Mangler før rigtige kunder (blokerende)

1. **Rigtig auth**: erstat demo-adgangskode med Supabase Auth (magic link eller adgangskode + MFA for ejere). Én konto pr. person.
2. **Rigtig database med RLS**: alle tabeller med `tenant_id` og RLS-politikker; server bruger brugerens JWT – ikke service-role – til læsning. Godkendelse som én betinget `UPDATE ... WHERE version = $n AND status = 'udkast_klar'` + unikt indeks på `outbox(inquiry_id)`.
3. **Delt rate limiting** (Postgres eller Redis) – hukommelses-limiteren virker kun pr. instans.
4. **Varig audit-log** i databasen (ikke hukommelse), med hvem/hvad/hvornår/version.
5. **Prompt injection**: kundebeskeder er utroværdig input. Workers må ikke kunne udløse handlinger ud fra beskedtekst; udkast skal altid godkendes af et menneske (det gør appen allerede).
6. **Push-afsendelse**: VAPID-nøglepar, privat nøgle kun server-side, sletning af udløbne abonnementer, og stadig kun neutral tekst.
7. **CSP med nonce** for scripts (i dag beskyttes mod framing, ikke mod injicerede scripts).
8. **GDPR**: databehandleraftaler (Vercel, Supabase, Anthropic), EU-region, slettepolitik, privatlivspolitik, fortegnelse. Få juridisk hjælp til kontrakter, før første betalende kunde.
9. **Fejlovervågning og backup** (fx Sentry EU + Supabase PITR).
10. **Ekstern gennemgang** (pentest eller grundig code review), før offentlig lancering.
