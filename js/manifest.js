"use strict";

/*
=========================================================
 SkyMedia Unified Manifest

 Loads ONE content source and publishes normalized collections
 to Reader, Video Viewer, and Slideshow Viewer.

 Source priority:
   1. Glide contract
   2. content.json

 The raw source is never exposed directly to feature modules.
=========================================================
*/

window.Manifest = {

    source: {
        url: "content.json?v=3.0.0",

        async load() {
            const response = await fetch(this.url, { cache: "no-store" });

            if (!response.ok) {
                throw new Error("Unable to load content.json");
            }

            return response.json();
        }
    },

    _data: null,

    async load() {
        SkyReader.setLoading(5, "Loading content...");

        try {
            const rawManifest =
                GlideContract.available()
                    ? await GlideContract.load()
                    : await this.source.load();

            const manifest =
                ContentContract.normalizeManifest(rawManifest);

            if (!manifest.content.length) {
                throw new Error("No visible content is available.");
            }

            this._data = manifest;

            window.dispatchEvent(new CustomEvent("skymedia:manifest-ready", {
                detail: { manifest }
            }));

            const books = this.content("book");
            const videos = this.content("video");
            const slideshows = this.content("slideshow");

            SkyReader.library = [...books];
            SkyReader.filteredLibrary = [...books];

            const background = rawManifest && typeof rawManifest === "object"
                ? rawManifest.background
                : null;

            if (background) {
                SkyReader.settings.background = background;

                const viewerBackground =
                    document.getElementById("viewerBackground");

                if (viewerBackground) {
                    viewerBackground.style.backgroundImage =
                        `url('${background}')`;
                }
            }

            if (manifest.diagnostics.length) {
                console.info(
                    "[Manifest] Normalization diagnostics:",
                    ...manifest.diagnostics
                );
            }

            SkyReader.setLoading(
                20,
                `Content loaded: ${books.length} books, ${videos.length} videos, ${slideshows.length} slideshows`
            );

            return manifest;

        } catch (error) {
            this._data = null;
            SkyReader.library = [];
            SkyReader.filteredLibrary = [];

            console.error("[Manifest] Content load failed", error);

            SkyReader.setStatus(
                error.message || "Unable to load SkyMedia content."
            );

            if (
                window.UI &&
                typeof UI.showError === "function"
            ) {
                UI.showError(
                    error,
                    "Unable to load SkyMedia content."
                );
            }

            throw error;
        }
    },

    all() {
        const items = this._data
            ? [...this._data.content]
            : [];

        /*
         * Publishing gate: an item is only ever exposed to any
         * consumer (Reader/Booklets library, Video library, Slideshow
         * library, or the Front Page) once it has a valid release
         * date-time that is on or before right now. This is the one
         * choke point every section's data flows through, so
         * filtering here is enough to keep unpublished inventory out
         * of every library grid and out of the front-door shapes —
         * no per-section filtering needed.
         */
        return window.SkyDate
            ? items.filter(item => SkyDate.isVisible(item.date))
            : items;
    },

    content(type) {
        return this.all().filter(item => item.type === type);
    },

    books() {
        return this.content("book");
    },

    videos() {
        return this.content("video");
    },

    slideshows() {
        return this.content("slideshow");
    },

    diagnostics() {
        return this._data
            ? [...this._data.diagnostics]
            : [];
    },

    frontPageCategories() {
        return this._data && this._data.frontPage && Array.isArray(this._data.frontPage.categories)
            ? [...this._data.frontPage.categories]
            : [];
    },

    normalize(rawManifest) {
        return ContentContract.normalizeManifest(rawManifest);
    },

    validate(rawManifest) {
        return this.normalize(rawManifest);
    },

    /*
    -------------------------------------------------------
     Runtime count reconciliation
    -------------------------------------------------------

     PDF page counts are authoritative only after PDF.js opens
     the document. This method is deliberately public so the
     Reader and Slideshow Viewer can correct their in-memory
     metadata without changing the supplied source.
    -------------------------------------------------------
    */

    reconcileBookCount(book, actualCount) {
        ContentContract.reconcileBookCount(book, actualCount);
        return book;
    },

    reconcileSlideshowCount(slideshow, actualCount) {
        ContentContract.reconcileSlideshowCount(slideshow, actualCount);
        return slideshow;
    }
};
