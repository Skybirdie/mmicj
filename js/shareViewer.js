"use strict";

/*
=========================================================
 SkyMedia Share Viewer
 Clean Share Mode

 BOOK SHARE BEHAVIOR
 --------------------------------------------------------
 • One shared book only.
 • Existing Reader / Renderer / PageFlip engine retained.
 • Rotate removed from Share Mode.
 • Toolbar:
       Mute | Share | Fullscreen | X
 • Previous / Next are independent edge controls.
 • Previous hidden on page 1.
 • Next hidden on final page.
 • Share-owned wheel navigation.
 • Share-owned horizontal swipe navigation.
 • Existing PageFlip mouse-click navigation retained.
 • Direct mouse interaction on final page cannot close
   the shared book.
 • Forward wheel/swipe cannot move beyond final page.
 • X closes the document but does NOT return to Reader landing.
 • X shows the large Open Meditation Mornings image button.
 • Fullscreen keeps background.jpg.
 • Share header disappears in fullscreen.
 • Status bar remains directly below the symmetrical page gap.
 • Welcome banner remains directly below status bar.
 • Existing Reader page indicator is preserved and explicitly
   synchronized by Share Mode after the Reader surface is moved.

 BOOK STATUS FORMAT
 --------------------------------------------------------
      Book Title        [ 2–3 / 24 ]

 • Book title is plain text.
 • Page/spread count is the only content inside #pageIndicator.
 • The title is NOT placed inside #pageIndicator.

 CLOSED STATE
 --------------------------------------------------------
 • Applies to BOOK, VIDEO, and SLIDESHOW shares.
 • Existing small bottom-right Open Meditation Mornings
   button is unchanged.
 • A separate large assets/go-button.png image is centered
   on desktop.
 • assets/go-button-mobile.png is used on smaller screens.
 • Mobile Go button can fill the viewport width.
 • Large image links to Meditation Mornings.
 • Item-specific controls disappear when closed.
 • Share header disappears when closed.
=========================================================
*/

