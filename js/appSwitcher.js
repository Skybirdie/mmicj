"use strict";

/*
=========================================================
 SkyReader App Switcher

 Owns which top-level media section is visible:
 - "reader"    -> #app        (SkyReader)
 - "video"     -> #videoSection (Video Viewer)

 A future "slideshow" section can be added the same way:
 give its root element an id, add it to SECTIONS below,
 and add a matching [data-app-target="slideshow"] button
 to the top bars. No other code needs to change.
=========================================================
*/

window.AppSwitcher = (function () {

    const STORAGE_KEY = "skymedia_active_app_v3";

    const SECTIONS = {
        front:  { rootId: "frontPage" },
        reader: { rootId: "app" },
        video:  { rootId: "videoSection" },
        slideshow: { rootId: "slideshowSection" }
    };

    let current = "reader";
    let initialized = false;


    function rootFor(id) {

        const section = SECTIONS[id];

        if (!section) {
            return null;
        }

        return document.getElementById(section.rootId);
    }


    function buttons() {

        return document.querySelectorAll(
            "[data-app-target]"
        );
    }


    function applyButtons() {

        buttons().forEach(button => {

            const active =
                button.getAttribute("data-app-target") === current;

            button.classList.toggle("active", active);

            button.setAttribute(
                "aria-pressed",
                active ? "true" : "false"
            );

        });

    }



    function save(id) {

        try {
            sessionStorage.setItem(STORAGE_KEY, id);
        }
        catch (error) {
            /* Storage unavailable — not fatal. */
        }

    }


function show(id, options = {}) {

    if (!SECTIONS[id]) {
        return;
    }

    /*
    -------------------------------------------------------
     Tell the global media manager that navigation is
     occurring.

     Background playback preference determines whether
     media managed by MediaManager should continue.
    -------------------------------------------------------
    */

    if (
        window.MediaManager &&
        typeof MediaManager.sectionChanged === "function"
    ) {
        MediaManager.sectionChanged(id);
    }

    /*
    -------------------------------------------------------
     Front Page media uses its own renderer, so explicitly
     apply the same background-playback preference here.

     Leaving Front Page:
       OFF -> stop Front Page media
       ON  -> allow it to continue

     Selecting another item is handled separately by
     FrontPage.openItem(), which always stops the previous
     Front Page item.
    -------------------------------------------------------
    */

    if (
        current === "front" &&
        id !== "front" &&
        window.FrontMediaRenderer &&
        typeof FrontMediaRenderer.stopPlayback === "function"
    ) {

        const continueInBackground =
            window.MediaManager &&
            typeof MediaManager.getBackgroundPlayback === "function"
                ? MediaManager.getBackgroundPlayback()
                : false;

        if (!continueInBackground) {
            FrontMediaRenderer.stopPlayback();
        }
    }

    current = id;


        Object.keys(SECTIONS).forEach(sectionId => {

            const root = rootFor(sectionId);

            if (!root) {
                return;
            }

            const active =
                sectionId === id;

            root.classList.toggle("app-section-active", active);
            root.classList.toggle("app-section-hidden", !active);

        });

        document.documentElement.dataset.activeApp = id;

        applyButtons();

        if (!options.skipSave) {
            save(id);
        }

        window.dispatchEvent(
            new CustomEvent("app:switched", { detail: { id } })
        );

        /*
        Whichever section just became visible may have been
        laid out while display:none (width/height of 0).
        Modules like VideoLibrary and VideoViewer already
        recompute their layout on "resize", so reuse that
        instead of adding a second refresh code path.
        */

        requestAnimationFrame(() => {
            if (id === "front" && window.FrontPage && typeof FrontPage.refresh === "function") {
                FrontPage.refresh();
            }
            window.dispatchEvent(new Event("resize"));
        });

    }


    function init() {
    if (initialized) {
        return true;
    }

    if (
        !rootFor("front") &&
        !rootFor("reader") &&
        !rootFor("video") &&
        !rootFor("slideshow")
    ) {
        return false;
    }

    initialized = true;

    buttons().forEach(button => {
        button.addEventListener("click", () => {
            show(button.getAttribute("data-app-target"));
        });
    });

    /*
     * A browser reload should preserve the section currently being viewed.
     *
     * A fresh navigation into the site should begin at Front Page.
     *
     * Direct links can still explicitly select their requested section
     * through AppSwitcher.show().
     */
    let initialSection = "front";

    try {
        const navigationEntry = performance.getEntriesByType("navigation")[0];

        if (
            navigationEntry &&
            navigationEntry.type === "reload"
        ) {
            const saved = sessionStorage.getItem(STORAGE_KEY);

            if (saved && rootFor(saved)) {
                initialSection = saved;
            }
        }
    }
    catch (error) {
        initialSection = "front";
    }

    show(initialSection, { skipSave: false });

    return true;
}


    return {

        init,
        show,
        current: () => current

    };

})();
