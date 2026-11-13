"use strict";

/* =========================================================
   Front Page celebrations  (js/birthdayParty.js  v2.0.0)
   with css/birthday-party.css

   A tiny celebration row above the bottom doors of the Front Page:

       [ gif ]  HAPPY BIRTHDAY
                ---------------
                Name

   Three kinds of celebration share the same row, button and popup, each
   with its own title, gifs, button icon and popup backdrop:

       WELCOME             members added in the last 7 days
       HAPPY BIRTHDAY      members with a birthday today
       HAPPY ANNIVERSARY   members whose add date is today, every year
                           (5, 10, 15 ... years get a milestone title,
                           e.g. "10-YEAR ANNIVERSARY", and a second beat
                           with special text such as "A whole decade!")

   Whatever applies today plays in that order, with a 3 second pause
   between them:   welcome > 3 s > birthdays > 3 s > anniversaries

   Each one plays like this:
   - The gif is picked at random from that kind's folder (assets/welcome/,
     assets/birthday/, assets/anniversary/, each with a manifest.json) and
     swapped every 10 seconds. They are dealt like a shuffled deck: every
     gif is used once before any repeats, never the same one twice in a row.
   - The names are shown one at a time, shuffled, 3 seconds each. With
     fewer than 4 names the time per name is stretched so each kind lasts
     at least 10 seconds.
   - Tapping/clicking the row opens a popup for the kind showing: its gif,
     its title and everyone in it A-Z, on that kind's backdrop gif.
     The clock is paused while the popup is open.

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
     3. BUTTON  neither fits: a button (the kind's icon) the same size as
                #frontShareButton and its horizontal mirror (left side).
                It shows for 10 seconds per kind (fade in, fade out);
                tapping it opens the popup.
   The decision is chooseMode() below, a pure function with tests.

   The clock only runs while the row or button is showing: it pauses in
   Books / Videos / Images, in a hidden tab, behind the loading screen and
   while the popup is open.

   DATA - this file knows nothing about where members live. It needs
   today's lists:

       BirthdayParty.setCelebrations({
           welcome:     ["Ann", "Marcus"],                 // or [{name:"Ann"}]
           birthday:    ["Joy"],
           anniversary: [{name:"Daniel", years:5}, ...]
       });

   and the pure function celebrationsFromMembers(members, date) turns a
   members list ({name, birthday, added}) into exactly that shape. Plan:
   a daily scheduled Worker runs it and writes a small public file with
   today's names only; phone numbers, emails and dates never reach the
   browser. (setCelebrants(names) still works: birthdays only.)

   PREVIEWING NOW (no data needed)
       ?birthdaydemo=members   assets/birthday/members-demo.json, filtered
                               for today (its dates are relative to today,
                               so it works on any day)
       ?birthdaydemo=all       sample welcome + birthdays + anniversaries
       ?birthdaydemo=1         sample birthday names
       ?birthdaydemo=Ann,Joy   your own birthday names
       or in the console:  BirthdayParty.demo()

   COST / RISK
   With no names nothing runs: no network, no timers, no DOM. Otherwise it
   fetches one tiny JSON per kind showing (the gif list) plus the gifs.
   It never touches the centerpiece, the doors or any other front-page
   code; it only appends elements inside #frontPage and reads positions.
   ========================================================= */
