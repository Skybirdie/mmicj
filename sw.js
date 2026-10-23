/* =========================================================
   mmicj service worker  (sw.js)

   Purpose: lets browsers offer "Install app", and shows a friendly
   offline page when the app is opened with no connection.

   It caches NOTHING of the app itself, so it can never serve a stale
   page, catalog, PDF or image. The only things it keeps are two small
   files for the offline screen: /offline.html and its picture
   /assets/errors/offline.webp. Page loads (navigations) pass straight
   through to the network as before and only fall back to the offline
   page if the network fails. PDF range requests, the PDF proxy, share
   links and R2 files are never touched.

   IF YOU CHANGE offline.html OR offline.webp: change OFFLINE_VERSION
   below. Browsers then install the new worker and fetch the new copies.
   ========================================================= */
const OFFLINE_VERSION = "1";
const OFFLINE_CACHE = "mmicj-offline-v" + OFFLINE_VERSION;
const OFFLINE_PAGE = "/offline.html";
const OFFLINE_IMAGE = "/assets/errors/offline.webp";

self.addEventListener("install", event => {
    event.waitUntil((async () => {
        try {
            const cache = await caches.open(OFFLINE_CACHE);
            await Promise.all([OFFLINE_PAGE, OFFLINE_IMAGE].map(async url => {
                try {
                    const res = await fetch(url, { cache: "reload" });
                    if (res.ok) await cache.put(url, res);
                } catch (e) { /* installing must never fail because of the offline page */ }
            }));
        } catch (e) { /* same */ }
        await self.skipWaiting();
    })());
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        try {
            const keys = await caches.keys();
            await Promise.all(keys.filter(k => k.startsWith("mmicj-offline-") && k !== OFFLINE_CACHE).map(k => caches.delete(k)));
        } catch (e) { /* ignore */ }
        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    const req = event.request;

    /* the offline picture itself: from the saved copy, so it shows with no connection */
    if (req.method === "GET" && new URL(req.url).pathname === OFFLINE_IMAGE) {
        event.respondWith(caches.match(OFFLINE_IMAGE).then(hit => hit || fetch(req)));
        return;
    }

    if (req.mode !== "navigate") return;

    event.respondWith(
        fetch(req).catch(async () => {
            const saved = await caches.match(OFFLINE_PAGE);
            if (saved) {
                return new Response(await saved.text(), {
                    status: 503,
                    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }
                });
            }
            /* first visit ever and already offline: the plain message that was used before */
            return new Response(
                "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
                "<title>Meditation Mornings</title>" +
                "<body style='font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#eef1f5;color:#333;text-align:center;padding:24px'>" +
                "<div><h2>Meditation Mornings</h2><p>You appear to be offline. Please check your connection and try again.</p></div>",
                { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
            );
        })
    );
});
