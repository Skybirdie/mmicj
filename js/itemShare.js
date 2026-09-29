/* =========================================================
   Item share panel  (js/itemShare.js  v1.0.0)

   The share panel for the Reader, Video and Slideshow item share
   links. It is the same panel the Front Page uses (js/frontShare.js),
   but for whichever item is being shared, and it is opened by
   ShareManager.share() - the one function every item share button
   already calls (readerShareButton, videoViewerShare, slideshowShare).

   Why
     While the app is embedded in Glide's iframe the browser refuses
     the native share sheet (navigator.share), so item share links
     could only copy silently. Inside an iframe this panel is used.

   When it opens (decided in ShareManager.share, not here)
     1. EMBEDDED (inside an iframe, i.e. Glide today): the panel opens.
     2. STANDALONE with a native share sheet: the native sheet is used,
        exactly as before. The panel is only the fallback if the
        browser has no native share or refuses it.
     3. Share Mode (?contractz / /s/... links) never uses this panel.
     4. "Copy link" copies silently and shows the same link-copied.gif
        (ShareManager.showLinkCopiedFeedback) - the final fallback.

   Fullscreen
     Video and Slideshow go fullscreen on their own viewer element
     (#videoViewer / #slideshowViewer), and only that element's
     descendants are painted while it is fullscreen. The panel is
     therefore mounted inside document.fullscreenElement whenever one
     exists, otherwise on <body>. Front Page -> Fullscreen -> Share
     takes exactly the same path as opening the viewer directly.

   Nothing here touches the Front Page panel, share mode, or storage.
   ========================================================= */
