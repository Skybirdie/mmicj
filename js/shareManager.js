"use strict";

window.ShareManager = (function () {

    const CONTRACT_PARAM = "contractz";
    const SECTION_PARAM = "section";
    const ID_PARAM = "id";

    const SHARE_PRIME_PATH =
        "/__sky_share_prime";


    /* =====================================================
       SECTION NORMALIZATION
    ===================================================== */

    function normalizeSection(section) {

        const value =
            String(section || "")
                .trim()
                .toLowerCase();

        if (
            value === "book" ||
            value === "books" ||
            value === "reader" ||
            value === "pdf" ||
            value === "pdfs"
        ) {
            return "reader";
        }

        if (
            value === "video" ||
            value === "videos"
        ) {
            return "video";
        }

        if (
            value === "slideshow" ||
            value === "slideshows" ||
            value === "slide" ||
            value === "slides"
        ) {
            return "slideshow";
        }

        return value;
    }


    /* =====================================================
       STRING / MEDIA NORMALIZATION
    ===================================================== */

    function cleanString(value) {

        if (
            value === null ||
            value === undefined
        ) {
            return "";
        }

        return String(value).trim();
    }


    function normalizeMedia(media) {

        if (Array.isArray(media)) {

            return media
                .map(cleanString)
                .filter(Boolean);
        }

        return cleanString(media);
    }


    /* =====================================================
       ONE-ITEM SHARE CONTRACT
    ===================================================== */

    function buildMinimalItem(item) {

        if (
            !item ||
            typeof item !== "object"
        ) {
            return null;
        }

        const result = {

            id:
                cleanString(item.id),

            type:
                cleanString(item.type)
                    .toLowerCase(),

            title:
                cleanString(item.title),

            subtitle:
                cleanString(item.subtitle),

            thumbnail:
                cleanString(item.thumbnail),

            media:
                normalizeMedia(item.media),

            audio:
                cleanString(item.audio),

            author:
                cleanString(item.author),

            category:
                cleanString(item.category),

            date:
                cleanString(item.date)
        };

        if (
            item.dateAdd !== undefined &&
            item.dateAdd !== null &&
            cleanString(item.dateAdd)
        ) {

            result.dateAdd =
                cleanString(
                    item.dateAdd
                );
        }

        return result;
    }


    /* =====================================================
       SR2 ENCODE
    ===================================================== */

    function encodeSelectedItem(item) {

        if (
            !window.GlideContract ||
            !GlideContract.codec ||
            typeof GlideContract.codec.encode !==
                "function"
        ) {

            throw new Error(
                "GlideContract SR2 codec is not available."
            );
        }

        const minimalItem =
            buildMinimalItem(item);

        if (
            !minimalItem ||
            !minimalItem.id
        ) {

            throw new Error(
                "Cannot create share link: selected item has no id."
            );
        }

        return GlideContract.codec.encode(
            [minimalItem]
        );
    }


    /* =====================================================
       PRIME WORKER


       The browser sends     
       section,
       id,
       item
       and returns:

           /s/<key>
    ===================================================== */

    async function primeShare(
        item,
        section,
        id
    ) {

        const endpoint =
            new URL(
                SHARE_PRIME_PATH,
                window.location.origin
            );

        const minimalItem =
            buildMinimalItem(item);

        if (!minimalItem || !minimalItem.id) {

            throw new Error(
                "Cannot create share link: selected item has no id."
            );
        }

        const response =
            await fetch(
                endpoint.toString(),
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            section:
                                normalizeSection(section),

                            id:
                                cleanString(id),

                            item:
                                minimalItem
                        })
                }
            );

        if (!response.ok) {

            let message =
                "Share link could not be created.";

            try {

                const data =
                    await response.json();

                if (data && data.error) {
                    message = data.error;
                }

            } catch (_) {}

            throw new Error(message);
        }

        const data =
            await response.json();

        if (!data || !data.url) {

            throw new Error(
                "Share server did not return a share URL."
            );
        }

        return String(data.url);
    }

    /* =====================================================
       BUILD SHARE URL

       Kept as an async public function for compatibility
       with any existing code that may call ShareManager.buildUrl().
    ===================================================== */

    async function buildUrl(
    section,
    id,
    item
) {

    const normalizedSection =
        normalizeSection(
            section
        );

    const normalizedId =
        cleanString(id);

    if (!normalizedSection) {

        throw new Error(
            "Cannot create share link: section is missing."
        );
    }

    if (!normalizedId) {

        throw new Error(
            "Cannot create share link: item id is missing."
        );
    }

    /*
     * The permanent URL is still the clean canonical route:
     *
     *     /s/<section>/<id>
     *
     * Before returning it, register the exact selected item in
     * the Worker's direct-share KV record. This is important
     * when an item has just been renamed: the new ID may not
     * yet exist in the published catalog, but the share link
     * must work immediately from the item that was actually
     * selected.
     *
     * The KV record is keyed by section + ID, so the new ID is
     * completely independent of the old ID.
     */
    return primeShare(
        item,
        normalizedSection,
        normalizedId
    );
}


    /* =====================================================
       LINK COPIED FEEDBACK

       A brief centered link-copied.gif over the current
       screen whenever a share link is copied to the
       clipboard. Native share (navigator.share) hands off to
       the OS share sheet instead of copying, so it does not
       trigger this - only the clipboard path below does.
    ===================================================== */

    const LINK_COPIED_IMAGE_ID = "skyLinkCopiedFeedback";
    const LINK_COPIED_IMAGE_SRC = "assets/link-copied.gif";
    const LINK_COPIED_VISIBLE_MS = 1100;

    let linkCopiedHideTimer = null;

    function getLinkCopiedElement() {

        let el = document.getElementById(
            LINK_COPIED_IMAGE_ID
        );

        if (el) {
            return el;
        }

        el = document.createElement("img");

        el.id = LINK_COPIED_IMAGE_ID;
        el.alt = "Link copied";
        el.setAttribute("aria-hidden", "true");

        document.body.appendChild(el);

        return el;
    }

    function showLinkCopiedFeedback() {

        if (
            typeof document === "undefined" ||
            !document.body
        ) {

            return;
        }

        const el = getLinkCopiedElement();

        if (linkCopiedHideTimer) {

            clearTimeout(linkCopiedHideTimer);
            linkCopiedHideTimer = null;
        }

        /*
         * Reset the src on every trigger so the GIF restarts
         * from its first frame on repeated, rapid share taps
         * instead of staying frozen on its last frame.
         */

        el.classList.remove("visible");
        el.src = "";
        el.src = LINK_COPIED_IMAGE_SRC;

        requestAnimationFrame(() => {

            el.classList.add("visible");
        });

        linkCopiedHideTimer = setTimeout(() => {

            el.classList.remove("visible");
            linkCopiedHideTimer = null;

        }, LINK_COPIED_VISIBLE_MS);
    }


    /* =====================================================
       SILENT CLIPBOARD

       IMPORTANT:
       NO alert().
       NO browser popup.
    ===================================================== */

    async function copyToClipboard(
        text
    ) {

        if (
            navigator.clipboard &&
            typeof navigator.clipboard.writeText ===
                "function"
        ) {

            try {

                await navigator.clipboard.writeText(
                    text
                );

                return true;

            } catch (error) {

                console.warn(
                    "[ShareManager] Clipboard API failed:",
                    error
                );
            }
        }

        try {

            const textarea =
                document.createElement(
                    "textarea"
                );

            textarea.value =
                text;

            textarea.setAttribute(
                "readonly",
                ""
            );

            textarea.style.position =
                "fixed";

            textarea.style.left =
                "-9999px";

            textarea.style.top =
                "0";

            document.body.appendChild(
                textarea
            );

            textarea.select();

            const copied =
                document.execCommand(
                    "copy"
                );

            textarea.remove();

            return copied;

        } catch (error) {

            console.warn(
                "[ShareManager] Clipboard fallback failed:",
                error
            );

            return false;
        }
    }


    /* =====================================================
       SHARE
    ===================================================== */

    async function share(
        section,
        item
    ) {

        if (
            !item ||
            typeof item !== "object"
        ) {

            throw new Error(
                "Cannot share: selected item is missing."
            );
        }

        const normalizedSection =
            normalizeSection(
                section
            );

        if (!normalizedSection) {

            throw new Error(
                "Cannot share: section is missing."
            );
        }

        if (
            !cleanString(item.id)
        ) {

            throw new Error(
                "Cannot share: selected item has no id."
            );
        }

        const url =
            await buildUrl(
                normalizedSection,
                item.id,
                item
            );

        const title =
            cleanString(
                item.title
            ) ||
            "SkyMedia";

        /* -------------------------------------------------
           Native share
        ------------------------------------------------- */

        if (
            navigator.share &&
            typeof navigator.share ===
                "function"
        ) {

            try {

                await navigator.share({
                    title,
                    text: title,
                    url
                });

                return url;

            } catch (error) {

                /*
                 * A user cancellation is not an error
                 * for our purposes. Fall through to the
                 * silent clipboard path.
                 */

                console.log(
                    "[ShareManager] Native share was not completed."
                );
            }
        }

        /* -------------------------------------------------
           Clipboard fallback

           NO alert.
        ------------------------------------------------- */

        const copied =
            await copyToClipboard(
                url
            );

        if (copied) {

            /*
             * No alert/prompt - showLinkCopiedFeedback()
             * plays link-copied.gif as the visible
             * confirmation instead.
             */

            console.info(
                "[ShareManager] Share link copied."
            );

            showLinkCopiedFeedback();

            return url;
        }

        /*
         * Do not use window.prompt().
         * Do not use alert().
         *
         * Return the URL so callers can still handle it.
         */

        console.warn(
            "[ShareManager] Could not copy share link:",
            url
        );

        return url;
    }


    /* =====================================================
       READ SHARE TARGET

       New short links:
           /s/<section>/<id>

       Worker bootstrap supplies:
           window.__SKY_SHARE_TARGET

       Legacy links still supported:
           ?contractz=...&section=...&id=...
    ===================================================== */

    function readTarget() {

        if (
            window.__SKY_SHARE_TARGET &&
            typeof window.__SKY_SHARE_TARGET ===
                "object"
        ) {

            const target =
                window.__SKY_SHARE_TARGET;

            const section =
                normalizeSection(
                    target.section
                );

            const id =
                cleanString(
                    target.id
                );

            if (
                section &&
                id
            ) {

                return {

                    section,
                    id,

                    contract:
                        window.SkyMediaContract ||
                        null,

                    short:
                        true
                };
            }
        }

        const url =
            new URL(
                window.location.href
            );

        return {

            section:
                normalizeSection(
                    url.searchParams.get(
                        SECTION_PARAM
                    )
                ),

            id:
                cleanString(
                    url.searchParams.get(
                        ID_PARAM
                    )
                ),

            contract:
                url.searchParams.get(
                    CONTRACT_PARAM
                ),

            short:
                false
        };
    }


    /* =====================================================
       SHARE DEEP LINK DETECTION
    ===================================================== */

    function isShareDeepLink() {

        const target =
            readTarget();

        return !!(
            target.section &&
            target.id &&
            (
                target.contract ||
                target.short
            )
        );
    }


