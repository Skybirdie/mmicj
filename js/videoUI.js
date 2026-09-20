"use strict";

/*
=========================================================
 SkyReader Video UI

 Owns the narrow-screen library drawer only.
 The drawer deliberately mirrors SkyReader's reader
 drawer behavior:
 • closed by default on narrow screens
 • toggle lives at the viewer's top-left
 • toggle disappears while drawer is open
 • selecting a video closes the drawer
=========================================================
*/

window.VideoUI = (function () {

    let initialized = false;

    let section = null;
    let toggle = null;
    let library = null;
    let closeButton = null;


    function cacheDom() {

        section =
            document.getElementById("videoSection");

        toggle =
            document.getElementById("videoNarrowLibraryToggle");

        library =
            document.getElementById("videoLibrary");

        closeButton =
            document.getElementById("videoLibraryDrawerClose");
    }


    function init() {

        if (initialized) {
            return true;
        }

        cacheDom();

        if (!section || !toggle || !library) {
            return false;
        }

        initialized = true;

        closeDrawer(false);

        toggle.addEventListener(
            "click",
            toggleDrawer
        );

        if (closeButton) {
            closeButton.addEventListener(
                "click",
                () => closeDrawer()
            );
        }

        return true;
    }


    function isNarrow() {
        return window.matchMedia(
            "(max-width: 999px)"
        ).matches;
    }


    function isOpen() {

        return !!(
            section &&
            section.classList.contains(
                "video-library-open"
            )
        );

    }


    function setOpen(open) {

        if (!section || !toggle) {
            return;
        }

        const shouldOpen =
            Boolean(open) && isNarrow();

        section.classList.toggle(
            "video-library-open",
            shouldOpen
        );

        section.classList.toggle(
            "video-drawer-open",
            shouldOpen
        );

        section.classList.toggle(
            "video-drawer-closed",
            !shouldOpen
        );

        toggle.setAttribute(
            "aria-expanded",
            String(shouldOpen)
        );

    }


    function toggleDrawer() {

        setOpen(!isOpen());

    }


    function closeDrawer(animate = true) {

        if (!section) {
            return;
        }

        if (!animate) {
            section.classList.remove(
                "video-library-open",
                "video-drawer-open"
            );

            section.classList.add(
                "video-drawer-closed"
            );

            if (toggle) {
                toggle.setAttribute(
                    "aria-expanded",
                    "false"
                );
            }

            return;
        }

        setOpen(false);

    }


    function openDrawer() {

        setOpen(true);

    }


    /*
    Desktop must never inherit a stale narrow state.
    */

    window.addEventListener(
        "resize",
        () => {

            if (!isNarrow()) {
                closeDrawer(false);
            }

        }
    );


    return {

        init,
        isOpen,
        toggleDrawer,
        openDrawer,
        closeDrawer

    };

})();