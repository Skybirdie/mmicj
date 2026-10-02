/* =========================================================
   Front Page share button + share panel  (js/frontShare.js  v2.1.0)

   A plain "share this link" button that lives on the Front Page only,
   with its own share panel that resembles the browser's share sheet.

   It is deliberately NOT part of the app's share mode:
     - it does not use shareManager.js / shareViewer.js
     - it never adds body.sky-share-mode or touches ?contractz= links
     - it shares one fixed public URL, not a book/video/slideshow

   Why a custom panel
     The app is currently embedded in Glide's iframe. Chrome only allows
     the native share sheet (navigator.share) inside a cross-origin iframe
     when the embedding page grants the "web-share" permission, which
     this app cannot grant itself. So while embedded, the native sheet is
     refused and this panel is used instead.

   Behaviour
     1. EMBEDDED (running inside an iframe, i.e. inside Glide today):
        the panel opens. No native share attempt is made.
     2. STANDALONE (the app opened directly, e.g. once Glide is gone):
        the browser's native share sheet is used. Nothing has to be
        changed for this: the check below simply stops matching.
        Browsers with no native share (e.g. desktop Firefox), or a native
        share that fails, get the panel as the fallback.
     3. In the panel, each option opens that platform's own share
        page/app with the link filled in; "Copy link" copies it silently
        and shows the same link-copied.gif the other share links use.
        No text confirmation, no alert().
     4. Instagram has no web link-share, so its tile copies the link and
        then opens Instagram so it can be pasted into a message or story.
     5. Closing the native sheet, or the panel, does nothing else.

   The button itself is markup inside #frontPage (index.html) and the
   panel is created inside #frontPage too, so both are shown and hidden
   by the Front Page's own app-section-active / app-section-hidden state.
   ========================================================= */