function isShareMode() {

    if (window.__SKY_SHARE_MODE === true) {
        return true;
    }

    return isShareDeepLink();
}


    /* =====================================================
       SECTION → MANIFEST TYPE
    ===================================================== */

    function sectionType(
        section
    ) {

        const normalized =
            normalizeSection(
                section
            );

        if (
            normalized ===
            "reader"
        ) {
            return "book";
        }

        if (
            normalized ===
            "video"
        ) {
            return "video";
        }

        if (
            normalized ===
            "slideshow"
        ) {
            return "slideshow";
        }

        return normalized;
    }


    /* =====================================================
       FIND ITEM IN MANIFEST
    ===================================================== */

    function findManifestItem(
        target
    ) {

        if (!window.Manifest) {
            return null;
        }

        const wantedId =
            cleanString(
                target.id
            );

        if (!wantedId) {
            return null;
        }

        const type =
            sectionType(
                target.section
            );

        if (
            typeof Manifest.content ===
                "function"
        ) {

            try {

                const items =
                    Manifest.content(
                        type
                    );

                if (
                    Array.isArray(items)
                ) {

                    const match =
                        items.find(
                            item =>
                                item &&
                                cleanString(
                                    item.id
                                ) ===
                                wantedId
                        );

                    if (match) {
                        return match;
                    }
                }

            } catch (error) {

                console.warn(
                    "[ShareManager] Manifest.content lookup failed:",
                    error
                );
            }
        }

        if (
            typeof Manifest.all ===
                "function"
        ) {

            try {

                const items =
                    Manifest.all();

                if (
                    Array.isArray(items)
                ) {

                    const match =
                        items.find(
                            item =>
                                item &&
                                cleanString(
                                    item.id
                                ) ===
                                wantedId
                        );

                    if (match) {
                        return match;
                    }
                }

            } catch (error) {

                console.warn(
                    "[ShareManager] Manifest.all lookup failed:",
                    error
                );
            }
        }

        return null;
    }


    /* =====================================================
       WAIT FOR MANIFEST
    ===================================================== */

    function waitForManifestItem(
        target,
        timeoutMs = 10000
    ) {

        return new Promise(
            resolve => {

                const startedAt =
                    Date.now();

                function check() {

                    const item =
                        findManifestItem(
                            target
                        );

                    if (item) {

                        resolve(item);
                        return;
                    }

                    if (
                        Date.now() -
                        startedAt >=
                        timeoutMs
                    ) {

                        resolve(null);
                        return;
                    }

                    window.setTimeout(
                        check,
                        50
                    );
                }

                check();
            }
        );
    }


    /* =====================================================
       WAIT FOR SHARE VIEWER
    ===================================================== */

    function waitForShareViewer(
        timeoutMs = 10000
    ) {

        return new Promise(
            resolve => {

                const startedAt =
                    Date.now();

                function check() {

                    if (
                        window.ShareViewer &&
                        typeof ShareViewer.start ===
                            "function"
                    ) {

                        resolve(true);
                        return;
                    }

                    if (
                        Date.now() -
                        startedAt >=
                        timeoutMs
                    ) {

                        resolve(false);
                        return;
                    }

                    window.setTimeout(
                        check,
                        50
                    );
                }

                check();
            }
        );
    }


    /* =====================================================
       START SHARE MODE
    ===================================================== */

    async function startShareMode(
        item,
        target
    ) {

        const available =
            await waitForShareViewer(
                10000
            );

        if (!available) {

            console.error(
                "[ShareManager] ShareViewer.start() did not become available."
            );

            return false;
        }

        try {

            await ShareViewer.start(
                item,
                {
                    section:
                        target.section,

                    id:
                        target.id
                }
            );

            return true;

        } catch (error) {

            console.error(
                "[ShareManager] ShareViewer.start() failed:",
                error
            );

            return false;
        }
    }


    /* =====================================================
       OPEN DEEP LINK
    ===================================================== */

    async function openDeepLink() {

        const target =
            readTarget();

        if (
            !target.section ||
            !target.id
        ) {

            return false;
        }

        if (
            openDeepLink._promise
        ) {

            return openDeepLink._promise;
        }

        openDeepLink._promise =
            (async function () {

                const item =
                    await waitForManifestItem(
                        target,
                        10000
                    );

                if (!item) {

                    console.error(
                        "[ShareManager] Shared item was not found in Manifest:",
                        target
                    );

                    return false;
                }

                return await startShareMode(
                    item,
                    target
                );

            })();

        try {

            return await
                openDeepLink._promise;

        } finally {

            openDeepLink._promise =
                null;
        }
    }


    return {

        normalizeSection,

        buildMinimalItem,

        encodeSelectedItem,

        buildUrl,

        share,

        readTarget,

        isShareDeepLink,

        isShareMode,

        openDeepLink
    };

})();