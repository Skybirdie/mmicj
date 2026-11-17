/* =========================================================
   mmicj item info  (js/itemInfo.js)

   A tiny "i" icon on library and landing cards (Books, Videos,
   Slideshows). Hover (mouse), click, tap or Enter/Space on it shows
   the item's title, subtitle and author in a small pale-yellow box
   next to the card.

   ONE shared popover is created on first use and appended to <body>,
   so it is never clipped by a card's overflow:hidden / circle mask and
   never moves with a card's hover transform. Every card just gets a
   small <span class="item-info-control"> from ItemInfo.attach().

   Usage (one line per card builder):

       if (window.ItemInfo) ItemInfo.attach(cardElement, item);

   - item needs { title, subtitle, author } (all optional; empty lines
     are left out, and a card whose item has none of them gets no icon).
   - Where the icon sits on each kind of card is pure CSS:
     css/item-info.css.
   - The icon never opens the item: its click is stopped before it
     reaches the card (same approach as the favorite buttons).
   ========================================================= */
(function () {
    "use strict";

    if (window.ItemInfo) return;

    var HOVER_DELAY = 120;      /* ms before a hover opens the box   */
    var LEAVE_DELAY = 140;      /* ms grace so the pointer can reach it */
    var GAP = 8;                /* px between card and box            */
    var MARGIN = 6;             /* px kept clear of the screen edge   */

    /* The card an icon belongs to; the box is placed beside this. */
    var HOST_SELECTOR = [
        ".video-circle-card",
        ".video-list-card",
        ".video-landing-circle-card",
        ".bookCard",
        ".listItem",
        ".slideshow-library-card",
        ".slideshow-landing-card"
    ].join(",");

    var ICON_SVG =
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' +
        '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/>' +
        '<rect x="11" y="10.6" width="2" height="6.6" rx="1" fill="currentColor"/>' +
        '<circle cx="12" cy="7.5" r="1.3" fill="currentColor"/>' +
        '</svg>';

    var popover = null;
    var current = null;         /* { anchor, pinned } while open */
    var showTimer = 0;
    var hideTimer = 0;
    var observer = null;
    var uid = 0;

    function clean(value) {
        return String(value == null ? "" : value).trim();
    }

    function hasDetails(item) {
        return !!(item && (clean(item.title) || clean(item.subtitle) || clean(item.author)));
    }

    function clearTimers() {
        window.clearTimeout(showTimer);
        window.clearTimeout(hideTimer);
        showTimer = 0;
        hideTimer = 0;
    }

    /* ---------- the shared box ---------- */

    function ensurePopover() {
        if (popover && popover.isConnected) return popover;

        popover = document.createElement("div");
        popover.id = "itemInfoPopover";
        popover.className = "item-info-popover";
        popover.setAttribute("role", "tooltip");

        /* Let the pointer travel from the icon onto the box and read it. */
        popover.addEventListener("pointerenter", function (event) {
            if (event.pointerType === "mouse") window.clearTimeout(hideTimer);
        });
        popover.addEventListener("pointerleave", function (event) {
            if (event.pointerType === "mouse" && current && !current.pinned) scheduleHide();
        });

        /* Taps on the box itself must never reach a card underneath. */
        ["click", "pointerdown", "mousedown", "touchstart"].forEach(function (name) {
            popover.addEventListener(name, function (event) { event.stopPropagation(); });
        });

        document.body.appendChild(popover);
        return popover;
    }

    function fill(item) {
        popover.textContent = "";

        var title = clean(item.title);
        var subtitle = clean(item.subtitle);
        var author = clean(item.author);

        if (title) {
            var t = document.createElement("div");
            t.className = "item-info-popover-title";
            t.textContent = title;
            popover.appendChild(t);
        }
        if (subtitle) {
            var s = document.createElement("div");
            s.className = "item-info-popover-subtitle";
            s.textContent = subtitle;
            popover.appendChild(s);
        }
        if (author) {
            var a = document.createElement("div");
            a.className = "item-info-popover-author";
            a.textContent = "By " + author;
            popover.appendChild(a);
        }
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }

    /* Beside the card: right side first, then left, else above/below the icon. */
    function position(anchor) {
        var host = anchor.closest(HOST_SELECTOR) || anchor;
        var h = host.getBoundingClientRect();
        var a = anchor.getBoundingClientRect();

        var vw = document.documentElement.clientWidth || window.innerWidth;
        var vh = document.documentElement.clientHeight || window.innerHeight;

        var pw = popover.offsetWidth;
        var ph = popover.offsetHeight;

        var left;
        var top = a.top + a.height / 2 - ph / 2;

        if (h.right + GAP + pw <= vw - MARGIN) {
            left = h.right + GAP;
        } else if (h.left - GAP - pw >= MARGIN) {
            left = h.left - GAP - pw;
        } else {
            left = clamp(a.left + a.width / 2 - pw / 2, MARGIN, vw - pw - MARGIN);
            top = (a.top - GAP - ph >= MARGIN) ? a.top - GAP - ph : a.bottom + GAP;
        }

        top = clamp(top, MARGIN, Math.max(MARGIN, vh - ph - MARGIN));

        popover.style.left = Math.round(left) + "px";
        popover.style.top = Math.round(top) + "px";
    }

    /* ---------- open / close ---------- */

    function watchAnchor() {
        if (observer || !window.MutationObserver) return;
        /* A card can be rebuilt while its box is open (favorite toggled,
           search typed...). Close rather than leave a box with no card. */
        observer = new MutationObserver(function () {
            if (current && !current.anchor.isConnected) close();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }

    function open(anchor, item, pinned) {
        clearTimers();

        if (current && current.anchor !== anchor) {
            current.anchor.setAttribute("aria-expanded", "false");
            current.anchor.removeAttribute("aria-describedby");
        }

        ensurePopover();
        fill(item);

        popover.classList.remove("open");
        popover.style.left = "0px";
        popover.style.top = "0px";
        position(anchor);

        /* next frame so the fade-in runs from the new position */
        window.requestAnimationFrame(function () {
            if (current && current.anchor === anchor) popover.classList.add("open");
        });

        current = { anchor: anchor, pinned: !!pinned };
        anchor.setAttribute("aria-expanded", "true");
        anchor.setAttribute("aria-describedby", popover.id);
        watchAnchor();
    }

    function close() {
        clearTimers();

        if (current) {
            current.anchor.setAttribute("aria-expanded", "false");
            current.anchor.removeAttribute("aria-describedby");
        }
        current = null;

        if (popover) popover.classList.remove("open");

        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    function scheduleHide() {
        window.clearTimeout(hideTimer);
        hideTimer = window.setTimeout(function () {
            if (current && !current.pinned) close();
        }, LEAVE_DELAY);
    }

    /* Click / tap / Enter / Space: a hover-opened box becomes pinned;
       a pinned one closes. */
    function activate(anchor, item) {
        if (current && current.anchor === anchor) {
            if (current.pinned) {
                close();
            } else {
                clearTimers();
                current.pinned = true;
            }
            return;
        }
        open(anchor, item, true);
    }

    /* ---------- the icon ---------- */

    function create(item) {
        if (!hasDetails(item)) return null;

        var el = document.createElement("span");
        el.className = "item-info-control";
        el.setAttribute("role", "button");
        el.setAttribute("tabindex", "0");
        el.setAttribute("aria-label", "Details" + (clean(item.title) ? " for " + clean(item.title) : ""));
        el.setAttribute("aria-expanded", "false");
        el.id = "itemInfo" + (++uid);
        el.innerHTML = ICON_SVG;

        /* Mouse only: touch and pen go through click (a tap fires
           compatibility mouse events too, which would open and
           immediately close the box). */
        el.addEventListener("pointerenter", function (event) {
            if (event.pointerType !== "mouse") return;
            window.clearTimeout(hideTimer);
            window.clearTimeout(showTimer);
            if (current && current.anchor === el) return;
            showTimer = window.setTimeout(function () { open(el, item, false); }, HOVER_DELAY);
        });

        el.addEventListener("pointerleave", function (event) {
            if (event.pointerType !== "mouse") return;
            window.clearTimeout(showTimer);
            if (current && current.anchor === el && !current.pinned) scheduleHide();
        });

        el.addEventListener("click", function (event) {
            event.preventDefault();
            event.stopPropagation();
            activate(el, item);
        });

        el.addEventListener("keydown", function (event) {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                activate(el, item);
            } else if (event.key === "Escape" && current) {
                event.stopPropagation();
                close();
            }
        });

        /* A press on the icon must not start the card's own press/drag. */
        el.addEventListener("pointerdown", function (event) { event.stopPropagation(); });

        return el;
    }

    function attach(host, item) {
        if (!host) return null;
        var el = create(item);
        if (el) host.appendChild(el);
        return el;
    }

    /* ---------- dismissal ---------- */

    document.addEventListener("pointerdown", function (event) {
        if (!current) return;
        var target = event.target;
        if (popover && popover.contains(target)) return;
        if (current.anchor.contains(target)) return;
        close();
    }, true);

    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && current) close();
    }, true);

    /* The box is fixed to the screen, so anything that moves the cards
       (scrolling a panel, resizing, switching section) closes it. */
    document.addEventListener("scroll", function () { if (current) close(); }, true);
    window.addEventListener("resize", function () { if (current) close(); });
    window.addEventListener("blur", function () { if (current && current.pinned) close(); });
    window.addEventListener("app:switched", close);

    window.ItemInfo = {
        create: create,
        attach: attach,
        close: close
    };
})();
