# GENFANG – mobil app (PWA-testversion)

Installérbar mobil-app til håndværksvirksomheder: nye henvendelser, AI-svarudkast til godkendelse og tilbud.

> **Status: testversion med syntetiske data.**
> Den rigtige GENFANG-kodebase (Supabase, de fire AI-workers, billing) var ikke tilgængelig, da appen blev bygget.
> Al dataadgang går derfor gennem ét lag – `src/lib/store.ts` – som erstattes, når appen kobles på den rigtige backend.
> Der sendes ingen mails, SMS, push-beskeder eller betalinger.

## Kør lokalt

Node 20+.

```bash
cd genfang-app
npm install
npm run dev            # http://localhost:3100  (adgangskode i udvikling: genfang-demo)
```

Testkonti (syntetiske):

| E-mail | Virksomhed |
|---|---|
| `ejer@hansen-vvs.test` | Hansen VVS (testdata) |
| `ejer@nordlys-el.test` | Nordlys El (testdata) – bruges til at teste, at virksomheder ikke kan se hinandens data |

## Test

```bash
npm run typecheck
npm test                                   # 18 unit-tests: isolering, dobbelt-godkendelse, sessioner, push-indhold

# End-to-end i rigtig Chromium (iPhone 13, Pixel 7 og desktop):
export SESSION_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
export DEMO_PASSWORD=en-lang-testkode
npm run build && npm start &
BASE_URL=http://localhost:3100 npm run test:e2e   # 20 scenarier + skærmbilleder i test/e2e/screenshots
```

## Struktur

```
src/proxy.ts                 optimistisk login-redirect (Next 16 "proxy", tidl. middleware)
src/lib/types.ts             delte typer – klar til at blive packages/types for Expo/Tauri
src/lib/store.ts             SYNTETISK datalag + godkendelseslogik (optimistisk lås, outbox)
src/lib/session.ts           HMAC-signerede sessioner (cookie for web, Bearer for native apps)
src/lib/auth.ts, api.ts      session-kontrol, CSRF-tjek, ensartede API-fejl
src/app/api/v1/*             versioneret JSON-API – samme kontrakt kan bruges af iOS/Android/desktop
src/app/(app)/*              Oversigt · Henvendelser · Sag · Tilbud · Mere
src/app/manifest.ts          PWA-manifest
public/sw.js                 service worker (cacher aldrig kundedata)
public/icons/*               app-ikoner (genereres med `npm run icons`)
docs/APP-RELEASE-PLAN.md     plan for Vercel-test, push, Expo/React Native og Tauri
docs/SIKKERHED.md            sikkerhedsgennemgang før rigtige kunder
```

## Deploy (beskyttet testversion)

Vercel-projekt med **Root Directory = `genfang-app`**, framework Next.js. Miljøvariabler:
`SESSION_SECRET` (≥ 32 tegn) og `DEMO_PASSWORD` (≥ 8 tegn). Slå **Deployment Protection → Vercel Authentication** til for alle deployments.
Uden de to variabler nægter serveren login i produktion.
