"use strict";

/*
=========================================================

 SkyReader Video Library

 Circular thumbnail library / list library

=========================================================
*/

window.VideoLibrary = (function () {

    let videos = [];

    let displayVideos = [];

    let selectedVideoId = null;

    let libraryElement = null;
    let gridElement = null;

    let currentView = "grid";

    let filterQuery = "";
    let sortMode = "random";
    let organizationFilter = "all";
    let categoryFilter = "all";
    
    /*
    -------------------------------------------------------
     Initialize
    -------------------------------------------------------
    */

    function init(options = {}) {

        libraryElement =
            options.libraryElement ||
            document.getElementById("videoLibrary");

        gridElement =
    options.gridElement ||
    document.getElementById("videoLibraryGrid");

render();

window.addEventListener(
    "resize",
    () => {

        if (
            currentView === "grid"
        ) {

            requestAnimationFrame(
                layoutCircleField
            );

        }

    }
);


        return true;
    }


    /*
    -------------------------------------------------------
     Load
    -------------------------------------------------------
    */

    function load(payload) {

    videos =
        VideoContract
            .parse(payload);

    sortMode = sortMode || "random";
    organizationFilter = organizationFilter || "all";
    categoryFilter = categoryFilter || "all";


    /*
    -------------------------------------------------------
     Create the grid display order.

     The first video always remains first.

     Every video after the first is shuffled.
    -------------------------------------------------------
    */

    displayVideos = organizeVideos();

    render();

if (
    window.VideoViewer &&
    typeof VideoViewer.renderLanding === "function"
) {
    VideoViewer.renderLanding();
}

return videos;
}


/*
-------------------------------------------------------
 Organize videos
-------------------------------------------------------
*/

function organizeVideos() {
    if (window.VideoSorter && typeof VideoSorter.organize === "function") {
        return VideoSorter.organize({
            videos,
            sort: sortMode,
            filter: organizationFilter,
            category: categoryFilter
        });
    }
    return [...videos];
}


/*
-------------------------------------------------------
 Create Random Display Order
-------------------------------------------------------
*/

function createRandomDisplayOrder(items) {

    if (!items.length) {
        return [];
    }


    /*
    Keep the first video fixed.

    This is our visual anchor.
    */

    const first =
        items[0];


    /*
    Copy everything after the first.
    */

    const remaining =
        items.slice(1);


    /*
    Fisher-Yates shuffle.
    */

    for (
        let i = remaining.length - 1;
        i > 0;
        i--
    ) {

        const j =
            Math.floor(
                Math.random() * (i + 1)
            );


        [
            remaining[i],
            remaining[j]
        ] =
        [
            remaining[j],
            remaining[i]
        ];

    }


    return [
        first,
        ...remaining
    ];
}


    /*
    -------------------------------------------------------
     Set View
    -------------------------------------------------------
    */

    function setView(view) {

        if (
            view !== "grid" &&
            view !== "list"
        ) {
            return;
        }

        currentView =
            view;

        if (libraryElement) {

            libraryElement
                .dataset.view =
                view;
        }

        render();
    }


    /*
    -------------------------------------------------------
     Toggle View
    -------------------------------------------------------
    */

    function toggleView() {

        setView(
            currentView === "grid"
                ? "list"
                : "grid"
        );
    }


    function setSort(mode) {
        if (window.VideoSorter && VideoSorter.available().includes(mode)) {
            sortMode = mode;
        }
        displayVideos = organizeVideos();
        render();
    }

    function setOrganizationFilter(mode) {
        const allowed = ["all", "favorites", "recent"];
        organizationFilter = allowed.includes(mode) ? mode : "all";
        displayVideos = organizeVideos();
        render();
    }

    function setCategory(category) {
        categoryFilter = String(category || "all");
        displayVideos = organizeVideos();
        render();
    }

    function getSort() { return sortMode; }
    function getOrganizationFilter() { return organizationFilter; }
    function getCategory() { return categoryFilter; }

    function getCategories() {
        return window.VideoSorter && typeof VideoSorter.categories === "function"
            ? VideoSorter.categories(videos)
            : [];
    }


    /*
    -------------------------------------------------------
     Render
    -------------------------------------------------------
    */

    function render() {

        if (!gridElement) {
            return;
        }

        gridElement.innerHTML = "";

        if (currentView === "grid") {

            renderGrid();

        }
        else {

            renderList();

        }

        refreshSelection();
    }


/*
=========================================================
 LANDING LIBRARY
=========================================================

 Uses the same VideoLibrary data as the side panel.

 Landing cards are intentionally simpler:

 - standard-size circles
 - single horizontal row
 - horizontally scrollable
 - titles overlaid on thumbnails
=========================================================
*/

function renderLanding() {

    /*
     * VideoViewer owns the actual landing DOM.
     * VideoLibrary only owns the authoritative collection.
     */
    if (
        window.VideoViewer &&
        typeof VideoViewer.renderLanding === "function"
    ) {
        VideoViewer.renderLanding();
    }

}


    /*
    -------------------------------------------------------
     Search filter

     Matches against title, subtitle, author, and category.
     An empty query matches everything.
    -------------------------------------------------------
    */

    function matchesFilter(video) {

        if (!filterQuery) {
            return true;
        }

        const haystack = [
            video.title,
            video.subtitle,
            video.author,
            video.category
        ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

        return haystack.includes(filterQuery);
    }


    function setFilter(query) {

        filterQuery = String(query || "")
            .trim()
            .toLowerCase();

        render();
    }


    function filteredDisplayVideos() {

        if (!filterQuery) {
            return displayVideos;
        }

        return displayVideos.filter(matchesFilter);
    }


    function filteredVideos() {

        if (!filterQuery) {
            return videos;
        }

        return videos.filter(matchesFilter);
    }


    /*
    =======================================================
     GRID VIEW
    =======================================================
    */

    function renderGrid() {

    const items =
        filteredDisplayVideos();

    items.forEach(
        (video, index) => {

            const card =
                createCircularCard(
                    video,
                    index
                );

            gridElement
                .appendChild(card);

        }
    );

    if (!items.length) {

        gridElement.appendChild(
            createEmptyState()
        );

    }


    /*
    -------------------------------------------------------
     Position the circles after they have been created.

     The layout engine uses the actual circle diameter
     so that visible edges remain exactly 10px apart.
    -------------------------------------------------------
    */

    requestAnimationFrame(
        layoutCircleField
    );
}


    /*
    -------------------------------------------------------
     Circular Card
    -------------------------------------------------------
    */

    function createCircularCard(
        video,
        index
    ) {

        const card =
            document.createElement(
                "button"
            );

        card.type = "button";

        card.className =
            "video-circle-card";

        card.dataset.videoId =
            video.id;



/*
-------------------------------------------------------
 Golden Ratio Circle Size

 First video:
 Always Level 1 / largest.

 Every subsequent video:
 Randomly receives ANY of the three sizes.
-------------------------------------------------------
*/

let sizeLevel;

if (index === 0) {

    sizeLevel = 1;

}
else {

    sizeLevel =
        Math.floor(
            Math.random() * 3
        ) + 1;

}


const sizeClass =
    "video-circle-size-" +
    sizeLevel;

card.classList.add(
    sizeClass
);




/*
        Thumbnail
        */

        const circle =
            document.createElement("div");

        circle.className =
            "video-circle";


        const fallbackThumbnail = "assets/default-thumbnail.png";

const image =
    document.createElement("img");

image.src =
    video.thumbnail ||
    fallbackThumbnail;

image.alt =
    video.title || "";

image.loading =
    "lazy";

image.addEventListener("error", () => {

    if (image.dataset.fallbackApplied === "true") {
        circle.classList.add("thumbnailFallback");
        return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = fallbackThumbnail;

});

circle.appendChild(image);


        /*
        Dark overlay makes title
        readable regardless of image.
        */

        const overlay =
            document.createElement(
                "div"
            );

        overlay.className =
            "video-circle-overlay";


        /*
        Title
        */

        const title =
            document.createElement(
                "span"
            );

        title.className =
            "video-circle-title";

        title.textContent =
            video.title;


        /*
        Play icon
        */

        const play =
            document.createElement(
                "span"
            );

        play.className =
            "video-circle-play";

        play.textContent =
            "▶";


        overlay.appendChild(
            play
        );

        overlay.appendChild(
            title
        );

        circle.appendChild(
            overlay
        );

        /* Keep the favorite physically inside the circular clipping area. */
        circle.appendChild(
            createFavoriteControl(video)
        );

        card.appendChild(
            circle
        );


        /*
        Selection
        */

        card.addEventListener(
            "click",
            () => {

                select(video.id);

            }
        );


        return card;
    }


    function createFavoriteControl(video) {
        const control = document.createElement("span");
        control.className = "video-favorite-control";
        control.dataset.videoId = video.id;
        control.setAttribute("role", "button");
        control.setAttribute("tabindex", "0");
        control.setAttribute("aria-label", "Favorite " + (video.title || "video"));

        const icon = document.createElement("span");
        icon.className = "video-favorite-icon";
        control.appendChild(icon);

        function refresh() {
            const active = !!(window.VideoFavorites && VideoFavorites.has(video.id));
            control.classList.toggle("is-favorite", active);
            control.setAttribute("aria-pressed", String(active));
            icon.textContent = active ? "♥" : "♡";
        }

        function toggle(event) {
            event.preventDefault();
            event.stopPropagation();
            if (window.VideoFavorites) VideoFavorites.toggle(video.id);
            displayVideos = organizeVideos();
            refresh();
            render();
        }

        control.addEventListener("click", toggle);
        control.addEventListener("keydown", event => {
            if (event.key === "Enter" || event.key === " ") toggle(event);
        });
        refresh();
        return control;
    }


    /*
    =======================================================
     LIST VIEW
    =======================================================
    */

    function renderList() {

        const items =
            filteredDisplayVideos();

        items.forEach(
            video => {

                const card =
                    createListCard(video);

                gridElement
                    .appendChild(card);

            }
        );

        if (!items.length) {

            gridElement.appendChild(
                createEmptyState()
            );

        }
    }


    /*
    -------------------------------------------------------
     Empty state (no search results)
    -------------------------------------------------------
    */

    function createEmptyState() {

        const el =
            document.createElement("div");

        el.className = "video-library-empty";

        if (filterQuery) {
            el.textContent = "No videos match your search.";
        } else if (organizationFilter === "favorites") {
            el.textContent = "No favorite videos yet.";
        } else if (organizationFilter === "recent") {
            el.textContent = "No recently viewed videos yet.";
        } else if (categoryFilter !== "all") {
            el.textContent = "No videos in this category.";
        } else {
            el.textContent = "No videos yet.";
        }

        return el;
    }


    /*
    -------------------------------------------------------
     List Card
    -------------------------------------------------------
    */

    function createListCard(video) {

        const card =
            document.createElement(
                "button"
            );

        card.type = "button";

        card.className =
            "video-list-card";

        card.dataset.videoId =
            video.id;

        card.appendChild(createFavoriteControl(video));


        /*
        Thumbnail
        */

        const thumbnail =
            document.createElement(
                "div"
            );

        thumbnail.className =
            "video-list-thumbnail";


        const fallbackThumbnail = "assets/default-thumbnail.png";

const image =
    document.createElement("img");

image.src =
    video.thumbnail ||
    fallbackThumbnail;

image.alt =
    video.title || "";

image.loading =
    "lazy";

image.addEventListener("error", () => {

    if (image.dataset.fallbackApplied === "true") {
        image.style.display = "none";
        return;
    }

    image.dataset.fallbackApplied = "true";
    image.src = fallbackThumbnail;

});

thumbnail.appendChild(image);


        /*
        Play icon
        */

        const play =
            document.createElement(
                "span"
            );

        play.className =
            "video-list-play";

        play.textContent =
            "▶";

        thumbnail.appendChild(
            play
        );


        /*
        Information
        */

        const info =
            document.createElement(
                "div"
            );

        info.className =
            "video-list-info";


        const title =
            document.createElement(
                "div"
            );

        title.className =
            "video-list-title";

        title.textContent =
            video.title;


        const meta =
            document.createElement(
                "div"
            );

        meta.className =
            "video-list-meta";

        meta.textContent =
            video.category || "";


        info.appendChild(title);
        info.appendChild(meta);


        card.appendChild(
            thumbnail
        );

        card.appendChild(
            info
        );


        card.addEventListener(
            "click",
            () => {

                select(video.id);

            }
        );


        return card;
    }


/*
=========================================================
 Circle Field Layout
=========================================================

 Organic 2D circle packing.

 Each circle is positioned according to its actual
 radius rather than an artificial row or column.

 Minimum visible edge-to-edge spacing:

                    10px

 This applies horizontally, vertically and diagonally.
=========================================================
*/

function layoutCircleField() {

    if (!gridElement) {
        return;
    }


    const cards =
        Array.from(
            gridElement.querySelectorAll(
                ".video-circle-card"
            )
        );


    if (!cards.length) {
        return;
    }


    /*
    -------------------------------------------------------
     Layout constants
    -------------------------------------------------------
    */

    const GAP = 10;

    const PADDING_X = 10;

    const PADDING_TOP = 0;


    /*
    -------------------------------------------------------
     Available width

     Account for the grid's 10px left/right padding.
    -------------------------------------------------------
    */

    const containerWidth =
        gridElement.clientWidth -
        (PADDING_X * 2);


    if (containerWidth <= 0) {
        return;
    }


    /*
    -------------------------------------------------------
     Prepare the field
    -------------------------------------------------------
    */

    gridElement.style.position =
        "relative";

    gridElement.style.height =
        "auto";


    cards.forEach(card => {

        card.style.position =
            "absolute";

        card.style.margin =
            "0";

    });


    /*
    -------------------------------------------------------
     Placed circle records

     Each record contains:

     x
     y
     radius
     diameter
    -------------------------------------------------------
    */

    const placed = [];


    /*
    -------------------------------------------------------
     Candidate X positions

     We test the left edge plus positions immediately
     beside already placed circles.

     This allows smaller circles to occupy spaces
     beside larger circles instead of being forced
     into conventional columns.
    -------------------------------------------------------
    */

    function getCandidateXPositions(
        diameter
    ) {

        const positions = [
            PADDING_X
        ];


        placed.forEach(circle => {

            positions.push(
                circle.x +
                circle.diameter +
                GAP
            );


            positions.push(
                circle.x +
                (
                    circle.diameter -
                    diameter
                ) / 2
            );


            positions.push(
                circle.x +
                circle.diameter -
                diameter -
                GAP
            );

        });


        /*
        ---------------------------------------------------
         Clamp and deduplicate
        ---------------------------------------------------
        */

        const maxX =
            PADDING_X +
            containerWidth -
            diameter;


        return [
            ...new Set(

                positions
                    .map(
                        x =>
                            Math.max(
                                PADDING_X,
                                Math.min(
                                    x,
                                    maxX
                                )
                            )
                    )
                    .map(
                        x =>
                            Math.round(x)
                    )

            )
        ];

    }


    /*
    -------------------------------------------------------
     Find the lowest valid Y position for a circle.

     This uses true circle-to-circle geometry.

     Therefore diagonal relationships are respected.
    -------------------------------------------------------
    */

    function findValidY(
        x,
        radius
    ) {

        let y =
            PADDING_TOP;


        /*
        ---------------------------------------------------
         Repeatedly push the circle downward until it
         clears every previously placed circle.
        ---------------------------------------------------
        */

        let changed = true;


        while (changed) {

            changed = false;


            placed.forEach(circle => {

                const otherRadius =
                    circle.radius;


                const requiredDistance =
                    radius +
                    otherRadius +
                    GAP;


                const centerX =
                    x +
                    radius;


                const otherCenterX =
                    circle.x +
                    otherRadius;


                const dx =
                    centerX -
                    otherCenterX;


                /*
                ------------------------------------------------
                 If horizontal distance is already greater
                 than the required center distance, these
                 circles cannot collide.
                ------------------------------------------------
                */

                if (
                    Math.abs(dx) >=
                    requiredDistance
                ) {

                    return;

                }


                /*
                ------------------------------------------------
                 Required vertical center distance.

                 Pythagorean geometry:

                 dx² + dy² >= distance²
                ------------------------------------------------
                */

                const verticalDistance =
                    Math.sqrt(
                        Math.max(
                            0,
                            (
                                requiredDistance *
                                requiredDistance
                            ) -
                            (
                                dx * dx
                            )
                        )
                    );


                const minimumY =
                    (
                        circle.y +
                        otherRadius
                    ) +
                    verticalDistance -
                    radius;


                /*
                ------------------------------------------------
                 If this circle would intersect the other
                 circle, move it down.
                ------------------------------------------------
                */

                if (
                    y <
                    minimumY
                ) {

                    y =
                        minimumY;

                    changed = true;

                }

            });

        }


        return y;

    }


    /*
    -------------------------------------------------------
     Place circles
    -------------------------------------------------------
    */

    cards.forEach(
        (card, index) => {

            const circle =
                card.querySelector(
                    ".video-circle"
                );


            if (!circle) {
                return;
            }


            const diameter =
                circle.offsetWidth;


            const radius =
                diameter / 2;


            /*
            ------------------------------------------------
             Candidate positions
            ------------------------------------------------
            */

            const candidates =
                getCandidateXPositions(
                    diameter
                );


            let best =
                null;


            /*
            ------------------------------------------------
             Evaluate every candidate.

             Prefer:

             1. Lowest vertical position.
             2. Then leftmost position.

             This creates a compact field while allowing
             smaller circles to fill spaces around larger
             circles.
            ------------------------------------------------
            */

            candidates.forEach(
                x => {

                    const y =
                        findValidY(
                            x,
                            radius
                        );


                    if (
                        !best ||
                        y < best.y ||
                        (
                            y === best.y &&
                            x < best.x
                        )
                    ) {

                        best = {
                            x,
                            y
                        };

                    }

                }
            );


            if (!best) {
                return;
            }


            /*
            ------------------------------------------------
             Apply position
            ------------------------------------------------
            */

            card.style.left =
                `${best.x}px`;

            card.style.top =
                `${best.y}px`;


            /*
            ------------------------------------------------
             Record actual circle geometry
            ------------------------------------------------
            */

            placed.push({

                x: best.x,

                y: best.y,

                diameter,

                radius

            });

        }
    );


    /*
    -------------------------------------------------------
     Calculate total field height
    -------------------------------------------------------
    */

    let fieldHeight =
        0;


    placed.forEach(
        circle => {

            fieldHeight =
                Math.max(
                    fieldHeight,
                    circle.y +
                    circle.diameter
                );

        }
    );


    gridElement.style.height =
        `${fieldHeight + 30}px`;

}


    /*
    =======================================================
     SELECT
    =======================================================
    */

    function select(id) {

        const video =
            videos.find(
                item =>
                    item.id === id
            );

        if (!video) {
            return;
        }

        selectedVideoId =
            id;

        refreshSelection();


        /*
        The Library does not control
        the player.

        It hands the selected
        contract to VideoViewer.
        */

        if (
            window.VideoViewer &&
            typeof VideoViewer.openVideo ===
                "function"
        ) {

            VideoViewer.openVideo(
                video
            );

        }
    }


    /*
    -------------------------------------------------------
     Selection State
    -------------------------------------------------------
    */

    function refreshSelection() {

        if (!gridElement) {
            return;
        }

        const cards =
            gridElement.querySelectorAll(
                "[data-video-id]"
            );

        cards.forEach(card => {

            card.classList.toggle(
                "selected",
                card.dataset.videoId ===
                    selectedVideoId
            );

        });
    }


    /*
    -------------------------------------------------------
     Get Videos
    -------------------------------------------------------
    */

    function getVideos() {

        return [...videos];
    }


    /*
    -------------------------------------------------------
     Get Current View
    -------------------------------------------------------
    */

    function getView() {

        return currentView;
    }


    /*
    -------------------------------------------------------
     Get Index / Count

     Used by the status bar to show "N of total" against
     the full (unfiltered) library, regardless of search.
    -------------------------------------------------------
    */

    function getIndex(id) {

        return videos.findIndex(
            video => video.id === id
        );
    }


    function getCount() {

        return videos.length;
    }


    /*
    -------------------------------------------------------
     Public API
    -------------------------------------------------------
    */

    return {

    init,
    load,
    render,
    renderLanding,

    select,

    setView,
    toggleView,

    setFilter,
    setSort,
    setOrganizationFilter,
    setCategory,
    getSort,
    getOrganizationFilter,
    getCategory,
    getCategories,

    getVideos,
    getView,

    getIndex,
    getCount

};

})();