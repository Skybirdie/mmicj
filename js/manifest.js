"use strict";

/*
=========================================================
 SkyMedia Unified Manifest

 Loads ONE content source and publishes normalized collections
 to Reader, Video Viewer, and Slideshow Viewer.

 Source priority:
   1. Glide contract (?contractz= / ?contract= / injected global)
   2. Catalog snapshot published by the Worker (/__sky_catalog)
   3. content.json

 A usable Glide contract is used exactly as before and the
 snapshot is never requested. The snapshot is only asked for when
 there is no Glide contract (e.g. the plain base URL) or the one
 supplied could not be used.

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

    /*
    -------------------------------------------------------
     Catalog snapshot (served by the Worker from KV)

     Same shape as content.json / the Glide contract:
     { version, content: [...] }. It is fetched with the normal
     browser cache (the Worker sends max-age + ETag), so repeat
     opens within a few minutes cost the Worker nothing. The last
     good copy is kept in localStorage purely as an offline /
     outage fallback.
    -------------------------------------------------------
    */

    snapshot: {
        url: "/__sky_catalog",
        storageKey: "skymedia-catalog-snapshot-v1",
        timeoutMs: 8000,

        _valid(data) {
            return !!(
                data &&
                typeof data === "object" &&
                Array.isArray(data.content) &&
                data.content.length
            );
        },

        _readCache() {
            try {
                const saved = JSON.parse(
                    localStorage.getItem(this.storageKey) || "null"
                );

                return saved && this._valid(saved.data)
                    ? saved
                    : null;
            } catch (error) {
                return null;
            }
        },

        _writeCache(data) {
            try {
                localStorage.setItem(
                    this.storageKey,
                    JSON.stringify({ savedAt: Date.now(), data })
                );
            } catch (error) {
                /* Storage blocked or full: the cache is optional. */
            }
        },

        async load() {
            const controller =
                typeof AbortController === "function"
                    ? new AbortController()
                    : null;

            const timer = controller
                ? setTimeout(() => controller.abort(), this.timeoutMs)
                : null;

            try {
                const response = await fetch(
                    this.url,
                    controller ? { signal: controller.signal } : undefined
                );

                if (!response.ok) {
                    throw new Error(
                        "Catalog snapshot request failed (" +
                        response.status +
                        ")."
                    );
                }

                const data = await response.json();

                if (!this._valid(data)) {
                    throw new Error(
                        "Catalog snapshot contained no items."
                    );
                }

                this._writeCache(data);

                return data;

            } catch (error) {
                const cached = this._readCache();

                if (cached) {
                    console.warn(
                        "[Manifest] Catalog snapshot unavailable; using the copy saved on " +
                        new Date(cached.savedAt).toISOString() +
                        ".",
                        error
                    );

                    return cached.data;
                }

                throw error;

            } finally {
                if (timer) {
                    clearTimeout(timer);
                }
            }
        }
    },

    _data: null,
    _sourceLabel: "",

    /*
    -------------------------------------------------------
     Pick the first source that yields usable content.
     Behaviour is unchanged when a usable Glide contract exists.
    -------------------------------------------------------
    */
    async resolve() {
        const sources = [];

        if (GlideContract.available()) {
            sources.push(["Glide contract", () => GlideContract.load()]);
        }

        sources.push(["catalog snapshot", () => this.snapshot.load()]);
        sources.push(["content.json", () => this.source.load()]);

        let last = null;
        let lastError = null;

        for (const [label, loader] of sources) {
            let raw = null;

            try {
                raw = await loader();
            } catch (error) {
                lastError = error;

                console.warn(
                    "[Manifest] " + label + " could not be loaded.",
                    error
                );

                continue;
            }

            if (!raw) {
                continue;
            }

            const manifest = ContentContract.normalizeManifest(raw);

            last = { raw, manifest, label };

            if (manifest.content.length) {
                return last;
            }

            console.warn(
                "[Manifest] " + label + " contained no usable content."
            );
        }

        if (last) {
            return last;
        }

        throw lastError || new Error("Unable to load content.json");
    },

    sourceLabel() {
        return this._sourceLabel;
    },

    async load() {
        SkyReader.setLoading(5, "Loading content...");

        try {
            const resolved = await this.resolve();

            const rawManifest = resolved.raw;

            const manifest = resolved.manifest;

            this._sourceLabel = resolved.label;

            console.info(
                "[Manifest] Content source: " + resolved.label
            );

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
