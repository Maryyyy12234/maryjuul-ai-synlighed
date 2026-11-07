/* GENFANG service worker – sikker og bevidst simpel.
 *
 * Regler:
 * 1. Kun GET-forespørgsler på samme domæne håndteres.
 * 2. /api/* caches ALDRIG (kundedata må ikke ligge i cachen på telefonen).
 * 3. HTML-sider caches ALDRIG. Uden net vises en neutral offline-side.
 * 4. Kun statiske, versionerede filer (/_next/static, /icons) caches.
 * 5. Push-beskeder viser kun neutral tekst – aldrig kundenavn, adresse eller beskedindhold.
 */
const VERSION = "gf-v1";
const STATIC_CACHE = `${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192.png", "/icons/badge-96.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(STATIC_CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // altid netværk, aldrig cache

  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok && res.type === "basic") {
          const copy = res.clone();
          caches.open(STATIC_CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});

// Kun disse stier må åbnes fra en notifikation.
const SAFE_PATHS = ["/", "/henvendelser", "/tilbud", "/mere"];

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = {}; }
  // Vi stoler ikke på indholdet: kun et antal bruges, teksten er altid neutral.
  const count = Number.isInteger(data.count) && data.count > 0 && data.count < 100 ? data.count : 1;
  const body = count === 1 ? "Ny akut sag venter. Åbn appen for detaljer." : `${count} akutte sager venter. Åbn appen for detaljer.`;
  event.waitUntil(self.registration.showNotification("GENFANG", {
    body,
    tag: "genfang-akut",
    renotify: true,
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    data: { url: "/henvendelser" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const raw = (event.notification.data && event.notification.data.url) || "/";
  const path = SAFE_PATHS.includes(raw) ? raw : "/";
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (new URL(c.url).origin === self.location.origin) { await c.focus(); return c.navigate(path); }
    }
    return self.clients.openWindow(path);
  })());
});
