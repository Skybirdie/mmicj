"use strict";

/*
=========================================================
 SkyMedia Special Release Notification

 Purpose
 -------
 Shows a small in-page clickable GIF on the Front Page for
 special releases.

 Special-release identity
 -----------------------
 The item id must begin with:

     mmstar-

 Release window
 --------------
 The item becomes eligible at its normal `date` value and
 remains eligible for exactly 7 days (168 hours).

 Display behavior
 ----------------
 Every time the Front Page opens, the currently eligible
 special release is shown for 10 seconds, then disappears.

 If several special releases are simultaneously within their
  seven-day windows, the newest release date is selected.

 Media mapping
 -------------
   book       -> assets/notification-book.gif
   video      -> assets/notification-video.gif
   slideshow  -> assets/notification-slides.gif

 Navigation
 ----------
 Clicking the notification hands the normalized item back to
 FrontPage.openItem(), which uses the existing normal type/
 section classification.

 This module does NOT use browser/system notifications.
=========================================================
*/

window.SkyReleaseNotification = (function () {

    const SPECIAL_PREFIX = "mmstar-";
    const DISPLAY_MS = 10000;
    const RELEASE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

    const GIFS = {
        book: "assets/notification-book.gif",
        video: "assets/notification-video.gif",
        slideshow: "assets/notification-slides.gif"
    };

    let button = null;
    let image = null;
    let timer = null;
    let initialized = false;
    let currentItem = null;

    function clean(value) {
        return String(value ?? "").trim();
    }

    function releaseDate(item) {
        if (!item) return null;

        const rawDate =
            item.raw && item.raw.date
                ? item.raw.date
                : item.date;

        const key =
            window.SkyDate
                ? SkyDate.key(rawDate)
                : clean(rawDate);

        if (
            !/^\d{12}$/.test(key) ||
            (
                window.SkyDate &&
                !SkyDate.validKey(key)
            )
        ) {
            return null;
        }

        const year = Number(key.slice(0, 4));
        const month = Number(key.slice(4, 6));
        const day = Number(key.slice(6, 8));
        const hour = Number(key.slice(8, 10));
        const minute = Number(key.slice(10, 12));

        const date =
            new Date(
                year,
                month - 1,
                day,
                hour,
                minute,
                0,
                0
            );

        return Number.isNaN(date.getTime())
            ? null
            : date;
    }

    function eligible(item, now = new Date()) {
        const id =
            clean(item?.id).toLowerCase();

        if (!id.startsWith(SPECIAL_PREFIX)) {
            return false;
        }

        const type =
            clean(item?.raw?.type || item?.section)
                .toLowerCase();

        if (!GIFS[type]) {
            return false;
        }

        const release =
            releaseDate(item);

        if (!release) {
            return false;
        }

        const age =
            now.getTime() - release.getTime();

        return (
            age >= 0 &&
            age <= RELEASE_WINDOW_MS
        );
    }

    function findRelease() {
        if (
            !window.FrontPage ||
            typeof FrontPage.collectItems !== "function"
        ) {
            return null;
        }

        const now = new Date();

        const candidates =
            FrontPage
                .collectItems()
                .filter(item => eligible(item, now));

        if (!candidates.length) {
            return null;
        }

        candidates.sort((a, b) => {
            const aDate =
                releaseDate(a)?.getTime() || 0;

            const bDate =
                releaseDate(b)?.getTime() || 0;

            return bDate - aDate;
        });

        return candidates[0];
    }

    function hide() {
        if (!button) return;

        if (timer) {
            clearTimeout(timer);
            timer = null;
        }

        currentItem = null;

        button.classList.remove("is-visible");

        window.setTimeout(() => {
            if (
                button &&
                !button.classList.contains("is-visible")
            ) {
                button.hidden = true;
                button.setAttribute(
                    "aria-hidden",
                    "true"
                );
            }
        }, 230);
    }

    function show(item) {
        if (!button || !image || !item) {
            return false;
        }

        const type =
            clean(item.raw?.type || item.section)
                .toLowerCase();

        const gif = GIFS[type];

        if (!gif) {
            hide();
            return false;
        }

        if (timer) {
            clearTimeout(timer);
            timer = null;
        }

        currentItem = item;

        image.src = gif;
        image.alt =
            clean(item.title)
                ? `Special release: ${item.title}`
                : "Special release";

        button.setAttribute(
            "aria-label",
            clean(item.title)
                ? `Open special release: ${item.title}`
                : "Open special release"
        );

        button.hidden = false;
        button.setAttribute(
            "aria-hidden",
            "false"
        );

        /*
         * Force the transition to begin from the hidden state
         * before making the control visible.
         */
        button.classList.remove("is-visible");

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                if (!currentItem) return;

                button.classList.add("is-visible");
            });
        });

        timer =
            window.setTimeout(
                hide,
                DISPLAY_MS
            );

        return true;
    }

    function refresh() {
        if (!initialized) {
            return false;
        }

        /*
         * The Front Page may be hidden when Manifest finishes loading.
         * Do not show the notification until Front Page is actually active.
         */
        if (
            window.AppSwitcher &&
            typeof AppSwitcher.current === "function" &&
            AppSwitcher.current() !== "front"
        ) {
            hide();
            return false;
        }

        const item = findRelease();

        if (!item) {
            hide();
            return false;
        }

        return show(item);
    }

    function init() {
        if (initialized) {
            return true;
        }

        button =
            document.getElementById(
                "frontReleaseNotification"
            );

        image =
            document.getElementById(
                "frontReleaseNotificationImage"
            );

        if (!button || !image) {
            return false;
        }

        initialized = true;

        button.addEventListener(
            "click",
            () => {
                const item = currentItem;

                hide();

                if (
                    item &&
                    window.FrontPage &&
                    typeof FrontPage.openItem === "function"
                ) {
                    FrontPage.openItem(item);
                }
            }
        );

        /*
         * If a broken/missing GIF is deployed, fail silently rather
         * than leaving a broken image on the Front Page.
         */
        image.addEventListener(
            "error",
            () => {
                hide();
            }
        );

        window.addEventListener(
            "app:switched",
            event => {
                if (
                    event.detail &&
                    event.detail.id === "front"
                ) {
                    /*
                     * FrontPage.refresh() is scheduled by AppSwitcher
                     * on the next animation frame. Wait for that same
                     * frame before collecting the current items.
                     */
                    requestAnimationFrame(refresh);
                } else {
                    hide();
                }
            }
        );

        window.addEventListener(
            "skymedia:manifest-ready",
            () => {
                requestAnimationFrame(() => {
                    if (
                        window.AppSwitcher &&
                        typeof AppSwitcher.current === "function" &&
                        AppSwitcher.current() === "front"
                    ) {
                        refresh();
                    }
                });
            }
        );

        /*
         * AppSwitcher may already have performed the initial front-page
         * switch before this module's DOMContentLoaded handler runs.
         */
        requestAnimationFrame(() => {
            if (
                window.AppSwitcher &&
                typeof AppSwitcher.current === "function" &&
                AppSwitcher.current() === "front"
            ) {
                refresh();
            }
        });

        return true;
    }

    return {
        init,
        refresh,
        hide
    };

})();
