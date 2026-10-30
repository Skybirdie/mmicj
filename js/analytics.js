/* =========================================================
   MMicj in-app analytics  (js/analytics.js  v1.0.0)

   Counts, for the admin portal only:
     session        the app was opened
     section_view   a section was shown (front / reader / video / slideshow)
     item_open      a book, video or slideshow was opened
     share_tap      a share button was pressed
     share_tile     a tile was chosen in the share panel (WhatsApp, Copy link ...)
     share_done     the native share sheet reported success
   (Share LINKS being opened by other people are counted on the server, in
    worker.js, so nothing here is needed for them.)

   How it stays cheap
     Every click only adds 1 to an in-memory counter. Nothing is sent per
     click. The counters are saved in this browser and sent as ONE small
     summary: when the page is hidden or closed, or at most once every
     5 minutes while it stays open. Never more than 20 sends a day per
     device. A failed send keeps the counters and tries again later.

   What is NOT collected
     No names, no IP address, no search text, no page content. Each browser
     holds one random id (so "visitors" can be counted) and nothing else.
     Do Not Track / Global Privacy Control are respected.

   HOW TO SWITCH IT OFF  (any ONE of these is enough)
     1. Cloudflare -> Worker mmicj -> Settings -> Variables:
        ANALYTICS_ENABLED = false   (no redeploy; the Worker stops writing
        and every app tells itself to pause for 6 hours the next time it
        reports)
     2. Set ENABLED below to false  (this file then does nothing at all)
     3. Remove the <script src="js/analytics.js"> line from index.html
   To leave YOUR OWN device out of the numbers, open the app once with
   ?an=off  (and ?an=on to count it again).

   Everything is wrapped so a failure here can never reach the app: if
   anything throws, analytics quietly stops and the app carries on.
   ========================================================= */
