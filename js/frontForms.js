/* =========================================================
   Front Page forms: Join and Testify!  (js/frontForms.js  v1.0.0)

   A small button next to #frontShareButton opens a little menu (Join | Testify).
   Each choice opens a form window. The forms hand their answers to the
   "mmicj-intake" Worker, which drops them into the private bucket for the
   admins (docs/INBOX-INTAKE.md in the admin portal project).

   What this file never does
     - It sends NOTHING to any Worker until the person presses the final button
       (Join, or Yes-send-it after Send on Testify). Typing, picking files and
       opening and closing the window only happen inside the browser.
     - It never lets the person set a date: the time of a submission is stamped
       by the Worker, and a testimony has no release date (admins decide that).
     - It adds no work to loading the Front Page: the menu, the forms and the
       security check (Cloudflare Turnstile, loaded from Cloudflare) are only
       created the first time they are opened.

   Join       name, birthday (month and day only), email, phone, consent box.
   Testify!   Title, Name or nickname, Description, Media (photo / video / PDF,
              the type is detected from the file), Audio (only when the media
              is not a video), "share anonymously" box (only the admins see the
              name), Send with a second "Yes, send it" confirmation.
   Photos, videos, PDFs and audio go straight from the browser to R2 with a
   signed one-file link, with a progress bar. Text goes in one request.

   Layout: the button is markup in index.html (#frontFormsButton); position and
   look are in css/front-forms.css. The menu and the window are created here
   inside #frontPage (like the share panel), so they belong to the Front Page.
   ========================================================= */