window.ShareViewer = (function () {

    let started = false;
    let activeItem = null;
    let activeTarget = null;

    let shell = null;
    let titleElement = null;
    let subtitleElement = null;
    let mediaHost = null;
    let statusElement = null;

    let closedPanel = null;

    let bookControlsBound = false;
    let pageStateTimer = null;

    let bookZoomController = null;
    let bookZoomTarget = null;

    let controlsIdleTimer = null;
    let controlsActivityBound = false;

    let bookGestureBound = false;
    let bookWheelTarget = null;
    let bookTouchTarget = null;
    let bookWheelLocked = false;
    let bookTouchTracking = false;
    let bookTouchStartX = 0;
    let bookTouchStartY = 0;
    let bookSuppressClickUntil = 0;

    let shareClosing = false;

    let shareCopiedCue = null;
    let shareCopiedCueTimer = null;

    let mediaCloseClickBound = false;

    /*
     * Final-page protection.
     */
    let lastPageProtectionBound = false;

    /*
     * Responsive Reader handling.
     */
    let bookResizeObserver = null;
    let bookResizeTimer = null;
    let bookResizeRaf = 0;
    let bookResponsiveRefreshBound = false;
    let bookInitialLayoutReady = false;
    let bookResponsiveLastWidth = 0;
    let bookResponsiveLastHeight = 0;

    let bookWindowResizeHandler = null;
    let bookVisualResizeHandler = null;

    /*
     * Closed-state Go button: tracks the real visible screen
     * (via visualViewport) on mobile so it stays centered as
     * the browser's address bar / toolbar show and hide.
     */
    let goButtonViewportBound = false;
    let goButtonViewportHandler = null;
    let goButtonViewportRaf = 0;

    const BOOK_TOUCH_THRESHOLD = 48;

    const GLIDE_MEDIA_URL =
        "https://meditationmornings.glide.page/dl/media";

/* Standalone Share Mode loading sequence. */
const SHARE_LOADING_INTERVAL = 2500;

const SHARE_LOADING_MESSAGES = [
    "1. In the beginning was the Word,",
    "and the Word was with God,",
    "and the Word was God.",
    "2. The same was in the beginning with God.",
    "3. All things were made by him;",
    "and without him was not any thing made that was made.",
    "4. In him was life;",
    "and the life was the light of men.",
    "5. And the light shineth in darkness;",
    "and the darkness comprehended it not.",
    "12. But as many as received him,",
    "to them gave he power to become the sons of God,",
    "even to them that believe on his name:",
    "13. Which were born, not of blood,",
    "nor of the will of the flesh,",
    "nor of the will of man, but of God.",
    "14. And the Word was made flesh,",
    "and dwelt among us,",
    "and we beheld his glory,",
    "the glory as of the only begotten of the Father,",
    "full of grace and truth."
];

let shareLoadingOverlay = null;
let shareLoadingText = null;
let shareLoadingTimer = null;
let shareLoadingIndex = 0;

    /* =====================================================
       BASIC HELPERS
    ===================================================== */

    function createElement(
        tag,
        className,
        text
    ) {

        const el =
            document.createElement(tag);

        if (className) {
            el.className =
                className;
        }

        if (text !== undefined) {
            el.textContent =
                text;
        }

        return el;
    }


    function isBookShare() {

        const section =
            String(
                activeTarget?.section ||
                activeItem?.type ||
                ""
            ).toLowerCase();

        return (
            section === "reader" ||
            section === "book"
        );
    }


    function isVideoShare() {

        const section =
            String(
                activeTarget?.section ||
                activeItem?.type ||
                ""
            ).toLowerCase();

        return section === "video";
    }


    function isSlideshowShare() {

        const section =
            String(
                activeTarget?.section ||
                activeItem?.type ||
                ""
            ).toLowerCase();

        return (
            section === "slideshow" ||
            section === "slides"
        );
    }


    function sectionLabel(section) {

        switch (
            String(section || "").toLowerCase()
        ) {

            case "reader":
            case "book":
                return "Book";

            case "video":
                return "Video";

            case "slideshow":
            case "slides":
                return "Images / Graphics";

            default:
                return "Media";
        }
    }


function createShareLoadingOverlay() {
    if (shareLoadingOverlay || !shell) return;

    shareLoadingOverlay = createElement("div", "sky-share-loading");
    shareLoadingOverlay.setAttribute("role", "status");
    shareLoadingOverlay.setAttribute("aria-live", "polite");
    shareLoadingOverlay.setAttribute("aria-busy", "true");
    shareLoadingOverlay.hidden = true;

    const inner = createElement("div", "sky-share-loading-inner");

    const image = document.createElement("img");
    image.className = "sky-share-loading-image";
    image.src = "/assets/loading.gif";
    image.alt = "";
    image.setAttribute("aria-hidden", "true");

    shareLoadingText = createElement("span", "sky-share-loading-text");

    inner.appendChild(image);
    inner.appendChild(shareLoadingText);
    shareLoadingOverlay.appendChild(inner);

    const main = shell.querySelector(".sky-share-main");
    (main || shell).appendChild(shareLoadingOverlay);
}

function setShareLoadingMessage() {
    if (shareLoadingText) {
        shareLoadingText.textContent =
            SHARE_LOADING_MESSAGES[shareLoadingIndex] ||
            SHARE_LOADING_MESSAGES[0];
    }
}

function startShareLoading() {
    createShareLoadingOverlay();
    if (!shareLoadingOverlay) return;

    if (shareLoadingTimer) {
        window.clearInterval(shareLoadingTimer);
        shareLoadingTimer = null;
    }

    shareLoadingIndex = 0;
    setShareLoadingMessage();

    shareLoadingOverlay.hidden = false;
    shareLoadingOverlay.setAttribute("aria-busy", "true");
    shareLoadingOverlay.classList.add("is-active");

    shareLoadingTimer = window.setInterval(() => {
        shareLoadingIndex =
            (shareLoadingIndex + 1) % SHARE_LOADING_MESSAGES.length;

        setShareLoadingMessage();
    }, SHARE_LOADING_INTERVAL);
}

function stopShareLoading() {
    if (shareLoadingTimer) {
        window.clearInterval(shareLoadingTimer);
        shareLoadingTimer = null;
    }

    if (!shareLoadingOverlay) return;

    shareLoadingOverlay.classList.remove("is-active");
    shareLoadingOverlay.hidden = true;
    shareLoadingOverlay.setAttribute("aria-busy", "false");
}


    /* =====================================================
       SHARE BOOK PAGE INDICATOR
    ===================================================== */

    function updateShareBookIndicator() {

        if (!isBookShare()) {
            return;
        }


        if (
            !window.Reader ||
            typeof Reader.currentPage !==
                "function" ||
            typeof Reader.pages !==
                "function"
        ) {
            return;
        }


        const indicator =
            document.getElementById(
                "pageIndicator"
            );


        const readerTitle =
            document.getElementById(
                "readerTitle"
            );


        const book =
            typeof Reader.book ===
                "function"
                ? Reader.book()
                : null;


        const title =
            String(
                book?.title ||
                activeItem?.title ||
                ""
            ).trim();


        if (readerTitle) {

            readerTitle.textContent =
                title;

            readerTitle.hidden =
                false;

            readerTitle.removeAttribute(
                "aria-hidden"
            );

            readerTitle.style.removeProperty(
                "display"
            );

            readerTitle.style.removeProperty(
                "visibility"
            );

            readerTitle.style.removeProperty(
                "opacity"
            );
        }


        if (!indicator) {
            return;
        }


        if (
            typeof window.updatePageIndicator ===
                "function"
        ) {

            try {

                window.updatePageIndicator();

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Reader page indicator refresh:",
                    error
                );
            }
        }


        const page =
            Number(
                Reader.currentPage()
            ) || 1;


        const pages =
            Number(
                Reader.pages()
            ) || 0;


        let label = "";


        if (
            typeof Reader.spread ===
                "function"
        ) {

            try {

                const spread =
                    Reader.spread();


                if (
                    spread &&
                    spread.label !==
                        undefined &&
                    spread.label !==
                        null
                ) {

                    label =
                        String(
                            spread.label
                        ).trim();
                }

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Reader spread lookup:",
                    error
                );
            }
        }


        if (!label) {
            label =
                String(page);
        }


        indicator.textContent =
            label +
            " / " +
            (pages || "");


        indicator.hidden =
            false;

        indicator.removeAttribute(
            "aria-hidden"
        );

        indicator.tabIndex =
            0;

        indicator.style.removeProperty(
            "display"
        );

        indicator.style.removeProperty(
            "visibility"
        );

        indicator.style.removeProperty(
            "opacity"
        );

        indicator.classList.add(
            "pageIndicatorActive"
        );
    }


    /* =====================================================
       CLOSED-STATE GO BUTTON
    ===================================================== */

    function updateClosedGoButtonLayout() {

        if (!closedPanel) {
            return;
        }


        const button =
            closedPanel.querySelector(
                ".sky-share-closed-go-button"
            );


        if (!button) {
            return;
        }


        const mobile =
            window.matchMedia(
                "(max-width: 700px)"
            ).matches;


        if (mobile) {

            button.style.setProperty(
                "width",
                "100vw",
                "important"
            );

            button.style.setProperty(
                "max-width",
                "100vw",
                "important"
            );

            button.style.setProperty(
                "max-height",
                "100vh",
                "important"
            );


            /* =============================================
               TRUE VISUAL CENTER ON MOBILE
               ---------------------------------------------
               "top:50%" resolves against the layout viewport,
               which mobile browsers size as if the address
               bar / bottom toolbar were hidden. That leaves
               the button sitting lower than the actual center
               once that browser chrome is on screen.

               window.visualViewport tracks the real visible
               area (height + top offset), so use it to compute
               the true vertical center in px. Where it isn't
               available, fall back to the "dvh" unit, which
               tracks the same thing natively in browsers that
               support it.
            ============================================= */
            if (window.visualViewport) {

                const centerY =
                    window.visualViewport.height / 2 +
                    window.visualViewport.offsetTop;

                button.style.setProperty(
                    "top",
                    centerY + "px",
                    "important"
                );
            }
            else {

                button.style.setProperty(
                    "top",
                    "50dvh",
                    "important"
                );
            }

        }
        else {

            button.style.setProperty(
                "width",
                "min(92vw, 1400px)",
                "important"
            );

            button.style.setProperty(
                "max-width",
                "92vw",
                "important"
            );

            button.style.setProperty(
                "max-height",
                "84vh",
                "important"
            );

            /* Reset back to the plain centered value in case
               a mobile px "top" was left over from a narrower
               viewport (e.g. rotating a tablet across the
               700px breakpoint). */
            button.style.setProperty(
                "top",
                "50%",
                "important"
            );
        }
    }


    /* =====================================================
       GO BUTTON VIEWPORT TRACKING (MOBILE)
       -----------------------------------------------------
       Keeps the go button centered on the real visible screen
       as the browser's chrome shows/hides (address bar,
       bottom toolbar, keyboard, pinch-zoom, etc.), by re-
       running updateClosedGoButtonLayout() whenever the
       visual viewport - or, failing that, the window - resizes.
       Bound once; harmless to keep running even while the
       closed panel/button are hidden.
    ===================================================== */

    function bindGoButtonViewportTracking() {

        if (goButtonViewportBound) {
            return;
        }

        goButtonViewportBound =
            true;


        goButtonViewportHandler =
            function () {

                if (goButtonViewportRaf) {
                    return;
                }

                goButtonViewportRaf =
                    requestAnimationFrame(
                        function () {

                            goButtonViewportRaf =
                                0;

                            updateClosedGoButtonLayout();
                        }
                    );
            };


        if (window.visualViewport) {

            window.visualViewport.addEventListener(
                "resize",
                goButtonViewportHandler,
                {
                    passive: true
                }
            );

            window.visualViewport.addEventListener(
                "scroll",
                goButtonViewportHandler,
                {
                    passive: true
                }
            );
        }


        window.addEventListener(
            "resize",
            goButtonViewportHandler,
            {
                passive: true
            }
        );

        window.addEventListener(
            "orientationchange",
            goButtonViewportHandler,
            {
                passive: true
            }
        );
    }


    function createClosedGoButton() {

    if (!closedPanel) {
        return null;
    }


    let button =
        closedPanel.querySelector(
            ".sky-share-closed-go-button"
        );


    if (button) {

        updateClosedGoButtonLayout();

        playGoButtonEntrance(
            button
        );

        return button;
    }


    /* =====================================================
       OUTER GO-BUTTON CONTAINER
       -----------------------------------------------------
       Plain (non-link) wrapper. It only displays the large
       go-button / go-button-mobile artwork and hosts the
       clickable gif overlay below. pointer-events:none keeps
       clicks anywhere on the artwork from doing anything -
       only the gif's own <a> (sky-share-closed-go-link) is
       clickable.
    ===================================================== */

    button =
        document.createElement("div");


    button.className =
        "sky-share-closed-go-button";


    button.style.setProperty(
        "position",
        "absolute",
        "important"
    );

    button.style.setProperty(
        "left",
        "50%",
        "important"
    );

    button.style.setProperty(
        "top",
        "50%",
        "important"
    );

    /* No "important" here on purpose: the entrance animation
       (sky-share-go-float-in, defined in share.css) needs to
       be able to drive this property. It settles back to this
       exact value once the animation finishes. */
    button.style.setProperty(
        "transform",
        "translate(-50%, -50%)"
    );

    button.style.setProperty(
        "height",
        "auto",
        "important"
    );

    button.style.setProperty(
        "padding",
        "0",
        "important"
    );

    button.style.setProperty(
        "margin",
        "0",
        "important"
    );

    button.style.setProperty(
        "border",
        "0",
        "important"
    );

    button.style.setProperty(
        "outline",
        "none",
        "important"
    );

    button.style.setProperty(
        "text-decoration",
        "none",
        "important"
    );

    button.style.setProperty(
        "cursor",
        "default",
        "important"
    );

    button.style.setProperty(
        "box-sizing",
        "border-box",
        "important"
    );

    button.style.setProperty(
        "z-index",
        "10000",
        "important"
    );

    button.style.setProperty(
        "display",
        "block",
        "important"
    );

    button.style.setProperty(
        "pointer-events",
        "none",
        "important"
    );


    const picture =
        document.createElement(
            "picture"
        );


    const mobileSource =
        document.createElement(
            "source"
        );


    mobileSource.media =
        "(max-width: 700px)";


    mobileSource.srcset =
        new URL(
            "/assets/go-button-mobile.png",
            window.location.origin
        ).href;


    picture.appendChild(
        mobileSource
    );


    const image =
        document.createElement(
            "img"
        );


    image.src =
        new URL(
            "/assets/go-button.png",
            window.location.origin
        ).href;


    /* Decorative now - the clickable element is goLink below,
       so this shouldn't be announced as a link by itself. */
    image.alt =
        "";


    image.setAttribute(
        "aria-hidden",
        "true"
    );


    image.draggable =
        false;


    image.style.setProperty(
        "display",
        "block",
        "important"
    );

    image.style.setProperty(
        "width",
        "100%",
        "important"
    );

    image.style.setProperty(
        "height",
        "auto",
        "important"
    );

    image.style.setProperty(
        "max-width",
        "100%",
        "important"
    );

    image.style.setProperty(
        "max-height",
        "100vh",
        "important"
    );

    image.style.setProperty(
        "object-fit",
        "contain",
        "important"
    );

    image.style.setProperty(
        "pointer-events",
        "none",
        "important"
    );

    image.style.setProperty(
        "user-select",
        "none",
        "important"
    );

    image.style.setProperty(
        "-webkit-user-drag",
        "none",
        "important"
    );


    picture.appendChild(
        image
    );

    button.appendChild(
        picture
    );


    /* =====================================================
       CLICKABLE GO-BUTTON-GIF OVERLAY
       -----------------------------------------------------
       This <a> is now the ONLY clickable region of the whole
       go-button graphic - the big go-button / go-button-mobile
       artwork behind it is inert (pointer-events:none above).

       Sized as a percentage of the go-button container (which
       has a definite, explicitly-set width) so it scales with
       both the desktop and mobile artwork, and positioned so
       it sits horizontally centered and vertically centered
       within the LOWER 25% band of that artwork:
         bottom: 12.5%              -> midpoint of the 0%-25%
                                        band, measured from the
                                        bottom edge
         transform: translate(-50%, 50%)
                                     -> centers the link itself
                                        on that point, both axes
    ===================================================== */

    const goLink =
        document.createElement(
            "a"
        );


    goLink.href =
        GLIDE_MEDIA_URL;


    goLink.target =
        "_blank";


    goLink.rel =
        "noopener noreferrer";


    goLink.className =
        "sky-share-closed-go-link";


    goLink.setAttribute(
        "aria-label",
        "Open Meditation Mornings"
    );


    goLink.style.setProperty(
        "position",
        "absolute",
        "important"
    );

    goLink.style.setProperty(
        "left",
        "50%",
        "important"
    );

    goLink.style.setProperty(
        "bottom",
        "12.5%",
        "important"
    );

    goLink.style.setProperty(
        "transform",
        "translate(-50%, 50%)",
        "important"
    );

    /* Sized proportional
       to the go-button width. */
    goLink.style.setProperty(
        "width",
        "30%",
        "important"
    );

    goLink.style.setProperty(
        "max-width",
        "220px",
        "important"
    );

    goLink.style.setProperty(
        "min-width",
        "70px",
        "important"
    );

    goLink.style.setProperty(
        "display",
        "block",
        "important"
    );

    goLink.style.setProperty(
        "line-height",
        "0",
        "important"
    );

    goLink.style.setProperty(
        "padding",
        "0",
        "important"
    );

    goLink.style.setProperty(
        "margin",
        "0",
        "important"
    );

    goLink.style.setProperty(
        "border",
        "0",
        "important"
    );

    goLink.style.setProperty(
        "outline",
        "none",
        "important"
    );

    goLink.style.setProperty(
        "text-decoration",
        "none",
        "important"
    );

    goLink.style.setProperty(
        "cursor",
        "pointer",
        "important"
    );

    goLink.style.setProperty(
        "pointer-events",
        "auto",
        "important"
    );

    goLink.style.setProperty(
        "-webkit-tap-highlight-color",
        "transparent",
        "important"
    );

    goLink.style.setProperty(
        "z-index",
        "2",
        "important"
    );


    const gif =
        document.createElement(
            "img"
        );


    gif.src =
        new URL(
            "/assets/go-button-gif.gif",
            window.location.origin
        ).href;


    gif.alt =
        "";


    gif.setAttribute(
        "aria-hidden",
        "true"
    );


    gif.draggable =
        false;


    gif.style.setProperty(
        "display",
        "block",
        "important"
    );

    gif.style.setProperty(
        "width",
        "100%",
        "important"
    );

    gif.style.setProperty(
        "height",
        "auto",
        "important"
    );

    gif.style.setProperty(
        "object-fit",
        "contain",
        "important"
    );


    gif.style.setProperty(
        "border-radius",
        "0",
        "important"
    );

    gif.style.setProperty(
        "filter",
        "drop-shadow(0px 3px 2px rgba(84, 231, 196, 0.8))",
        "important"
    );

    gif.style.setProperty(
        "pointer-events",
        "none",
        "important"
    );

    gif.style.setProperty(
        "user-select",
        "none",
        "important"
    );

    gif.style.setProperty(
        "-webkit-user-drag",
        "none",
        "important"
    );


    goLink.appendChild(
        gif
    );

    button.appendChild(
        goLink
    );


    closedPanel.appendChild(
        button
    );


    updateClosedGoButtonLayout();

    bindGoButtonViewportTracking();

    playGoButtonEntrance(
        button
    );


    return button;
}


    /* =====================================================
       GO BUTTON ENTRANCE (FLOAT IN FROM LEFT)
       -----------------------------------------------------
       Adds/restarts the CSS "sky-share-go-float-in" animation
       (defined in share.css) so the go-button / go-button-
       mobile artwork and its gif overlay float in together
       from the left, every time the closed-state panel is
       shown - not just the first time it's created.
    ===================================================== */

    function playGoButtonEntrance(button) {

        if (!button) {
            return;
        }

        button.classList.remove(
            "sky-share-go-float-in"
        );

        // Force a reflow so re-adding the class below restarts
        // the animation instead of being a no-op.
        void button.offsetWidth;

        button.classList.add(
            "sky-share-go-float-in"
        );
    }


    /* =====================================================
       SHARE SHELL
    ===================================================== */

    function createShell() {

        if (shell) {
            return;
        }


        shell =
            createElement(
                "div",
                "sky-share-shell"
            );


        shell.id =
            "skyShareShell";


        const header =
            createElement(
                "header",
                "sky-share-header"
            );


        const brand =
            createElement(
                "div",
                "sky-share-brand"
            );


        const section =
            createElement(
                "div",
                "sky-share-section"
            );


        header.appendChild(
            brand
        );

        header.appendChild(
            section
        );


        const main =
            createElement(
                "main",
                "sky-share-main"
            );


        const heading =
            createElement(
                "div",
                "sky-share-heading"
            );


        titleElement =
            createElement(
                "h1",
                "sky-share-title"
            );


        subtitleElement =
            createElement(
                "div",
                "sky-share-subtitle"
            );


        heading.appendChild(
            titleElement
        );

        heading.appendChild(
            subtitleElement
        );


        mediaHost =
            createElement(
                "div",
                "sky-share-media-host"
            );


        mediaHost.id =
            "skyShareMediaHost";


        statusElement =
            createElement(
                "div",
                "sky-share-status"
            );


        const primaryLogo =
            document.getElementById(
                "workspacePrimaryLogo"
            );


        if (primaryLogo) {

            primaryLogo.classList.add(
                "sky-share-primary-logo"
            );

            primaryLogo.style.display =
                "block";

            shell.appendChild(
                primaryLogo
            );
        }


        const actions =
            createElement(
                "div",
                "sky-share-actions"
            );


        const openButton =
            createElement(
                "a",
                "sky-share-open-button",
                "Open Meditation Mornings"
            );


        openButton.href =
            GLIDE_MEDIA_URL;

        openButton.target =
            "_blank";

        openButton.rel =
            "noopener noreferrer";


        const closeButton =
            createElement(
                "button",
                "sky-share-close-button",
                "×"
            );


        closeButton.type =
            "button";

        closeButton.setAttribute(
            "aria-label",
            "Close"
        );

        closeButton.title =
            "Close";


        closeButton.addEventListener(
            "click",
            close
        );


        actions.appendChild(
            openButton
        );

        actions.appendChild(
            closeButton
        );


        main.appendChild(
            heading
        );

        main.appendChild(
            mediaHost
        );

        main.appendChild(
            statusElement
        );


        shell.appendChild(
            header
        );

        shell.appendChild(
            main
        );

        shell.appendChild(
            actions
        );


        document.body.appendChild(
            shell
        );
    }


    /* =====================================================
       HIDE NORMAL APPLICATION
    ===================================================== */

    function isolateApplication() {

        document.body.classList.add(
            "sky-share-mode"
        );


        const selectors = [

            "#frontPage",
            "#frontSection",

            "#workspace",
            "#videoSection",
            "#slideshowSection",

            "#topBar",
            "#topSearchGroup",
            "#topBarRightControls",

            "#videoTopBar",
            "#videoLibrary",
            "#videoSearchGroup",
            "#videoTopBarRightControls",

            "#slideshowLibrary",
            ".slideshow-top-bar",

            ".app-switcher",
            ".responsive-app-menu",
            ".responsive-app-menu-button",

            "#readerLibrary",
            "#library",
            "#libraryPanel",
            "#readerDrawer",

            "#settingsPanel",
            "#settingsOverlay",

            ".video-library",
            ".slideshow-library"
        ];


        selectors.forEach(
            selector => {

                document
                    .querySelectorAll(
                        selector
                    )
                    .forEach(
                        el => {

                            el.dataset.skyShareHidden =
                                "true";

                            el.style.setProperty(
                                "display",
                                "none",
                                "important"
                            );
                        }
                    );
            }
        );


        document
            .querySelectorAll(
                "[data-app-target], .app-switch-button"
            )
            .forEach(
                el => {

                    el.dataset.skyShareHidden =
                        "true";

                    el.style.setProperty(
                        "display",
                        "none",
                        "important"
                    );
                }
            );
    }


    /* =====================================================
       MOVE SURFACE
    ===================================================== */

    function moveIntoShareHost(element) {

        if (
            !element ||
            !mediaHost
        ) {
            return;
        }


        mediaHost.appendChild(
            element
        );


        element.style.removeProperty(
            "display"
        );
    }


    /* =====================================================
       BUTTON CLONE
    ===================================================== */

    function replaceButton(id) {

        const oldButton =
            document.getElementById(
                id
            );


        if (!oldButton) {
            return null;
        }


        const newButton =
            oldButton.cloneNode(
                true
            );


        oldButton.replaceWith(
            newButton
        );


        return newButton;
    }


    /* =====================================================
       MUTE
    ===================================================== */

    function updateMuteIcon() {

        const button =
            document.getElementById(
                "muteButton"
            );


        if (!button) {
            return;
        }


        const muted =
            !!(
                window.AudioController &&
                typeof AudioController.isMuted ===
                    "function" &&
                AudioController.isMuted()
            );


        const use =
            button.querySelector(
                "use"
            );


        if (use) {

            use.setAttribute(
                "href",
                muted
                    ? "#icon-muted"
                    : "#icon-volume"
            );
        }


        button.classList.toggle(
            "active",
            muted
        );

        button.classList.toggle(
            "is-muted",
            muted
        );


        button.setAttribute(
            "aria-pressed",
            muted
                ? "true"
                : "false"
        );


        button.setAttribute(
            "aria-label",
            muted
                ? "Unmute"
                : "Mute"
        );


        button.title =
            muted
                ? "Unmute"
                : "Mute";
    }


    /* =====================================================
       FULLSCREEN ICON
    ===================================================== */

    function updateFullscreenIcon() {

        const button =
            document.getElementById(
                "viewerFullscreenButton"
            );


        if (!button) {
            return;
        }


        const active =
            document.fullscreenElement ===
            shell;


        const use =
            button.querySelector(
                "use"
            );


        if (use) {

            use.setAttribute(
                "href",
                active
                    ? "#icon-fullscreen-exit"
                    : "#icon-fullscreen"
            );
        }


        button.setAttribute(
            "aria-pressed",
            active
                ? "true"
                : "false"
        );


        button.setAttribute(
            "aria-label",
            active
                ? "Exit fullscreen"
                : "Fullscreen"
        );


        button.title =
            active
                ? "Exit fullscreen"
                : "Fullscreen";
    }


    /* =====================================================
       PAGE BUTTONS
    ===================================================== */

    function updatePageButtons() {

        if (!isBookShare()) {
            return;
        }


        if (
            !window.Reader ||
            typeof Reader.currentPage !==
                "function" ||
            typeof Reader.pages !==
                "function"
        ) {
            return;
        }


        const page =
            Number(
                Reader.currentPage()
            ) || 1;


        const pages =
            Number(
                Reader.pages()
            ) || 0;


        const previous =
            document.getElementById(
                "previousButton"
            );


        const next =
            document.getElementById(
                "nextButton"
            );


        if (previous) {

            const hidden =
                page <= 1;

            previous.hidden =
                hidden;

            previous.setAttribute(
                "aria-hidden",
                hidden
                    ? "true"
                    : "false"
            );
        }


        if (next) {

            const hidden =
                pages > 0 &&
                page >= pages;

            next.hidden =
                hidden;

            next.setAttribute(
                "aria-hidden",
                hidden
                    ? "true"
                    : "false"
            );
        }


        updateShareBookIndicator();
    }


    /* =====================================================
       PAGE WATCHER
    ===================================================== */

    function startPageWatcher() {

        stopPageWatcher();


        pageStateTimer =
            setInterval(
                function () {

                    updatePageButtons();

                },
                150
            );
    }


    function stopPageWatcher() {

        if (pageStateTimer) {

            clearInterval(
                pageStateTimer
            );

            pageStateTimer =
                null;
        }
    }


    /* =====================================================
       FULLSCREEN
    ===================================================== */

    function enterFullscreen() {

        if (!shell) {
            return;
        }


        if (
            document.fullscreenElement ===
            shell
        ) {
            return;
        }


        if (
            typeof shell.requestFullscreen ===
                "function"
        ) {

            shell.requestFullscreen()
                .catch(
                    error => {

                        console.warn(
                            "[SkyMedia Share] Fullscreen failed.",
                            error
                        );
                    }
                );
        }
    }


    function exitFullscreen() {

        if (
            document.fullscreenElement &&
            typeof document.exitFullscreen ===
                "function"
        ) {

            document.exitFullscreen()
                .catch(
                    () => {}
                );
        }
    }


    /* =====================================================
       SHARE-LINK COPIED CUE
    ===================================================== */

    function showShareCopiedCue() {

        if (shareCopiedCueTimer) {
            clearTimeout(shareCopiedCueTimer);
            shareCopiedCueTimer = null;
        }

        if (shareCopiedCue) {
            shareCopiedCue.remove();
            shareCopiedCue = null;
        }

        const image = document.createElement("img");

        image.className = "sky-share-link-copied-cue";
        image.src = new URL(
            "/assets/link-copied.gif",
            window.location.origin
        ).href;
        image.alt = "";
        image.setAttribute("aria-hidden", "true");

        image.style.setProperty("position", "fixed", "important");
        image.style.setProperty("left", "50%", "important");
        image.style.setProperty("top", "50%", "important");
        image.style.setProperty("transform", "translate(-50%, -50%)", "important");
        image.style.setProperty("width", "45px", "important");
        image.style.setProperty("height", "45px", "important");
        image.style.setProperty("max-width", "45px", "important");
        image.style.setProperty("max-height", "45px", "important");
        image.style.setProperty("object-fit", "contain", "important");
        image.style.setProperty("pointer-events", "none", "important");
        image.style.setProperty("z-index", "2147483647", "important");
        image.style.setProperty("opacity", "1", "important");
        image.style.setProperty("transition", "opacity 250ms ease", "important");

        document.body.appendChild(image);
        shareCopiedCue = image;

        shareCopiedCueTimer = setTimeout(() => {

            if (!shareCopiedCue) {
                shareCopiedCueTimer = null;
                return;
            }

            shareCopiedCue.style.setProperty("opacity", "0", "important");

            const cue = shareCopiedCue;

            shareCopiedCueTimer = setTimeout(() => {
                cue.remove();

                if (shareCopiedCue === cue) {
                    shareCopiedCue = null;
                }

                shareCopiedCueTimer = null;
            }, 300);

        }, 1000);
    }


    /* =====================================================
       BOOK CONTROLS
    ===================================================== */

    function bindBookControls() {

        if (bookControlsBound) {

            updateMuteIcon();
            updatePageButtons();

            return;
        }


        const toolbar =
            document.getElementById(
                "toolbar"
            );


        if (!toolbar) {
            return;
        }


        bookControlsBound =
            true;


        replaceButton(
            "previousButton"
        );

        replaceButton(
            "nextButton"
        );

        replaceButton(
            "muteButton"
        );

        replaceButton(
            "readerShareButton"
        );

        replaceButton(
            "viewerFullscreenButton"
        );

        replaceButton(
            "readerCloseButton"
        );

        replaceButton(
            "rotateButton"
        );

        replaceButton(
            "bookmarkAddButton"
        );


        const previous =
            document.getElementById(
                "previousButton"
            );

        const next =
            document.getElementById(
                "nextButton"
            );

        const mute =
            document.getElementById(
                "muteButton"
            );

        const share =
            document.getElementById(
                "readerShareButton"
            );

        const fullscreen =
            document.getElementById(
                "viewerFullscreenButton"
            );

        const closeButton =
            document.getElementById(
                "readerCloseButton"
            );


        if (previous) {
            mediaHost.appendChild(
                previous
            );
        }


        if (next) {
            mediaHost.appendChild(
                next
            );
        }


        toolbar.replaceChildren(
            mute,
            share,
            fullscreen,
            closeButton
        );


        previous?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();


                const page =
                    Number(
                        Reader.currentPage?.()
                    ) || 1;


                if (page <= 1) {

                    updatePageButtons();

                    return;
                }


                if (
                    window.SRNavigation &&
                    typeof SRNavigation.previous ===
                        "function"
                ) {

                    SRNavigation.previous();
                }


                setTimeout(
                    updatePageButtons,
                    80
                );

                setTimeout(
                    updatePageButtons,
                    500
                );
            }
        );


        next?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();


                const page =
                    Number(
                        Reader.currentPage?.()
                    ) || 1;


                const pages =
                    Number(
                        Reader.pages?.()
                    ) || 0;


                if (
                    pages &&
                    page >= pages
                ) {

                    updatePageButtons();

                    return;
                }


                if (
                    window.SRNavigation &&
                    typeof SRNavigation.next ===
                        "function"
                ) {

                    SRNavigation.next();
                }


                setTimeout(
                    updatePageButtons,
                    80
                );

                setTimeout(
                    updatePageButtons,
                    500
                );
            }
        );


        mute?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();


                if (
                    window.AudioController &&
                    typeof AudioController.toggleMute ===
                        "function"
                ) {

                    AudioController.toggleMute();
                }


                updateMuteIcon();
            }
        );


        share?.addEventListener(
            "click",
            async event => {

                event.preventDefault();
                event.stopPropagation();


                const book =
                    window.Reader &&
                    typeof Reader.book ===
                        "function"
                        ? Reader.book()
                        : activeItem;


                if (
                    book &&
                    book.id &&
                    window.ShareManager &&
                    typeof ShareManager.share ===
                        "function"
                ) {

                    try {

                        await ShareManager.share(
                            "reader",
                            book
                        );

                        showShareCopiedCue();

                    }
                    catch (error) {

                        console.error(
                            "[SkyMedia Share] Share-link action failed:",
                            error
                        );
                    }
                }
            }
        );


        fullscreen?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();


                if (
                    document.fullscreenElement ===
                    shell
                ) {

                    exitFullscreen();

                }
                else {

                    enterFullscreen();
                }
            }
        );


        closeButton?.addEventListener(
            "click",
            event => {

                event.preventDefault();
                event.stopPropagation();

                close();
            }
        );


        updateMuteIcon();

        updatePageButtons();

        startPageWatcher();
    }


