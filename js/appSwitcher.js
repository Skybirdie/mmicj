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
    let hasShown = false;


    /*
    -------------------------------------------------------
     Navigating away from a viewer section counts as closing
     whatever item is open in it, so returning shows the
     section's landing (with the item in its Continue /
     Recent shelves) instead of re-selecting the item.

     Each viewer's own close routine is used, so last page /
     recent information is saved exactly as for a manual close.

     Exception: with Background Playback enabled, media that is
     actually playing keeps going (that is the whole point of
     the setting), so it is left open.  Paused or stopped media
     is closed like anything else.
    -------------------------------------------------------
    */
    /*
     * Video / Slideshow fullscreen their own viewer element, which
     * would be left fullscreen (and blank) once its section is hidden.
     * Leaving a viewer section ends that fullscreen, like the close
     * above. The Reader ends page fullscreen through Reader.close().
     */
    function leaveViewerFullscreen(sectionId) {

        try {

            const element = document.fullscreenElement;

            if (
                element &&
                (sectionId === "video" || sectionId === "slideshow") &&
                element !== document.documentElement &&
                typeof document.exitFullscreen === "function"
            ) {
                document.exitFullscreen().catch(() => {});
            }

        }
        catch (error) {
            console.warn("[AppSwitcher] Unable to leave fullscreen.", error);
        }

    }

    function closeOpenItem(sectionId) {

        try {

            const backgroundOn =
                window.MediaManager &&
                typeof MediaManager.getBackgroundPlayback === "function" &&
                MediaManager.getBackgroundPlayback();

            if (sectionId === "reader") {

                if (
                    window.Reader &&
                    typeof Reader.isOpen === "function" &&
                    Reader.isOpen()
                ) {
                    Reader.close({ playSound: false });
                }

            }
            else if (sectionId === "video") {

                if (
                    window.VideoViewer &&
                    typeof VideoViewer.getCurrentVideo === "function" &&
                    VideoViewer.getCurrentVideo() &&
                    !(
                        backgroundOn &&
                        typeof VideoViewer.isPlaying === "function" &&
                        VideoViewer.isPlaying()
                    )
                ) {
                    VideoViewer.closeVideo();
                }

            }
            else if (sectionId === "slideshow") {

                if (
                    window.SlideshowViewer &&
                    typeof SlideshowViewer.getCurrent === "function" &&
                    SlideshowViewer.getCurrent() &&
                    !(
                        backgroundOn &&
                        typeof SlideshowViewer.isPlaying === "function" &&
                        SlideshowViewer.isPlaying()
                    )
                ) {
                    SlideshowViewer.close();
                }

            }

        }
        catch (error) {
            console.warn("[AppSwitcher] Unable to close open item.", error);
        }

    }


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

    /*
     * Leaving a section (not the initial page load, and not a
     * click on the section already showing) closes its open item.
     */
    if (hasShown && current !== id) {
        closeOpenItem(current);
        leaveViewerFullscreen(current);
    }

    hasShown = true;

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


    /*
    -------------------------------------------------------
     Opening the item named by a link (?item=<section>/<id>,
     written by js/browserAddress.js).

     Uses the same hand-off a Front Page door uses
     (FrontPage.openItem): resolve the item in the section's own
     library, show the section, then select it on the next frame.

     The libraries only hold released items, so an item that is
     unreleased, removed, or in the wrong section is simply not
     found and the visitor stays on the section the link named.
    -------------------------------------------------------
    */
    function parseRequestedItem(value) {

        const text = String(value || "").trim();
        const cut = text.indexOf("/");

        if (cut < 1) {
            return null;
        }

        const key = text.slice(0, cut).toLowerCase();
        const id = text.slice(cut + 1);

        const section =
            key === "reader" || key === "book" || key === "books" ? "reader" :
            key === "video" || key === "videos" ? "video" :
            key === "slideshow" || key === "slideshows" ? "slideshow" :
            "";

        return section && id && id.length <= 512
            ? { section, id }
            : null;
    }

    function findLibraryItem(target) {

        const same = candidate =>
            String(candidate && candidate.id !== undefined && candidate.id !== null
                ? candidate.id
                : "") === String(target.id);

        if (target.section === "reader") {
            return window.SkyReader && Array.isArray(SkyReader.library)
                ? SkyReader.library.find(same) || null
                : null;
        }

        if (target.section === "video") {
            return window.VideoLibrary && typeof VideoLibrary.getVideos === "function"
                ? VideoLibrary.getVideos().find(same) || null
                : null;
        }

        if (target.section === "slideshow") {
            return window.SlideshowLibrary && typeof SlideshowLibrary.getSlideshows === "function"
                ? SlideshowLibrary.getSlideshows().find(same) || null
                : null;
        }

        return null;
    }

    function openRequestedItem(target) {

        if (!target) {
            return;
        }

        try {

            const found = findLibraryItem(target);

            if (!found) {
                return;
            }

            if (current !== target.section) {
                show(target.section);
            }

            requestAnimationFrame(() => {

                try {

                    if (target.section === "reader") {
                        if (window.Library && typeof Library.select === "function") {
                            Library.select(found, 1);
                        }
                    }
                    else if (target.section === "video") {
                        if (window.VideoLibrary && typeof VideoLibrary.select === "function") {
                            VideoLibrary.select(found.id);
                        }
                    }
                    else if (target.section === "slideshow") {
                        if (window.SlideshowLibrary && typeof SlideshowLibrary.select === "function") {
                            SlideshowLibrary.select(found.id);
                        }
                    }

                }
                catch (error) {
                    console.warn("[AppSwitcher] Unable to open linked item.", error);
                }

            });

        }
        catch (error) {
            console.warn("[AppSwitcher] Unable to open linked item.", error);
        }
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
    let requestedItem = null;

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
        else if (
            navigationEntry &&
            navigationEntry.type === "navigate"
        ) {
            /*
             * A link produced by js/browserAddress.js (/?view=video&item=...)
             * opens on the section it names and, when it names an item,
             * opens that item. Share and contract links are not state
             * links and are ignored here.
             */
            const params = new URLSearchParams(window.location.search);

            const requested =
                String(params.get("view") || "").trim().toLowerCase();

            if (
                window.location.pathname === "/" &&
                !params.has("contractz") &&
                !params.has("contract") &&
                !params.has("k")
            ) {
                if (requested && rootFor(requested)) {
                    initialSection = requested;
                }

                requestedItem = parseRequestedItem(params.get("item"));
            }
        }
    }
    catch (error) {
        initialSection = "front";
    }

    show(initialSection, { skipSave: false });

    /*
     * init() runs after every library has loaded (see index.html), so
     * a requested item can be looked up and opened right here.
     */
    openRequestedItem(requestedItem);

    return true;
}


    return {

        init,
        show,
        current: () => current

    };

})();