(function(){
    "use strict";

    const DEFAULT_LOGO = "assets/logo.png";

    /* Current item (set on every open; the platform links below read
       these when the tiles are built). */
    let SHARE_URL   = "";
    let SHARE_TITLE = "";
    let SHARE_TEXT  = "";
    let MESSAGE     = "";

    let panel = null;
    let dialog = null;
    let grid = null;
    let previewImg = null;
    let previewName = null;
    let previewUrl = null;
    let lastFocus = null;
    let isOpen = false;

    /* ---------------------------------------------------------
       Clipboard + confirmation graphic: ShareManager owns both, so
       the item panel shows the identical link-copied cue.
       --------------------------------------------------------- */
    async function copyLink(){
        try{
            if(window.ShareManager && typeof ShareManager.copyToClipboard === "function"){
                return !!(await ShareManager.copyToClipboard(SHARE_URL));
            }
        }catch(_){}
        return false;
    }

    function showCopied(){
        try{
            if(window.ShareManager && typeof ShareManager.showLinkCopiedFeedback === "function"){
                ShareManager.showLinkCopiedFeedback();
            }
        }catch(_){}
    }

    /* ---------------------------------------------------------
       Platforms (same list, order and icons as the Front Page panel)
       --------------------------------------------------------- */
    const enc = encodeURIComponent;

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
                '<defs><linearGradient id="isIgGrad" x1="0" y1="1" x2="1" y2="0">' +
                '<stop offset="0" stop-color="#FEDA75"/><stop offset=".35" stop-color="#FA7E1E"/>' +
                '<stop offset=".6" stop-color="#D62976"/><stop offset=".8" stop-color="#962FBF"/>' +
                '<stop offset="1" stop-color="#4F5BD5"/></linearGradient></defs>' +
                '<circle cx="24" cy="24" r="24" fill="url(#isIgGrad)"/>' +
                '<rect x="13" y="13" width="22" height="22" rx="6.5" fill="none" stroke="#fff" stroke-width="2.6"/>' +
                '<circle cx="24" cy="24" r="5.2" fill="none" stroke="#fff" stroke-width="2.6"/>' +
                '<circle cx="30.3" cy="17.7" r="1.6" fill="#fff"/>')
        },
        {
            id: "x", label: "X",
            href: () => "https://x.com/intent/post?text=" + enc(SHARE_TEXT) + "&url=" + enc(SHARE_URL),
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
            href: () => "https://t.me/share/url?url=" + enc(SHARE_URL) + "&text=" + enc(SHARE_TEXT),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#229ED9"/>' +
                '<path d="M11 23.4L35.6 13.9c1.1-.4 2 .3 1.7 1.8l-4.2 19.6c-.3 1.4-1.1 1.7-2.3 1.1l-6.3-4.7-3 2.9c-.3.3-.6.6-1.3.6l.5-6.4 11.7-10.6c.5-.5-.1-.7-.8-.3L15.4 27l-6.2-1.9c-1.3-.4-1.4-1.3.4-1.9z" fill="#fff"/>')
        },
        {
            id: "line", label: "LINE",
            href: () => "https://social-plugins.line.me/lineit/share?url=" + enc(SHARE_URL) + "&text=" + enc(SHARE_TEXT),
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
            href: () => "mailto:?subject=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_TEXT + "\n\n" + SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#3B82F6"/>' +
                '<rect x="11" y="15" width="26" height="18" rx="3" fill="none" stroke="#fff" stroke-width="2.6"/>' +
                '<path d="M12 17.5l12 9 12-9" fill="none" stroke="#fff" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>')
        },
        {
            id: "gmail", label: "Gmail",
            href: () => "https://mail.google.com/mail/?view=cm&fs=1&su=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_TEXT + "\n\n" + SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="23" fill="#fff" stroke="#dadce0" stroke-width="2"/>' +
                '<path d="M12.5 17v15" stroke="#4285F4" stroke-width="3.2" stroke-linecap="round"/>' +
                '<path d="M35.5 17v15" stroke="#34A853" stroke-width="3.2" stroke-linecap="round"/>' +
                '<path d="M12.5 17l11.5 9 11.5-9" fill="none" stroke="#EA4335" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>')
        },
        {
            id: "outlook", label: "Outlook",
            href: () => "https://outlook.live.com/mail/0/deeplink/compose?subject=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_TEXT + "\n\n" + SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#0078D4"/>' +
                '<path d="M27.5 17h7.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5h-7.5z" fill="#fff" opacity=".85"/>' +
                '<circle cx="21.5" cy="24" r="6.6" fill="none" stroke="#fff" stroke-width="3.6"/>')
        },
        {
            id: "yahoo", label: "Yahoo Mail",
            href: () => "https://compose.mail.yahoo.com/?subject=" + enc(SHARE_TITLE) + "&body=" + enc(SHARE_TEXT + "\n\n" + SHARE_URL),
            icon: svg(
                '<circle cx="24" cy="24" r="24" fill="#6001D2"/>' +
                '<text x="24" y="31.5" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" font-weight="900" font-style="italic" font-size="22" fill="#fff">y!</text>')
        }
    ];


    /* ---------------------------------------------------------
       Panel
       --------------------------------------------------------- */
    function mountHost(){
        const fs = document.fullscreenElement;
        if(fs &&
           fs !== document.documentElement &&
           fs !== document.body &&
           !/^(VIDEO|IFRAME|IMG|AUDIO|CANVAS)$/.test(fs.tagName)){
            return fs;
        }
        return document.body;
    }

    function buildPanel(){
        panel = document.createElement("div");
        panel.id = "itemSharePanel";
        panel.setAttribute("aria-hidden", "true");

        const backdrop = document.createElement("div");
        backdrop.className = "itemShareBackdrop";
        backdrop.addEventListener("click", ()=>close(true));

        dialog = document.createElement("div");
        dialog.className = "itemShareDialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-labelledby", "itemShareHeading");

        const handle = document.createElement("div");
        handle.className = "itemShareHandle";
        handle.setAttribute("aria-hidden", "true");

        const header = document.createElement("div");
        header.className = "itemShareHeader";

        const heading = document.createElement("h2");
        heading.id = "itemShareHeading";
        heading.textContent = "Share";

        const closeBtn = document.createElement("button");
        closeBtn.type = "button";
        closeBtn.className = "itemShareClose";
        closeBtn.setAttribute("aria-label", "Close");
        closeBtn.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
            '<path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
        closeBtn.addEventListener("click", ()=>close(true));

        header.append(heading, closeBtn);

        const preview = document.createElement("div");
        preview.className = "itemSharePreview";

        previewImg = document.createElement("img");
        previewImg.alt = "";
        previewImg.draggable = false;
        previewImg.addEventListener("error", ()=>{
            if(previewImg.getAttribute("src") !== DEFAULT_LOGO){
                previewImg.src = DEFAULT_LOGO;
            }else{
                previewImg.style.visibility = "hidden";
            }
        });

        const meta = document.createElement("div");
        meta.className = "itemSharePreviewText";
        previewName = document.createElement("strong");
        previewUrl = document.createElement("span");
        meta.append(previewName, previewUrl);

        preview.append(previewImg, meta);

        grid = document.createElement("div");
        grid.className = "itemShareGrid";

        dialog.append(handle, header, preview, grid);
        panel.append(backdrop, dialog);

        /* The panel can live inside a viewer (fullscreen). Keep every
           interaction inside it from reaching that viewer's own click,
           touch and key handlers (tap-to-pause, arrow-key paging...). */
        ["click","dblclick","mousedown","mouseup","pointerdown","pointerup",
         "touchstart","touchend","keyup","contextmenu"].forEach(type=>{
            panel.addEventListener(type, e=>e.stopPropagation());
        });

        panel.addEventListener("keydown", event=>{
            event.stopPropagation();

            if(event.key === "Escape"){
                close(true);
                return;
            }

            if(event.key === "Tab"){
                const items = Array.from(dialog.querySelectorAll("a[href], button"));
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

        /* Entering/leaving fullscreen changes which element is painted;
           close rather than leave the panel stranded in the old host. */
        document.addEventListener("fullscreenchange", ()=>close(false));
    }

    function fillTiles(){
        grid.textContent = "";

        PLATFORMS.forEach(p=>{
            const tile = document.createElement(p.href ? "a" : "button");
            tile.className = "itemShareTile";
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
            icon.className = "itemShareIcon";
            icon.innerHTML = p.icon;

            const label = document.createElement("span");
            label.className = "itemShareLabel";
            label.textContent = p.label;

            tile.append(icon, label);

            tile.addEventListener("click", event=>{
                if(p.action === "copy"){
                    event.preventDefault();
                    copyLink().then(ok=>{ if(ok) showCopied(); });
                    close(true);
                    return;
                }

                if(p.action === "copy-open"){
                    /* Let the link open normally; copy alongside it. */
                    copyLink().then(ok=>{ if(ok) showCopied(); });
                }

                window.setTimeout(()=>close(false), 0);
            });

            grid.appendChild(tile);
        });
    }

    /* opts: { url, title, text, subtitle, thumbnail } */
    function open(opts){
        opts = opts || {};
        if(!opts.url) return false;

        SHARE_URL   = String(opts.url);
        SHARE_TITLE = String(opts.title || "SkyMedia");
        SHARE_TEXT  = String(opts.text  || SHARE_TITLE);
        MESSAGE     = SHARE_TEXT + " " + SHARE_URL;

        if(!panel) buildPanel();

        previewName.textContent = SHARE_TITLE;
        previewUrl.textContent  = SHARE_URL.replace(/^https?:\/\//, "");
        previewImg.style.visibility = "";
        previewImg.src = opts.thumbnail || DEFAULT_LOGO;

        fillTiles();

        const host = mountHost();
        if(panel.parentNode !== host) host.appendChild(panel);

        lastFocus = document.activeElement;
        isOpen = true;
        panel.classList.add("is-open");
        panel.setAttribute("aria-hidden", "false");

        window.requestAnimationFrame(()=>{
            const first = dialog.querySelector(".itemShareTile");
            if(first) first.focus({preventScroll:true});
        });

        return true;
    }

    function close(restoreFocus){
        if(!panel || !isOpen) return;

        isOpen = false;
        panel.classList.remove("is-open");
        panel.setAttribute("aria-hidden", "true");

        if(restoreFocus && lastFocus && typeof lastFocus.focus === "function" &&
           document.contains(lastFocus)){
            lastFocus.focus({preventScroll:true});
        }
        lastFocus = null;
    }

    /* True when the app runs inside another page (an iframe) - how it is
       hosted in Glide. Same test as frontShare.js: not tied to Glide's
       domains, so nothing needs changing once Glide is removed. */
    function isEmbedded(){
        try{
            return window.self !== window.top;
        }catch(_){
            return true;
        }
    }

    window.ItemShare = { open, close, isEmbedded };
})();