(function(){
    "use strict";

    /* ---------------------------------------------------------
       Settings - the only numbers/words worth editing
       --------------------------------------------------------- */
    const NAME_MS        = 3000;    /* time each name is shown (minimum) */
    const GIF_MS         = 10000;   /* the gif changes this often */
    const MIN_PARTY_MS   = 10000;   /* each kind lasts at least this long */
    const BUTTON_MS      = 10000;   /* how long the button shows, per kind */
    const GAP_MS         = 3000;    /* pause between welcome > birthdays > anniversaries */
    const WELCOME_DAYS   = 7;       /* "new": added today or in the 6 days before (7 days) */
    const TICK_MS        = 200;     /* clock resolution */
    const FADE_MS        = 280;     /* name / gif cross-fade (match the CSS) */
    const LEAVE_MS       = 500;     /* fade-out before everything is removed */

    /* What each kind looks like. Gif folders each need a manifest.json
       (["a.gif","b.gif"]); the backdrop gifs are set in the CSS. */
    const TYPES = {
        welcome:{
            title:    "WELCOME",
            subtitle: "Our newest members",
            folder:   "assets/welcome/",
            icon:     "assets/welcome-icon.gif",
            label:    "Welcome! See our newest members"
        },
        birthday:{
            title:    "HAPPY BIRTHDAY",
            subtitle: "",
            folder:   "assets/birthday/",
            icon:     "assets/birthday-icon.gif",
            label:    "Happy birthday! See who is celebrating today"
        },
        anniversary:{
            title:    "HAPPY ANNIVERSARY",
            subtitle: "",
            folder:   "assets/anniversary/",
            icon:     "assets/anniversary-icon.gif",
            label:    "Happy anniversary! See who is celebrating today"
        }
    };
    const ORDER = ["welcome", "birthday", "anniversary"];

    /* Anniversaries that are a multiple of 5 years get special text.
       Add any year here; other multiples of 5 get "<n> years strong!". */
    const MILESTONE_TEXT = {
        5:  "Half a decade!",
        10: "A whole decade!",
        25: "A quarter century!",
        50: "Golden jubilee!"
    };

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

    const DEMO_BIRTHDAYS = ["Ava", "Marcus", "Joy", "Daniel", "Hannah"];
    const DEMO_ALL = {
        welcome:     ["Amara", "Caleb", "Naomi"],
        birthday:    ["Ava", "Marcus", "Joy"],
        anniversary: [{name:"Ruth", years:1}, {name:"Daniel", years:3}, {name:"Esther", years:5}, {name:"Gideon", years:10}]
    };
    const DEMO_MEMBERS_FILE = "assets/birthday/members-demo.json";   /* ?birthdaydemo=members */

    /* ---------------------------------------------------------
       Pure helpers (no page needed; tested in birthdayParty.test.mjs)
       --------------------------------------------------------- */

    function tidy(value){
        return String(value == null ? "" : value).replace(/\s+/g, " ").trim();
    }

    /* A list of names (or {name, years}) -> [{name, years?}]: trimmed,
       blanks and duplicate names (ignoring case) dropped; anniversaries
       need a whole number of years >= 1. */
    function cleanEntries(list, type){
        const seen = new Set();
        const out = [];
        (Array.isArray(list) ? list : []).forEach(raw => {
            const isObject = !!raw && typeof raw === "object";
            const name = tidy(isObject ? raw.name : raw);
            if(!name) return;
            const key = name.toLocaleLowerCase();
            if(seen.has(key)) return;
            const entry = {name:name};
            if(type === "anniversary"){
                const years = Math.floor(Number(isObject ? raw.years : NaN));
                if(!(years >= 1)) return;
                entry.years = years;
            }
            seen.add(key);
            out.push(entry);
        });
        return out;
    }

    function cleanNames(list){
        return cleanEntries(list, "birthday").map(e => e.name);
    }

    function nameOf(item){ return typeof item === "string" ? item : item.name; }

    function alphabetical(items){
        return items.slice().sort((a, b) =>
            nameOf(a).localeCompare(nameOf(b), undefined, {sensitivity:"base", numeric:true}));
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

    /* How long each name shows and how long one kind lasts. */
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

    /* ---- anniversary wording ---- */
    function milestoneText(years){
        if(!(years >= 5) || years % 5) return null;
        return MILESTONE_TEXT[years] || (years + " years strong!");
    }

    function yearsLabel(years){
        return years + (years === 1 ? " year" : " years");
    }

    /* Title shown in the row while this person is on: milestones get their own. */
    function entryTitle(type, entry){
        if(type === "anniversary" && entry && milestoneText(entry.years)){
            return entry.years + "-YEAR ANNIVERSARY";
        }
        return TYPES[type].title;
    }

    /* What the row shows, in order, for a list of entries (already in play
       order). Usually one beat per person: the name (anniversaries add
       "3 years" after it). A 5/10/15... year anniversary gets two: the name
       under its milestone title, then its special text, so the longer text
       is never squeezed next to a name. */
    function makeBeats(type, entries){
        const beats = [];
        entries.forEach(entry => {
            if(type === "anniversary"){
                const special = milestoneText(entry.years);
                if(special){
                    beats.push({entry:entry, main:entry.name, extra:""});
                    beats.push({entry:entry, main:"\u2605 " + special, extra:""});
                }else{
                    beats.push({entry:entry, main:entry.name, extra:yearsLabel(entry.years)});
                }
            }else{
                beats.push({entry:entry, main:entry.name, extra:""});
            }
        });
        return beats;
    }

    /* ---- dates ---- */
    function parseYMD(value){
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value == null ? "" : value).trim());
        return m ? {y:+m[1], m:+m[2], d:+m[3]} : null;
    }

    function parseMD(value){            /* "YYYY-MM-DD" or "MM-DD" */
        const m = /(?:^|-)(\d{2})-(\d{2})$/.exec(String(value == null ? "" : value).trim());
        return m ? {m:+m[1], d:+m[2]} : null;
    }

    function dayNumber(y, m, d){
        return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
    }

    function isLeap(y){
        return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    }

    /* From a members list ({name, birthday, added}) what to celebrate on
       `date` (default: now, device time):
         welcome      added today or in the previous 6 days
         birthday     birthday today
         anniversary  add date's month/day is today and at least 1 year ago
       A 29 February date is celebrated on 28 February in years with no 29th. */
    function celebrationsFromMembers(members, date){
        const now = date || new Date();
        const y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate();
        const today = dayNumber(y, m, d);
        const leap = isLeap(y);
        const hit = (mm, dd) => (mm === m && dd === d) ||
                                (!leap && mm === 2 && dd === 29 && m === 2 && d === 28);
        const out = {welcome:[], birthday:[], anniversary:[]};

        (Array.isArray(members) ? members : []).forEach(member => {
            if(!member || !tidy(member.name)) return;
            const name = member.name;

            const born = parseMD(member.birthday);
            if(born && hit(born.m, born.d)) out.birthday.push(name);

            const added = parseYMD(member.added);
            if(added){
                const age = today - dayNumber(added.y, added.m, added.d);
                if(age >= 0 && age < WELCOME_DAYS) out.welcome.push({name:name});
                const years = y - added.y;
                if(years >= 1 && hit(added.m, added.d)) out.anniversary.push({name:name, years:years});
            }
        });
        return out;
    }

    function birthdaysToday(members, date){
        return celebrationsFromMembers(members, date).birthday;
    }

    /* Demo file only: dates relative to today so it works on any day.
         birthday "today"          -> a birthday today
         added "today-2d"          -> added 2 days ago
         added "today-5y"          -> added exactly 5 years ago today  */
    function resolveDemoMembers(members, date){
        const now = date || new Date();
        const pad = n => String(n).padStart(2, "0");
        const ymd = dt => dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate());
        return (Array.isArray(members) ? members : []).map(member => {
            const out = Object.assign({}, member);
            if(out.birthday === "today") out.birthday = "1990-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
            const t = /^today-(\d+)([dy])$/.exec(String(out.added || ""));
            if(t){
                const n = +t[1];
                out.added = t[2] === "d"
                    ? ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - n))
                    : (now.getFullYear() - n) + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
            }
            return out;
        });
    }

    /* ---- layout ---- */

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

    const CORE = {cleanNames, cleanEntries, alphabetical, shuffled, plan, gifDeck, manifestFiles,
                  milestoneText, yearsLabel, entryTitle, makeBeats,
                  celebrationsFromMembers, birthdaysToday, resolveDemoMembers,
                  chooseMode, choosePopup, rowHeightFor,
                  NAME_MS, GIF_MS, MIN_PARTY_MS, BUTTON_MS, GAP_MS, WELCOME_DAYS, TYPES, ORDER};

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

    function currentSegment(p){ return p.segments[p.segIndex]; }

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
        const first = TYPES[currentSegment(p).type];

        /* --- the row --- */
        const root = el("div");
        root.id = "frontBirthdayParty";
        root.hidden = true;                 /* shown once a layout has been chosen */

        const row = el("button", "bp-row");
        row.type = "button";
        row.setAttribute("aria-haspopup", "dialog");
        row.setAttribute("aria-label", first.label);

        const gifBox = el("span", "bp-gif");
        const gifImg = el("img");
        gifImg.alt = "";
        gifImg.draggable = false;
        gifBox.appendChild(gifImg);

        const text = el("span", "bp-text");
        text.setAttribute("aria-hidden", "true");
        const title = el("span", "bp-title", first.title);
        const name = el("span", "bp-name");
        const nameMain = el("span", "bp-name-main");
        const nameExtra = el("span", "bp-name-extra");
        name.appendChild(nameMain);
        name.appendChild(nameExtra);
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
        button.title = first.label;
        button.setAttribute("aria-haspopup", "dialog");
        button.setAttribute("aria-label", first.label);
        const btnBox = el("span", "bp-btn-gif");
        const btnImg = el("img");
        btnImg.alt = "";
        btnImg.draggable = false;
        btnBox.appendChild(btnImg);
        btnBox.insertAdjacentHTML("beforeend", STAR_ICON);
        button.appendChild(btnBox);

        /* --- the popup (filled for the kind showing when it opens) --- */
        const modal = el("div", "bp-modal");
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "bpModalTitle");
        modal.dataset.placement = "center";
        modal.dataset.type = currentSegment(p).type;

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

        const cardTitle = el("h2", "bp-card-title", first.title);
        cardTitle.id = "bpModalTitle";
        const cardSub = el("p", "bp-card-sub");
        cardSub.hidden = true;

        const list = el("ul", "bp-card-list");

        card.appendChild(close);
        card.appendChild(cardGifBox);
        card.appendChild(cardTitle);
        card.appendChild(cardSub);
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

        p.dom = {root, row, button, btnImg, btnBox, gifBox, gifImg,
                 title, name, nameMain, nameExtra,
                 modal, close, cardGifBox, cardGifImg, cardTitle, cardSub, list};
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
        const showRow = rowCapable(p);
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

    /* ---- name line (and the title, which milestones change) ---- */
    function showName(p, index){
        const seg = currentSegment(p);
        const beat = seg.beats[index];
        const d = p.dom;
        const title = entryTitle(seg.type, beat.entry);
        const extra = beat.extra;
        const instant = (p.nameIndex === -1);

        const apply = () => {
            d.nameMain.textContent = beat.main;
            d.nameExtra.textContent = extra;
            d.title.textContent = title;
            d.name.classList.remove("is-out");
            d.title.classList.remove("is-out");
        };

        if(instant){
            apply();
        }else{
            d.name.classList.add("is-out");
            if(d.title.textContent !== title) d.title.classList.add("is-out");
            setTimeout(() => { if(party === p && !p.done) apply(); }, FADE_MS);
        }
        p.nameIndex = index;
    }

    /* ---- gif ---- */
    function nextGifUrl(p){
        const seg = currentSegment(p);
        const deck = p.decks[seg.type];
        const file = deck ? deck.next() : null;
        return file ? TYPES[seg.type].folder + encodeURIComponent(file) : null;
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

    /* The gif list for a kind: one small request, only when it is about to play. */
    function ensureDeck(p, type){
        if(p.decks[type] !== undefined || p.loading[type]) return;
        p.loading[type] = true;
        fetch(TYPES[type].folder + "manifest.json", {cache:"default"})
            .then(r => r.ok ? r.json() : [])
            .catch(() => [])
            .then(json => {
                p.loading[type] = false;
                if(party !== p) return;
                p.decks[type] = gifDeck(manifestFiles(json));
                const seg = currentSegment(p);
                if(!p.done && seg && seg.type === type && p.phase === "show"){
                    p.gifIndex = -1;
                    render(p);
                }
            });
    }

    /* ---- one kind starts (welcome, birthdays or anniversaries) ---- */
    function startSegment(p){
        const seg = currentSegment(p);
        const cfg = TYPES[seg.type];
        const d = p.dom;

        p.phase = "show";
        p.phaseElapsed = 0;
        p.nameIndex = -1;
        p.gifIndex = -1;
        p.currentGif = null;

        d.gifImg.removeAttribute("src");
        d.gifBox.classList.remove("is-fallback");
        d.title.textContent = cfg.title;
        d.row.setAttribute("aria-label", cfg.label);
        d.button.title = cfg.label;
        d.button.setAttribute("aria-label", cfg.label);
        loadInto(d.btnImg, d.btnBox, cfg.icon);

        ensureDeck(p, seg.type);
        render(p);
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
        const seg = currentSegment(p);
        const nameIndex = Math.min(seg.beats.length - 1, Math.floor(p.phaseElapsed / seg.plan.perName));
        if(nameIndex !== p.nameIndex) showName(p, nameIndex);

        /* (the gif list is still loading: leave the gif box empty, not the fallback disc) */
        const gifIndex = Math.floor(p.phaseElapsed / GIF_MS);
        if(p.decks[seg.type] && gifIndex !== p.gifIndex){
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

        const seg = currentSegment(p);
        const isRow = rowCapable(p);
        p.phaseElapsed += dt;

        if(p.phase === "show"){
            (isRow ? p.dom.root : p.dom.button).classList.add("is-on");

            /* a row lasts as long as its names need (at least 10 s); the button 10 s */
            if(p.phaseElapsed >= (isRow ? seg.plan.total : BUTTON_MS)){
                if(p.segIndex >= p.segments.length - 1){
                    finish(p);
                }else{
                    p.phase = "gap";            /* pause, then the next kind */
                    p.phaseElapsed = 0;
                    ensureDeck(p, p.segments[p.segIndex + 1].type);   /* have its gifs ready */
                    p.dom.root.classList.remove("is-on");
                    p.dom.button.classList.remove("is-on");
                }
                return;
            }
            if(isRow) render(p);
        }else if(p.phaseElapsed >= GAP_MS){
            p.segIndex++;
            startSegment(p);
        }
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
    function fillPopup(p){
        const seg = currentSegment(p);
        const cfg = TYPES[seg.type];
        const d = p.dom;

        d.modal.dataset.type = seg.type;
        d.cardTitle.textContent = cfg.title;
        d.cardSub.textContent = cfg.subtitle;
        d.cardSub.hidden = !cfg.subtitle;

        d.list.textContent = "";
        seg.sorted.forEach(entry => {
            const li = el("li");
            li.appendChild(el("span", "bp-li-name", entry.name));
            if(seg.type === "anniversary"){
                const special = milestoneText(entry.years);
                li.appendChild(el("span", "bp-li-extra",
                    special ? "★ " + yearsLabel(entry.years) + " · " + special
                            : yearsLabel(entry.years)));
                if(special) li.classList.add("is-milestone");
            }
            d.list.appendChild(li);
        });
        d.list.scrollTop = 0;
    }

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
        if(!p || p.done || p.modalOpen || p.phase !== "show") return;
        p.modalOpen = true;
        p.dom.root.classList.add("is-hushed");

        fillPopup(p);

        /* the popup shows whichever gif the row is showing right now
           (or the next one in the deck if the row never ran) */
        if(!p.currentGif && p.decks[currentSegment(p).type]) p.currentGif = nextGifUrl(p);
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

    /* input: {welcome:[...], birthday:[...], anniversary:[{name, years}...]}
       Plays whatever is non-empty, welcome > birthdays > anniversaries. */
    function setCelebrations(input, options){
        const force = !!(options && options.force);
        const segments = [];
        ORDER.forEach(type => {
            const entries = cleanEntries(input && input[type], type);
            if(entries.length){
                const beats = makeBeats(type, shuffled(entries));
                segments.push({type:type, beats:beats, sorted:alphabetical(entries), plan:plan(beats.length)});
            }
        });
        if(!segments.length) return false;
        if(party && !force) return false;      /* one run per app opening */
        teardown(party);

        const p = {
            segments:     segments,
            segIndex:     0,
            phase:        "show",       /* "show" or "gap" (the pause between kinds) */
            phaseElapsed: 0,
            nameIndex:    -1,
            gifIndex:     -1,
            decks:        {},
            loading:      {},
            currentGif:   null,
            mode:         "button",
            modalOpen:    false,
            done:         false,
            timer:        null,
            observer:     null,
            lastTick:     Date.now(),
            dom:          null
        };
        if(!build(p)) return false;
        party = p;

        startSegment(p);                         /* first name straight away */
        layout(p);
        p.timer = setInterval(() => tick(p), TICK_MS);

        /* screen changes (resize, rotation, the Front Page being shown) re-pick the layout */
        if(typeof ResizeObserver === "function"){
            p.observer = new ResizeObserver(() => layout(p));
            p.observer.observe(frontPage());
        }
        return true;
    }

    /* birthdays only (the original call) */
    function setCelebrants(names, options){
        return setCelebrations({birthday:names}, options);
    }

    function demo(names){
        return setCelebrants(names && names.length ? names : DEMO_BIRTHDAYS, {force:true});
    }

    window.BirthdayParty = {
        setCelebrations: setCelebrations,
        setCelebrants:   setCelebrants,
        demo:            demo,
        demoAll:         () => setCelebrations(DEMO_ALL, {force:true}),
        isRunning:       () => !!party && !party.done,
        mode:            () => party ? party.mode : null,
        current:         () => party && !party.done ? currentSegment(party).type : null,
        _core:           CORE
    };

    /* Test-only: read the fake members file and celebrate whatever applies
       today (the same filtering the real data will use). */
    function demoFromMembersFile(){
        return fetch(DEMO_MEMBERS_FILE, {cache:"no-store"})
            .then(r => r.ok ? r.json() : {members:[]})
            .catch(() => ({members:[]}))
            .then(json => setCelebrations(
                celebrationsFromMembers(resolveDemoMembers(json && json.members)),
                {force:true}));
    }

    /* ?birthdaydemo=members | all | 1 | Ann,Marcus,Joy */
    try{
        const value = new URLSearchParams(window.location.search).get("birthdaydemo");
        if(value !== null){
            const start = () => {
                if(value === "members") return demoFromMembersFile();
                if(value === "all") return window.BirthdayParty.demoAll();
                return demo(value === "" || value === "1" ? null : value.split(","));
            };
            if(document.readyState === "loading"){
                document.addEventListener("DOMContentLoaded", start, {once:true});
            }else{
                start();
            }
        }
    }catch(e){}
})();
