"use strict";

/* =========================================================
   Front Page birthday party  (js/birthdayParty.js  v1.3.0)
   with css/birthday-party.css

   A tiny celebration row above the bottom doors of the Front Page:

       [ gif ]  HAPPY BIRTHDAY
                Name

   - The gif is picked at random from assets/birthday/ (listed in
     assets/birthday/manifest.json) and swapped for the next one every
     10 seconds. They are dealt like a shuffled deck: every gif is used
     once before any repeats, and the same gif never shows twice in a row.
   - The names of today's birthday people are shown one at a time,
     shuffled, 3 seconds each. If there are fewer than 4 names the time
     per name is stretched so the party always lasts at least 10 seconds
     (one gif's worth).
   - When every name has been shown the row fades away and is gone until
     the app is opened again.
   - Tapping/clicking the row opens a popup: the gif, "HAPPY BIRTHDAY",
     and everyone celebrating today in alphabetical order, on the
     assets/birthday.gif backdrop. The party's clock is paused while the
     popup is open.

   WHERE IT GOES - the page is measured (not guessed) and the first
   layout that really fits wins:
     1. SIDE    room to the left of the centerpiece (wide screens):
                the row runs from the screen's left edge to a comfortable
                distance left of the centerpiece, just above the bottom
                doors. The popup also opens in that left space, so the
                centerpiece stays visible while the list is read.
     2. BELOW   no room beside it, but a clear strip between the
                centerpiece and the bottom doors (phones, portrait
                tablets): the row sits in that strip, never over the
                centerpiece, and stops just left of #frontShareButton
                when that button is above the doors.
     3. BUTTON  neither fits: a birthday button (assets/birthday-icon.gif)
                the same size as #frontShareButton and its horizontal
                mirror (left side instead of right). Like the row it only
                shows for 10 seconds (fades in, fades out); tapping it
                opens the popup.
   The decision is chooseMode() below, a pure function with tests.

   The clock only runs while the row or button is showing: it pauses in
   Books / Videos / Images, in a hidden tab, behind the loading screen and
   while the popup is open.

   WHAT THIS FILE DOES NOT DO (yet)
   It knows nothing about members. It only needs a list of display names
   for today:

       BirthdayParty.setCelebrants(["Ann", "Marcus", ...]);

   Plan for the real data: a daily scheduled Worker writes a small
   public file with today's names only; phone numbers, emails and birth
   years never reach the browser.

   PREVIEWING NOW (no data needed)
       open the app with   ?birthdaydemo=members            (assets/birthday/members-demo.json,
                                                             today's birthdays only)
                           ?birthdaydemo=1                  (sample names)
                           ?birthdaydemo=Ann,Marcus,Joy     (your own names)
       or in the console:  BirthdayParty.demo()

   COST / RISK
   With no names nothing runs: no network, no timers, no DOM. When there
   are names it fetches one tiny JSON file (the gif list) plus the gifs.
   It never touches the centerpiece, the doors or any other front-page
   code; it only appends elements inside #frontPage and reads their
   positions.
   ========================================================= */