async function waitForSharedVideoReady(item) {
    const video = document.getElementById("videoPlayer");
    const iframe = document.getElementById("videoIframePlayer");

    const isYouTube =
        window.ContentContract &&
        typeof ContentContract.isYouTubeUrl === "function" &&
        ContentContract.isYouTubeUrl(item?.video);

    if (isYouTube) {
        if (!iframe) return;

        await new Promise((resolve, reject) => {
            const cleanup = () => {
                iframe.removeEventListener("load", onLoad);
                iframe.removeEventListener("error", onError);
            };

            const onLoad = () => {
                cleanup();
                resolve();
            };

            const onError = () => {
                cleanup();
                reject(
                    new Error(
                        "The shared video player could not be loaded."
                    )
                );
            };

            iframe.addEventListener("load", onLoad);
            iframe.addEventListener("error", onError);
        });

        return;
    }

    if (!video) return;
    if (video.readyState >= 2) return;

    await new Promise((resolve, reject) => {
        const cleanup = () => {
            video.removeEventListener("loadeddata", onReady);
            video.removeEventListener("canplay", onReady);
            video.removeEventListener("error", onError);
        };

        const onReady = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(
                new Error("The shared video could not be loaded.")
            );
        };

        video.addEventListener("loadeddata", onReady);
        video.addEventListener("canplay", onReady);
        video.addEventListener("error", onError);
    });
}

