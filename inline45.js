
document.addEventListener("DOMContentLoaded", async function () {

    let localContent = { content: [], frontCategories: [] };
    try {
        const response = await fetch("content.json?v=1.0.0", { cache: "no-store" });
        if (!response.ok) throw new Error("Unable to load content.json");
        localContent = await response.json();
    } catch (error) {
        console.error("[SkyMedia] Local content manifest could not be loaded.", error);
    }

    const contentItems = Array.isArray(localContent.content) ? localContent.content : [];
    const localVideos = contentItems.filter(item => String(item?.type || "").toLowerCase() === "video");
    const localSlideshows = contentItems.filter(item => String(item?.type || "").toLowerCase() === "slideshow");

    if (
        window.VideoViewer &&
        window.VideoLibrary
    ) {

        VideoLibrary.init();

        VideoViewer.init();

        VideoUI.init();

VideoLibrary.load(localVideos);

if (
    window.VideoViewer &&
    typeof VideoViewer.renderLanding === "function"
) {

    VideoViewer.renderLanding();

}


document
    .querySelectorAll(
        "[data-video-view]"
    )
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const view =
                    button.dataset.videoView;

                VideoLibrary.setView(
                    view
                );


                document
                    .querySelectorAll(
                        "[data-video-view]"
                    )
                    .forEach(item => {

                        item.classList.toggle(
                            "active",
                            item === button
                        );

                    });

            }
        );

    });


    }


    /*
    -----------------------------------------------------
     Video library organization
    -----------------------------------------------------
    */

    const videoSortButton = document.getElementById("videoSortButton");
    const videoFilterButton = document.getElementById("videoFilterButton");
    const videoSortMenu = document.getElementById("videoSortMenu");
    const videoFilterMenu = document.getElementById("videoFilterMenu");
    const videoSort = document.getElementById("videoSort");
    const videoFilter = document.getElementById("videoFilter");
    const videoCategory = document.getElementById("videoCategory");
    const videoFilterActive = document.getElementById("videoFilterActive");

    function closeVideoOrgMenus() {
        if (videoSortMenu) videoSortMenu.classList.add("hidden");
        if (videoFilterMenu) videoFilterMenu.classList.add("hidden");
    }

    function refreshVideoOrgControls() {
        if (!window.VideoLibrary) return;
        if (videoSort) videoSort.value = VideoLibrary.getSort();
        if (videoFilter) videoFilter.value = VideoLibrary.getOrganizationFilter();
        if (videoCategory) videoCategory.value = VideoLibrary.getCategory();
        if (videoFilterActive) {
            const active = VideoLibrary.getOrganizationFilter() !== "all" || VideoLibrary.getCategory() !== "all";
            videoFilterActive.classList.toggle("active", active);
        }
    }

    if (videoSortButton && videoSortMenu) {
        videoSortButton.addEventListener("click", event => {
            event.stopPropagation();
            if (videoFilterMenu) videoFilterMenu.classList.add("hidden");
            videoSortMenu.classList.toggle("hidden");
        });
    }

    if (videoFilterButton && videoFilterMenu) {
        videoFilterButton.addEventListener("click", event => {
            event.stopPropagation();
            if (videoSortMenu) videoSortMenu.classList.add("hidden");
            videoFilterMenu.classList.toggle("hidden");
        });
    }

    if (videoSort) {
        videoSort.addEventListener("change", () => {
            VideoLibrary.setSort(videoSort.value);
            closeVideoOrgMenus();
            refreshVideoOrgControls();
        });
    }

    if (videoFilter) {
        videoFilter.addEventListener("change", () => {
            VideoLibrary.setOrganizationFilter(videoFilter.value);
            refreshVideoOrgControls();
        });
    }

    if (videoCategory) {
        videoCategory.addEventListener("change", () => {
            VideoLibrary.setCategory(videoCategory.value);
            refreshVideoOrgControls();
        });
    }

    document.addEventListener("click", event => {
        if (!event.target.closest(".video-library-organization-controls")) {
            closeVideoOrgMenus();
        }
    });

    if (window.VideoLibrary && typeof VideoLibrary.getCategories === "function" && videoCategory) {
        VideoLibrary.getCategories().forEach(category => {
            const option = document.createElement("option");
            option.value = category;
            option.textContent = category;
            videoCategory.appendChild(option);
        });
    }

    refreshVideoOrgControls();


    /*
    -----------------------------------------------------
     Video top bar: search
    -----------------------------------------------------
    */

    const videoSearchGroup =
        document.getElementById("videoSearchGroup");

    const videoSearchButton =
        document.getElementById("videoSearchButton");

    const videoSearchBox =
        document.getElementById("videoSearchBox");

    if (videoSearchButton && videoSearchGroup && videoSearchBox) {

        videoSearchButton.addEventListener("click", () => {

            const open =
                videoSearchGroup.classList.toggle("searchOpen");

            if (open) {
                videoSearchBox.focus();
            }
            else {
                videoSearchBox.value = "";
                if (window.VideoLibrary && typeof VideoLibrary.setFilter === "function") {
                    VideoLibrary.setFilter("");
                }
            }

        });

        videoSearchBox.addEventListener("input", () => {

            if (window.VideoLibrary && typeof VideoLibrary.setFilter === "function") {
                VideoLibrary.setFilter(videoSearchBox.value);
            }

        });

    }


    /*
    -----------------------------------------------------
     Video top bar: settings (reuses SkyReader's panel)
    -----------------------------------------------------
    */

    const videoSettingsButton =
        document.getElementById("videoSettingsButton");

    if (videoSettingsButton) {

        videoSettingsButton.addEventListener("click", () => {

            if (typeof SettingsPanel !== "undefined") {
                SettingsPanel.toggle();
            }

        });

    }


    /*
    -----------------------------------------------------
     Switching between the Reader and Video sections
    -----------------------------------------------------
    */

    if (window.SlideshowLibrary && window.SlideshowViewer && window.SlideshowUI) {
        SlideshowLibrary.init();
        SlideshowViewer.init();
        SlideshowUI.init();

        SlideshowLibrary.load(localSlideshows);;

        const slideshowSort = document.getElementById("slideshowSort");
        const slideshowFilter = document.getElementById("slideshowFilter");
        const slideshowCategory = document.getElementById("slideshowCategory");
        if (slideshowSort) slideshowSort.value = SlideshowLibrary.getSort();
        if (slideshowFilter) slideshowFilter.value = SlideshowLibrary.getFilter();
        if (slideshowCategory) slideshowCategory.value = SlideshowLibrary.getCategory();
    }

    if (window.FrontPage) {
        if (Array.isArray(localContent.frontCategories) && localContent.frontCategories.length === 7) {
            try { FrontPage.setCategories(localContent.frontCategories); } catch (e) { console.warn("[SkyMedia] Front Page categories were not applied.", e); }
        }
        FrontPage.init();
    }

    if (window.AppSwitcher) {
        AppSwitcher.init();
    }

    if (window.FrontPage && typeof FrontPage.refresh === "function") {
        FrontPage.refresh();
    }

    const readerShareButton = document.getElementById("readerShareButton");
    if (readerShareButton && !readerShareButton.dataset.bound) {
        readerShareButton.dataset.bound = "true";
        readerShareButton.addEventListener("click", () => {
            const book = window.Reader && typeof Reader.book === "function" ? Reader.book() : null;
            if (book && window.ShareManager) ShareManager.share("reader", book);
        });
    }

    window.setTimeout(() => {
        if (window.ShareManager && typeof ShareManager.openDeepLink === "function") ShareManager.openDeepLink();
    }, 0);

});
