/* =========================================================
   mmicj service worker  (sw.js)

   Purpose: lets browsers offer "Install app". It does NOT cache
   anything, so it can never serve a stale page, catalog, PDF or
   image, and it never touches PDF range requests, the PDF proxy,
   share links or R2 files: only page loads (navigations) pass
   through it, straight to the network as before.

   If the network is down when the app is opened, a short message
   is shown instead of the browser's error page.
   ========================================================= */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", event => {
    if (event.request.mode !== "navigate") return;

    event.respondWith(
        fetch(event.request).catch(() => new Response(
            "<!doctype html><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'>" +
            "<title>Meditation Mornings</title>" +
            "<body style='font:16px/1.5 system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#eef1f5;color:#333;text-align:center;padding:24px'>" +
            "<div><h2>Meditation Mornings</h2><p>You appear to be offline. Please check your connection and try again.</p></div>",
            { status: 503, headers: { "content-type": "text/html; charset=utf-8" } }
        ))
    );
});