async function waitForSharedSlideshowReady() {
    const viewer = document.getElementById("slideshowViewer");
    if (!viewer) return;

    const image = viewer.querySelector(".slideshow-slide img");
    if (!image) return;

    if (image.complete) {
        if (image.naturalWidth > 0) return;

        throw new Error(
            "The shared slideshow image could not be loaded."
        );
    }

    await new Promise((resolve, reject) => {
        const cleanup = () => {
            image.removeEventListener("load", onLoad);
            image.removeEventListener("error", onError);
        };

        const onLoad = () => {
            cleanup();
            resolve();
        };

        const onError = () => {
            cleanup();
            reject(
                new Error(
                    "The shared slideshow image could not be loaded."
                )
            );
        };

        image.addEventListener("load", onLoad);
        image.addEventListener("error", onError);
    });
}


    /* =====================================================
       ITEM CONTROL CLEANUP
    ===================================================== */

    function hideSharedItemControls() {

        const selectors = [

            "#toolbar",
            "#statusBar",
            "#previousButton",
            "#nextButton",
            "#previousPage",
            "#nextPage",

            "#videoTopBar",
            "#videoToolbar",
            "#videoControls",
            "#videoViewerControls",
            "#videoPlayerControls",
            ".video-controls",
            ".video-player-controls",
            ".video-control-bar",
            ".video-toolbar",

            "#slideshowTopBar",
            "#slideshowToolbar",
            "#slideshowControls",
            "#slideshowViewerControls",
            ".slideshow-top-bar",
            ".slideshow-controls",
            ".slideshow-control-bar",
            ".slideshow-toolbar",
            ".slideshow-buttons"
        ];


        selectors.forEach(
            selector => {

                document
                    .querySelectorAll(
                        selector
                    )
                    .forEach(
                        element => {

                            element.style.setProperty(
                                "display",
                                "none",
                                "important"
                            );

                            element.style.setProperty(
                                "visibility",
                                "hidden",
                                "important"
                            );

                            element.style.setProperty(
                                "opacity",
                                "0",
                                "important"
                            );

                            element.style.setProperty(
                                "pointer-events",
                                "none",
                                "important"
                            );
                        }
                    );
            }
        );
    }


    /* =====================================================
       ITEM SURFACE CLEANUP
    ===================================================== */

    function hideSharedItemSurfaces() {

        if (mediaHost) {

            mediaHost.style.setProperty(
                "display",
                "none",
                "important"
            );

            mediaHost.style.setProperty(
                "visibility",
                "hidden",
                "important"
            );

            mediaHost.style.setProperty(
                "opacity",
                "0",
                "important"
            );

            mediaHost.style.setProperty(
                "pointer-events",
                "none",
                "important"
            );
        }


        [
            "#viewerArea",
            "#videoViewer",
            "#slideshowViewer",
            "#videoSection",
            "#slideshowSection"
        ].forEach(
            selector => {

                document
                    .querySelectorAll(
                        selector
                    )
                    .forEach(
                        element => {

                            element.style.setProperty(
                                "display",
                                "none",
                                "important"
                            );

                            element.style.setProperty(
                                "visibility",
                                "hidden",
                                "important"
                            );

                            element.style.setProperty(
                                "opacity",
                                "0",
                                "important"
                            );

                            element.style.setProperty(
                                "pointer-events",
                                "none",
                                "important"
                            );
                        }
                    );
            }
        );


        if (statusElement) {

            statusElement.style.setProperty(
                "display",
                "none",
                "important"
            );

            statusElement.style.setProperty(
                "visibility",
                "hidden",
                "important"
            );

            statusElement.style.setProperty(
                "opacity",
                "0",
                "important"
            );
        }
    }


    /* =====================================================
       VIDEO / SLIDESHOW STOP
    ===================================================== */

    function stopNonBookMedia() {

        if (
            isVideoShare() &&
            window.VideoViewer &&
            typeof VideoViewer.close ===
                "function"
        ) {

            try {

                VideoViewer.close();

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Video close cleanup:",
                    error
                );
            }
        }


        if (
            isSlideshowShare() &&
            window.SlideshowViewer &&
            typeof SlideshowViewer.close ===
                "function"
        ) {

            try {

                SlideshowViewer.close();

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Slideshow close cleanup:",
                    error
                );
            }
        }


        if (mediaHost) {

            mediaHost
                .querySelectorAll(
                    "video, audio"
                )
                .forEach(
                    media => {

                        try {
                            media.pause();
                        }
                        catch (error) {
                            /* ignore */
                        }
                    }
                );
        }


        document
            .querySelectorAll(
                "#videoViewer video, #videoViewer audio"
            )
            .forEach(
                media => {

                    try {
                        media.pause();
                    }
                    catch (error) {
                        /* ignore */
                    }
                }
            );
    }


    /* =====================================================
       BOOK WHEEL NAVIGATION
    ===================================================== */

    function onBookWheel(event) {

        if (!isBookShare()) {
            return;
        }


        if (event.ctrlKey) {
            return;
        }


        if (!window.SRNavigation) {
            return;
        }


        const forward =
            event.deltaY > 0 ||
            event.deltaX > 0;


        const backward =
            event.deltaY < 0 ||
            event.deltaX < 0;


        if (
            !forward &&
            !backward
        ) {
            return;
        }


        const page =
            Number(
                Reader.currentPage?.()
            ) || 1;


        const pages =
            Number(
                Reader.pages?.()
            ) || 0;


        /*
         * HARD STOP at the final page.
         */
        if (
            forward &&
            pages > 0 &&
            page >= pages
        ) {

            event.preventDefault();
            event.stopPropagation();

            if (
                typeof event.stopImmediatePropagation ===
                    "function"
            ) {

                event.stopImmediatePropagation();
            }


            updatePageButtons();

            return;
        }


        /*
         * HARD STOP at the first page when moving backward.
         */
        if (
            backward &&
            page <= 1
        ) {

            event.preventDefault();
            event.stopPropagation();

            if (
                typeof event.stopImmediatePropagation ===
                    "function"
            ) {

                event.stopImmediatePropagation();
            }


            updatePageButtons();

            return;
        }


        if (bookWheelLocked) {

            event.preventDefault();
            event.stopPropagation();

            return;
        }


        bookWheelLocked =
            true;


        setTimeout(
            function () {

                bookWheelLocked =
                    false;

            },
            220
        );


        /*
         * Share Mode owns the wheel event.
         */
        event.preventDefault();
        event.stopPropagation();

        if (
            typeof event.stopImmediatePropagation ===
                "function"
        ) {

            event.stopImmediatePropagation();
        }


        if (forward) {

            if (
                typeof SRNavigation.next ===
                    "function"
            ) {

                SRNavigation.next();
            }

        }
        else {

            if (
                typeof SRNavigation.previous ===
                    "function"
            ) {

                SRNavigation.previous();
            }
        }


        setTimeout(
            updatePageButtons,
            80
        );

        setTimeout(
            updatePageButtons,
            500
        );
    }


    /* =====================================================
       BOOK TOUCH START
    ===================================================== */

    function onBookTouchStart(event) {

        if (!isBookShare()) {

            bookTouchTracking =
                false;

            return;
        }


        if (
            event.touches.length !== 1
        ) {

            bookTouchTracking =
                false;

            return;
        }


        const target =
            event.target;


        if (
            target &&
            target.closest &&
            target.closest(
                [
                    "#toolbar",
                    "#previousButton",
                    "#nextButton",
                    "#pageJump",
                    "#pageIndicator",
                    ".sky-share-actions"
                ].join(", ")
            )
        ) {

            bookTouchTracking =
                false;

            return;
        }


        bookTouchTracking =
            true;


        bookTouchStartX =
            event.touches[0].clientX;


        bookTouchStartY =
            event.touches[0].clientY;
    }


    /* =====================================================
       BOOK TOUCH MOVE
    ===================================================== */

    function onBookTouchMove(event) {

        if (
            !bookTouchTracking ||
            event.touches.length !== 1
        ) {
            return;
        }


        const dx =
            event.touches[0].clientX -
            bookTouchStartX;


        const dy =
            event.touches[0].clientY -
            bookTouchStartY;


        if (
            Math.abs(dx) >
                BOOK_TOUCH_THRESHOLD &&
            Math.abs(dx) >
                Math.abs(dy)
        ) {

            /*
             * Prevent browser horizontal scrolling.
             */
            event.preventDefault();
        }
    }


    /* =====================================================
       BOOK TOUCH END
    ===================================================== */

    function onBookTouchEnd(event) {

        if (!bookTouchTracking) {
            return;
        }


        bookTouchTracking =
            false;


        if (!isBookShare()) {
            return;
        }


        if (!window.SRNavigation) {
            return;
        }


        const touch =
            event.changedTouches &&
            event.changedTouches[0];


        if (!touch) {
            return;
        }


        const dx =
            touch.clientX -
            bookTouchStartX;


        const dy =
            touch.clientY -
            bookTouchStartY;


        if (
            Math.abs(dx) <
                BOOK_TOUCH_THRESHOLD ||
            Math.abs(dx) <=
                Math.abs(dy)
        ) {
            return;
        }


        const forward =
            dx < 0;


        const page =
            Number(
                Reader.currentPage?.()
            ) || 1;


        const pages =
            Number(
                Reader.pages?.()
            ) || 0;


        /*
         * Do not permit a forward swipe beyond the
         * final page.
         */
        if (
            forward &&
            pages > 0 &&
            page >= pages
        ) {

            event.preventDefault();
            event.stopPropagation();

            updatePageButtons();

            return;
        }


        /*
         * Do not permit backward swipe before page 1.
         */
        if (
            !forward &&
            page <= 1
        ) {

            event.preventDefault();
            event.stopPropagation();

            updatePageButtons();

            return;
        }


        event.preventDefault();
        event.stopPropagation();


        if (
            typeof event.stopImmediatePropagation ===
                "function"
        ) {

            event.stopImmediatePropagation();
        }


        bookSuppressClickUntil =
            Date.now() + 500;


        if (forward) {

            if (
                typeof SRNavigation.next ===
                    "function"
            ) {

                SRNavigation.next();
            }

        }
        else {

            if (
                typeof SRNavigation.previous ===
                    "function"
            ) {

                SRNavigation.previous();
            }
        }


        setTimeout(
            updatePageButtons,
            80
        );

        setTimeout(
            updatePageButtons,
            500
        );
    }


    /* =====================================================
       CANCEL SYNTHESIZED CLICK AFTER SWIPE
    ===================================================== */

    function onBookTouchClickCapture(
        event
    ) {

        if (
            Date.now() <
            bookSuppressClickUntil
        ) {

            event.preventDefault();
            event.stopPropagation();

            if (
                typeof event.stopImmediatePropagation ===
                    "function"
            ) {

                event.stopImmediatePropagation();
            }


            bookSuppressClickUntil =
                0;
        }
    }


    /* =====================================================
       BOOK GESTURES
    ===================================================== */

    function bindBookGestures() {

        if (bookGestureBound) {
            return;
        }


        bookGestureBound =
            true;


        bookWheelTarget =
            document.getElementById(
                "viewerArea"
            ) ||
            mediaHost;


        bookTouchTarget =
            mediaHost;


        /*
         * Wheel is capture-phase so PageFlip/other listeners
         * cannot consume it first.
         */
        if (bookWheelTarget) {

            bookWheelTarget.addEventListener(
                "wheel",
                onBookWheel,
                {
                    passive: false,
                    capture: true
                }
            );
        }


        if (bookTouchTarget) {

            bookTouchTarget.addEventListener(
                "touchstart",
                onBookTouchStart,
                {
                    passive: true,
                    capture: true
                }
            );


            bookTouchTarget.addEventListener(
                "touchmove",
                onBookTouchMove,
                {
                    passive: false,
                    capture: true
                }
            );


            bookTouchTarget.addEventListener(
                "touchend",
                onBookTouchEnd,
                {
                    passive: false,
                    capture: true
                }
            );


            bookTouchTarget.addEventListener(
                "click",
                onBookTouchClickCapture,
                true
            );
        }


        /*
         * IMPORTANT:
         *
         * Do NOT call:
         *
         *     SRNavigation.enableWheel(false)
         *     SRNavigation.enableTouch(false)
         *
         * Those global state changes were contributing to the
         * navigation regressions. Share Mode's capture-phase
         * handlers already own the wheel/swipe events.
         */
    }


    function unbindBookGestures() {

        if (!bookGestureBound) {
            return;
        }


        if (bookWheelTarget) {

            bookWheelTarget.removeEventListener(
                "wheel",
                onBookWheel,
                true
            );
        }


        if (bookTouchTarget) {

            bookTouchTarget.removeEventListener(
                "touchstart",
                onBookTouchStart,
                true
            );

            bookTouchTarget.removeEventListener(
                "touchmove",
                onBookTouchMove,
                true
            );

            bookTouchTarget.removeEventListener(
                "touchend",
                onBookTouchEnd,
                true
            );

            bookTouchTarget.removeEventListener(
                "click",
                onBookTouchClickCapture,
                true
            );
        }


        bookWheelTarget =
            null;


        bookTouchTarget =
            null;


        bookTouchTracking =
            false;


        bookWheelLocked =
            false;


        bookGestureBound =
            false;
    }


    /* =====================================================
       FINAL-PAGE MOUSE CLOSE PROTECTION
    ===================================================== */

    function isAllowedLastPageControl(
        target
    ) {

        if (
            !target ||
            !target.closest
        ) {
            return false;
        }


        return !!target.closest(
            [
                "#toolbar",
                "#previousButton",
                "#muteButton",
                "#readerShareButton",
                "#viewerFullscreenButton",
                "#readerCloseButton",
                "#pageIndicator",
                "#pageJump",
                "#pageJumpInput",
                ".sky-share-actions",
                ".sky-share-close-button"
            ].join(",")
        );
    }


    function isFinalPageBookSurface(
        target
    ) {

        if (!isBookShare()) {
            return false;
        }


        if (
            !window.Reader ||
            typeof Reader.currentPage !==
                "function" ||
            typeof Reader.pages !==
                "function"
        ) {
            return false;
        }


        const current =
            Number(
                Reader.currentPage()
            ) || 1;


        const total =
            Number(
                Reader.pages()
            ) || 0;


        if (
            !total ||
            current < total
        ) {
            return false;
        }


        if (
            isAllowedLastPageControl(
                target
            )
        ) {
            return false;
        }


        const viewer =
            document.getElementById(
                "viewerArea"
            );


        if (!viewer) {
            return false;
        }


        return viewer.contains(
            target
        );
    }


    function blockFinalPageMouseEvent(
        event
    ) {

        if (
            !isFinalPageBookSurface(
                event.target
            )
        ) {
            return;
        }


        /*
         * We only block mouse interaction here.
         *
         * Touch swipes are handled by Share's touch
         * navigation system.
         */
        if (
            event.type === "pointerdown" &&
            event.pointerType &&
            event.pointerType !== "mouse"
        ) {
            return;
        }


        if (
            event.type === "pointerup" &&
            event.pointerType &&
            event.pointerType !== "mouse"
        ) {
            return;
        }


        event.preventDefault();
        event.stopPropagation();


        if (
            typeof event.stopImmediatePropagation ===
                "function"
        ) {

            event.stopImmediatePropagation();
        }
    }


    function blockFinalPageWheel(event) {

        if (!isBookShare() || event.ctrlKey) {
            return;
        }

        const forward =
            Number(event.deltaY) > 0 ||
            Number(event.deltaX) > 0;

        if (!forward) {
            return;
        }

        if (
            !window.Reader ||
            typeof Reader.currentPage !== "function" ||
            typeof Reader.pages !== "function"
        ) {
            return;
        }

        const current = Number(Reader.currentPage()) || 1;
        const total = Number(Reader.pages()) || 0;

        if (!total || current < total) {
            return;
        }

        event.preventDefault();
        event.stopPropagation();

        if (typeof event.stopImmediatePropagation === "function") {
            event.stopImmediatePropagation();
        }

        updatePageButtons();
    }


    /*
     * WINDOW-LEVEL FINAL-PAGE GUARDS
     *
     * PageFlip/Reader can install its own handlers below the
     * document level.  A document-capture listener can therefore
     * still be too late for some builds.  These window-capture
     * guards run before the event reaches document/page elements.
     */

    function blockFinalPageWindowWheel(event) {

        if (!isBookShare() || event.ctrlKey) {
            return;
        }

        const forward =
            Number(event.deltaY) > 0 ||
            Number(event.deltaX) > 0;

        if (!forward) {
            return;
        }

        if (
            !window.Reader ||
            typeof Reader.currentPage !== "function" ||
            typeof Reader.pages !== "function"
        ) {
            return;
        }

        const current = Number(Reader.currentPage()) || 1;
        const total = Number(Reader.pages()) || 0;

        if (!total || current < total) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
        updatePageButtons();
    }


    function blockFinalPageWindowMouse(event) {

        if (!isBookShare()) {
            return;
        }

        if (
            !window.Reader ||
            typeof Reader.currentPage !== "function" ||
            typeof Reader.pages !== "function"
        ) {
            return;
        }

        const current = Number(Reader.currentPage()) || 1;
        const total = Number(Reader.pages()) || 0;

        if (!total || current < total) {
            return;
        }

        const target = event.target;

        if (!target || !target.closest) {
            return;
        }

        /*
         * NEXT is an explicit control, but on the final page it
         * must be completely inert rather than allowed to reach
         * any Reader/PageFlip handler.
         */
        const nextButton = target.closest("#nextButton");

        if (nextButton) {
            event.preventDefault();
            event.stopImmediatePropagation();
            updatePageButtons();
            return;
        }

        /* X and the other toolbar/status controls remain usable. */
        if (isAllowedLastPageControl(target)) {
            return;
        }

        const viewer = document.getElementById("viewerArea");

        if (!viewer || !viewer.contains(target)) {
            return;
        }

        /*
         * This is a direct mouse interaction with the final page.
         * Block it before PageFlip can turn it into its final-page
         * close action.
         */
        if (
            event.type === "pointerdown" &&
            event.pointerType &&
            event.pointerType !== "mouse"
        ) {
            return;
        }

        if (
            event.type === "pointerup" &&
            event.pointerType &&
            event.pointerType !== "mouse"
        ) {
            return;
        }

        event.preventDefault();
        event.stopImmediatePropagation();
    }


    function bindLastPageProtection() {

        if (lastPageProtectionBound) {
            return;
        }


        lastPageProtectionBound =
            true;


        /* Window capture is intentionally in addition to the
         * existing document-capture guards. */
        window.addEventListener(
            "wheel",
            blockFinalPageWindowWheel,
            {
                capture: true,
                passive: false
            }
        );

        window.addEventListener(
            "pointerdown",
            blockFinalPageWindowMouse,
            true
        );

        window.addEventListener(
            "pointerup",
            blockFinalPageWindowMouse,
            true
        );

        window.addEventListener(
            "mousedown",
            blockFinalPageWindowMouse,
            true
        );

        window.addEventListener(
            "mouseup",
            blockFinalPageWindowMouse,
            true
        );

        window.addEventListener(
            "click",
            blockFinalPageWindowMouse,
            true
        );


        /*
         * Some Reader/PageFlip builds signal the final-page close
         * through a custom event. Intercept it before Reader's
         * normal listener can turn it into a close.
         */
        document.addEventListener(
            "skyreader:last-page-click",
            blockFinalPageMouseEvent,
            true
        );


        /*
         * Wheel is intercepted at document capture because the
         * visible Reader surface may be nested/reparented.
         */
        document.addEventListener(
            "wheel",
            blockFinalPageWheel,
            {
                capture: true,
                passive: false
            }
        );


        /*
         * Pointer events happen before click.
         */
        document.addEventListener(
            "pointerdown",
            blockFinalPageMouseEvent,
            true
        );


        document.addEventListener(
            "pointerup",
            blockFinalPageMouseEvent,
            true
        );


        document.addEventListener(
            "mousedown",
            blockFinalPageMouseEvent,
            true
        );


        document.addEventListener(
            "mouseup",
            blockFinalPageMouseEvent,
            true
        );


        /*
         * Final fallback.
         */
        document.addEventListener(
            "click",
            blockFinalPageMouseEvent,
            true
        );
    }


    function unbindLastPageProtection() {

        if (!lastPageProtectionBound) {
            return;
        }


        document.removeEventListener(
            "skyreader:last-page-click",
            blockFinalPageMouseEvent,
            true
        );


        document.removeEventListener(
            "wheel",
            blockFinalPageWheel,
            {
                capture: true
            }
        );


        document.removeEventListener(
            "pointerdown",
            blockFinalPageMouseEvent,
            true
        );


        document.removeEventListener(
            "pointerup",
            blockFinalPageMouseEvent,
            true
        );


        document.removeEventListener(
            "mousedown",
            blockFinalPageMouseEvent,
            true
        );


        document.removeEventListener(
            "mouseup",
            blockFinalPageMouseEvent,
            true
        );


        document.removeEventListener(
            "click",
            blockFinalPageMouseEvent,
            true
        );



        window.removeEventListener(
            "wheel",
            blockFinalPageWindowWheel,
            {
                capture: true
            }
        );

        window.removeEventListener(
            "pointerdown",
            blockFinalPageWindowMouse,
            true
        );

        window.removeEventListener(
            "pointerup",
            blockFinalPageWindowMouse,
            true
        );

        window.removeEventListener(
            "mousedown",
            blockFinalPageWindowMouse,
            true
        );

        window.removeEventListener(
            "mouseup",
            blockFinalPageWindowMouse,
            true
        );

        window.removeEventListener(
            "click",
            blockFinalPageWindowMouse,
            true
        );

        lastPageProtectionBound =
            false;
    }


    /* =====================================================
       CLOSED-STATE SHARE HEADER
    ===================================================== */

    function hideClosedStateHeader() {

        if (!shell) {
            return;
        }


        const header =
            shell.querySelector(
                ".sky-share-header"
            );


        if (!header) {
            return;
        }


        header.style.setProperty(
            "display",
            "none",
            "important"
        );

        header.style.setProperty(
            "visibility",
            "hidden",
            "important"
        );

        header.style.setProperty(
            "opacity",
            "0",
            "important"
        );

        header.style.setProperty(
            "pointer-events",
            "none",
            "important"
        );
    }


    function restoreShareHeader() {

        if (!shell) {
            return;
        }


        const header =
            shell.querySelector(
                ".sky-share-header"
            );


        if (!header) {
            return;
        }


        header.style.removeProperty(
            "display"
        );

        header.style.removeProperty(
            "visibility"
        );

        header.style.removeProperty(
            "opacity"
        );

        header.style.removeProperty(
            "pointer-events"
        );
    }


    /* =====================================================
       CLOSED STATE: MOBILE CHROME (LOGO / OPEN BUTTON)
       -----------------------------------------------------
       On mobile, once the go-button-mobile artwork is showing,
       hide the workspace primary logo and the small persistent
       .sky-share-open-button so they don't compete with it.
       Both normally carry "!important" visibility rules in
       share.css, so they're overridden here the same way -
       with a higher-priority inline "!important".
    ===================================================== */

    function hideClosedStateMobileChrome() {

        const mobile =
            window.matchMedia(
                "(max-width: 700px)"
            ).matches;


        if (!mobile) {
            return;
        }


        const primaryLogo =
            document.getElementById(
                "workspacePrimaryLogo"
            );


        if (primaryLogo) {

            primaryLogo.style.setProperty(
                "display",
                "none",
                "important"
            );

            primaryLogo.style.setProperty(
                "visibility",
                "hidden",
                "important"
            );
        }


        const openButton =
            shell ?
                shell.querySelector(
                    ".sky-share-open-button"
                ) :
                null;


        if (openButton) {

            openButton.style.setProperty(
                "display",
                "none",
                "important"
            );

            openButton.style.setProperty(
                "visibility",
                "hidden",
                "important"
            );
        }
    }


    function restoreClosedStateMobileChrome() {

        const primaryLogo =
            document.getElementById(
                "workspacePrimaryLogo"
            );


        if (primaryLogo) {

            primaryLogo.style.removeProperty(
                "display"
            );

            primaryLogo.style.removeProperty(
                "visibility"
            );
        }


        const openButton =
            shell ?
                shell.querySelector(
                    ".sky-share-open-button"
                ) :
                null;


        if (openButton) {

            openButton.style.removeProperty(
                "display"
            );

            openButton.style.removeProperty(
                "visibility"
            );
        }
    }


    /* =====================================================
       CLOSED STATE
    ===================================================== */

    function showClosedPanel() {

        if (!shell) {
            return;
        }


        shell.classList.add(
            "sky-share-document-closed"
        );


        hideClosedStateHeader();

        hideSharedItemControls();

        hideSharedItemSurfaces();


        if (titleElement) {

            titleElement.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        if (subtitleElement) {

            subtitleElement.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        if (!closedPanel) {

            closedPanel =
                createElement(
                    "div",
                    "sky-share-closed-panel"
                );


            const main =
                shell.querySelector(
                    ".sky-share-main"
                );


            if (main) {

                const mainStyle =
                    getComputedStyle(main);


                if (
                    mainStyle.position ===
                    "static"
                ) {

                    main.style.setProperty(
                        "position",
                        "relative",
                        "important"
                    );
                }


                main.appendChild(
                    closedPanel
                );
            }
        }


        closedPanel.hidden =
            false;


        closedPanel.style.setProperty(
            "display",
            "block",
            "important"
        );

        closedPanel.style.setProperty(
            "position",
            "absolute",
            "important"
        );

        closedPanel.style.setProperty(
            "inset",
            "0",
            "important"
        );

        closedPanel.style.setProperty(
            "width",
            "100%",
            "important"
        );

        closedPanel.style.setProperty(
            "height",
            "100%",
            "important"
        );

        closedPanel.style.setProperty(
            "overflow",
            "hidden",
            "important"
        );

        closedPanel.style.setProperty(
            "box-sizing",
            "border-box",
            "important"
        );

        closedPanel.style.setProperty(
            "pointer-events",
            "none",
            "important"
        );

        closedPanel.style.setProperty(
            "z-index",
            "9999",
            "important"
        );


        createClosedGoButton();

        hideClosedStateMobileChrome();
    }


    /* =====================================================
       CLOSE
    ===================================================== */

    function close() {

        stopShareLoading();

        if (shareCopiedCueTimer) {
            clearTimeout(shareCopiedCueTimer);
            shareCopiedCueTimer = null;
        }

        if (shareCopiedCue) {
            shareCopiedCue.remove();
            shareCopiedCue = null;
        }

        if (shareClosing) {
            return;
        }


        if (
            shell &&
            shell.classList.contains(
                "sky-share-document-closed"
            )
        ) {
            return;
        }


        shareClosing =
            true;


        try {

            stopPageWatcher();

            unbindLastPageProtection();

            unbindBookResponsiveRefresh();

            detachBookZoom();

            stopControlsIdleTimer();

            unbindBookGestures();

            exitFullscreen();


            hideSharedItemControls();


            stopNonBookMedia();


            try {

                if (
                    isBookShare() &&
                    window.Reader &&
                    typeof Reader.close ===
                        "function" &&
                    Reader.isOpen()
                ) {

                    Reader.close({
                        playSound: false
                    });
                }

            }
            catch (error) {

                console.warn(
                    "[SkyMedia Share] Reader close cleanup:",
                    error
                );
            }


            isolateApplication();


            [
                "#workspace",
                "#topBar",
                "#topSearchGroup",
                "#topBarRightControls",
                "#library",
                "#libraryPanel",
                "#readerLibrary",
                "#readerDrawer",
                "#toolbar",
                "#viewerArea",
                "#statusBar"
            ].forEach(
                selector => {

                    document
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            el => {

                                el.style.setProperty(
                                    "display",
                                    "none",
                                    "important"
                                );

                                el.style.setProperty(
                                    "visibility",
                                    "hidden",
                                    "important"
                                );

                                el.style.setProperty(
                                    "opacity",
                                    "0",
                                    "important"
                                );

                                el.style.setProperty(
                                    "pointer-events",
                                    "none",
                                    "important"
                                );
                            }
                        );
                }
            );


            [
                "#videoTopBar",
                "#videoToolbar",
                "#videoControls",
                "#videoViewerControls",
                "#videoPlayerControls",
                ".video-controls",
                ".video-player-controls",
                ".video-control-bar",
                ".video-toolbar",

                "#slideshowTopBar",
                "#slideshowToolbar",
                "#slideshowControls",
                "#slideshowViewerControls",
                ".slideshow-top-bar",
                ".slideshow-controls",
                ".slideshow-control-bar",
                ".slideshow-toolbar",
                ".slideshow-buttons"
            ].forEach(
                selector => {

                    document
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            el => {

                                el.style.setProperty(
                                    "display",
                                    "none",
                                    "important"
                                );

                                el.style.setProperty(
                                    "visibility",
                                    "hidden",
                                    "important"
                                );

                                el.style.setProperty(
                                    "opacity",
                                    "0",
                                    "important"
                                );

                                el.style.setProperty(
                                    "pointer-events",
                                    "none",
                                    "important"
                                );
                            }
                        );
                }
            );


            document
                .querySelectorAll(
                    ".sr-welcome-banner"
                )
                .forEach(
                    el => {

                        el.style.setProperty(
                            "display",
                            "none",
                            "important"
                        );

                        el.style.setProperty(
                            "visibility",
                            "hidden",
                            "important"
                        );
                    }
                );


            hideSharedItemSurfaces();


            showClosedPanel();

        }
        catch (error) {

            console.error(
                "[SkyMedia Share] Close cleanup:",
                error
            );

        }
        finally {

            shareClosing =
                false;
        }
    }


    /* =====================================================
       CONTROLS IDLE TIMEOUT
    ===================================================== */

    const CONTROLS_IDLE_MS =
        10000;


    function showControls() {

        document.body.classList.remove(
            "sky-share-controls-hidden"
        );
    }


    function scheduleControlsHide() {

        if (controlsIdleTimer) {

            clearTimeout(
                controlsIdleTimer
            );
        }


        controlsIdleTimer =
            setTimeout(
                () => {

                    controlsIdleTimer =
                        null;


                    if (
                        !shell ||
                        !shell.classList.contains(
                            "sky-share-document-closed"
                        )
                    ) {

                        document.body.classList.add(
                            "sky-share-controls-hidden"
                        );
                    }

                },
                CONTROLS_IDLE_MS
            );
    }


    function registerControlsActivity() {

        if (
            !document.body.classList.contains(
                "sky-share-mode"
            )
        ) {
            return;
        }


        showControls();

        scheduleControlsHide();
    }


    function bindControlsIdleTimer() {

        if (controlsActivityBound) {

            registerControlsActivity();

            return;
        }


        controlsActivityBound =
            true;


        [
            "pointerdown",
            "pointermove",
            "mousemove",
            "touchstart",
            "keydown",
            "wheel"
        ].forEach(
            type => {

                document.addEventListener(
                    type,
                    registerControlsActivity,
                    {
                        passive: true
                    }
                );
            }
        );


        registerControlsActivity();
    }


    function stopControlsIdleTimer() {

        if (controlsIdleTimer) {

            clearTimeout(
                controlsIdleTimer
            );

            controlsIdleTimer =
                null;
        }


        showControls();
    }


    /* =====================================================
       FULLSCREEN CHANGE
    ===================================================== */

    function bindFullscreenChange() {

        document.addEventListener(
            "fullscreenchange",
            () => {

                if (
                    !document.body.classList.contains(
                        "sky-share-mode"
                    )
                ) {
                    return;
                }


                updateFullscreenIcon();
            }
        );
    }


    /* =====================================================
       ESCAPE
    ===================================================== */

    function bindEscape() {

        document.addEventListener(
            "keydown",
            event => {

                if (
                    !document.body.classList.contains(
                        "sky-share-mode"
                    )
                ) {
                    return;
                }


                if (
                    event.key !==
                    "Escape"
                ) {
                    return;
                }


                event.preventDefault();


                if (
                    document.fullscreenElement ===
                    shell
                ) {

                    exitFullscreen();

                    return;
                }


                if (
                    shell &&
                    !shell.classList.contains(
                        "sky-share-document-closed"
                    )
                ) {

                    close();
                }
            }
        );
    }


    /* =====================================================
       READER INITIAL VISIBILITY
    ===================================================== */

    function setBookInitialVisibility(
        visible
    ) {

        const host =
            mediaHost ||
            document.getElementById(
                "skyShareMediaHost"
            );


        const viewer =
            document.getElementById(
                "viewerArea"
            );


        if (host) {

            if (visible) {

                host.classList.remove(
                    "sky-share-book-layout-pending"
                );

                host.style.removeProperty(
                    "visibility"
                );

                host.style.removeProperty(
                    "opacity"
                );

                host.style.removeProperty(
                    "pointer-events"
                );

            }
            else {

                host.classList.add(
                    "sky-share-book-layout-pending"
                );

                host.style.setProperty(
                    "visibility",
                    "hidden",
                    "important"
                );

                host.style.setProperty(
                    "opacity",
                    "0",
                    "important"
                );

                host.style.setProperty(
                    "pointer-events",
                    "none",
                    "important"
                );
            }
        }


        if (viewer) {

            if (visible) {

                viewer.classList.remove(
                    "sky-share-book-layout-pending"
                );

                viewer.style.removeProperty(
                    "visibility"
                );

                viewer.style.removeProperty(
                    "opacity"
                );

                viewer.style.removeProperty(
                    "pointer-events"
                );

            }
            else {

                viewer.classList.add(
                    "sky-share-book-layout-pending"
                );

                viewer.style.setProperty(
                    "visibility",
                    "hidden",
                    "important"
                );

                viewer.style.setProperty(
                    "opacity",
                    "0",
                    "important"
                );

                viewer.style.setProperty(
                    "pointer-events",
                    "none",
                    "important"
                );
            }
        }
    }


    /* =====================================================
       RESPONSIVE READER REFRESH
    ===================================================== */

    function scheduleBookResponsiveRefresh(
        delay = 100
    ) {

        if (!isBookShare()) {
            return;
        }


        if (
            shell &&
            shell.classList.contains(
                "sky-share-document-closed"
            )
        ) {
            return;
        }


        if (
            !window.Reader ||
            typeof Reader.refresh !==
                "function"
        ) {
            return;
        }


        if (bookResizeTimer) {

            clearTimeout(
                bookResizeTimer
            );

            bookResizeTimer =
                null;
        }


        bookResizeTimer =
            setTimeout(
                function () {

                    bookResizeTimer =
                        null;


                    if (bookResizeRaf) {

                        cancelAnimationFrame(
                            bookResizeRaf
                        );
                    }


                    bookResizeRaf =
                        requestAnimationFrame(
                            function () {

                                bookResizeRaf =
                                    0;


                                if (
                                    !isBookShare() ||
                                    (
                                        shell &&
                                        shell.classList.contains(
                                            "sky-share-document-closed"
                                        )
                                    )
                                ) {
                                    return;
                                }


                                if (!mediaHost) {
                                    return;
                                }


                                const rect =
                                    mediaHost.getBoundingClientRect();


                                const width =
                                    Math.round(
                                        rect.width
                                    );


                                const height =
                                    Math.round(
                                        rect.height
                                    );


                                if (
                                    width <= 0 ||
                                    height <= 0
                                ) {
                                    return;
                                }


                                const initialLayout =
                                    !bookInitialLayoutReady;


                                /*
                                 * Once the initial layout is visible,
                                 * do not refresh unless the actual
                                 * Share media area changed.
                                 */
                                if (
                                    !initialLayout &&
                                    width ===
                                        bookResponsiveLastWidth &&
                                    height ===
                                        bookResponsiveLastHeight
                                ) {
                                    return;
                                }


                                bookResponsiveLastWidth =
                                    width;


                                bookResponsiveLastHeight =
                                    height;


                                try {

                                    Reader.refresh();

                                }
                                catch (error) {

                                    console.warn(
                                        "[SkyMedia Share] Responsive Reader refresh:",
                                        error
                                    );

                                }


                                updatePageButtons();

                                updateShareBookIndicator();


                                /*
                                 * Only the first layout gets the
                                 * hidden settling sequence.
                                 */
                                if (initialLayout) {

                                    requestAnimationFrame(
                                        function () {

                                            requestAnimationFrame(
                                                function () {

                                                    if (
                                                        !isBookShare() ||
                                                        (
                                                            shell &&
                                                            shell.classList.contains(
                                                                "sky-share-document-closed"
                                                            )
                                                        )
                                                    ) {
                                                        return;
                                                    }


                                                    try {

                                                        Reader.refresh();

                                                    }
                                                    catch (error) {

                                                        console.warn(
                                                            "[SkyMedia Share] Final initial Reader refresh:",
                                                            error
                                                        );

                                                    }


                                                    updatePageButtons();

                                                    updateShareBookIndicator();


                                                    bookInitialLayoutReady =
                                                        true;


                                                    setBookInitialVisibility(
                                                        true
                                                    );

                                                }
                                            );
                                        }
                                    );
                                }

                            }
                        );

                },
                delay
            );
    }


    function bindBookResponsiveRefresh() {

        if (bookResponsiveRefreshBound) {
            return;
        }


        bookResponsiveRefreshBound =
            true;


        bookResponsiveLastWidth =
            0;


        bookResponsiveLastHeight =
            0;


        /*
         * Window resize handler.
         */
        bookWindowResizeHandler =
            function () {

                scheduleBookResponsiveRefresh(
                    100
                );
            };


        window.addEventListener(
            "resize",
            bookWindowResizeHandler,
            {
                passive: true
            }
        );


        /*
         * Visual viewport resize handler.
         */
        if (
            window.visualViewport
        ) {

            bookVisualResizeHandler =
                function () {

                    scheduleBookResponsiveRefresh(
                        100
                    );
                };


            window.visualViewport.addEventListener(
                "resize",
                bookVisualResizeHandler,
                {
                    passive: true
                }
            );
        }


        /*
         * Only observe the stable Share media host.
         *
         * Do NOT observe #viewerArea or .sky-share-main.
         */
        if (
            typeof ResizeObserver ===
                "function" &&
            mediaHost
        ) {

            bookResizeObserver =
                new ResizeObserver(
                    function () {

                        scheduleBookResponsiveRefresh(
                            100
                        );
                    }
                );


            bookResizeObserver.observe(
                mediaHost
            );
        }


        /*
         * Guaranteed initial refresh.
         */
        scheduleBookResponsiveRefresh(
            100
        );
    }


    function unbindBookResponsiveRefresh() {

        if (bookResizeTimer) {

            clearTimeout(
                bookResizeTimer
            );

            bookResizeTimer =
                null;
        }


        if (bookResizeRaf) {

            cancelAnimationFrame(
                bookResizeRaf
            );

            bookResizeRaf =
                0;
        }


        if (bookResizeObserver) {

            bookResizeObserver.disconnect();

            bookResizeObserver =
                null;
        }


        if (
            bookWindowResizeHandler
        ) {

            window.removeEventListener(
                "resize",
                bookWindowResizeHandler
            );

            bookWindowResizeHandler =
                null;
        }


        if (
            bookVisualResizeHandler &&
            window.visualViewport
        ) {

            window.visualViewport.removeEventListener(
                "resize",
                bookVisualResizeHandler
            );

            bookVisualResizeHandler =
                null;
        }


        bookResponsiveRefreshBound =
            false;


        bookResponsiveLastWidth =
            0;


        bookResponsiveLastHeight =
            0;
    }


    /* =====================================================
       BOOK
    ===================================================== */

    async function prepareBook(item) {

        if (
            !window.Reader ||
            typeof Reader.open !==
                "function"
        ) {

            throw new Error(
                "Share Mode: Reader.open() unavailable."
            );
        }


        const viewer =
            document.getElementById(
                "viewerArea"
            );


        if (!viewer) {

            throw new Error(
                "Share Mode: #viewerArea not found."
            );
        }


        /*
         * Hide complete Share media surface BEFORE Reader.open().
         * This prevents the initial PageFlip frame from flashing.
         */
        bookInitialLayoutReady =
            false;


        setBookInitialVisibility(
            false
        );


        await Reader.open(
            item
        );


        /*
         * Move the Reader surface once.
         */
        moveIntoShareHost(
            viewer
        );


        viewer.classList.add(
            "sky-share-responsive-book"
        );


        viewer.classList.add(
            "sky-share-book-layout-pending"
        );


        viewer.classList.add(
            "sky-share-mounted-viewer"
        );


        /*
         * Move toolbar.
         */
        const toolbar =
            document.getElementById(
                "toolbar"
            );


        if (toolbar) {

            moveIntoShareHost(
                toolbar
            );
        }


        /*
         * Move status bar.
         */
        const status =
            document.getElementById(
                "statusBar"
            );


        if (status) {

            moveIntoShareHost(
                status
            );


            status.hidden =
                false;

            status.removeAttribute(
                "aria-hidden"
            );

            status.style.removeProperty(
                "visibility"
            );

            status.style.removeProperty(
                "opacity"
            );

            status.style.removeProperty(
                "display"
            );


            const readerTitle =
                document.getElementById(
                    "readerTitle"
                );


            if (readerTitle) {

                readerTitle.hidden =
                    false;

                readerTitle.removeAttribute(
                    "aria-hidden"
                );

                readerTitle.style.removeProperty(
                    "display"
                );

                readerTitle.style.removeProperty(
                    "visibility"
                );

                readerTitle.style.removeProperty(
                    "opacity"
                );
            }


            const pageIndicator =
                document.getElementById(
                    "pageIndicator"
                );


            if (pageIndicator) {

                pageIndicator.hidden =
                    false;

                pageIndicator.removeAttribute(
                    "aria-hidden"
                );

                pageIndicator.style.removeProperty(
                    "display"
                );

                pageIndicator.style.removeProperty(
                    "visibility"
                );

                pageIndicator.style.removeProperty(
                    "opacity"
                );
            }


            const pageJump =
                document.getElementById(
                    "pageJump"
                );


            if (pageJump) {

                pageJump.style.removeProperty(
                    "display"
                );

                pageJump.style.removeProperty(
                    "visibility"
                );
            }
        }


        /*
         * Welcome banner.
         */
        const welcome =
            document.querySelector(
                ".sr-welcome-banner"
            );


        if (welcome) {

            moveIntoShareHost(
                welcome
            );
        }


        /*
         * Reader navigation ownership.
         */
        if (window.SRNavigation) {

            if (
                typeof SRNavigation.initialize ===
                    "function"
            ) {

                SRNavigation.initialize();
            }


            if (
                typeof SRNavigation.setCurrentBook ===
                    "function"
            ) {

                SRNavigation.setCurrentBook(
                    item
                );
            }
        }


        bindBookControls();

        bindBookGestures();

        bindLastPageProtection();


        updateMuteIcon();

        updatePageButtons();


        if (
            typeof window.updatePageIndicator ===
                "function"
        ) {

            window.updatePageIndicator();
        }


        updateShareBookIndicator();


        /*
         * One ordinary Reader refresh before responsive
         * monitoring takes over.
         */
        requestAnimationFrame(
            function () {

                if (
                    window.Reader &&
                    typeof Reader.refresh ===
                        "function"
                ) {

                    try {

                        Reader.refresh();

                    }
                    catch (error) {

                        console.warn(
                            "[SkyMedia Share] Initial Reader refresh:",
                            error
                        );
                    }
                }


                updatePageButtons();

                updateShareBookIndicator();
            }
        );


        attachBookZoom();


        setTimeout(
            attachBookZoom,
            150
        );


        setTimeout(
            attachBookZoom,
            600
        );
    }


    /* =====================================================
       BOOK ZOOM
    ===================================================== */

    function attachBookZoom() {

        if (!window.SkyMediaZoom) {
            return;
        }


        const viewer =
            document.getElementById(
                "viewerArea"
            );


        if (!viewer) {
            return;
        }


        const target =
            viewer.querySelector(
                ".stf__parent"
            ) ||
            document.getElementById(
                "pageContainer"
            ) ||
            viewer;


        if (
            bookZoomController &&
            bookZoomTarget === target
        ) {

            return;
        }


        if (bookZoomController) {

            bookZoomController.destroy();

            bookZoomController =
                null;
        }


        bookZoomController =
            SkyMediaZoom.create(
                viewer
            );


        bookZoomController.setTarget(
            target
        );


        bookZoomTarget =
            target;
    }


    function detachBookZoom() {

        if (bookZoomController) {

            bookZoomController.destroy();

            bookZoomController =
                null;

            bookZoomTarget =
                null;
        }
    }


    /* =====================================================
       VIDEO / SLIDESHOW CLOSE BRIDGES
    ===================================================== */

    function bindViewerCloseBridges() {

        /*
         * Video.
         */
        if (
            window.VideoViewer &&
            typeof VideoViewer.close ===
                "function"
        ) {

            if (
                !VideoViewer._skyShareOriginalClose
            ) {

                const originalClose =
                    VideoViewer.close;


                VideoViewer._skyShareOriginalClose =
                    originalClose;


                VideoViewer.close =
                    function (...args) {

                        if (
                            started &&
                            isVideoShare() &&
                            !shareClosing &&
                            !shell?.classList.contains(
                                "sky-share-document-closed"
                            )
                        ) {

                            close();

                            return;
                        }


                        return originalClose.apply(
                            this,
                            args
                        );
                    };
            }
        }


        /*
         * Slideshow.
         */
        if (
            window.SlideshowViewer &&
            typeof SlideshowViewer.close ===
                "function"
        ) {

            if (
                !SlideshowViewer._skyShareOriginalClose
            ) {

                const originalClose =
                    SlideshowViewer.close;


                SlideshowViewer._skyShareOriginalClose =
                    originalClose;


                SlideshowViewer.close =
                    function (...args) {

                        if (
                            started &&
                            isSlideshowShare() &&
                            !shareClosing &&
                            !shell?.classList.contains(
                                "sky-share-document-closed"
                            )
                        ) {

                            close();

                            return;
                        }


                        return originalClose.apply(
                            this,
                            args
                        );
                    };
            }
        }
    }


    function bindMediaCloseClickBridge() {

        if (mediaCloseClickBound) {
            return;
        }


        mediaCloseClickBound =
            true;


        document.addEventListener(
            "click",
            function (event) {

                if (!started) {
                    return;
                }


                if (shareClosing) {
                    return;
                }


                if (
                    shell &&
                    shell.classList.contains(
                        "sky-share-document-closed"
                    )
                ) {
                    return;
                }


                if (
                    !isVideoShare() &&
                    !isSlideshowShare()
                ) {
                    return;
                }


                const target =
                    event.target;


                if (
                    !target ||
                    !target.closest
                ) {
                    return;
                }


                const button =
                    target.closest(
                        "button, a, [role='button'], [data-action]"
                    );


                if (!button) {
                    return;
                }


                const metadata =
                    [
                        button.id,
                        button.className,
                        button.getAttribute(
                            "aria-label"
                        ),
                        button.getAttribute(
                            "title"
                        ),
                        button.getAttribute(
                            "data-action"
                        )
                    ]
                    .filter(Boolean)
                    .join(" ");


                if (
                    /fullscreen/i.test(
                        metadata
                    )
                ) {
                    return;
                }


                if (
                    !/close/i.test(
                        metadata
                    )
                ) {
                    return;
                }


                event.preventDefault();
                event.stopPropagation();


                if (
                    typeof event.stopImmediatePropagation ===
                        "function"
                ) {

                    event.stopImmediatePropagation();
                }


                close();

            },
            true
        );
    }


    /* =====================================================
       VIDEO
    ===================================================== */

    /* =====================================================
   VIDEO
===================================================== */

