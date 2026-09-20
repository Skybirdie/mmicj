"use strict";

window.SlideshowLibrary = (function () {
let slideshows = [];
let displaySlideshows = [];
let currentView = "grid";
let sortMode = "random";
let filterMode = "all";
let categoryFilter = "all";
let searchQuery = "";
let selectedId = null;
let gridElement = null;


function init(options = {}) {
    gridElement =
        options.gridElement ||
        document.getElementById("slideshowLibraryGrid");

    return !!gridElement;
}

function load(payload) {
    slideshows = window.SlideshowContract
        ? SlideshowContract.parse(payload)
        : [];

    console.log("[SlideshowLibrary] Loaded items:", slideshows);

    console.log(
        "[SlideshowLibrary] PDF items:",
        slideshows.filter(
            item => item && item.source === "pdf"
        )
    );

    apply();

    if (window.SlideshowViewer) {
        SlideshowViewer.renderLanding();
    }

    return slideshows;
}

function apply() {
    displaySlideshows =
        window.SlideshowSorter
            ? SlideshowSorter.organize({
                slideshows,
                sort: sortMode,
                filter: filterMode,
                category: categoryFilter,
                search: searchQuery
            })
            : [...slideshows];

    render();

    if (window.SlideshowViewer) {
        SlideshowViewer.renderLanding();
    }
}

/*
 * Creates the favorite control used by both:
 *
 * 1. Normal Slideshow Library cards
 * 2. Slideshow Landing cards
 */
function createFavorite(id) {
    const button = document.createElement("span");

    button.className = "slideshow-favorite-control";
    button.setAttribute("role", "button");
    button.setAttribute("tabindex", "0");

    const update = () => {
        const active =
            window.SlideshowFavorites &&
            SlideshowFavorites.has(id);

        button.classList.toggle(
            "is-favorite",
            !!active
        );

        button.textContent =
            active ? "♥" : "♡";

        button.setAttribute(
            "aria-pressed",
            String(!!active)
        );

        button.title =
            active
                ? "Remove from favorites"
                : "Add to favorites";

        button.setAttribute(
            "aria-label",
            active
                ? "Remove slideshow from favorites"
                : "Add slideshow to favorites"
        );
    };

    const toggle = (event) => {
        event.stopPropagation();
        event.preventDefault();

        if (window.SlideshowFavorites) {
            SlideshowFavorites.toggle(id);
        }

        update();

        /*
         * Reapply the library filter/sort so that
         * the Favorites filter remains accurate.
         */
        apply();
    };

    button.addEventListener(
        "click",
        toggle
    );

    button.addEventListener(
        "keydown",
        event => {
            if (
                event.key === "Enter" ||
                event.key === " "
            ) {
                event.preventDefault();
                event.stopPropagation();
                toggle(event);
            }
        }
    );

    update();

    return button;
}

function card(item) {
    const button =
        document.createElement("button");

    button.type = "button";
    button.className =
        "slideshow-library-card";

    button.dataset.slideshowId =
        item.id;

    const media =
        document.createElement("div");

    media.className =
        "slideshow-library-card-media";

    const img =
        document.createElement("img");

    const fallbackThumbnail =
        "assets/default-thumbnail.png";

    img.src =
        item.thumbnail ||
        (
            item.source === "pdf"
                ? fallbackThumbnail
                : item.slides?.[0]?.image ||
                  (
                      Array.isArray(item.media)
                          ? item.media[0]
                          : ""
                  ) ||
                  fallbackThumbnail
        );

    img.alt =
        item.title || "";

    img.loading = "lazy";

    img.addEventListener(
        "error",
        () => {
            if (
                img.dataset.fallbackApplied ===
                "true"
            ) {
                return;
            }

            img.dataset.fallbackApplied =
                "true";

            img.src =
                fallbackThumbnail;
        }
    );

    media.appendChild(img);

    const info =
        document.createElement("div");

    info.className =
        "slideshow-library-card-info";

    const title =
        document.createElement("strong");

    title.textContent =
        item.title;

    info.appendChild(title);

    if (item.category) {
        const meta =
            document.createElement("span");

        meta.textContent =
            item.category;

        info.appendChild(meta);
    }

    button.append(
        media,
        info,
        createFavorite(item.id)
    );

    button.addEventListener(
        "click",
        () => select(item.id)
    );

    return button;
}

function render() {
    if (!gridElement) {
        return;
    }

    gridElement.innerHTML = "";

    gridElement.dataset.view =
        currentView;

    if (!displaySlideshows.length) {
        const empty =
            document.createElement("div");

        empty.className =
            "slideshow-library-empty";

        empty.textContent =
            searchQuery
                ? "No slide shows match your search."
                : filterMode === "favorites"
                    ? "No favorite slide shows yet."
                    : "No slide shows found.";

        gridElement.appendChild(empty);

        return;
    }

    displaySlideshows.forEach(
        item => gridElement.appendChild(
            card(item)
        )
    );

    refreshSelection();
}

function select(id) {
    const item =
        slideshows.find(
            x => x.id === id
        );

    if (!item) {
        return;
    }

    selectedId = id;

    refreshSelection();

    if (window.SlideshowViewer) {
        SlideshowViewer.open(item);
    }
}

function refreshSelection() {
    if (!gridElement) {
        return;
    }

    gridElement
        .querySelectorAll(
            "[data-slideshow-id]"
        )
        .forEach(x => {
            x.classList.toggle(
                "selected",
                x.dataset.slideshowId ===
                selectedId
            );
        });
}

function setView(view) {
    if (
        view !== "grid" &&
        view !== "list"
    ) {
        return;
    }

    currentView = view;

    render();
}

function setSort(mode) {
    if (
        window.SlideshowSorter &&
        !SlideshowSorter
            .available()
            .includes(mode)
    ) {
        return;
    }

    sortMode = mode;

    apply();
}

function setFilter(mode) {
    filterMode =
        ["all", "favorites"].includes(mode)
            ? mode
            : "all";

    apply();
}

function setCategory(cat) {
    categoryFilter =
        String(cat || "all");

    apply();
}

function setSearch(query) {
    searchQuery =
        String(query || "")
            .trim()
            .toLowerCase();

    apply();
}

function getCategories() {
    return window.SlideshowSorter
        ? SlideshowSorter.categories(
            slideshows
        )
        : [];
}

return {
    init,
    load,
    render,
    select,
    setView,
    setSort,
    setFilter,
    setCategory,
    setSearch,
    getCategories,

    getSort: () => sortMode,
    getFilter: () => filterMode,
    getCategory: () => categoryFilter,
    getSearch: () => searchQuery,

    getSlideshows: () => [...slideshows],
    getDisplayed: () => [...displaySlideshows],

    /*
     * IMPORTANT:
     * This must be inside the returned API.
     * SlideshowViewer.renderLanding() uses this
     * to create the landing-card favorite icon.
     */
    createFavorite
};


})();