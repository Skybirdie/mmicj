"use strict";

/* =========================================================
   SkyMedia Front Page

   Seven-category portal.  The Front Page reads the SAME
   normalized collection published by Manifest; it does not
   maintain a second copy of the content data.

   Category order is supplied by content.json / Glide under
   frontPage.categories.  The seven values below are the safe
   fallback when that configuration is absent.
   ========================================================= */
window.FrontPage = (function () {
    const DEFAULT_CATEGORIES = [
        "Book Club",
        "Affirmations",
        "Feed My Sheep",
        "BYOB",
        "Sayings",
        "Meditation",
        "Testimonies"
    ];

    /* =========================================================
       Centerpiece labels

       These labels are used ONLY by the center door.
       Peripheral category doors continue to display the
       actual category name.
       ========================================================= */
    const CENTERPIECE_LABELS = {
        "Meditation": "Meditation Mondays",
        "Book Club": "Book Club Tuesdays",
        "Affirmations": "We Affirm Wednesdays",
        "Feed My Sheep": "Feed My Sheep Fridays",
        "BYOB": "BYOB Sundays",
        "Sayings": "Sayings Saturdays",
        "Testimonies": "Testimony Thursdays"
    };

    const TOP_POSITIONS = ["top-left", "top-middle", "top-right"];
    const BOTTOM_POSITIONS = ["bottom-left", "bottom-middle", "bottom-right"];

    let initialized = false;
    let categories = [...DEFAULT_CATEGORIES];
    let root = null, stage = null, topWave = null, wave = null, mediaHost = null;

    function configuredCategories() {
        const values = window.Manifest && typeof Manifest.frontPageCategories === "function"
            ? Manifest.frontPageCategories()
            : null;

        if (values && values.length === 7) {
            const cleaned = values
                .map(v => String(v || "").trim())
                .filter(Boolean);

            if (cleaned.length === 7) return cleaned;
        }

        return [...DEFAULT_CATEGORIES];
    }

    function getCategories() {
        return [...categories];
    }

    function setCategories(values) {
        if (!Array.isArray(values) || values.length !== 7) {
            throw new Error("Front Page requires exactly seven categories.");
        }

        categories = values.map(v => String(v || "").trim());
        render();
    }

    function syncCategoriesFromManifest() {
        const next = configuredCategories();

        if (next.length === 7) {
            categories = next;
        }
    }

    /* =========================================================
       Return the presentation label for the centerpiece.

       Matching is case-insensitive so "Meditation",
       "meditation", or "MEDITATION" all resolve correctly.
       ========================================================= */
    function getCenterpieceLabel(category) {
        const key = String(category || "").trim();

        if (!key) return "Category";

        const match = Object.keys(CENTERPIECE_LABELS).find(
            name => name.toLowerCase() === key.toLowerCase()
        );

        return match ? CENTERPIECE_LABELS[match] : key;
    }

    function normalizeItem(item, section) {
        if (!item || typeof item !== "object") return null;

        const category = String(item.category || "").trim();

        if (!category) return null;

        function cleanUrl(value){
            if(value == null) return "";
            let url=String(value).trim();
            if(!url) return "";
            const match=url.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            return (match ? (match[2] || match[1] || "") : url).trim();
        }

        const thumbnail =
            cleanUrl(item.thumbnail) ||
            cleanUrl(item.cover) ||
            cleanUrl(item.slides?.[0]?.image) ||
            cleanUrl(Array.isArray(item.media) ? item.media[0] : item.media) ||
            "assets/default-thumbnail.png";

        return {
            id: String(item.id || "").trim(),
            title: String(item.title || "Untitled").trim(),
            category,
            thumbnail,
            date: window.SkyDate
                ? SkyDate.key(item.date)
                : String(item.date || "").trim(),
            section,
            raw: item
        };
    }

    function collectItems() {
        /*
         * The unified Manifest is the primary source.  Importantly, an
         * empty Manifest is NOT treated as a valid empty result while the
         * application is still booting: the section libraries may already
         * contain the normalized data in that situation.  We therefore use
         * the libraries as a compatibility fallback only when Manifest.all()
         * is empty.
         */
        let items = [];

        if (window.Manifest && typeof Manifest.all === "function") {
            const manifestItems = Manifest.all();

            if (Array.isArray(manifestItems) && manifestItems.length) {
                items = manifestItems
                    .map(item => normalizeItem(
                        item,
                        item.type === "book" ? "reader" : item.type
                    ))
                    .filter(Boolean);
            }
        }

        if (!items.length) {
            if (window.SkyReader && Array.isArray(SkyReader.library)) {
                SkyReader.library.forEach(i => {
                    const n = normalizeItem(i, "reader");
                    if (n) items.push(n);
                });
            }

            if (window.VideoLibrary && typeof VideoLibrary.getVideos === "function") {
                VideoLibrary.getVideos().forEach(i => {
                    const n = normalizeItem(i, "video");
                    if (n) items.push(n);
                });
            }

            if (window.SlideshowLibrary &&
                typeof SlideshowLibrary.getSlideshows === "function") {

                SlideshowLibrary.getSlideshows().forEach(i => {
                    const n = normalizeItem(i, "slideshow");
                    if (n) items.push(n);
                });
            }
        }

        return items.filter(item =>
            !window.SkyDate || SkyDate.isVisible(item.date)
        );
    }

    function newest(items) {
        return items.reduce((best, item) => {
            if (!best) return item;

            const itemDate = String(item.raw?.date || item.date || "");
            const bestDate = String(best.raw?.date || best.date || "");

            return itemDate > bestDate ? item : best;
        }, null);
    }

    function shuffle(items) {
        const result = [...items];

        for (let i = result.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [result[i], result[j]] = [result[j], result[i]];
        }

        return result;
    }

    function resolveDoors() {
        syncCategoriesFromManifest();

        const all = collectItems();

        const categoryEntries = categories.map(category => ({
            category,
            item: newest(all.filter(item =>
                item.category.toLowerCase() === category.toLowerCase()
            ))
        }));

        const available = categoryEntries.filter(e => e.item);

        const centerpieceItem = newest(
            available.map(e => e.item)
        );

        const centerEntry =
            available.find(e => e.item === centerpieceItem) || null;

        const centerCategory = centerEntry?.category || null;

        const peripheralEntries = shuffle(
            categoryEntries.filter(e => e.category !== centerCategory)
        );

        return {
            center: centerEntry,
            peripheral: peripheralEntries,
            categoryEntries
        };
    }

    function createDoor(entry, position, centerpiece = false) {
        const button = document.createElement("button");

        button.type = "button";
        button.className =
            "front-door" +
            (centerpiece ? " front-door-center" : "");

        button.dataset.frontPosition = position;
        button.dataset.frontCategory = entry?.category || "";

        button.setAttribute(
            "aria-label",
            entry?.item
                ? `${entry.category}: ${entry.item.title}`
                : `${entry?.category || position} category door`
        );

        /* =====================================================
           Centerpiece media

           UNCHANGED — this is the existing FrontMediaRenderer
           path that displays the selected content.
           ===================================================== */
        if (entry?.item && centerpiece) {
            const host = document.createElement("div");

            host.id = "frontMediaHost";
            host.className = "front-media-host";

            button.appendChild(host);
            mediaHost = host;

            if (window.FrontMediaRenderer) {
                FrontMediaRenderer.init(host);
                FrontMediaRenderer.render(entry.item);
            }

        } else if (entry?.item) {

            const img = document.createElement("img");

            img.src = entry.item.thumbnail;
            img.alt = "";
            img.draggable = false;

            img.onerror = () => {
                img.src = "assets/default-thumbnail.png";
            };

            button.appendChild(img);

            button.addEventListener("click", () => openItem(entry.item));

        } else {

            button.classList.add("is-empty");
        }

        /* =====================================================
           Label

           ONLY the centerpiece receives the custom
           CENTERPIECE_LABELS value.

           All other doors continue using their category name.
           ===================================================== */

const label = document.createElement("span");
label.className = "front-door-label";

if (!centerpiece) {
    label.textContent = entry?.category || "Category";
    button.appendChild(label);
}

        return button;
    }





    function openItem(item) {
        if (!item || !item.raw) return;

    /*
     * Selecting another Front Page item always ends the
     * currently displayed Front Page media. The background
     * playback preference applies to leaving the Front Page,
     * not to playing multiple Front Page items simultaneously.
     */
    if(
        window.FrontMediaRenderer &&
        typeof FrontMediaRenderer.destroy === "function"
    ){
        FrontMediaRenderer.destroy();
    }


        if (window.AppSwitcher) {
            AppSwitcher.show(item.section);
        }

        requestAnimationFrame(() => {
            try {
                /*
                 * Resolve the item again from the destination section's
                 * authoritative library before opening it. Front Page items
                 * are normalized copies; using their id directly could fail
                 * when a library still contains a numeric id or when its
                 * selection state has not caught up with the manifest.
                 *
                 * The destination section is already visible by this point,
                 * so this handoff is deliberately performed on the next
                 * animation frame after AppSwitcher.show().
                 */

                if (item.section === "reader") {

                    if (!window.Library || typeof Library.select !== "function") {
                        return;
                    }

                    const book =
                        window.SkyReader && Array.isArray(SkyReader.library)
                            ? SkyReader.library.find(book =>
                                String(book?.id ?? "") === String(item.id ?? "")
                            )
                            : null;

                    Library.select(book || item.raw, 1);
                    return;
                }

                if (item.section === "video") {

                    if (!window.VideoLibrary || typeof VideoLibrary.select !== "function") {
                        return;
                    }

                    const videos =
                        typeof VideoLibrary.getVideos === "function"
                            ? VideoLibrary.getVideos()
                            : [];

                    const video = videos.find(candidate =>
                        String(candidate?.id ?? "") === String(item.id ?? "")
                    );

                    VideoLibrary.select(video ? video.id : item.id);
                    return;
                }

                if (item.section === "slideshow") {

                    if (!window.SlideshowLibrary || typeof SlideshowLibrary.select !== "function") {
                        return;
                    }

                    const slideshows =
                        typeof SlideshowLibrary.getSlideshows === "function"
                            ? SlideshowLibrary.getSlideshows()
                            : [];

                    const slideshow = slideshows.find(candidate =>
                        String(candidate?.id ?? "") === String(item.id ?? "")
                    );

                    SlideshowLibrary.select(slideshow ? slideshow.id : item.id);
                }

            } catch (error) {
                console.error(
                    "[FrontPage] Unable to open selected item.",
                    error
                );
            }
        });
    }

    function render() {
        if (!root || !stage || !topWave || !wave) return false;

        try {
            syncCategoriesFromManifest();

const assignments = resolveDoors();

const center = assignments.center || {
    category: categories[0] || "Book Club",
    item: null
};

/*
 * Preserve an actively playing Front Page centerpiece when the
 * user has enabled background media playback and the same item
 * is still assigned to the centerpiece.
 *
 * The Front Page still refreshes normally; we simply preserve the
 * existing centerpiece DOM instead of destroying its media element.
 */
let preservedCenterDoor = null;

if (
    window.FrontMediaRenderer &&
    typeof FrontMediaRenderer.getCurrent === "function" &&
    typeof FrontMediaRenderer.getCurrent() === "object"
) {
    const currentMedia = FrontMediaRenderer.getCurrent();

    const backgroundPlayback =
        window.MediaManager &&
        typeof MediaManager.getBackgroundPlayback === "function" &&
        MediaManager.getBackgroundPlayback();

    if (
        backgroundPlayback &&
        currentMedia &&
        center.item &&
        String(currentMedia.id) === String(center.item.id)
    ) {
        preservedCenterDoor =
            stage.querySelector(".front-door-center");
    }
}

/*
 * Destroy the existing Front Page media only when it is not being
 * preserved. This retains the existing refresh behavior for all
 * non-playing/non-preserved states.
 */
if (!preservedCenterDoor && window.FrontMediaRenderer) {
    FrontMediaRenderer.destroy();
}

mediaHost = null;

stage
    .querySelectorAll(".front-door")
    .forEach(n => {
        if (n !== preservedCenterDoor) {
            n.remove();
        }
    });

topWave.innerHTML = "";
wave.innerHTML = "";

if (preservedCenterDoor) {
    mediaHost =
        preservedCenterDoor.querySelector("#frontMediaHost");
} else {
    const centerDoor =
        createDoor(center, "center", true);

    stage.appendChild(centerDoor);
}

            const peripheral = assignments.peripheral || [];

            [
                ...TOP_POSITIONS,
                ...BOTTOM_POSITIONS
            ].forEach((position, index) => {

                const entry = peripheral[index] || {
                    category:
                        categories.find(
                            c => c !== center.category
                        ) || "Category",
                    item: null
                };

                const target =
                    index < 3
                        ? topWave
                        : wave;

                target.appendChild(
                    createDoor(entry, position, false)
                );
            });

            root.dataset.today =
                window.SkyDate
                    ? SkyDate.nowKey()
                    : "";

            root.dataset.frontDataCount =
                String(collectItems().length);

            root.dataset.frontRendered = "true";

            return true;

        } catch (error) {

            console.error(
                "[FrontPage] Render failed.",
                error
            );

            root.dataset.frontRendered = "error";
            root.dataset.frontRenderError =
                error.message || String(error);

            return false;
        }
    }

    function init() {
        if (initialized) {
            syncCategoriesFromManifest();
            render();
            return true;
        }

        root = document.getElementById("frontPage");
        stage = document.getElementById("frontStage");
        topWave = document.getElementById("frontTopWave");
        wave = document.getElementById("frontWave");
        mediaHost = document.getElementById("frontMediaHost");

        if (!root || !stage || !topWave || !wave) {
            return false;
        }

        initialized = true;

        syncCategoriesFromManifest();
        render();

        return true;
    }

    function refresh() {
        return initialized
            ? (syncCategoriesFromManifest(), render(), true)
            : init();
    }

    /* Re-render whenever the unified content source finishes loading. */
    window.addEventListener("skymedia:manifest-ready", () => {
        if (initialized) {
            render();
        }
    });

    return {
        init,
        refresh,
        render,
        getCategories,
        setCategories,
        collectItems,
        resolveDoors
    };
})();