async function prepareVideo(item) {

    if (
        window.VideoLibrary &&
        typeof VideoLibrary.init === "function"
    ) {

        VideoLibrary.init();

        if (
            typeof VideoLibrary.load === "function" &&
            window.Manifest &&
            typeof Manifest.videos === "function"
        ) {

            VideoLibrary.load(
                Manifest.videos()
            );
        }
    }


    const viewer =
        document.getElementById(
            "videoViewer"
        );


    if (!viewer) {

        throw new Error(
            "Share Mode: #videoViewer not found."
        );
    }


    if (
        window.VideoViewer &&
        typeof VideoViewer.init === "function"
    ) {

        VideoViewer.init();
    }


    moveIntoShareHost(
        viewer
    );


    if (
        !window.VideoViewer ||
        typeof VideoViewer.openVideo !== "function"
    ) {

        throw new Error(
            "Share Mode: VideoViewer.openVideo() unavailable."
        );
    }


    await VideoViewer.openVideo(
        item
    );

    await waitForSharedVideoReady(
        item
    );


    bindViewerCloseBridges();

    bindMediaCloseClickBridge();
}


    /* =====================================================
       SLIDESHOW
    ===================================================== */

    async function prepareSlideshow(item) {

    if (typeof SlideshowLibrary === "undefined") {
        throw new Error("Share Mode: SlideshowLibrary unavailable.");
    }

    if (typeof SlideshowViewer === "undefined") {
        throw new Error("Share Mode: SlideshowViewer unavailable.");
    }

    if (typeof SlideshowLibrary.init === "function") {
        SlideshowLibrary.init();
    }

    if (
        typeof Manifest !== "undefined" &&
        Manifest.slideshows &&
        typeof Manifest.slideshows.load === "function"
    ) {
        await Manifest.slideshows.load();
    }

    if (typeof SlideshowViewer.init === "function") {
        const initialized = SlideshowViewer.init();

        if (initialized === false) {
            throw new Error(
                "Share Mode: SlideshowViewer could not initialize."
            );
        }
    }

    if (
        typeof SlideshowUI !== "undefined" &&
        typeof SlideshowUI.init === "function"
    ) {
        SlideshowUI.init();
    }

    const viewer = document.getElementById("slideshowViewer");

    if (!viewer) {
        throw new Error("Share Mode: #slideshowViewer not found.");
    }

    /*
     * The Worker catalog supplies the authoritative ContentContract
     * representation:
     *
     *     media: [...]
     *
     * SlideshowViewer, however, operates on the runtime slideshow
     * representation:
     *
     *     source: "images"
     *     slides: [{ image: "..." }, ...]
     *
     * Use the existing SlideshowContract compatibility layer rather
     * than duplicating that conversion here.
     */
    let slideshowItem = item;

    if (
        typeof SlideshowContract !== "undefined" &&
        typeof SlideshowContract.normalize === "function"
    ) {
        slideshowItem = SlideshowContract.normalize(item, 0);
    }

    if (!slideshowItem) {
        throw new Error(
            "Share Mode: Unable to normalize slideshow."
        );
    }

    if (
        slideshowItem.source !== "pdf" &&
        (
            !Array.isArray(slideshowItem.slides) ||
            slideshowItem.slides.length === 0
        )
    ) {
        throw new Error(
            "Share Mode: Slideshow contains no usable slides."
        );
    }

    moveIntoShareHost(viewer);

    await SlideshowViewer.open(slideshowItem);
    await waitForSharedSlideshowReady();

    bindViewerCloseBridges();
    bindMediaCloseClickBridge();
}


    /* =====================================================
       OPEN ITEM
    ===================================================== */

    async function openItem(
        item,
        target
    ) {

        const section =
            String(
                target.section ||
                item.type ||
                ""
            ).toLowerCase();


        activeItem =
            item;


        activeTarget =
            target;


        document.body.classList.toggle(
            "sky-share-book",
            section === "reader" ||
            section === "book"
        );


        bookInitialLayoutReady =
            false;


        if (closedPanel) {

            closedPanel.hidden =
                true;

            closedPanel.style.setProperty(
                "display",
                "none",
                "important"
            );
        }


        if (mediaHost) {

            mediaHost.style.removeProperty(
                "display"
            );

            mediaHost.style.removeProperty(
                "visibility"
            );

            mediaHost.style.removeProperty(
                "opacity"
            );

            mediaHost.style.removeProperty(
                "pointer-events"
            );
        }


        if (titleElement) {

            titleElement.style.removeProperty(
                "display"
            );
        }


        if (subtitleElement) {

            subtitleElement.style.removeProperty(
                "display"
            );
        }


        if (statusElement) {

            statusElement.style.removeProperty(
                "display"
            );

            statusElement.style.removeProperty(
                "visibility"
            );

            statusElement.style.removeProperty(
                "opacity"
            );
        }


        shell.classList.remove(
            "sky-share-document-closed"
        );


        restoreShareHeader();

        restoreClosedStateMobileChrome();


        titleElement.textContent =
            String(
                item.title ||
                "Meditation Mornings"
            ).trim();


        subtitleElement.textContent =
            String(
                item.subtitle ||
                ""
            ).trim();


        const sectionElement =
            shell.querySelector(
                ".sky-share-section"
            );


        if (sectionElement) {

            sectionElement.textContent =
                sectionLabel(
                    section
                );
        }


        statusElement.textContent = "";


        if (section === "video") {

            await prepareVideo(
                item
            );

        }
        else if (
            section === "slideshow" ||
            section === "slides"
        ) {

            await prepareSlideshow(
                item
            );

        }
        else if (
            section === "reader" ||
            section === "book"
        ) {

            await prepareBook(
                item
            );

        }
        else {

            throw new Error(
                "Unsupported Share Mode section: " +
                section
            );
        }


        /*
         * Non-books do not use Reader's initial hidden-layout
         * mechanism.
         */
        if (!isBookShare()) {

            setBookInitialVisibility(
                true
            );
        }


        if (
            !isBookShare() &&
            statusElement
        ) {

            statusElement.textContent =
                "";
        }
    }


    /* =====================================================
       START
    ===================================================== */

    async function start(
    item,
    target
) {

    if (started) {
        return;
    }


    if (!item) {

        throw new Error(
            "Share Mode: no item supplied."
        );
    }


    if (!target) {

        throw new Error(
            "Share Mode: no target supplied."
        );
    }


    started =
        true;


    activeItem =
        item;


    activeTarget =
        target;


    try {

        createShell();

        startShareLoading();


        bindEscape();

        bindFullscreenChange();


        /*
         * Do NOT bind last-page protection yet.
         *
         * The Reader surface does not exist in Share Mode
         * until prepareBook() runs.
         */
        await openItem(
            item,
            target
        );


        isolateApplication();


        /*
         * Loading is finished only after the shared item has
         * successfully prepared.
         */
        stopShareLoading();


        /*
         * Reader-specific post-isolation setup.
         */
        if (isBookShare()) {

            const status =
                document.getElementById(
                    "statusBar"
                );


            if (status) {

                status.hidden =
                    false;

                status.removeAttribute(
                    "aria-hidden"
                );

                status.style.removeProperty(
                    "display"
                );

                status.style.removeProperty(
                    "visibility"
                );

                status.style.removeProperty(
                    "opacity"
                );
            }


            updatePageButtons();

            updateShareBookIndicator();


            /*
             * Start responsive monitoring only after the
             * final Share layout exists.
             */
            bindBookResponsiveRefresh();
        }


        bindControlsIdleTimer();


        shell.style.zIndex =
            "999999";

    }
    catch (error) {

        started =
            false;


        console.error(
            "[SkyMedia Share] STARTUP FAILED:",
            error
        );


        stopShareLoading();


        if (statusElement) {

            statusElement.textContent =
                error?.message ||
                "Unable to open shared item.";
        }


        throw error;
    }
}


    /* =====================================================
       PUBLIC API
    ===================================================== */

    return {

        start,

        close,

        isStarted() {

            return started;
        },

        getItem() {

            return activeItem;
        },

        getTarget() {

            return activeTarget;
        }
    };

})();