(function () {
    "use strict";

    /* ----- the switches and limits (the only things worth editing) ----- */
    const ENABLED = true;                    /* master switch for this file */
    const RESPECT_DNT = true;                /* honour Do Not Track / Global Privacy Control */
    const ENDPOINT = "/__sky_collect";
    const MIN_SEND_GAP_MS = 5 * 60 * 1000;   /* while the app stays open: at most one send per 5 minutes */
    const HIDDEN_SEND_GAP_MS = 60 * 1000;    /* when the page is hidden/closed: at most one send per minute */
    const MAX_SENDS_PER_DAY = 20;            /* per device, per day: a hard ceiling on Worker requests */
    const MAX_ENTRIES_PER_SEND = 40;         /* distinct (event, section, item) lines in one send */
    const MAX_PENDING_KEYS = 300;            /* the local backlog never grows past this */
    const PAUSE_WHEN_OFF_MS = 6 * 60 * 60 * 1000;     /* after the server says "off" */
    const PAUSE_WHEN_MISSING_MS = 24 * 60 * 60 * 1000; /* after 403/404/405/410: no such endpoint here */
    const REOPEN_DEDUPE_MS = 30 * 1000;      /* the same item "opened" twice within 30 s counts once */
    const STORE_KEY = "mm-an-v1";
    const SKIP_KEY = "mm-an-skip";

    const EVENTS = ["session", "section_view", "item_open", "share_tap", "share_tile", "share_done"];
    const SECTIONS = { front: 1, reader: 1, video: 1, slideshow: 1 };
    const SECTION_ALIASES = {
        book: "reader", books: "reader", reader: "reader", pdf: "reader", pdfs: "reader", magazine: "reader", magazines: "reader",
        video: "video", videos: "video",
        slideshow: "slideshow", slideshows: "slideshow",
        front: "front"
    };

    if (!ENABLED) { window.MMAnalytics = { enabled: false, reason: "ENABLED is false" }; return; }

    /* ----- safe storage (can throw or be empty in private windows / Glide iframes) ----- */
    const lsGet = k => { try { return window.localStorage.getItem(k); } catch (_) { return null; } };
    const lsSet = (k, v) => { try { window.localStorage.setItem(k, v); return true; } catch (_) { return false; } };

    /* ----- ?an=off / ?an=on : leave this device out (the admins' own phones) ----- */
    try {
        const q = new URLSearchParams(window.location.search).get("an");
        if (q === "off") lsSet(SKIP_KEY, "1");
        else if (q === "on") { try { window.localStorage.removeItem(SKIP_KEY); } catch (_) { } }
    } catch (_) { }

    const dnt = () => {
        try {
            return navigator.doNotTrack === "1" || window.doNotTrack === "1" || navigator.globalPrivacyControl === true;
        } catch (_) { return false; }
    };

    if (lsGet(SKIP_KEY) === "1") { window.MMAnalytics = { enabled: false, reason: "this device is excluded (?an=off)" }; return; }
    if (RESPECT_DNT && dnt()) { window.MMAnalytics = { enabled: false, reason: "Do Not Track" }; return; }
    try { if (navigator.webdriver) { window.MMAnalytics = { enabled: false, reason: "automated browser" }; return; } } catch (_) { }

    /* ----- state, kept in this browser ----- */
    const todayKey = () => new Date().toISOString().slice(0, 10);

    function randomId() {
        try {
            const a = new Uint8Array(8);
            crypto.getRandomValues(a);
            return Array.from(a, b => b.toString(16).padStart(2, "0")).join("");
        } catch (_) {
            return Math.random().toString(16).slice(2, 10) + Math.random().toString(16).slice(2, 10);
        }
    }

    let state = { vid: "", pending: {}, day: todayKey(), sends: 0, pausedUntil: 0 };
    try {
        const saved = JSON.parse(lsGet(STORE_KEY) || "null");
        if (saved && typeof saved === "object") {
            state.vid = typeof saved.vid === "string" ? saved.vid.slice(0, 32) : "";
            state.pending = saved.pending && typeof saved.pending === "object" ? saved.pending : {};
            state.day = typeof saved.day === "string" ? saved.day : state.day;
            state.sends = Number(saved.sends) || 0;
            state.pausedUntil = Number(saved.pausedUntil) || 0;
        }
    } catch (_) { }
    if (!state.vid) state.vid = randomId();
    if (state.day !== todayKey()) { state.day = todayKey(); state.sends = 0; }

    let persistTimer = 0;
    function persistNow() {
        persistTimer = 0;
        lsSet(STORE_KEY, JSON.stringify(state));
    }
    function persistSoon() {
        if (!persistTimer) persistTimer = window.setTimeout(persistNow, 2000);
    }

    const paused = () => state.pausedUntil > Date.now();
    function pauseFor(ms, dropPending) {
        state.pausedUntil = Date.now() + ms;
        if (dropPending) state.pending = {};
        persistNow();
    }

    /* ----- counting ----- */
    const SEP = "\u0001";
    const cleanId = v => String(v == null ? "" : v).replace(/[^A-Za-z0-9_\-.:~]/g, "_").slice(0, 64);
    const cleanDetail = v => String(v == null ? "" : v).toLowerCase().replace(/[^a-z0-9_\-]/g, "").slice(0, 24);
    const sectionOf = v => SECTION_ALIASES[String(v || "").trim().toLowerCase()] || "";
    const lastOpen = {};

    function track(event, section, id, detail) {
        try {
            if (paused() || EVENTS.indexOf(event) < 0) return;
            const sec = SECTIONS[section] ? section : "";
            const key = [event, sec, cleanId(id), cleanDetail(detail)].join(SEP);
            if (!(key in state.pending) && Object.keys(state.pending).length >= MAX_PENDING_KEYS) return;
            state.pending[key] = (state.pending[key] || 0) + 1;
            persistSoon();
        } catch (_) { }
    }

    function inShareMode() {
        try { return !!(window.ShareManager && ShareManager.isShareMode && ShareManager.isShareMode()); } catch (_) { return false; }
    }

    function trackOpen(section, id) {
        try {
            const clean = cleanId(id);
            if (!clean) return;
            const k = section + SEP + clean, now = Date.now();
            if (lastOpen[k] && now - lastOpen[k] < REOPEN_DEDUPE_MS) return;
            lastOpen[k] = now;
            track("item_open", section, clean, inShareMode() ? "share" : "");
        } catch (_) { }
    }

    /* ----- sending ----- */
    function surface() {
        try {
            if (inShareMode()) return "share";
            if (window.self !== window.top) return "embed";
            if ((window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true) return "pwa";
        } catch (_) { return "embed"; }   /* reading window.top threw: we ARE framed */
        return "browser";
    }

    let inflight = false;
    let lastSend = Date.now();   /* the 5-minute timer counts from when the app opened */
    let lastHideSend = 0;        /* a short visit must still be able to report once when it ends */

    function takeBatch() {
        const keys = Object.keys(state.pending).slice(0, MAX_ENTRIES_PER_SEND);
        const sent = {};
        const e = keys.map(k => {
            const p = k.split(SEP);
            sent[k] = state.pending[k];
            return [p[0], p[1], p[2], p[3], state.pending[k]];
        });
        return { e, sent };
    }

    function subtract(sent) {
        Object.keys(sent).forEach(k => {
            const left = (state.pending[k] || 0) - sent[k];
            if (left > 0) state.pending[k] = left; else delete state.pending[k];
        });
        persistNow();
    }

    function canSend() {
        if (paused() || inflight) return false;
        if (state.day !== todayKey()) { state.day = todayKey(); state.sends = 0; }
        return state.sends < MAX_SENDS_PER_DAY && Object.keys(state.pending).length > 0;
    }

    function send(useBeacon) {
        try {
            if (!canSend()) return;
            const batch = takeBatch();
            if (!batch.e.length) return;
            const body = JSON.stringify({ v: 1, a: state.vid, p: surface(), e: batch.e });
            state.sends += 1;
            lastSend = Date.now();

            if (useBeacon) lastHideSend = Date.now();
            if (useBeacon && navigator.sendBeacon) {
                /* page is going away: fire and forget (text/plain keeps it a "simple" request) */
                const queued = navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }));
                if (queued) subtract(batch.sent); else persistNow();
                return;
            }

            inflight = true;
            fetch(ENDPOINT, {
                method: "POST",
                body,
                keepalive: true,
                credentials: "omit",
                headers: { "Content-Type": "text/plain;charset=UTF-8" }
            }).then(res => {
                inflight = false;
                if (res.ok) {
                    subtract(batch.sent);
                    return res.json().then(j => { if (j && j.on === false) pauseFor(PAUSE_WHEN_OFF_MS, true); }, () => { });
                }
                if (res.status === 403 || res.status === 404 || res.status === 405 || res.status === 410) pauseFor(PAUSE_WHEN_MISSING_MS, true);
                else persistNow();   /* 429 / 5xx: keep the counters, try again after the gap */
            }).catch(() => { inflight = false; persistNow(); });
        } catch (_) { inflight = false; }
    }

    function maybeSend() {
        if (document.visibilityState === "hidden") return;
        if (Date.now() - lastSend >= MIN_SEND_GAP_MS) send(false);
    }

    function onHide() {
        persistNow();
        if (Date.now() - lastHideSend >= HIDDEN_SEND_GAP_MS) send(true);
    }

    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") onHide(); });
    window.addEventListener("pagehide", onHide);
    window.setInterval(maybeSend, 60 * 1000);   /* a clock tick only; it sends nothing unless counters are waiting */

    /* ----- what gets counted ----- */

    /* sections: AppSwitcher already announces every switch */
    window.addEventListener("app:switched", ev => {
        try {
            const id = ev && ev.detail && ev.detail.id;
            if (SECTIONS[id]) track("section_view", id, "", "");
        } catch (_) { }
    });

    /* wraps obj[name] so `before` runs first and the original runs exactly as it did, with the same `this`, arguments and result */
    function wrap(obj, name, before) {
        try {
            const orig = obj && obj[name];
            if (typeof orig !== "function" || orig.__mmAn) return false;
            const wrapped = function () {
                try { before.apply(this, arguments); } catch (_) { }
                return orig.apply(this, arguments);
            };
            wrapped.__mmAn = true;
            obj[name] = wrapped;
            return true;
        } catch (_) { return false; }
    }

    function install() {
        wrap(window.VideoViewer, "openVideo", video => { if (video) trackOpen("video", video.id); });
        wrap(window.SlideshowViewer, "open", item => { if (item) trackOpen("slideshow", item.id); });
        wrap(window.SRNavigation, "openMagazine", book => { if (book) trackOpen("reader", book.id); });

        /* share button -> ShareManager.share(section, item): the one funnel every item share button uses */
        wrap(window.ShareManager, "share", (section, item) => {
            const sec = sectionOf(section);
            lastShare = { section: sec, id: item && item.id };
            track("share_tap", sec, item && item.id, "");
        });
    }

    let lastShare = { section: "front", id: "" };

    /* the front page share button has its own panel */
    document.addEventListener("click", ev => {
        try {
            const t = ev.target && ev.target.closest ? ev.target : null;
            if (!t) return;
            if (t.closest("#frontShareButton")) {
                lastShare = { section: "front", id: "" };
                track("share_tap", "front", "", "");
                return;
            }
            /* a tile chosen in either share panel: data-platform says which (copy, whatsapp, x, ...) */
            const tile = t.closest(".itemShareTile, .frontShareTile");
            if (tile && tile.dataset && tile.dataset.platform) {
                const front = tile.classList.contains("frontShareTile");
                track("share_tile", front ? "front" : lastShare.section, front ? "" : lastShare.id, tile.dataset.platform);
            }
        } catch (_) { }
    }, true);

    /* the native share sheet: count it only when the browser reports that sharing completed */
    try {
        if (typeof navigator.share === "function" && !navigator.share.__mmAn) {
            const nativeShare = navigator.share;
            const wrappedShare = function () {
                const p = nativeShare.apply(this, arguments);
                try {
                    if (p && typeof p.then === "function") {
                        const section = lastShare.section, id = lastShare.id;
                        p.then(() => track("share_done", section, id, "native"), () => { });
                    }
                } catch (_) { }
                return p;
            };
            wrappedShare.__mmAn = true;
            navigator.share = wrappedShare;
        }
    } catch (_) { }

    install();
    track("session", "", "", "");
    persistSoon();

    window.MMAnalytics = {
        enabled: true,
        track,
        flush: () => send(false),                        /* for testing in the console: MMAnalytics.flush() */
        pending: () => JSON.parse(JSON.stringify(state.pending)),
        pauseUntil: () => state.pausedUntil
    };
})();