(function(){
    "use strict";

    /* ---------------------------------------------------------
       Settings - the only numbers worth editing
       --------------------------------------------------------- */
    const GIF_FOLDER     = "assets/birthday/";
    const GIF_MANIFEST   = GIF_FOLDER + "manifest.json";   /* ["a.gif","b.gif",...] */
    const BUTTON_ICON    = "assets/birthday-icon.gif";     /* the button (layout 3) */
    const NAME_MS        = 3000;    /* time each name is shown (minimum) */
    const GIF_MS         = 10000;   /* the gif changes this often */
    const MIN_PARTY_MS   = 10000;   /* the party never ends sooner than this */
    const BUTTON_MS      = 10000;   /* how long the birthday button (layout 3) shows */
    const TICK_MS        = 200;     /* clock resolution */
    const FADE_MS        = 280;     /* name / gif cross-fade (match the CSS) */
    const LEAVE_MS       = 500;     /* fade-out before the row is removed */

    /* layout numbers (px) */
    const INSET          = 10;      /* gap to the screen's left edge */
    const GAP_CENTER     = 18;      /* gap between the row and the centerpiece */
    const GAP_DOORS      = 6;       /* gap between the row and the bottom doors */
    const GAP_BELOW      = 4;       /* gap between the centerpiece and the row below it */
    const SIDE_MIN_W     = 190;     /* narrowest useful row beside the centerpiece */
    const BELOW_MIN_W    = 190;     /* narrowest useful row below it */
    const SHARE_GAP      = 8;       /* gap between the row and #frontShareButton */
    const POPUP_SIDE_MIN = 260;     /* narrowest popup worth placing beside the centerpiece */
    const POPUP_SIDE_MAX = 400;
    const POPUP_SIDE_MIN_H = 300;

    const DEMO_NAMES = ["Ava", "Marcus", "Joy", "Daniel", "Hannah"];
    const DEMO_MEMBERS_FILE = GIF_FOLDER + "members-demo.json";   /* ?birthdaydemo=members */

    /* ---------------------------------------------------------
       Pure helpers (no page needed; tested in birthdayParty.test.mjs)
       --------------------------------------------------------- */

    /* Trim, collapse spaces, drop blanks and duplicates (ignoring case). */
    function cleanNames(list){
        const seen = new Set();
        const out = [];
        (Array.isArray(list) ? list : []).forEach(raw => {
            const name = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
            if(!name) return;
            const key = name.toLocaleLowerCase();
            if(seen.has(key)) return;
            seen.add(key);
            out.push(name);
        });
        return out;
    }

    function alphabetical(names){
        return names.slice().sort((a, b) =>
            a.localeCompare(b, undefined, {sensitivity:"base", numeric:true}));
    }

    function shuffled(list, rnd){
        const random = rnd || Math.random;
        const a = list.slice();
        for(let i = a.length - 1; i > 0; i--){
            const j = Math.floor(random() * (i + 1));
            const t = a[i]; a[i] = a[j]; a[j] = t;
        }
        return a;
    }

    /* How long each name shows and how long the whole party lasts. */
    function plan(count){
        const n = Math.max(1, count | 0);
        const perName = Math.max(NAME_MS, Math.ceil(MIN_PARTY_MS / n));
        return {perName:perName, total:perName * n};
    }

    /* A shuffled deck of gifs: all used once, then reshuffled, and the
       first card of a new deck is never the last card of the old one. */
    function gifDeck(files, rnd){
        const random = rnd || Math.random;
        let queue = [];
        let last = null;
        return {
            next(){
                if(!files.length) return null;
                if(!queue.length){
                    queue = shuffled(files, random);
                    if(files.length > 1 && queue[0] === last){
                        const j = 1 + Math.floor(random() * (queue.length - 1));
                        const t = queue[0]; queue[0] = queue[j]; queue[j] = t;
                    }
                }
                last = queue.shift();
                return last;
            }
        };
    }

    /* Only plain file names from the manifest (no paths, no tricks). */
    function manifestFiles(json){
        return (Array.isArray(json) ? json : []).filter(f =>
            typeof f === "string" && f.trim() &&
            !/[\\/]/.test(f) && f.indexOf("..") === -1
        ).map(f => f.trim());
    }

    /* From a members list ({name, birthday:"YYYY-MM-DD" | "MM-DD"}) the names
       whose birthday is `date` (default: now, device time). A 29 February
       birthday is celebrated on 28 February in years that have no 29th. */
    function birthdaysToday(members, date){
        const now = date || new Date();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        const y = now.getFullYear();
        const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
        const out = [];
        (Array.isArray(members) ? members : []).forEach(m => {
            const match = m && /(?:^|-)(\d{2})-(\d{2})$/.exec(String(m.birthday || "").trim());
            if(!match) return;
            const mm = +match[1], dd = +match[2];
            const hit = (mm === month && dd === day) ||
                        (!leap && mm === 2 && dd === 29 && month === 2 && day === 28);
            if(hit) out.push(m.name);
        });
        return out;
    }

    /* Height of the row for a given width (matches the tiers in
       css/birthday-party.css: gif 72 / 60 / 48 px). */
    function rowHeightFor(width){
        return width >= 300 ? 72 : width >= 220 ? 60 : 48;
    }

    /* Which layout fits? All numbers are pixels measured on the page:
         vw, vh      the Front Page's size
         center      {left, right, top, bottom} of the centerpiece
         waveTop     top edge of the bottom doors
         shareLeft   left edge of #frontShareButton (or null)
         shareAbove  true when that button sits above the doors (phones)
       Returns {mode:"side"|"below"|"button", right, bottom}
       (right/bottom = distance from the screen's right / bottom edge). */
    function chooseMode(g){
        const bottom = Math.round(g.vh - g.waveTop + GAP_DOORS);

        /* 1. beside the centerpiece */
        const sideW = g.center.left - INSET - GAP_CENTER;
        if(sideW >= SIDE_MIN_W){
            return {mode:"side", right:Math.round(g.vw - (g.center.left - GAP_CENTER)), bottom:bottom};
        }

        /* 2. in the strip between the centerpiece and the doors */
        const rightEdge = (g.shareAbove && g.shareLeft != null)
            ? g.shareLeft - SHARE_GAP
            : g.vw - INSET;
        const belowW = rightEdge - INSET;
        const room = (g.waveTop - GAP_DOORS) - (g.center.bottom + GAP_BELOW);
        if(belowW >= BELOW_MIN_W && room >= rowHeightFor(belowW)){
            return {mode:"below", right:Math.round(g.vw - rightEdge), bottom:bottom};
        }

        /* 3. no room: the mirrored button */
        return {mode:"button", right:0, bottom:bottom};
    }

    /* Where the popup goes: beside the centerpiece if there is room for a
       reasonable card, otherwise centered. top/bottom are the free band
       between the top and bottom doors. */
    function choosePopup(g){
        const left = INSET + 6;
        const width = Math.min(POPUP_SIDE_MAX, Math.round(g.center.left - left - GAP_CENTER));
        const top = Math.round(g.topWaveBottom + 12);
        const bottom = Math.round(g.vh - g.waveTop + 12);
        const height = g.vh - top - bottom;
        if(width >= POPUP_SIDE_MIN && height >= POPUP_SIDE_MIN_H){
            return {placement:"side", left:left, width:width, top:top, bottom:bottom};
        }
        return {placement:"center"};
    }

    const CORE = {cleanNames, alphabetical, shuffled, plan, gifDeck, manifestFiles, birthdaysToday,
                  chooseMode, choosePopup, rowHeightFor,
                  NAME_MS, GIF_MS, MIN_PARTY_MS};

    /* ---------------------------------------------------------
       The party
       --------------------------------------------------------- */
    let party = null;          /* the running (or finished) party, if any */

    function frontPage(){ return document.getElementById("frontPage"); }

    function frontIsShowing(){
        const page = frontPage();
        return !!page && page.classList.contains("app-section-active");
    }

    function el(tag, className, text){
        const node = document.createElement(tag);
        if(className) node.className = className;
        if(text != null) node.textContent = text;
        return node;
    }

    /* Show `url` in `img`; if it cannot load, show the gradient disc. */
    function loadInto(img, box, url, done){
        if(!url){
            box.classList.add("is-fallback");
            if(done) done(false);
            return;
        }
        const probe = new Image();
        probe.onload = function(){
            box.classList.remove("is-fallback");
            img.src = url;
            if(done) done(true);
        };
        probe.onerror = function(){
            box.classList.add("is-fallback");
            if(done) done(false);
        };
        probe.src = url;
    }

    const CLOSE_ICON =
        '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" ' +
        'stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>';

    /* little star shown on the gold disc when the button's gif is missing */
    const STAR_ICON =
        '<svg class="bp-star" viewBox="0 0 24 24" aria-hidden="true"><path fill="#fff" ' +
        'd="M12 2.5l2.7 6.2 6.8.6-5.1 4.5 1.5 6.6L12 16.9l-5.9 3.5 1.5-6.6L2.5 9.3l6.8-.6z"/></svg>';

    function build(p){
        const page = frontPage();
        if(!page) return false;

        /* --- the row --- */
        const root = el("div");
        root.id = "frontBirthdayParty";
        root.hidden = true;                 /* shown once a layout has been chosen */

        const row = el("button", "bp-row");
        row.type = "button";
        row.setAttribute("aria-haspopup", "dialog");
        row.setAttribute("aria-label", "Happy birthday! See who is celebrating today");

        const gifBox = el("span", "bp-gif");
        const gifImg = el("img");
        gifImg.alt = "";
        gifImg.draggable = false;
        gifBox.appendChild(gifImg);

        const text = el("span", "bp-text");
        text.setAttribute("aria-hidden", "true");
        const title = el("span", "bp-title", "HAPPY BIRTHDAY");
        const name = el("span", "bp-name");
        text.appendChild(title);
        text.appendChild(name);

        row.appendChild(gifBox);
        row.appendChild(text);
        root.appendChild(row);

        /* --- the button (layout 3): mirror of #frontShareButton --- */
        const button = el("button");
        button.id = "frontBirthdayButton";
        button.type = "button";
        button.hidden = true;
        button.title = "Today's birthdays";
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-label", "Today's birthdays");
        const btnBox = el("span", "bp-btn-gif");
        const btnImg = el("img");
        btnImg.alt = "";
        btnImg.draggable = false;
        btnBox.appendChild(btnImg);
        btnBox.insertAdjacentHTML("beforeend", STAR_ICON);
        button.appendChild(btnBox);

        /* --- the popup --- */
        const modal = el("div", "bp-modal");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "bpModalTitle");
        modal.dataset.placement = "center";

        const backdrop = el("div", "bp-modal-backdrop");
        const card = el("div", "bp-card");

        const close = el("button", "bp-close");
        close.type = "button";
        close.setAttribute("aria-label", "Close");
        close.innerHTML = CLOSE_ICON;

        const cardGifBox = el("div", "bp-card-gif");
        const cardGifImg = el("img");
        cardGifImg.alt = "";
        cardGifImg.draggable = false;
        cardGifBox.appendChild(cardGifImg);

        const cardTitle = el("h2", "bp-card-title", "HAPPY BIRTHDAY");
        cardTitle.id = "bpModalTitle";

        const list = el("ul", "bp-card-list");
        p.sorted.forEach(n => list.appendChild(el("li", "", n)));

        card.appendChild(close);
        card.appendChild(cardGifBox);
        card.appendChild(cardTitle);
        card.appendChild(list);
        modal.appendChild(backdrop);
        modal.appendChild(card);

        page.appendChild(root);
        page.appendChild(button);
        page.appendChild(modal);

        row.addEventListener("click", () => openModal());
        button.addEventListener("click", () => openModal());
        close.addEventListener("click", () => closeModal());
        backdrop.addEventListener("click", () => closeModal());
        modal.addEventListener("keydown", e => {
            if(e.key === "Escape"){ e.stopPropagation(); closeModal(); }
        });

        loadInto(btnImg, btnBox, BUTTON_ICON);

        p.dom = {root, row, button, gifBox, gifImg, name, modal, close, cardGifBox, cardGifImg};
        return true;
    }

    /* ---- measuring and choosing the layout ---- */
    function rectIn(page, selectorOrEl){
        const node = typeof selectorOrEl === "string" ? page.querySelector(selectorOrEl) : selectorOrEl;
        if(!node) return null;
        const r = node.getBoundingClientRect();
        if(!r.width && !r.height) return null;
        const pr = page.getBoundingClientRect();
        return {left:r.left - pr.left, right:r.right - pr.left, top:r.top - pr.top, bottom:r.bottom - pr.top};
    }

    function measure(){
        const page = frontPage();
        if(!page || !frontIsShowing()) return null;
        const pr = page.getBoundingClientRect();
        const vw = pr.width, vh = pr.height;
        if(!vw || !vh) return null;

        const narrow = vw <= 700;
        /* If the doors are not built yet, use the same sizes front-page.css uses. */
        let center = rectIn(page, ".front-door-center");
        if(!center){
            const s = Math.min(vh * 0.75, vw * (narrow ? 0.84 : 0.82));
            center = {left:(vw - s) / 2, right:(vw + s) / 2, top:(vh - s) / 2, bottom:(vh + s) / 2};
        }
        const wave = rectIn(page, "#frontWave");
        const waveTop = wave ? wave.top : vh - vh * (narrow ? 0.15 : 0.10);
        const topWave = rectIn(page, "#frontTopWave");
        const topWaveBottom = topWave ? topWave.bottom : vh * (narrow ? 0.15 : 0.10);
        const share = rectIn(page, "#frontShareButton");

        return {
            vw:vw, vh:vh, center:center, waveTop:waveTop, topWaveBottom:topWaveBottom,
            shareLeft: share ? share.left : null,
            shareAbove: !!share && share.top < waveTop - 4
        };
    }

    function rowCapable(p){ return p.mode === "side" || p.mode === "below"; }

    function layout(p){
        if(p.done) return;
        const g = measure();
        if(!g || !p.dom) return;

        const choice = chooseMode(g);
        p.mode = choice.mode;

        const root = p.dom.root;
        const showRow = rowCapable(p) && !p.done;
        root.hidden = !showRow;
        if(showRow){
            root.style.left = "max(" + INSET + "px, env(safe-area-inset-left, 0px))";
            root.style.right = choice.right + "px";
            root.style.bottom = choice.bottom + "px";
            root.dataset.mode = choice.mode;
        }
        /* the button stands in whenever there is no room for a row */
        p.dom.button.hidden = (p.mode !== "button");
    }

    /* ---- name line ---- */
    function showName(p, index){
        const node = p.dom.name;
        const next = p.order[index];
        if(p.nameIndex === -1){          /* first name: no fade */
            node.textContent = next;
        }else{
            node.classList.add("is-out");
            setTimeout(() => {
                node.textContent = next;
                node.classList.remove("is-out");
            }, FADE_MS);
        }
        p.nameIndex = index;
    }

    /* ---- gif ---- */
    function nextGifUrl(p){
        const file = p.deck ? p.deck.next() : null;
        return file ? GIF_FOLDER + encodeURIComponent(file) : null;
    }

    function showNextGif(p){
        const url = nextGifUrl(p);
        p.currentGif = url;

        const img = p.dom.gifImg;
        if(p.gifIndex <= 0 || !img.getAttribute("src")){
            loadInto(img, p.dom.gifBox, url);
        }else{
            /* load first, then cross-fade, so there is never a blank gap */
            const probe = new Image();
            probe.onload = function(){
                img.classList.add("is-out");
                setTimeout(() => {
                    p.dom.gifBox.classList.remove("is-fallback");
                    img.src = url;
                    img.classList.remove("is-out");
                }, FADE_MS);
            };
            probe.onerror = function(){ p.dom.gifBox.classList.add("is-fallback"); };
            if(url) probe.src = url; else probe.onerror();
        }
    }

    /* ---- clock ---- */
    function canRun(p){
        return !p.done &&
               frontIsShowing() &&
               !document.hidden &&
               !document.getElementById("reloadScreen") &&   /* loading screen */
               !p.modalOpen;
    }

    function render(p){
        const nameIndex = Math.min(p.order.length - 1, Math.floor(p.elapsed / p.plan.perName));
        if(nameIndex !== p.nameIndex) showName(p, nameIndex);

        /* (the gif list is still loading: leave the gif box empty, not the fallback disc) */
        const gifIndex = Math.floor(p.elapsed / GIF_MS);
        if(p.deck && gifIndex !== p.gifIndex){
            p.gifIndex = gifIndex;
            showNextGif(p);
        }
    }

    function tick(p){
        const now = Date.now();
        const dt = Math.min(now - p.lastTick, TICK_MS * 2);   /* a stalled tab adds nothing */
        p.lastTick = now;

        layout(p);                        /* the doors may have just been built */
        if(!canRun(p)) return;

        const isRow = rowCapable(p);
        (isRow ? p.dom.root : p.dom.button).classList.add("is-on");
        p.elapsed += dt;

        /* a row lasts as long as its names need (at least 10 s); the button 10 s */
        if(p.elapsed >= (isRow ? p.plan.total : BUTTON_MS)){
            finish(p);
            return;
        }
        if(isRow) render(p);
    }

    function finish(p){
        clearInterval(p.timer);
        p.timer = null;
        p.done = true;
        if(p.observer){ p.observer.disconnect(); p.observer = null; }
        p.dom.root.classList.remove("is-on");
        p.dom.button.classList.remove("is-on");
        /* fade out, then take everything off the page until the app is reopened */
        setTimeout(() => {
            [p.dom.root, p.dom.button, p.dom.modal].forEach(n => n.parentNode && n.parentNode.removeChild(n));
        }, LEAVE_MS);
    }

    /* ---- popup ---- */
    function placePopup(p){
        const modal = p.dom.modal;
        const g = measure();
        const choice = g ? choosePopup(g) : {placement:"center"};
        modal.dataset.placement = choice.placement;
        if(choice.placement === "side"){
            modal.style.setProperty("--bp-side-left", choice.left + "px");
            modal.style.setProperty("--bp-side-width", choice.width + "px");
            modal.style.setProperty("--bp-side-top", choice.top + "px");
            modal.style.setProperty("--bp-side-bottom", choice.bottom + "px");
        }
    }

    function openModal(){
        const p = party;
        if(!p || p.done || p.modalOpen) return;
        p.modalOpen = true;
        p.dom.root.classList.add("is-hushed");

        /* the popup shows whichever gif the row is showing right now
           (or the next one in the deck if the row never ran) */
        if(!p.currentGif && p.deck) p.currentGif = nextGifUrl(p);
        loadInto(p.dom.cardGifImg, p.dom.cardGifBox, p.currentGif);

        placePopup(p);
        p.dom.modal.classList.add("is-open");
        p.dom.close.focus({preventScroll:true});
    }

    function closeModal(){
        const p = party;
        if(!p || !p.modalOpen) return;
        p.modalOpen = false;
        p.dom.modal.classList.remove("is-open");
        p.dom.root.classList.remove("is-hushed");
        p.lastTick = Date.now();
        const back = p.dom.button.hidden ? p.dom.row : p.dom.button;
        try{ back.focus({preventScroll:true}); }catch(e){}
    }

    /* ---------------------------------------------------------
       Public API
       --------------------------------------------------------- */
    function teardown(p){
        if(!p) return;
        if(p.timer) clearInterval(p.timer);
        if(p.observer) p.observer.disconnect();
        if(p.dom){
            [p.dom.root, p.dom.button, p.dom.modal].forEach(n => n.parentNode && n.parentNode.removeChild(n));
        }
    }

    function setCelebrants(names, options){
        const force = !!(options && options.force);
        const list = cleanNames(names);
        if(!list.length) return false;
        if(party && !force) return false;      /* one party per app opening */
        teardown(party);

        const p = {
            order:      shuffled(list),
            sorted:     alphabetical(list),
            plan:       plan(list.length),
            elapsed:    0,
            nameIndex:  -1,
            gifIndex:   -1,
            deck:       null,
            currentGif: null,
            mode:       "button",
            modalOpen:  false,
            done:       false,
            timer:      null,
            observer:   null,
            lastTick:   Date.now(),
            dom:        null
        };
        if(!build(p)) return false;
        party = p;

        /* gif list: one small request, only now that there is a party */
        fetch(GIF_MANIFEST, {cache:"default"})
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
            .then(json => {
                if(party !== p) return;
                p.deck = gifDeck(manifestFiles(json));
                p.gifIndex = -1;
                if(!p.done) render(p);
            });

        render(p);                               /* first name straight away */
        layout(p);
        p.timer = setInterval(() => tick(p), TICK_MS);

        /* screen changes (resize, rotation, the Front Page being shown) re-pick the layout */
        if(typeof ResizeObserver === "function"){
            p.observer = new ResizeObserver(() => layout(p));
            p.observer.observe(frontPage());
        }
        return true;
    }

    function demo(names){
        return setCelebrants(names && names.length ? names : DEMO_NAMES, {force:true});
    }

    window.BirthdayParty = {
        setCelebrants: setCelebrants,
        demo:          demo,
        isRunning:     () => !!party && !party.done,
        mode:          () => party ? party.mode : null,
        _core:         CORE
    };

    /* Test-only: read the fake members file and celebrate whoever has a
       birthday today (this is the same filtering the real data will use). */
    function demoFromMembersFile(){
        return fetch(DEMO_MEMBERS_FILE, {cache:"no-store"})
            .then(r => r.ok ? r.json() : {members:[]})
            .catch(() => ({members:[]}))
            .then(json => setCelebrants(birthdaysToday(json && json.members), {force:true}));
    }

    /* ?birthdaydemo=1  |  ?birthdaydemo=Ann,Marcus,Joy  |  ?birthdaydemo=members */
    try{
        const value = new URLSearchParams(window.location.search).get("birthdaydemo");
        if(value !== null){
            const names = (value === "" || value === "1") ? DEMO_NAMES : value.split(",");
            const start = () => value === "members" ? demoFromMembersFile() : demo(names);
            if(document.readyState === "loading"){
                document.addEventListener("DOMContentLoaded", start, {once:true});
            }else{
                start();
            }
        }
    }catch(e){}
})();