(function(){
    "use strict";

    /* ---------- settings ---------- */
    var INTAKE_URL = "https://mmicj-intake.meditation-mornings-icj.workers.dev";
    var TURNSTILE_SITE_KEY = "0x4AAAAAAGF5FIsgOzi0ukTg";      /* public by design; "" = no security check (local testing only) */
    var TURNSTILE_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

    /* The same rules the Worker enforces (the Worker checks again, so these only give a friendly message early). */
    var MB = 1024 * 1024;
    var LIMITS = { title: 120, joinName: 100, testimonyName: 60, description: 5000, email: 200, phone: 40,
                   video: 200 * MB, image: 15 * MB, pdf: 25 * MB, audio: 25 * MB };
    var MEDIA = { video: ["mp4", "webm", "mov", "m4v"], image: ["jpg", "jpeg", "png", "webp", "gif"], pdf: ["pdf"] };
    var AUDIO = ["mp3", "m4a", "aac", "wav", "ogg"];
    var KIND_LABEL = { video: "Video", image: "Photo", pdf: "PDF" };
    var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var DAYS_IN = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];       /* 29 February is allowed */

    var host = null, button = null, menu = null, shell = null;
    var forms = {};

    /* ---------- tiny helpers ---------- */
    function el(tag, cls, text){
        var n = document.createElement(tag);
        if(cls) n.className = cls;
        if(text !== undefined && text !== null) n.textContent = text;
        return n;
    }
    function clear(n){ while(n.firstChild) n.removeChild(n.firstChild); }
    function svg(markup){
        var t = document.createElement("template");
        t.innerHTML = markup.trim();
        return t.content.firstChild;
    }
    function newId(prefix){
        var b = new Uint8Array(8);
        (window.crypto || window.msCrypto).getRandomValues(b);
        var s = "";
        for(var i = 0; i < b.length; i++) s += (b[i] < 16 ? "0" : "") + b[i].toString(16);
        return prefix + "_" + s;
    }
    function extOf(name){
        var m = /\.([A-Za-z0-9]{1,8})$/.exec(String(name || ""));
        return m ? m[1].toLowerCase() : "";
    }
    function mediaKind(name){
        var e = extOf(name);
        for(var k in MEDIA) if(MEDIA[k].indexOf(e) !== -1) return k;
        return "";
    }
    function mb(n){ return Math.round(n / MB) + " MB"; }
    function size(n){ return n >= MB ? (n / MB).toFixed(n >= 10 * MB ? 0 : 1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB"; }
    function isDark(){ return document.documentElement.getAttribute("data-theme") === "dark"; }

    var ICON = {
        close: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        join: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="9" cy="8" r="3.6" fill="currentColor"/><path d="M2.5 20c0-3.9 2.9-6.4 6.5-6.4s6.5 2.5 6.5 6.4z" fill="currentColor"/><path d="M19 6v6M16 9h6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>',
        testify: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" fill="currentColor"/></svg>',
        upload: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
        sprout: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M24 42V24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/><path d="M24 26c0-8 5-13 14-13 0 8-5 13-14 13z" fill="currentColor"/><path d="M24 31c0-6-4-10-11-10 0 6 4 10 11 10z" fill="currentColor" opacity=".8"/></svg>',
        check: '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false"><path d="M12 25l8 8 16-17" fill="none" stroke="currentColor" stroke-width="4.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    };

    /* ---------- talking to the intake Worker ---------- */
    function post(path, body){
        return fetch(INTAKE_URL + path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        }).then(function(res){
            return res.json().catch(function(){ return null; }).then(function(data){ return { ok: res.ok, status: res.status, data: data }; });
        }, function(){ return { ok: false, status: 0, data: null }; });
    }

    function putFile(url, file, contentType, onProgress){
        return new Promise(function(resolve, reject){
            var x = new XMLHttpRequest();
            x.open("PUT", url);
            x.setRequestHeader("Content-Type", contentType);
            x.upload.onprogress = function(e){ if(e.lengthComputable && onProgress) onProgress(e.loaded); };
            x.onload = function(){ x.status >= 200 && x.status < 300 ? resolve() : reject({ status: x.status }); };
            x.onerror = function(){ reject({ status: 0 }); };
            x.onabort = function(){ reject({ status: 0 }); };
            x.send(file);
        });
    }

    /* what to tell the person when the Worker (or the network) said no */
    function sayFailure(res){
        if(res.status === 0) return (navigator.onLine === false)
            ? "You seem to be offline. Please check your connection and try again."
            : "We couldn't reach the server. Please check your connection and try again.";
        if(res.data && typeof res.data.error === "string" && res.status < 500) return res.data.error;
        return "Something went wrong on our side. Please try again in a moment.";
    }

    /* ---------- the security check (Cloudflare Turnstile), loaded only when a form is first opened ---------- */
    var tsLoading = null;
    function loadTurnstile(){
        if(window.turnstile) return Promise.resolve(window.turnstile);
        if(tsLoading) return tsLoading;
        tsLoading = new Promise(function(resolve, reject){
            var s = document.createElement("script");
            s.src = TURNSTILE_SRC;
            s.async = true;
            s.defer = true;
            s.onload = function(){ window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile")); };
            s.onerror = function(){ tsLoading = null; reject(new Error("turnstile")); };
            document.head.appendChild(s);
        });
        return tsLoading;
    }

    function makeCheck(box, note){
        var c = { token: "", id: null, failed: false, mounted: false };
        var waiters = [];
        function settle(ok){
            var w = waiters; waiters = [];
            w.forEach(function(x){ ok ? x.res(c.token) : x.rej(new Error("check")); });
        }
        function refreshNote(){
            clear(note);
            if(!TURNSTILE_SITE_KEY) return;
            if(c.failed){
                note.appendChild(document.createTextNode("We couldn't load the security check."));
                var again = el("button", "", "Try again");
                again.type = "button";
                again.addEventListener("click", function(){ c.unmount(); c.mount(); });
                note.appendChild(again);
            }
        }
        c.mount = function(){
            if(!TURNSTILE_SITE_KEY || c.mounted) return;
            c.mounted = true;
            c.failed = false;
            refreshNote();
            loadTurnstile().then(function(ts){
                if(!c.mounted) return;
                c.id = ts.render(box, {
                    sitekey: TURNSTILE_SITE_KEY,
                    size: (box.clientWidth && box.clientWidth < 300) ? "compact" : "flexible",
                    theme: isDark() ? "dark" : "light",
                    callback: function(t){ c.token = t; c.failed = false; refreshNote(); settle(true); },
                    "expired-callback": function(){ c.token = ""; },
                    "error-callback": function(){ c.token = ""; c.failed = true; refreshNote(); settle(false); }
                });
            }).catch(function(){ c.failed = true; refreshNote(); settle(false); });
        };
        c.unmount = function(){
            try{ if(c.id !== null && window.turnstile) window.turnstile.remove(c.id); }catch(e){}
            c.id = null; c.token = ""; c.mounted = false;
            clear(box);
        };
        /* a token can only be used once: ask for a fresh one */
        c.reset = function(){
            c.token = "";
            try{ if(c.id !== null && window.turnstile) window.turnstile.reset(c.id); }catch(e){}
        };
        c.needed = function(){ return !!TURNSTILE_SITE_KEY; };

        /* Get a usable token, whatever state the widget is in. If the widget is gone, empty or stuck,
           it is rebuilt from scratch, so the person never has to refresh the page. */
        function dead(){ return !c.mounted || (c.id !== null && !box.childNodes.length) || c.failed; }
        c.ensure = function(){
            if(!TURNSTILE_SITE_KEY || c.token) return Promise.resolve(c.token);
            return new Promise(function(res, rej){
                var done = false, t1, t2;
                var w = {
                    res: function(t){ if(done) return; done = true; clearTimeout(t1); clearTimeout(t2); res(t); },
                    rej: function(e){ if(done) return; done = true; clearTimeout(t1); clearTimeout(t2); rej(e); }
                };
                waiters.push(w);
                if(dead()){ c.unmount(); c.mount(); }
                else if(c.id !== null){ try{ window.turnstile.reset(c.id); }catch(e){} }
                /* still nothing after a while: rebuild once more, then give up */
                t1 = setTimeout(function(){
                    if(done || c.token) return;
                    c.unmount(); c.mount();
                    t2 = setTimeout(function(){ if(!done){ c.failed = true; refreshNote(); w.rej(new Error("check")); } }, 30000);
                }, 10000);
            });
        };
        return c;
    }

    /* ---------- the window (one shell, shared by both forms and their confirmation windows) ---------- */
    function buildShell(){
        var root = el("div", "ff-modal");
        root.hidden = false;
        root.setAttribute("aria-hidden", "true");

        var backdrop = el("div", "ff-backdrop");
        var dialog = el("div", "ff-dialog");
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "ffTitle");

        var header = el("div", "ff-header");
        var title = el("h2", "", "");
        title.id = "ffTitle";
        var closeBtn = el("button", "ff-close");
        closeBtn.type = "button";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.appendChild(svg(ICON.close));
        header.appendChild(title);
        header.appendChild(closeBtn);

        var sub = el("p", "ff-sub", "");
        var body = el("div", "ff-body");
        var footer = el("div", "ff-footer");

        dialog.appendChild(header);
        dialog.appendChild(sub);
        dialog.appendChild(body);
        dialog.appendChild(footer);
        root.appendChild(backdrop);
        root.appendChild(dialog);
        host.appendChild(root);

        var s = { root: root, dialog: dialog, title: title, sub: sub, body: body, footer: footer, closeBtn: closeBtn, current: null, doneShown: false };

        s.canClose = function(){ return !(s.current && s.current.busy && s.current.busy()); };
        s.close = function(){
            if(!s.canClose()) return;
            if(s.doneShown){                                   /* a sent form starts empty next time, however the window was closed */
                s.doneShown = false;
                if(s.current && s.current.afterDone) s.current.afterDone();
            }
            root.classList.remove("is-open");
            root.setAttribute("aria-hidden", "true");
            if(button) button.setAttribute("aria-expanded", "false");
            window.setTimeout(function(){ if(button) button.focus({ preventScroll: true }); }, 0);
        };
        s.setBusy = function(v){ dialog.setAttribute("data-busy", v ? "true" : "false"); };

        closeBtn.addEventListener("click", s.close);
        backdrop.addEventListener("click", s.close);

        /* typing must never trigger the reader's or the app's keyboard shortcuts */
        ["keydown", "keyup", "keypress"].forEach(function(type){
            root.addEventListener(type, function(e){
                if(type === "keydown" && e.key === "Escape"){ e.stopPropagation(); s.close(); return; }
                e.stopPropagation();
                if(type === "keydown" && e.key === "Tab") trapTab(e);
            });
        });

        function trapTab(e){
            var items = Array.prototype.slice.call(dialog.querySelectorAll("button:not([disabled]), input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), a[href]"))
                .filter(function(n){ return n.offsetParent !== null && !n.classList.contains("ff-trap") && !n.closest(".ff-trap"); });
            if(!items.length) return;
            var first = items[0], last = items[items.length - 1];
            if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
            else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
        }

        s.show = function(form){
            s.current = form;
            s.doneShown = false;
            s.title.textContent = form.title;
            s.sub.textContent = form.subtitle || "";
            s.sub.hidden = !form.subtitle;
            clear(s.body); s.body.appendChild(form.body);
            clear(s.footer); s.footer.appendChild(form.footer);
            s.body.scrollTop = 0;
            s.setBusy(false);
            root.classList.add("is-open");
            root.setAttribute("aria-hidden", "false");
            if(button) button.setAttribute("aria-expanded", "true");
            if(form.onShow) form.onShow();
            window.requestAnimationFrame(function(){
                var fine = window.matchMedia && window.matchMedia("(pointer:fine)").matches;
                var first = fine ? form.body.querySelector("input:not([type=hidden]):not(.ff-sr):not([tabindex='-1']), textarea") : null;
                if(first) first.focus({ preventScroll: true });
                else { dialog.tabIndex = -1; dialog.focus({ preventScroll: true }); }          /* phones: do not open the keyboard by itself */
            });
        };

        /* the confirmation window that replaces the form after a successful send */
        s.showDone = function(opts){
            var wrap = el("div", "ff-done");
            var icon = el("div", "ff-done-icon");
            icon.appendChild(svg(opts.icon));
            wrap.appendChild(icon);
            opts.lines.forEach(function(l){
                var n = el(l.tag, l.cls || "", l.text);
                wrap.appendChild(n);
            });
            clear(s.body); s.body.appendChild(wrap);
            clear(s.footer);
            var ok = el("button", "ff-btn ff-primary", "Close");
            ok.type = "button";
            ok.addEventListener("click", function(){ s.setBusy(false); s.close(); });
            s.doneShown = true;
            s.footer.appendChild(ok);
            s.sub.hidden = true;
            s.title.textContent = opts.title;
            s.body.scrollTop = 0;
            window.requestAnimationFrame(function(){ ok.focus({ preventScroll: true }); });
        };

        return s;
    }

    /* ---------- field builders ---------- */
    var fieldSeq = 0;
    function field(labelText, control, opts){
        opts = opts || {};
        var id = "ff-f" + (++fieldSeq);
        var wrap = el("div", "ff-field");
        var label = el("label", "ff-label", labelText);
        if(opts.required){ var r = el("span", "ff-req", "*"); r.setAttribute("aria-hidden", "true"); label.appendChild(r); }
        if(opts.optional){ label.appendChild(el("span", "ff-opt", "optional")); }
        if(control.id === "") control.id = id;
        label.setAttribute("for", control.id);
        wrap.appendChild(label);
        wrap.appendChild(control);
        var err = el("p", "ff-error", "");
        err.id = id + "-err";
        wrap.appendChild(err);
        control.setAttribute("aria-describedby", err.id);
        if(opts.hint){ wrap.appendChild(el("p", "ff-hint", opts.hint)); }
        wrap._err = err;
        wrap.setBad = function(msg){
            err.textContent = msg || "";
            wrap.setAttribute("data-bad", msg ? "true" : "false");
            control.setAttribute("aria-invalid", msg ? "true" : "false");
        };
        return wrap;
    }
    function input(type, attrs){
        var i = el("input", "ff-input");
        i.type = type;
        i.id = "";
        for(var k in (attrs || {})) i.setAttribute(k, attrs[k]);
        return i;
    }

    /* =====================================================
       JOIN
       ===================================================== */
    function createJoin(){
        var f = { title: "Join", subtitle: "Become a registered member of Meditation Mornings.", busyNow: false };
        f.busy = function(){ return f.busyNow; };

        var sid = "";
        var form = el("form", "ff-form");
        form.noValidate = true;
        form.setAttribute("autocomplete", "on");
        form.addEventListener("submit", function(e){ e.preventDefault(); });      /* Enter never sends: only the Join button does */

        var fields = el("fieldset", "ff-fields");

        var name = input("text", { autocomplete: "name", maxlength: String(LIMITS.joinName), placeholder: "Your full name" });
        var fName = field("Name", name, { required: true });

        var month = el("select", "ff-select"); month.id = ""; month.setAttribute("aria-label", "Birth month");
        var day = el("select", "ff-select"); day.id = ""; day.setAttribute("aria-label", "Birth day");
        month.appendChild(new Option("Month", ""));
        MONTHS.forEach(function(m, i){ month.appendChild(new Option(m, String(i + 1))); });
        day.appendChild(new Option("Day", ""));
        for(var d = 1; d <= 31; d++) day.appendChild(new Option(String(d), String(d)));
        var bRow = el("div", "ff-row"); bRow.appendChild(month); bRow.appendChild(day);
        var bWrap = el("div", "ff-field");
        var bLabel = el("label", "ff-label", "Birthday");
        bLabel.appendChild(el("span", "ff-opt", "optional"));
        bLabel.setAttribute("for", "ffBirthMonth"); month.id = "ffBirthMonth";
        var bErr = el("p", "ff-error", ""); bErr.id = "ffBirthErr";
        bWrap.appendChild(bLabel); bWrap.appendChild(bRow); bWrap.appendChild(bErr);
        bWrap.appendChild(el("p", "ff-hint", "Month and day only, no year."));
        function setBirthBad(msg){ bErr.textContent = msg || ""; bWrap.setAttribute("data-bad", msg ? "true" : "false"); }

        var email = input("email", { autocomplete: "email", inputmode: "email", maxlength: String(LIMITS.email), placeholder: "name@example.com" });
        var fEmail = field("Email", email, { optional: true });
        var phone = input("tel", { autocomplete: "tel", inputmode: "tel", maxlength: String(LIMITS.phone), placeholder: "+1 868 555 0142" });
        var fPhone = field("Phone", phone, { optional: true });

        /* a field only robots fill in */
        var trap = input("text", { tabindex: "-1", autocomplete: "off", name: "website", "aria-hidden": "true" });
        var trapWrap = el("div", "ff-trap"); trapWrap.setAttribute("aria-hidden", "true");
        trapWrap.appendChild(trap);

        var consent = el("input"); consent.type = "checkbox"; consent.id = "ffJoinConsent";
        var consentLabel = el("label", "", "I agree that Meditation Mornings may keep these details.");
        consentLabel.setAttribute("for", "ffJoinConsent");
        consentLabel.appendChild(el("small", "", "Only your name may ever be shown in the app. Your other details stay private."));
        var consentWrap = el("div", "ff-check-box");
        consentWrap.appendChild(consent); consentWrap.appendChild(consentLabel);
        var consentErr = el("p", "ff-error", ""); consentErr.id = "ffConsentErr";

        var checkBox = el("div", "ff-check");
        var checkNote = el("p", "ff-check-note", "");
        var check = makeCheck(checkBox, checkNote);

        fields.appendChild(fName); fields.appendChild(bWrap); fields.appendChild(fEmail); fields.appendChild(fPhone);
        fields.appendChild(consentWrap); fields.appendChild(consentErr); fields.appendChild(trapWrap);
        fields.appendChild(checkBox); fields.appendChild(checkNote);
        form.appendChild(fields);
        f.body = form;

        /* footer: message + the Join button */
        var footer = el("div", "ff-footer-inner");
        var msg = el("p", "ff-msg", ""); msg.setAttribute("role", "alert");
        var submit = el("button", "ff-btn ff-primary", "Join");
        submit.type = "button";
        footer.appendChild(msg); footer.appendChild(submit);
        f.footer = footer;

        function say(t){ msg.textContent = t || ""; msg.setAttribute("data-kind", ""); }
        function setBusy(v){
            f.busyNow = v;
            fields.disabled = v;
            submit.disabled = v;
            submit.textContent = v ? "Joining…" : "Join";
            if(shell) shell.setBusy(v);
        }

        /* keep the day list honest for the chosen month */
        function fitDays(){
            var m = +month.value, max = m ? DAYS_IN[m - 1] : 31;
            for(var i = 0; i < day.options.length; i++){
                var v = +day.options[i].value;
                day.options[i].hidden = day.options[i].disabled = !!v && v > max;
            }
            if(+day.value > max) day.value = "";
        }
        month.addEventListener("change", fitDays);

        /* an error goes away as soon as the person works on that field */
        name.addEventListener("input", function(){ fName.setBad(""); });
        email.addEventListener("input", function(){ fEmail.setBad(""); });
        phone.addEventListener("input", function(){ fPhone.setBad(""); });
        month.addEventListener("change", function(){ setBirthBad(""); });
        day.addEventListener("change", function(){ setBirthBad(""); });
        consent.addEventListener("change", function(){ consentErr.textContent = ""; });

        function validate(){
            var ok = true, firstBad = null;
            function bad(node, setter, text){ setter(text); ok = false; if(!firstBad) firstBad = node; }
            var n = name.value.replace(/\s+/g, " ").trim();
            fName.setBad("");
            if(!n) bad(name, fName.setBad, "Please enter your name.");
            else if(n.length > LIMITS.joinName) bad(name, fName.setBad, "Please keep your name under " + LIMITS.joinName + " characters.");
            setBirthBad("");
            if((month.value && !day.value) || (!month.value && day.value)) bad(month, setBirthBad, "Please choose both the month and the day, or leave both empty.");
            var em = email.value.trim();
            fEmail.setBad("");
            if(em && (em.length > LIMITS.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em))) bad(email, fEmail.setBad, "That email address does not look right.");
            var ph = phone.value.trim();
            fPhone.setBad("");
            if(ph && (ph.length > LIMITS.phone || !/^[0-9+()\-.\s]{5,}$/.test(ph))) bad(phone, fPhone.setBad, "That phone number does not look right.");
            consentErr.textContent = "";
            if(!consent.checked) bad(consent, function(t){ consentErr.textContent = t; }, "Please tick the box to let us keep your details.");
            if(firstBad) firstBad.focus({ preventScroll: false });
            return ok;
        }

        function resetForm(){
            name.value = ""; month.value = ""; day.value = ""; email.value = ""; phone.value = ""; trap.value = ""; consent.checked = false;
            fitDays(); sid = "";
            [fName, fEmail, fPhone].forEach(function(x){ x.setBad(""); });
            setBirthBad(""); consentErr.textContent = ""; say("");
            check.reset();
        }
        f.afterDone = resetForm;
        f.onShow = function(){ check.mount(); };

        var checking = false;
        submit.addEventListener("click", function(){
            if(f.busyNow) return;
            say("");
            if(!validate()) return;
            if(check.needed() && !check.token){
                if(checking) return;
                checking = true; say("Checking that you're a person…");
                check.ensure().then(function(){ checking = false; say(""); submit.click(); },
                    function(){ checking = false; say("The security check did not finish. Please try again."); });
                return;
            }
            if(navigator.onLine === false){ say(sayFailure({ status: 0 })); return; }
            sid = sid || newId("j");
            setBusy(true);
            var body = {
                id: sid, name: name.value.replace(/\s+/g, " ").trim(), consent: true, website: trap.value, cf: check.token,
                birthday: month.value && day.value ? (("0" + month.value).slice(-2) + "-" + ("0" + day.value).slice(-2)) : "",
                email: email.value.trim(), phone: phone.value.trim()
            };
            post("/api/join", body).then(function(res){
                setBusy(false);
                if(res.ok){
                    shell.setBusy(false);
                    shell.showDone({
                        title: "Welcome!", icon: ICON.sprout,
                        lines: [{ tag: "h3", text: "Welcome to the MMicj garden!" }, { tag: "p", text: "Let's grow together." }]
                    });
                    return;
                }
                if(res.status !== 400 && res.status !== 413 && res.status !== 429) check.reset();       /* the single-use check was spent */
                say(sayFailure(res));
            });
        });

        return f;
    }

    /* =====================================================
       TESTIFY!
       ===================================================== */
    function createTestify(){
        var f = { title: "Testify!", subtitle: "Share what God has done. Add words, a photo, a video, a PDF or audio.", busyNow: false };
        f.busy = function(){ return f.busyNow; };

        var st = { media: null, mediaKind: "", audio: null, id: "", started: false, uploads: null, mode: "edit" };

        var form = el("form", "ff-form");
        form.noValidate = true;
        form.addEventListener("submit", function(e){ e.preventDefault(); });
        var fields = el("fieldset", "ff-fields");

        var title = input("text", { maxlength: String(LIMITS.title), autocomplete: "off", placeholder: "A short title" });
        var fTitle = field("Title", title, { required: true });

        var nick = input("text", { maxlength: String(LIMITS.testimonyName), autocomplete: "nickname", placeholder: "Your name or a nickname" });
        var fNick = field("Name or nickname", nick, { required: true });

        var desc = el("textarea", "ff-textarea"); desc.id = "";
        desc.maxLength = LIMITS.description;
        desc.placeholder = "Write your testimony here (optional if you add a file).";
        var fDesc = field("Description", desc, { optional: true });
        var count = el("p", "ff-count", "0 / " + LIMITS.description);
        fDesc.insertBefore(count, fDesc._err);
        desc.addEventListener("input", function(){ count.textContent = desc.value.length + " / " + LIMITS.description; });

        /* media */
        var mediaIn = el("input", "ff-sr"); mediaIn.type = "file"; mediaIn.id = "ffMediaIn";
        mediaIn.accept = "image/*,video/*,application/pdf,.pdf";
        var mediaPick = el("label", "ff-pick"); mediaPick.setAttribute("for", "ffMediaIn");
        mediaPick.appendChild(svg(ICON.upload)); mediaPick.appendChild(document.createTextNode("Choose a photo, video or PDF"));
        var mediaChosen = el("div", "ff-chosen"); mediaChosen.hidden = true;
        var mediaBadge = el("span", "ff-badge", "");
        var mediaInfo = el("div", "ff-fileinfo"); var mediaName = el("strong", "", ""); var mediaSize = el("span", "", "");
        mediaInfo.appendChild(mediaName); mediaInfo.appendChild(mediaSize);
        var mediaRemove = el("button", "ff-remove", "Remove"); mediaRemove.type = "button";
        mediaChosen.appendChild(mediaBadge); mediaChosen.appendChild(mediaInfo); mediaChosen.appendChild(mediaRemove);
        var fMedia = el("div", "ff-field");
        var mLabel = el("label", "ff-label", "Media upload"); mLabel.appendChild(el("span", "ff-opt", "optional")); mLabel.setAttribute("for", "ffMediaIn");
        var mErr = el("p", "ff-error", ""); mErr.id = "ffMediaErr";
        fMedia.appendChild(mLabel); fMedia.appendChild(mediaIn); fMedia.appendChild(mediaPick); fMedia.appendChild(mediaChosen); fMedia.appendChild(mErr);
        fMedia.appendChild(el("p", "ff-hint", "Photo up to " + mb(LIMITS.image) + ", video up to " + mb(LIMITS.video) + ", PDF up to " + mb(LIMITS.pdf) + ". We detect the type for you."));
        function setMediaBad(t){ mErr.textContent = t || ""; fMedia.setAttribute("data-bad", t ? "true" : "false"); }

        /* audio */
        var audioIn = el("input", "ff-sr"); audioIn.type = "file"; audioIn.id = "ffAudioIn"; audioIn.accept = "audio/*,.mp3,.m4a,.aac,.wav,.ogg";
        var audioPick = el("label", "ff-pick"); audioPick.setAttribute("for", "ffAudioIn");
        audioPick.appendChild(svg(ICON.upload)); audioPick.appendChild(document.createTextNode("Choose an audio file"));
        var audioChosen = el("div", "ff-chosen"); audioChosen.hidden = true;
        var audioBadge = el("span", "ff-badge", "Audio");
        var audioInfo = el("div", "ff-fileinfo"); var audioName = el("strong", "", ""); var audioSize = el("span", "", "");
        audioInfo.appendChild(audioName); audioInfo.appendChild(audioSize);
        var audioRemove = el("button", "ff-remove", "Remove"); audioRemove.type = "button";
        audioChosen.appendChild(audioBadge); audioChosen.appendChild(audioInfo); audioChosen.appendChild(audioRemove);
        var fAudio = el("div", "ff-field");
        var aLabel = el("label", "ff-label", "Audio upload"); aLabel.appendChild(el("span", "ff-opt", "optional")); aLabel.setAttribute("for", "ffAudioIn");
        var aErr = el("p", "ff-error", ""); aErr.id = "ffAudioErr";
        var aHint = el("p", "ff-hint", "");
        fAudio.appendChild(aLabel); fAudio.appendChild(audioIn); fAudio.appendChild(audioPick); fAudio.appendChild(audioChosen); fAudio.appendChild(aErr); fAudio.appendChild(aHint);
        function setAudioBad(t){ aErr.textContent = t || ""; fAudio.setAttribute("data-bad", t ? "true" : "false"); }

        /* anonymous */
        var anon = el("input"); anon.type = "checkbox"; anon.id = "ffAnon";
        var anonLabel = el("label", "", "Share anonymously");
        anonLabel.setAttribute("for", "ffAnon");
        anonLabel.appendChild(el("small", "", "Only our team will see the name or nickname you gave."));
        var anonWrap = el("div", "ff-check-box"); anonWrap.appendChild(anon); anonWrap.appendChild(anonLabel);

        var trap = input("text", { tabindex: "-1", autocomplete: "off", name: "website", "aria-hidden": "true" });
        var trapWrap = el("div", "ff-trap"); trapWrap.setAttribute("aria-hidden", "true"); trapWrap.appendChild(trap);

        var something = el("p", "ff-error", ""); something.id = "ffSomethingErr";

        var checkBox = el("div", "ff-check");
        var checkNote = el("p", "ff-check-note", "");
        var check = makeCheck(checkBox, checkNote);

        fields.appendChild(fTitle); fields.appendChild(fNick); fields.appendChild(fDesc); fields.appendChild(fMedia); fields.appendChild(fAudio);
        fields.appendChild(anonWrap); fields.appendChild(something); fields.appendChild(trapWrap); fields.appendChild(checkBox); fields.appendChild(checkNote);
        form.appendChild(fields);
        f.body = form;

        /* ----- file choosing ----- */
        function renderFiles(){
            if(st.media){
                mediaChosen.hidden = false; mediaPick.hidden = true;
                mediaBadge.textContent = KIND_LABEL[st.mediaKind] + " detected";
                mediaName.textContent = st.media.name; mediaSize.textContent = size(st.media.size);
            }else{ mediaChosen.hidden = true; mediaPick.hidden = false; mediaName.textContent = ""; mediaSize.textContent = ""; }
            if(st.audio){
                audioChosen.hidden = false; audioPick.hidden = true;
                audioName.textContent = st.audio.name; audioSize.textContent = size(st.audio.size);
            }else{ audioChosen.hidden = true; audioPick.hidden = false; audioName.textContent = ""; audioSize.textContent = ""; }
            var noAudio = st.mediaKind === "video";
            fAudio.setAttribute("data-disabled", noAudio ? "true" : "false");
            audioIn.disabled = noAudio;
            aHint.textContent = noAudio ? "Audio can only be added when the file is not a video." : "mp3, m4a, aac, wav or ogg, up to " + mb(LIMITS.audio) + ".";
        }

        function checkMedia(file){
            var kind = mediaKind(file.name);
            if(!kind) return { error: "That file type isn't supported. Please choose a photo (JPG, PNG, WebP or GIF), a video (MP4, WebM, MOV or M4V) or a PDF." };
            if(!file.size) return { error: "That file looks empty." };
            if(file.size > LIMITS[kind]) return { error: "That " + KIND_LABEL[kind].toLowerCase() + " is too large (the limit is " + mb(LIMITS[kind]) + ")." };
            return { kind: kind };
        }

        mediaIn.addEventListener("change", function(){
            var file = mediaIn.files && mediaIn.files[0];
            mediaIn.value = "";
            if(!file) return;
            var r = checkMedia(file);
            if(r.error){ setMediaBad(r.error); return; }
            setMediaBad("");
            st.media = file; st.mediaKind = r.kind;
            var droppedAudio = (r.kind === "video" && !!st.audio);
            if(droppedAudio){ st.audio = null; setAudioBad(""); }
            renderFiles();
            if(droppedAudio) aHint.textContent = "Your audio file was removed, because audio can only be added when the file is not a video.";
            clearSomething();
        });
        mediaRemove.addEventListener("click", function(){ st.media = null; st.mediaKind = ""; setMediaBad(""); renderFiles(); });

        audioIn.addEventListener("change", function(){
            var file = audioIn.files && audioIn.files[0];
            audioIn.value = "";
            if(!file) return;
            if(st.mediaKind === "video"){ setAudioBad("Audio can only be added when the file is not a video."); return; }
            if(AUDIO.indexOf(extOf(file.name)) === -1){ setAudioBad("That audio type isn't supported. Please choose an mp3, m4a, aac, wav or ogg file."); return; }
            if(!file.size){ setAudioBad("That file looks empty."); return; }
            if(file.size > LIMITS.audio){ setAudioBad("That audio file is too large (the limit is " + mb(LIMITS.audio) + ")."); return; }
            setAudioBad(""); st.audio = file; renderFiles(); clearSomething();
        });
        audioRemove.addEventListener("click", function(){ st.audio = null; setAudioBad(""); renderFiles(); });
        function clearSomething(){ something.textContent = ""; }
        desc.addEventListener("input", function(){ clearSomething(); fDesc.setBad(""); });
        title.addEventListener("input", function(){ fTitle.setBad(""); });
        nick.addEventListener("input", function(){ fNick.setBad(""); });
        renderFiles();

        /* ----- the footer has three modes: edit (Send), confirm (Go back / Yes, send it) and sending (progress) ----- */
        var footer = el("div", "ff-footer-inner");
        var msg = el("p", "ff-msg", ""); msg.setAttribute("role", "alert");
        var area = el("div", "ff-footer-area");
        footer.appendChild(msg); footer.appendChild(area);
        f.footer = footer;

        var sendBtn = el("button", "ff-btn ff-primary", "Send"); sendBtn.type = "button";
        var ask = el("p", "ff-ask", "Send your testimony now?");
        ask.appendChild(el("small", "", "You won't be able to change it after it is sent."));
        var backBtn = el("button", "ff-btn ff-secondary", "Go back"); backBtn.type = "button";
        var yesBtn = el("button", "ff-btn ff-primary", "Yes, send it"); yesBtn.type = "button";
        var actions = el("div", "ff-actions"); actions.appendChild(backBtn); actions.appendChild(yesBtn);
        var bar = el("div", "ff-progress"); var barFill = el("i"); bar.appendChild(barFill);
        bar.setAttribute("role", "progressbar"); bar.setAttribute("aria-valuemin", "0"); bar.setAttribute("aria-valuemax", "100");
        var barText = el("p", "ff-progress-text", "");
        var barNote = el("p", "ff-progress-note", "Please keep this window open until it is sent.");

        function say(t, kind){ msg.textContent = t || ""; msg.setAttribute("data-kind", kind || ""); }
        function setMode(mode){
            st.mode = mode;
            clear(area);
            fields.disabled = (mode === "sending");
            if(mode === "edit") area.appendChild(sendBtn);
            else if(mode === "confirm"){ area.appendChild(ask); area.appendChild(actions); }
            else { area.appendChild(bar); area.appendChild(barText); area.appendChild(barNote); }
            f.busyNow = (mode === "sending");
            if(shell) shell.setBusy(f.busyNow);
        }
        setMode("edit");

        function setProgress(pct, text, wait){
            bar.setAttribute("data-wait", wait ? "true" : "false");
            barFill.style.width = wait ? "" : Math.max(2, Math.min(100, pct)) + "%";
            bar.setAttribute("aria-valuenow", String(Math.round(pct)));
            barText.textContent = text;
        }

        /* ----- checking the form (the same rules as the Worker) ----- */
        function validate(){
            var ok = true, firstBad = null;
            function bad(node, text, setter){ setter(text); ok = false; if(!firstBad) firstBad = node; }
            var t = title.value.replace(/\s+/g, " ").trim(), n = nick.value.replace(/\s+/g, " ").trim(), d = desc.value.trim();
            fTitle.setBad(""); fNick.setBad(""); fDesc.setBad(""); clearSomething();
            if(!t) bad(title, "Please add a title.", fTitle.setBad);
            else if(t.length > LIMITS.title) bad(title, "Please keep the title under " + LIMITS.title + " characters.", fTitle.setBad);
            if(!n) bad(nick, "Please add your name or a nickname.", fNick.setBad);
            else if(n.length > LIMITS.testimonyName) bad(nick, "Please keep your name under " + LIMITS.testimonyName + " characters.", fNick.setBad);
            if(d.length > LIMITS.description) bad(desc, "Please keep the description under " + LIMITS.description + " characters.", fDesc.setBad);
            if(!d && !st.media && !st.audio) bad(desc, "Please share some text, a photo / video / PDF, or an audio file.", function(x){ something.textContent = x; });
            if(firstBad) firstBad.focus({ preventScroll: false });
            return ok;
        }

        function payload(withToken){
            var p = {
                id: st.id, title: title.value.replace(/\s+/g, " ").trim(), name: nick.value.replace(/\s+/g, " ").trim(),
                description: desc.value, anonymous: anon.checked, website: trap.value
            };
            if(withToken) p.cf = check.token;
            if(st.media) p.media = { name: st.media.name, size: st.media.size };
            if(st.audio) p.audio = { name: st.audio.name, size: st.audio.size };
            return p;
        }

        function newSession(){ st.started = false; st.uploads = null; st.id = newId("t"); }

        var checking = false;
        /* step 1: Send -> check, then ask "are you sure?" (nothing is sent yet) */
        sendBtn.addEventListener("click", function(){
            say("");
            yesBtn.textContent = "Yes, send it";
            if(!validate()) return;
            if(check.needed() && !check.token){
                if(checking) return;
                checking = true; say("Checking that you're a person…");
                check.ensure().then(function(){ checking = false; say(""); if(st.mode === "edit") sendBtn.click(); },
                    function(){ checking = false; say("The security check did not finish. Please tap Send again."); });
                return;
            }
            if(!st.id) st.id = newId("t");
            setMode("confirm");
        });
        /* back to editing: if an upload had already started, begin afresh so edits are never mixed with old files */
        backBtn.addEventListener("click", function(){
            say("");
            if(st.started){ newSession(); check.reset(); }
            setMode("edit");
        });

        /* step 2: Yes, send it */
        yesBtn.addEventListener("click", function(){ if(st.mode === "confirm") run(); });

        function fail(text){ say(text); yesBtn.textContent = "Try again"; setMode("confirm"); }

        function run(){
            say("");
            if(navigator.onLine === false){ say(sayFailure({ status: 0 })); return; }
            if(!st.started && check.needed() && !check.token){
                if(checking) return;
                checking = true; say("Checking that you're a person…");
                check.ensure().then(function(){ checking = false; say(""); if(st.mode === "confirm") run(); },
                    function(){ checking = false; say("The security check did not finish. Please tap again."); });
                return;
            }
            setMode("sending");
            setProgress(0, "Getting ready…", true);

            var hasFiles = !!(st.media || st.audio);
            var start = st.started ? Promise.resolve({ ok: true }) : post("/api/testify", payload(true));

            start.then(function(res){
                if(!res.ok){
                    if(res.status !== 400 && res.status !== 413 && res.status !== 429) check.reset();
                    throw { say: sayFailure(res) };
                }
                if(!st.started){
                    if(!hasFiles || (res.data && res.data.done)) return "done";
                    st.started = true;
                    st.uploads = (res.data && res.data.uploads || []).map(function(u){ return { field: u.field, key: u.key, url: u.url, contentType: u.contentType, sent: false, loaded: 0 }; });
                    if(!st.uploads.length) throw { say: "Something went wrong on our side. Please try again in a moment." };
                }
                return sendFiles();
            }).then(function(r){
                if(r === "done") return "done";
                /* all files are in R2: tell the Worker to save the entry */
                setProgress(100, "Finishing…", true);
                var p = payload(false);
                st.uploads.forEach(function(u){ if(u.field === "media") p.media.key = u.key; else p.audio.key = u.key; });
                return post("/api/testify/finish", p).then(function(res){
                    if(!res.ok){
                        if(res.status === 400 || res.status === 422){ newSession(); check.reset(); }       /* the files did not check out: start over next time */
                        throw { say: sayFailure(res) };
                    }
                    return "done";
                });
            }).then(function(){
                finished();
            }).catch(function(e){
                fail(e && e.say ? e.say : "Something went wrong. Please try again.");
            });
        }

        function sendFiles(){
            var total = 0;
            st.uploads.forEach(function(u){ total += (u.field === "media" ? st.media : st.audio).size; });
            function update(){
                var sent = 0;
                st.uploads.forEach(function(u){ sent += u.loaded; });
                var pct = total ? (sent / total) * 100 : 0;
                setProgress(pct, "Sending… " + Math.round(pct) + "%", false);
            }
            update();
            var chain = Promise.resolve();
            st.uploads.forEach(function(u){
                chain = chain.then(function(){
                    if(u.sent) return;
                    var file = u.field === "media" ? st.media : st.audio;
                    return putFile(u.url, file, u.contentType, function(loaded){ u.loaded = loaded; update(); }).then(function(){
                        u.sent = true; u.loaded = file.size; update();
                    }, function(err){
                        u.loaded = 0;
                        if(err && err.status === 403){ newSession(); check.reset(); }          /* the one-hour link ran out: start over next time */
                        throw { say: "Your file didn't finish sending. Please check your connection and tap Try again." };
                    });
                });
            });
            return chain;
        }

        function finished(){
            f.busyNow = false;
            if(shell) shell.setBusy(false);
            shell.showDone({
                title: "Thank you!", icon: ICON.check,
                lines: [
                    { tag: "h3", text: "Your testimony has been sent." },
                    { tag: "p", cls: "ff-ref", text: "Revelation 12:11 (KJV)." },
                    { tag: "blockquote", text: "“And they overcame him by the blood of the Lamb, and by the word of their testimony…”" }
                ]
            });
        }

        function resetForm(){
            title.value = ""; nick.value = ""; desc.value = ""; anon.checked = false; trap.value = "";
            count.textContent = "0 / " + LIMITS.description;
            st.media = null; st.mediaKind = ""; st.audio = null; st.id = ""; st.started = false; st.uploads = null;
            [fTitle, fNick, fDesc].forEach(function(x){ x.setBad(""); });
            setMediaBad(""); setAudioBad(""); clearSomething(); say("");
            yesBtn.textContent = "Yes, send it";
            renderFiles(); setMode("edit"); check.reset();
        }
        f.afterDone = resetForm;
        f.onShow = function(){ check.mount(); };

        return f;
    }

    /* ---------- the little menu above the button ---------- */
    function buildMenu(){
        var m = el("div", "ff-menu");
        m.hidden = true;
        m.setAttribute("role", "group");
        m.setAttribute("aria-label", "Join or testify");

        function choice(label, icon, key){
            var b = el("button", "ff-menu-btn");
            b.type = "button";
            b.appendChild(svg(icon));
            b.appendChild(document.createTextNode(label));
            b.addEventListener("click", function(){ closeMenu(false); openForm(key); });
            return b;
        }
        m.appendChild(choice("Join", ICON.join, "join"));
        m.appendChild(choice("Testify", ICON.testify, "testify"));
        m.addEventListener("keydown", function(e){
            if(e.key === "Escape"){ e.stopPropagation(); closeMenu(true); }
        });
        host.appendChild(m);
        return m;
    }

    function placeMenu(){
        var r = button.getBoundingClientRect();
        var w = menu.offsetWidth || 220;
        var vw = document.documentElement.clientWidth || window.innerWidth;
        var vh = document.documentElement.clientHeight || window.innerHeight;
        var centre = r.left + r.width / 2;
        var left = Math.max(8, Math.min(vw - w - 8, centre - w / 2));
        menu.style.left = Math.round(left) + "px";
        menu.style.bottom = Math.round(vh - r.top + 10) + "px";
        menu.style.setProperty("--ff-arrow", Math.round(Math.max(18, Math.min(w - 18, centre - left))) + "px");
    }

    function openMenu(){
        if(!menu) menu = buildMenu();
        menu.hidden = false;
        placeMenu();
        window.requestAnimationFrame(function(){ menu.classList.add("is-open"); });
        button.setAttribute("aria-expanded", "true");
        var first = menu.querySelector("button");
        if(first) first.focus({ preventScroll: true });
    }

    function closeMenu(restoreFocus){
        if(!menu || menu.hidden) return;
        menu.classList.remove("is-open");
        menu.hidden = true;
        button.setAttribute("aria-expanded", "false");
        if(restoreFocus) button.focus({ preventScroll: true });
    }

    function openForm(key){
        if(!shell) shell = buildShell();
        if(!forms[key]) forms[key] = key === "join" ? createJoin() : createTestify();
        shell.show(forms[key]);
    }

    function init(){
        host = document.getElementById("frontPage");
        button = document.getElementById("frontFormsButton");
        if(!host || !button || button.dataset.ffBound === "true") return;
        button.dataset.ffBound = "true";
        button.setAttribute("aria-haspopup", "true");
        button.setAttribute("aria-expanded", "false");

        button.addEventListener("click", function(){
            if(shell && shell.root.classList.contains("is-open")) return;
            (menu && !menu.hidden) ? closeMenu(false) : openMenu();
        });

        /* tapping anywhere else, rotating the phone or leaving the Front Page closes the menu */
        document.addEventListener("pointerdown", function(e){
            if(!menu || menu.hidden) return;
            if(menu.contains(e.target) || button.contains(e.target)) return;
            closeMenu(false);
        }, true);
        window.addEventListener("resize", function(){ closeMenu(false); });
        new MutationObserver(function(){
            if(host.classList.contains("app-section-hidden")) closeMenu(false);
        }).observe(host, { attributes: true, attributeFilter: ["class"] });
    }

    if(document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
    else init();

    /* a handle for tests / support (does not open anything by itself) */
    window.FrontForms = { open: function(k){ if(host) openForm(k === "testify" ? "testify" : "join"); } };
})();