(function(){
    "use strict";

    const SHARE_URL   = "https://meditationmornings.glide.page";
    const SHARE_TITLE = "Meditation Mornings";
    const SHARE_TEXT  = "Meditation Mornings in Christ Jesus";
    const SHARE_LOGO  = "assets/logo.png";

    /* Same image and on-screen time as the app's other share links
       (see LINK_COPIED_* in shareManager.js). Its own element, so this
       button never shares state with the share-mode code. */
    const FEEDBACK_ID  = "frontShareCopiedFeedback";
    const FEEDBACK_SRC = "assets/link-copied.gif";
    const FEEDBACK_MS  = 1100;

    let feedbackTimer = 0;
    let panel = null;
    let panelDialog = null;
    let shareButton = null;

    /* ---------------------------------------------------------
       Confirmation graphic
       --------------------------------------------------------- */
    function showCopiedFeedback(){
        if(!document.body) return;

        let el = document.getElementById(FEEDBACK_ID);
        if(!el){
            el = document.createElement("img");
            el.id = FEEDBACK_ID;
            el.alt = "Link copied";
            el.setAttribute("aria-hidden", "true");
            el.draggable = false;
            document.body.appendChild(el);
        }

        window.clearTimeout(feedbackTimer);

        /* Reset src on every trigger so the GIF restarts from its first
           frame on repeated taps instead of freezing on its last frame. */
        el.classList.remove("visible");
        el.src = "";
        el.src = FEEDBACK_SRC;

        window.requestAnimationFrame(()=>{
            el.classList.add("visible");
        });

        feedbackTimer = window.setTimeout(()=>{
            el.classList.remove("visible");
        }, FEEDBACK_MS);
    }

    /* ---------------------------------------------------------
       Clipboard (silent)
       --------------------------------------------------------- */
    async function copyLink(){
        /* Preferred: async Clipboard API (needs HTTPS / localhost, and
           the "clipboard-write" permission when embedded in an iframe). */
        if(navigator.clipboard && typeof navigator.clipboard.writeText === "function"){
            try{
                await navigator.clipboard.writeText(SHARE_URL);
                return true;
            }catch(_){
                /* fall through to the legacy path */
            }
        }

        /* Legacy fallback for iframes / insecure contexts / old WebViews. */
        try{
            const field = document.createElement("textarea");
            field.value = SHARE_URL;
            field.setAttribute("readonly", "");
            field.style.cssText =
                "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
            document.body.appendChild(field);
            field.select();
            field.setSelectionRange(0, field.value.length);
            const ok = document.execCommand("copy");
            field.remove();
            return !!ok;
        }catch(_){
            return false;
        }
    }

    /* ---------------------------------------------------------
       Platforms

       Every option below opens that platform's own public share
       endpoint with the link pre-filled; none needs an app ID or key.
       Icons are simple drawings of each brand's mark (48x48 viewBox).
       --------------------------------------------------------- */
    const enc = encodeURIComponent;
    const MESSAGE = SHARE_URL;

    const svg = body =>
        '<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">' + body + "</svg>";

    const PLATFORMS = [
        {
            id: "copy", label: "Copy link", action: "copy",
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#5f6368"/>' +
                '<g fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">' +
                '<path d="M21 27a6 6 0 0 0 8.5 0l4-4a6 6 0 0 0-8.5-8.5l-1.5 1.5"/>' +
                '<path d="M27 21a6 6 0 0 0-8.5 0l-4 4a6 6 0 0 0 8.5 8.5l1.5-1.5"/></g>')
        },
        {
            id: "whatsapp", label: "WhatsApp",
            href: () => "https://wa.me/?text=" + enc(MESSAGE),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#25D366"/>' +
                '<path d="M24 11.5a12.5 12.5 0 0 0-10.7 19l-1.6 6.1 6.3-1.6A12.5 12.5 0 1 0 24 11.5z" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round"/>' +
                '<path d="M19.2 18.2c-.5 1-.4 2.3.9 4.3 1.5 2.3 3.4 3.8 5.4 4.5 1.2.4 2.2-.2 2.8-1.1l.3-.5-2.6-1.5-1 .9c-1.2-.4-3-2-3.7-3.6l.8-1-1.3-2.7z" fill="#fff"/>')
        },
        {
            id: "facebook", label: "Facebook",
            href: () => "https://www.facebook.com/sharer/sharer.php?u=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#1877F2"/>' +
                '<path d="M26.6 38V26h4l.6-4.7h-4.6v-3c0-1.3.4-2.3 2.3-2.3h2.5v-4.2c-.4 0-1.9-.2-3.6-.2-3.6 0-6 2.2-6 6.2v3.5h-4V26h4v12z" fill="#fff"/>')
        },
        {
            id: "instagram", label: "Instagram", action: "copy-open",
            href: () => "https://www.instagram.com/direct/inbox/",
            icon: svg(
                '<defs><linearGradient id="fsIgGrad" x1="0" y1="1" x2="1" y2="0">' +
                '<stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/>' +
                '<stop offset=".6" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/>' +
                '<stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs>' +
                '<circle cx="24" cy="24" r="24" fill="url(#fsIgGrad)"/>' +
                '<rect x="13" y="13" width="22" height="22" rx="6.5" fill="none" stroke="#fff" stroke-width="2.6"/>' +
                '<circle cx="24" cy="24" r="5.2" fill="none" stroke="#fff" stroke-width="2.6"/>' +
                '<circle cx="30.3" cy="17.7" r="1.6" fill="#fff"/>')
        },
        {
            id: "x", label: "X",
            href: () => "https://x.com/intent/post?url=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#000"/>' +
                '<path d="M14 14h5.6L34 34h-5.6z" fill="#fff"/>' +
                '<path d="M33.2 14L14.8 34" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>')
        },
        {
            id: "threads", label: "Threads",
            href: () => "https://www.threads.net/intent/post?text=" + enc(MESSAGE),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#000"/>' +
                '<text x="24" y="32.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="700" font-size="25" fill="#fff">@</text>')
        },
        {
            id: "telegram", label: "Telegram",
            href: () => "https://t.me/share/url?url=" + enc(SHARE_URL) + "",
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#229ED9"/>' +
                '<path d="M11 23.4L35.6 13.9c1.1-.4 2 .3 1.7 1.8l-4.2 19.6c-.3 1.4-1.1 1.7-2.3 1.1l-6.3-4.7-3 2.9c-.3.3-.6.6-1.3.6l.5-6.4 11.7-10.6c.5-.5-.1-.7-.8-.3L15.4 27l-6.2-1.9c-1.3-.4-1.4-1.3.4-1.9z" fill="#fff"/>')
        },
        {
            id: "line", label: "LINE",
            href: () => "https://social-plugins.line.me/lineit/share?url=" + enc(SHARE_URL) + "",
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#06C755"/>' +
                '<path d="M24 12c-8 0-14.5 5.2-14.5 11.6 0 5.7 5.1 10.5 12 11.4.5.1 1.1.3 1.3.7.1.4.1.9 0 1.3l-.2 1.3c-.1.4-.3 1.5 1.3.8s8.6-5 11.7-8.6c2.2-2.4 3.2-4.9 3.2-7.4C38.5 17.2 32 12 24 12z" fill="#fff"/>' +
                '<text x="24" y="27" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="800" font-size="8.5" fill="#06C755">LINE</text>')
        },
        {
            id: "linkedin", label: "LinkedIn",
            href: () => "https://www.linkedin.com/sharing/share-offsite/?url=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#0A66C2"/>' +
                '<rect x="13.5" y="20" width="4.4" height="14" fill="#fff"/>' +
                '<circle cx="15.7" cy="15" r="2.6" fill="#fff"/>' +
                '<path d="M21 20h4.2v2c.8-1.4 2.4-2.3 4.4-2.3 3.9 0 5 2.5 5 6V34h-4.4v-7.3c0-1.6-.3-2.9-2.1-2.9-1.9 0-2.7 1.4-2.7 3V34H21z" fill="#fff"/>')
        },
        {
            id: "reddit", label: "Reddit",
            href: () => "https://www.reddit.com/submit?url=" + enc(SHARE_URL) + "&title=" + enc(SHARE_TITLE),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#FF4500"/>' +
                '<ellipse cx="24" cy="28" rx="11" ry="7.5" fill="#fff"/>' +
                '<circle cx="12.6" cy="25.2" r="2.6" fill="#fff"/><circle cx="35.4" cy="25.2" r="2.6" fill="#fff"/>' +
                '<circle cx="19.8" cy="27" r="2" fill="#FF4500"/><circle cx="28.2" cy="27" r="2" fill="#FF4500"/>' +
                '<path d="M19.5 31.6c2.5 2 6.5 2 9 0" stroke="#FF4500" stroke-width="1.4" fill="none" stroke-linecap="round"/>' +
                '<path d="M24 20.6l1.8-7 5.5 1.2" stroke="#fff" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
                '<circle cx="32.6" cy="14.8" r="2.3" fill="#fff"/>')
        },
        {
            id: "bluesky", label: "Bluesky",
            href: () => "https://bsky.app/intent/compose?text=" + enc(MESSAGE),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#1185FE"/>' +
                '<path d="M16.6 14.6c2.9 2.2 6 6.6 7.4 9 1.4-2.4 4.5-6.8 7.4-9 2.1-1.6 5.6-2.8 5.6 1.1 0 .8-.5 6.6-.8 7.5-1 3.3-4.3 4.1-7.3 3.6 5.2.9 6.5 3.8 3.7 6.8-5.5 5.6-7.9-1.4-8.5-3.2-.1-.3-.2-.5-.2-.4 0-.1-.1.1-.2.4-.6 1.8-3 8.8-8.5 3.2-2.8-3-1.5-5.9 3.7-6.8-3 .5-6.3-.3-7.3-3.6-.3-.9-.8-6.7-.8-7.5 0-3.9 3.5-2.7 5.6-1.1z" fill="#fff" transform="translate(0 -1.2) scale(1)"/>')
        },
        {
            id: "sms", label: "SMS", sameTab: true,
            href: () => "sms:?&body=" + enc(MESSAGE),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#34B04A"/>' +
                '<path d="M13 15.5h22a2.5 2.5 0 0 1 2.5 2.5v11a2.5 2.5 0 0 1-2.5 2.5H23l-6.5 5v-5H13A2.5 2.5 0 0 1 10.5 29V18A2.5 2.5 0 0 1 13 15.5z" fill="#fff"/>' +
                '<circle cx="17.5" cy="23.5" r="1.7" fill="#34B04A"/><circle cx="24" cy="23.5" r="1.7" fill="#34B04A"/><circle cx="30.5" cy="23.5" r="1.7" fill="#34B04A"/>')
        },
        {
            id: "email", label: "Email", sameTab: true,
            href: () => "mailto:?subject=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#3B82F6"/>' +
                '<rect x="11" y="15" width="26" height="18" rx="3" fill="none" stroke="#fff" stroke-width="2.6"/>' +
                '<path d="M12 17.5l12 9 12-9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
        },
        {
            id: "gmail", label: "Gmail",
            href: () => "https://mail.google.com/mail/?view=cm&fs=1&su=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="23" fill="#fff" stroke="#dadce0" stroke-width="2"/>' +
                '<path d="M12.5 17v15" stroke="#4285F4" stroke-width="3.2" stroke-linecap="round"/>' +
                '<path d="M35.5 17v15" stroke="#34A853" stroke-width="3.2" stroke-linecap="round"/>' +
                '<path d="M12.5 17l11.5 9 11.5-9" fill="none" stroke="#EA4335" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>')
        },
        {
            id: "outlook", label: "Outlook",
            href: () => "https://outlook.live.com/mail/0/deeplink/compose?subject=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#0078D4"/>' +
                '<path d="M27.5 17h7.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-7.5z" fill="#fff" opacity=".85"/>' +
                '<circle cx="21.5" cy="24" r="6.6" fill="none" stroke="#fff" stroke-width="3.6"/>')
        },
        {
            id: "yahoo", label: "Yahoo Mail",
            href: () => "https://compose.mail.yahoo.com/?subject=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#6001D2"/>' +
                '<text x="24" y="31.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-style="italic" font-size="22" fill="#fff">y!</text>')
        }
    ];

    /* ---------------------------------------------------------
       Panel
       --------------------------------------------------------- */
    function buildPanel(){
        const host = document.getElementById("frontPage");
        if(!host) return null;

        panel = document.createElement("div");
        panel.id = "frontSharePanel";
        panel.setAttribute("aria-hidden", "true");

        const backdrop = document.createElement("div");
        backdrop.className = "frontShareBackdrop";
        backdrop.addEventListener("click", ()=>closePanel(true));

        panelDialog = document.createElement("div");
        panelDialog.className = "frontShareDialog";
        panelDialog.setAttribute("role", "dialog");
        panelDialog.setAttribute("aria-modal", "true");
        panelDialog.setAttribute("aria-labelledby", "frontShareHeading");

        const handle = document.createElement("div");
        handle.className = "frontShareHandle";
        handle.setAttribute("aria-hidden", "true");

        const header = document.createElement("div");
        header.className = "frontShareHeader";

        const heading = document.createElement("h2");
        heading.id = "frontShareHeading";
        heading.textContent = "Share";

        const close = document.createElement("button");
        close.type = "button";
        close.className = "frontShareClose";
        close.setAttribute("aria-label", "Close");
        close.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        close.addEventListener("click", ()=>closePanel(true));

        header.append(heading, close);

        const preview = document.createElement("div");
        preview.className = "frontSharePreview";

        const logo = document.createElement("img");
        logo.src = SHARE_LOGO;
        logo.alt = "";
        logo.draggable = false;
        logo.addEventListener("error", ()=>{ logo.style.visibility = "hidden"; });

        const meta = document.createElement("div");
        meta.className = "frontSharePreviewText";
        const name = document.createElement("strong");
        name.textContent = SHARE_TITLE;
        const url = document.createElement("span");
        url.textContent = SHARE_URL.replace(/^https?:\/\//, "");
        meta.append(name, url);

        preview.append(logo, meta);

        const grid = document.createElement("div");
        grid.className = "frontShareGrid";

        PLATFORMS.forEach(p=>{
            const tile = document.createElement(p.href ? "a" : "button");
            tile.className = "frontShareTile";
            tile.dataset.platform = p.id;

            if(p.href){
                tile.href = p.href();
                if(!p.sameTab){
                    tile.target = "_blank";
                    tile.rel = "noopener noreferrer";
                }
            }else{
                tile.type = "button";
            }

            const icon = document.createElement("span");
            icon.className = "frontShareIcon";
            icon.innerHTML = p.icon;

            const label = document.createElement("span");
            label.className = "frontShareLabel";
            label.textContent = p.label;

            tile.append(icon, label);

            tile.addEventListener("click", event=>{
                if(p.action === "copy"){
                    event.preventDefault();
                    copyLink().then(ok=>{
                        if(ok) showCopiedFeedback();
                    });
                    closePanel(true);
                    return;
                }

                if(p.action === "copy-open"){
                    /* Let the link open normally; copy alongside it. */
                    copyLink().then(ok=>{
                        if(ok) showCopiedFeedback();
                    });
                }

                /* Close after the browser has handled the click. */
                window.setTimeout(()=>closePanel(false), 0);
            });

            grid.appendChild(tile);
        });

        panelDialog.append(handle, header, preview, grid);
        panel.append(backdrop, panelDialog);
        host.appendChild(panel);

        panel.addEventListener("keydown", event=>{
            if(event.key === "Escape"){
                event.stopPropagation();
                closePanel(true);
                return;
            }

            if(event.key === "Tab"){
                const items = Array.from(
                    panelDialog.querySelectorAll("a[href], button")
                );
                if(!items.length) return;
                const first = items[0];
                const last = items[items.length - 1];

                if(event.shiftKey && document.activeElement === first){
                    event.preventDefault();
                    last.focus();
                }else if(!event.shiftKey && document.activeElement === last){
                    event.preventDefault();
                    first.focus();
                }
            }
        });

        /* If the Front Page is hidden while the panel is open (another
           section becomes active), close it so it isn't left open when the
           person returns. */
        new MutationObserver(()=>{
            if(host.classList.contains("app-section-hidden")){
                closePanel(false);
            }
        }).observe(host, {attributes:true, attributeFilter:["class"]});

        return panel;
    }

    function openPanel(){
        if(!panel && !buildPanel()) return;

        panel.classList.add("is-open");
        panel.setAttribute("aria-hidden", "false");
        if(shareButton) shareButton.setAttribute("aria-expanded", "true");

        window.requestAnimationFrame(()=>{
            const first = panelDialog.querySelector(".frontShareTile");
            if(first) first.focus({preventScroll:true});
        });
    }

    function closePanel(restoreFocus){
        if(!panel || !panel.classList.contains("is-open")) return;

        panel.classList.remove("is-open");
        panel.setAttribute("aria-hidden", "true");
        if(shareButton){
            shareButton.setAttribute("aria-expanded", "false");
            if(restoreFocus) shareButton.focus({preventScroll:true});
        }
    }

    /* ---------------------------------------------------------
       Entry point
       --------------------------------------------------------- */
    /* True when the app is running inside another page (an iframe), which
       is how it is hosted in Glide. This is deliberately not tied to
       Glide's domains (Glide serves embeds from several hosts); the iframe
       itself is what the browser restricts. When the app is opened
       directly this is false, so no code change is needed once Glide is
       removed. */
    function isEmbedded(){
        try{
            return window.self !== window.top;
        }catch(_){
            /* Reading window.top can throw in some sandboxed frames; that
               only happens when we ARE framed. */
            return true;
        }
    }

    /* Standalone only: does this browser have a native share sheet at all?
       (Desktop Firefox, for example, does not.) If it has one but refuses
       at the moment of use, handleShare() falls back to the panel. */
    function nativeShareAvailable(){
        return typeof navigator.share === "function";
    }

    async function handleShare(){
        /* Embedded (Glide): the native sheet is blocked, go straight to
           the panel. Standalone: prefer the native sheet. */
        if(!isEmbedded() && nativeShareAvailable()){
            try{
                /* Link only: title/text would be added to the message
                   by apps like WhatsApp. The card comes from the link. */
                await navigator.share({
                    url: SHARE_URL
                });
                return;
            }catch(error){
                /* The person closed the native sheet: nothing to do. */
                if(error && error.name === "AbortError") return;
                /* Any other failure: use the panel instead. */
            }
        }

        openPanel();
    }

    function init(){
        shareButton = document.getElementById("frontShareButton");
        if(!shareButton || shareButton.dataset.frontShareBound === "true") return;
        shareButton.dataset.frontShareBound = "true";
        shareButton.setAttribute("aria-haspopup", "dialog");
        shareButton.setAttribute("aria-expanded", "false");
        shareButton.addEventListener("click", handleShare);
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init, {once:true});
    }else{
        init();
    }
})();
