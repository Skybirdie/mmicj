"use strict";

/* =========================================================
   Front Page birthday party  (js/birthdayParty.js  v1.1.0)
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

   The clock only runs while the Front Page is actually showing (it
   pauses in Books / Videos / Images, in a hidden tab, and behind the
   loading screen).

   WHAT THIS FILE DOES NOT DO (yet)
   It knows nothing about members. It only needs a list of display names
   for today:

       BirthdayParty.setCelebrants(["Ann", "Marcus", ...]);

   The members catalog (private bucket, via the Worker) will call that
   later; the phone numbers, emails and birth years never need to reach
   the browser, only the names to celebrate today.

   PREVIEWING NOW (no data needed)
       open the app with   ?birthdaydemo=1                  (sample names)
                           ?birthdaydemo=Ann,Marcus,Joy     (your own names)
       or in the console:  BirthdayParty.demo()

   COST / RISK
   With no names nothing runs: no network, no timers, no DOM. When there
   are names it fetches one tiny JSON file (the gif list) plus the gifs.
   It never touches the centerpiece, the doors or any other front-page
   code; it only appends two elements inside #frontPage.
   ========================================================= */
(function(){
    "use strict";

    /* ---------------------------------------------------------
       Settings - the only numbers worth editing
       --------------------------------------------------------- */
    const GIF_FOLDER     = "assets/birthday/";
    const GIF_MANIFEST   = GIF_FOLDER + "manifest.json";   /* ["a.gif","b.gif",...] */
    const NAME_MS        = 3000;    /* time each name is shown (minimum) */
    const GIF_MS         = 10000;   /* the gif changes this often */
    const MIN_PARTY_MS   = 10000;   /* the party never ends sooner than this */
    const TICK_MS        = 200;     /* clock resolution */
    const FADE_MS        = 280;     /* name / gif cross-fade (match the CSS) */
    const LEAVE_MS       = 500;     /* fade-out before the row is removed */

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

    const CORE = {cleanNames, alphabetical, shuffled, plan, gifDeck, manifestFiles, birthdaysToday,
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

    function build(p){
        const page = frontPage();
        if(!page) return false;

        /* --- the row --- */
        const root = el("div");
        root.id = "frontBirthdayParty";

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

        /* --- the popup --- */
        const modal = el("div", "bp-modal");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "bpModalTitle");

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
        page.appendChild(modal);

        row.addEventListener("click", () => openModal());
        close.addEventListener("click", () => closeModal());
        backdrop.addEventListener("click", () => closeModal());
        modal.addEventListener("keydown", e => {
            if(e.key === "Escape"){ e.stopPropagation(); closeModal(); }
        });

        p.dom = {root, row, gifBox, gifImg, name, modal, close, cardGifBox, cardGifImg};
        return true;
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
    function showNextGif(p){
        const file = p.deck ? p.deck.next() : null;
        const url = file ? GIF_FOLDER + encodeURIComponent(file) : null;
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
        return frontIsShowing() &&
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

        if(!canRun(p)) return;

        p.dom.root.classList.add("is-on");
        p.elapsed += dt;

        if(p.elapsed >= p.plan.total){
            finish(p);
            return;
        }
        render(p);
    }

    function finish(p){
        clearInterval(p.timer);
        p.timer = null;
        p.done = true;
        p.dom.root.classList.remove("is-on");
        setTimeout(() => {
            if(p.dom.root.parentNode) p.dom.root.parentNode.removeChild(p.dom.root);
            if(p.dom.modal.parentNode) p.dom.modal.parentNode.removeChild(p.dom.modal);
        }, LEAVE_MS);
    }

    /* ---- popup ---- */
    function openModal(){
        const p = party;
        if(!p || p.done || p.modalOpen) return;
        p.modalOpen = true;

        /* the popup shows whichever gif the row is showing right now */
        loadInto(p.dom.cardGifImg, p.dom.cardGifBox, p.currentGif);

        p.dom.modal.classList.add("is-open");
        p.dom.close.focus({preventScroll:true});
    }

    function closeModal(){
        const p = party;
        if(!p || !p.modalOpen) return;
        p.modalOpen = false;
        p.dom.modal.classList.remove("is-open");
        p.lastTick = Date.now();
        try{ p.dom.row.focus({preventScroll:true}); }catch(e){}
    }

    /* ---------------------------------------------------------
       Public API
       --------------------------------------------------------- */
    function setCelebrants(names, options){
        const force = !!(options && options.force);
        const list = cleanNames(names);
        if(!list.length) return false;
        if(party && !force) return false;      /* one party per app opening */
        if(party && party.timer) clearInterval(party.timer);
        if(party && party.dom){
            [party.dom.root, party.dom.modal].forEach(n => n.parentNode && n.parentNode.removeChild(n));
        }

        const p = {
            order:      shuffled(list),
            sorted:     alphabetical(list),
            plan:       plan(list.length),
            elapsed:    0,
            nameIndex:  -1,
            gifIndex:   -1,
            deck:       null,
            currentGif: null,
            modalOpen:  false,
            done:       false,
            timer:      null,
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
                if(party !== p || p.done) return;
                p.deck = gifDeck(manifestFiles(json));
                p.gifIndex = -1;
                render(p);
            });

        render(p);                               /* first name straight away */
        p.timer = setInterval(() => tick(p), TICK_MS);
        return true;
    }

    function demo(names){
        return setCelebrants(names && names.length ? names : DEMO_NAMES, {force:true});
    }

    window.BirthdayParty = {
        setCelebrants: setCelebrants,
        demo:          demo,
        isRunning:     () => !!party && !party.done,
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
