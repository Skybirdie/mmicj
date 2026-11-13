"use strict";

/* =========================================================
   searchSummary.js — "Search results for ..." summaries

   While a section's search box has text, show a small, neat line so
   nobody mistakes a filtered library for an empty one:

     Search results for "grace" within Books (3)            [Clear search]
     No results for "xyz" within Videos. Please edit or clear search text.   [Clear search]

   Where it appears (each section keeps its OWN search box and its OWN
   logic; nothing is shared between Books, Videos and Images/Graphics):
     - above the grid/list in the section's library panel / drawer
     - on the section's landing, temporarily in place of the
       Read Again / Watch Again / View Again card (the card is only hidden
       with CSS while the search has text, never rebuilt or changed)

   This file only READS: the search box value, item counts, and the DOM
   the libraries already render. The one action it performs is the Clear
   button, which empties the section's own search box and fires that box's
   normal "input" event, exactly what the user would do by hand.

   Visibility of everything is driven by one attribute per section on
   <html> (data-ss-reader / data-ss-video / data-ss-slideshow), see
   css/search-summary.css.
   ========================================================= */
window.SearchSummary = (function () {

    const $ = (selector) => document.querySelector(selector);

    /* Name shown in the sentence = the label in the section menu. */
    const SECTIONS = [
        {
            id: "reader",
            name: "Books",
            input: "#searchBox",
            panelBefore: "#libraryContent",
            landingBefore: "#viewerContinue",
            panelCount: () => {
                try { return SkyReader.filteredLibrary.length; } catch (e) { return 0; }
            },
            landingCount: () => childCount("#viewerShelfView"),
            watch: ["#shelfView", "#listView", "#viewerShelfView"]
        },
        {
            id: "video",
            name: "Videos",
            input: "#videoSearchBox",
            panelBefore: "#videoLibraryGrid",
            landingBefore: ".video-landing-media-row",
            panelCount: () => {
                try { return VideoLibrary.getDisplayedCount(); } catch (e) { return 0; }
            },
            landingCount: () => childCount("#videoLandingLibrary"),
            watch: ["#videoLibraryGrid", "#videoLandingLibrary"]
        },
        {
            id: "slideshow",
            name: "Images/Graphics",
            input: "#slideshowSearchBox",
            panelBefore: "#slideshowLibraryGrid",
            landingBefore: ".slideshow-landing-media-row",
            panelCount: () => {
                try { return SlideshowLibrary.getDisplayed().length; } catch (e) { return 0; }
            },
            landingCount: () => childCount("#slideshowLandingLibrary"),
            watch: ["#slideshowLibraryGrid", "#slideshowLandingLibrary"]
        }
    ];

    function childCount(selector) {
        const el = $(selector);
        return el ? el.children.length : 0;
    }

    function queryOf(section) {
        const input = $(section.input);
        return input ? String(input.value || "").trim() : "";
    }

    /* ---------- building the summary element ---------- */

    function build(section, where) {
        const box = document.createElement("div");
        box.className = "ss-summary ss-" + where;
        box.dataset.ssSection = section.id;
        box.dataset.ssWhere = where;
        box.setAttribute("role", "status");
        box.hidden = true;

        const text = document.createElement("span");
        text.className = "ss-text";

        const clear = document.createElement("button");
        clear.type = "button";
        clear.className = "ss-clear";
        clear.textContent = "Clear search";
        clear.setAttribute("aria-label", "Clear search in " + section.name);
        clear.addEventListener("click", (event) => {
            event.stopPropagation();
            clearSearch(section);
        });

        box.append(text, clear);
        return box;
    }

    function place(section, where, beforeSelector) {
        const anchor = $(beforeSelector);
        if (!anchor || !anchor.parentNode) return null;

        const key = "ss" + where;
        if (section[key] && section[key].isConnected) return section[key];

        const box = build(section, where);
        anchor.parentNode.insertBefore(box, anchor);
        section[key] = box;
        return box;
    }

    function fill(box, section, query, count) {
        const text = box.querySelector(".ss-text");
        if (!text) return;

        text.textContent = "";
        const quoted = document.createElement("span");
        quoted.className = "ss-query";
        quoted.textContent = query;

        if (count > 0) {
            text.append("Search results for \"", quoted, "\" within " + section.name + " ");
            const n = document.createElement("span");
            n.className = "ss-count";
            n.textContent = "(" + count + ")";
            text.append(n);
            box.dataset.ssState = "results";
        } else {
            text.append("No results for \"", quoted, "\" within " + section.name + ". Please edit or clear search text.");
            box.dataset.ssState = "none";
        }
    }

    /* ---------- update ---------- */

    function update(section) {
        const query = queryOf(section);
        const active = query.length > 0;
        const root = document.documentElement;
        const attr = "data-ss-" + section.id;

        const panelBox = place(section, "panel", section.panelBefore);
        const landingBox = place(section, "landing", section.landingBefore);

        if (!active) {
            root.removeAttribute(attr);
            [panelBox, landingBox].forEach((box) => { if (box) box.hidden = true; });
            return;
        }

        root.setAttribute(attr, "");

        if (panelBox) {
            fill(panelBox, section, query, section.panelCount());
            panelBox.hidden = false;
        }
        if (landingBox) {
            fill(landingBox, section, query, section.landingCount());
            landingBox.hidden = false;
        }
    }

    let pending = false;
    function updateAll() {
        if (pending) return;
        pending = true;
        const run = () => {
            pending = false;
            SECTIONS.forEach((section) => {
                try { update(section); } catch (e) { /* never break the app */ }
            });
        };
        (window.requestAnimationFrame || setTimeout)(run);
    }

    function clearSearch(section) {
        const input = $(section.input);
        if (!input) return;
        input.value = "";
        /* The section's own listener does the real work (and its own
           landing/panel refresh), exactly as when the user clears it. */
        input.dispatchEvent(new Event("input", { bubbles: true }));
        updateAll();
    }

    /* ---------- wiring ---------- */

    let watching = false;
    function init() {
        if (watching) return;
        watching = true;

        SECTIONS.forEach((section) => {
            const input = $(section.input);
            if (input) {
                input.addEventListener("input", updateAll);
                input.addEventListener("change", updateAll);
            }
        });

        /* Any re-render of a library (search, sort, category, data load)
           refreshes the counts. The summaries live outside these
           containers, so this can never loop. */
        if (typeof MutationObserver !== "undefined") {
            const observer = new MutationObserver(updateAll);
            SECTIONS.forEach((section) => {
                section.watch.forEach((selector) => {
                    const el = $(selector);
                    if (el) observer.observe(el, { childList: true });
                });
            });
        }

        updateAll();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    return { update: updateAll };
})();
