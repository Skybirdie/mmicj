"use strict";

window.SlideshowLibrary = (function () {
    let slideshows = [];
    let displaySlideshows = [];
    let currentView = "grid";
    let sortMode = "alphabetical";
    let filterMode = "all";
    let categoryFilter = "all";
    let searchQuery = "";
    let selectedId = null;
    let gridElement = null;
    let selectionPromise = null;

    function init(options = {}) {
        gridElement = options.gridElement || document.getElementById("slideshowLibraryGrid");
        return !!gridElement;
    }


    function load(payload) {
    slideshows = window.SlideshowContract ? SlideshowContract.parse(payload) : [];

    apply();
    if (window.SlideshowViewer) SlideshowViewer.renderLanding();
    return slideshows;
}


    function apply() {
        displaySlideshows = window.SlideshowSorter ? SlideshowSorter.organize({slideshows, sort: sortMode, filter: filterMode, category: categoryFilter, search: searchQuery}) : [...slideshows];
        render();
        if (window.SlideshowViewer) SlideshowViewer.renderLanding();
    }
    function createFavorite(id) {
        const button = document.createElement("span");
        button.className = "slideshow-favorite-control";
        button.setAttribute("role", "button");
        button.setAttribute("tabindex", "0");
        const update = () => {
            const active = window.SlideshowFavorites && SlideshowFavorites.has(id);
            button.classList.toggle("is-favorite", active);
            button.textContent = active ? "♥" : "♡";
            button.setAttribute("aria-pressed", String(!!active));
        };
        button.title = "Favorite";
        button.setAttribute("aria-label", "Favorite slideshow");
        button.addEventListener("click", e => { e.stopPropagation(); if (window.SlideshowFavorites) SlideshowFavorites.toggle(id); update(); apply(); });
        button.addEventListener("keydown", e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); button.click(); } });
        update();
        return button;
    }
    function card(item) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "slideshow-library-card";
        button.dataset.slideshowId = item.id;
        const media = document.createElement("div"); media.className = "slideshow-library-card-media";
        const img = document.createElement("img");

const fallbackThumbnail = "assets/default-thumbnail.png";

img.src = item.thumbnail || (
    item.source === "pdf"
        ? fallbackThumbnail
        : item.slides?.[0]?.image ||
          (Array.isArray(item.media) ? item.media[0] : "") ||
          fallbackThumbnail
);

img.alt = item.title || "";
img.loading = "lazy";

img.addEventListener("error", () => {

    if (img.dataset.fallbackApplied === "true") {
        return;
    }

    img.dataset.fallbackApplied = "true";
    img.src = fallbackThumbnail;

});

media.appendChild(img);
        const info = document.createElement("div"); info.className = "slideshow-library-card-info";
        const title = document.createElement("strong"); title.textContent = item.title; info.appendChild(title);
        if (item.category) { const meta = document.createElement("span"); meta.textContent = item.category; info.appendChild(meta); }
        button.append(media, info, createFavorite(item.id));
        button.addEventListener("click", () => select(item.id));
        return button;
    }
    function render() {
        if (!gridElement) return;
        gridElement.innerHTML = "";
        gridElement.dataset.view = currentView;
        if (!displaySlideshows.length) {
            const empty = document.createElement("div"); empty.className = "slideshow-library-empty";
            empty.textContent = searchQuery ? "No slide shows match your search." : filterMode === "favorites" ? "No favorite slide shows yet." : "No slide shows found.";
            gridElement.appendChild(empty); return;
        }
        displaySlideshows.forEach(item => gridElement.appendChild(card(item)));
        refreshSelection();
    }
    function select(id) {
        const item = slideshows.find(x => x.id === id);
        if (!item || !window.SlideshowViewer) return false;

        /* Keep the visual selection synchronous, but single-flight the
           asynchronous viewer open so rapid/cold-start clicks cannot launch
           competing PDF.js loads. */
        if (selectionPromise) return false;

        selectedId = id;
        refreshSelection();

        selectionPromise = Promise.resolve(SlideshowViewer.open(item))
            .finally(() => { selectionPromise = null; });

        return selectionPromise;
    }
    function refreshSelection() { if (!gridElement) return; gridElement.querySelectorAll("[data-slideshow-id]").forEach(x => x.classList.toggle("selected", x.dataset.slideshowId === selectedId)); }
    function setView(view) { if (view !== "grid" && view !== "list") return; currentView = view; render(); }
    function setSort(mode) { if (window.SlideshowSorter && !SlideshowSorter.available().includes(mode)) return; sortMode = mode; apply(); }
    function setFilter(mode) { filterMode = ["all", "favorites"].includes(mode) ? mode : "all"; apply(); }
    function setCategory(cat) { categoryFilter = String(cat || "all"); apply(); }
    function setSearch(query) { searchQuery = String(query || "").trim().toLowerCase(); apply(); }
    function getCategories() { return window.SlideshowSorter ? SlideshowSorter.categories(slideshows) : []; }
    return {init, load, render, select, setView, setSort, setFilter, setCategory, setSearch, getCategories, getSort: () => sortMode, getFilter: () => filterMode, getCategory: () => categoryFilter, getSearch: () => searchQuery, getSlideshows: () => [...slideshows], getDisplayed: () => [...displaySlideshows], getSlideshows: () => [...slideshows]};
})();
