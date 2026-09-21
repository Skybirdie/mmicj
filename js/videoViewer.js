"use strict";

/*

SkyReader Video Viewer

Video player + responsive landing

Status indicator:
    Native video  -> elapsed / total
                    00:00 / 08:42

YouTube iframe:
    Playback timing is not available directly from the
    iframe and therefore does not fabricate a page count.

=========================================================
*/

window.VideoViewer = (function () {

let viewerElement = null;
let videoElement = null;
let iframeElement = null;
let activePlayerType = "video";
let titleElement = null;

let landingElement = null;

let statusMessageElement = null;
let statusTitleElement = null;
let statusIndicatorElement = null;

let currentVideo = null;
let lastSelectedVideo = null;

let resizeObserverBound = false;


/*
=========================================================
 STATUS / TIME DISPLAY
=========================================================
*/

/*
---------------------------------------------------------
 Format seconds as:

    MM:SS

or, for videos one hour or longer:

    H:MM:SS
---------------------------------------------------------
*/

function formatVideoTime(seconds) {

    if (!Number.isFinite(seconds) || seconds < 0) {
        return "00:00";
    }

    seconds = Math.floor(seconds);

    const hours =
        Math.floor(seconds / 3600);

    const minutes =
        Math.floor((seconds % 3600) / 60);

    const secs =
        seconds % 60;

    if (hours > 0) {

        return (
            hours +
            ":" +
            String(minutes).padStart(2, "0") +
            ":" +
            String(secs).padStart(2, "0")
        );

    }

    return (
        String(minutes).padStart(2, "0") +
        ":" +
        String(secs).padStart(2, "0")
    );

}


/*
---------------------------------------------------------
 Reset the playback timer.

 This deliberately clears the old library position so a
 video can never display something like "3 / 4".
---------------------------------------------------------
*/

function resetVideoTimer() {

    if (!statusIndicatorElement) {
        return;
    }

    if (
        activePlayerType === "video" &&
        videoElement &&
        Number.isFinite(videoElement.duration) &&
        videoElement.duration > 0
    ) {

        statusIndicatorElement.textContent =
            "00:00 / " +
            formatVideoTime(videoElement.duration);

    }
    else {

        statusIndicatorElement.textContent =
            "";

    }

}


/*
---------------------------------------------------------
 Update elapsed / total playback time.

 Only the native <video> element is handled here.

 YouTube iframe playback is intentionally not guessed.
---------------------------------------------------------
*/

function updateVideoTimer() {

    if (!statusIndicatorElement) {
        return;
    }

    if (
        activePlayerType !== "video" ||
        !videoElement ||
        !currentVideo
    ) {

        statusIndicatorElement.textContent = "";

        return;
    }

    const currentTime =
        Number.isFinite(videoElement.currentTime)
            ? videoElement.currentTime
            : 0;

    const duration =
        Number.isFinite(videoElement.duration) &&
        videoElement.duration > 0
            ? videoElement.duration
            : 0;

    if (!duration) {

        statusIndicatorElement.textContent =
            formatVideoTime(currentTime);

        return;
    }

    statusIndicatorElement.textContent =
        formatVideoTime(currentTime) +
        " / " +
        formatVideoTime(duration);

}


/*
---------------------------------------------------------
 Bind native video timing events.

 These events keep the status bar synchronized with the
 actual video rather than with the position of the video
 in the library.
---------------------------------------------------------
*/

function bindVideoTimingEvents() {

    if (!videoElement || videoElement.dataset.skyTimingBound) {
        return;
    }

    videoElement.dataset.skyTimingBound = "true";

    videoElement.addEventListener(
        "loadedmetadata",
        updateVideoTimer
    );

    videoElement.addEventListener(
        "durationchange",
        updateVideoTimer
    );

    videoElement.addEventListener(
        "timeupdate",
        updateVideoTimer
    );

    videoElement.addEventListener(
        "progress",
        updateVideoTimer
    );

    videoElement.addEventListener(
        "play",
        updateVideoTimer
    );

    videoElement.addEventListener(
        "pause",
        updateVideoTimer
    );

    videoElement.addEventListener(
        "ended",
        updateVideoTimer
    );

}


/*
---------------------------------------------------------
 Initialize
---------------------------------------------------------
*/

function init(options = {}) {

    viewerElement =
        options.viewerElement ||
        document.getElementById("videoViewer");

    videoElement =
        options.videoElement ||
        document.getElementById("videoPlayer");

    titleElement =
        options.titleElement ||
        document.getElementById("videoViewerTitle");

    landingElement =
        options.landingElement ||
        document.getElementById("videoLanding");

    statusMessageElement =
        options.statusMessageElement ||
        document.getElementById("videoStatusMessage");

    statusTitleElement =
        options.statusTitleElement ||
        document.getElementById("videoStatusTitle");

    statusIndicatorElement =
        options.statusIndicatorElement ||
        document.getElementById("videoIndicator");


    if (!videoElement) {
        return false;
    }


    /*
    ---------------------------------------------------
     Bind playback timing
    ---------------------------------------------------
    */

    bindVideoTimingEvents();


    const shareButton =
        document.getElementById("videoViewerShare");

    if (
        shareButton &&
        !shareButton.dataset.bound
    ) {

        shareButton.dataset.bound = "true";

        shareButton.addEventListener(
            "click",
            () => {

                if (
                    currentVideo &&
                    window.ShareManager
                ) {

                    ShareManager.share(
                        "video",
                        currentVideo
                    );

                }

            }
        );

    }


    const closeButton =
        document.getElementById("videoViewerClose");

    if (
        closeButton &&
        !closeButton.dataset.bound
    ) {

        closeButton.dataset.bound = "true";

        closeButton.addEventListener(
            "click",
            closeVideo
        );

    }


    if (
        !document.documentElement.dataset.videoEscapeBound
    ) {

        document.documentElement.dataset.videoEscapeBound =
            "true";

        document.addEventListener(
            "keydown",
            event => {

                if (event.key !== "Escape") {
                    return;
                }

                if (currentVideo) {

                    event.preventDefault();
                    event.stopPropagation();

                    closeVideo();

                }

            },
            true
        );

    }


    /*
    ---------------------------------------------------
     Video metadata
    ---------------------------------------------------
    */

    videoElement.addEventListener(
        "loadedmetadata",
        handleMetadata
    );

    /*
    Safety net: a few browsers can report loadedmetadata
    before videoWidth/videoHeight are populated.
    */

    videoElement.addEventListener(
        "loadeddata",
        handleMetadata
    );


    /*
    ---------------------------------------------------
     Responsive layout
    ---------------------------------------------------
    */

    window.addEventListener(
        "resize",
        () => {

            refreshVideoLayout();

        }
    );


    /*
    ---------------------------------------------------
     Viewer resize observer
    ---------------------------------------------------
    */

    if (
        !resizeObserverBound &&
        typeof ResizeObserver !== "undefined" &&
        viewerElement
    ) {

        resizeObserverBound = true;

        const observer =
            new ResizeObserver(() => {

                refreshVideoLayout();

            });

        observer.observe(viewerElement);

    }


    if (
        !document.documentElement.dataset.videoFullscreenBound
    ) {

        document.documentElement.dataset.videoFullscreenBound =
            "true";

        document.addEventListener(
            "fullscreenchange",
            () => refreshVideoLayout()
        );

    }


    /*
    ---------------------------------------------------
     Initial state
    ---------------------------------------------------
    */

    refreshVideoLayout();

renderLanding();

resetVideoTimer();

updateStatusBar(null);

return true;

}


/*
=========================================================
 LANDING
=========================================================
*/

function renderLanding() {

    if (!landingElement) {
        return;
    }


    /*
    ---------------------------------------------------
     Get authoritative video collection.
    ---------------------------------------------------
    */

    let videos = [];


    if (
        window.VideoLibrary &&
        typeof VideoLibrary.getVideos === "function"
    ) {

        videos =
            VideoLibrary.getVideos();

    }


    /*
    ---------------------------------------------------
     Clear existing cards.
    ---------------------------------------------------
    */

    const continueContainer =
        landingElement.querySelector(
            "#videoLandingContinue"
        );

    const libraryContainer =
        landingElement.querySelector(
            "#videoLandingLibrary"
        );

    const continueSection =
        landingElement.querySelector(
            ".video-landing-continue-section"
        );

    const mediaRow =
        landingElement.querySelector(
            ".video-landing-media-row"
        );


    if (continueContainer) {
        continueContainer.innerHTML = "";
    }


    if (continueSection) {
        continueSection.classList.add("is-empty");
    }


    if (mediaRow) {
        mediaRow.classList.add("is-empty");
    }


    if (libraryContainer) {
        libraryContainer.innerHTML = "";
    }


    /*
    ---------------------------------------------------
     Nothing to render yet.
    ---------------------------------------------------
    */

    if (!videos.length) {
        return;
    }


    if (!lastSelectedVideo) {

        try {

            const recent =
                JSON.parse(
                    localStorage.getItem(
                        "skyvideo-recent"
                    ) || "[]"
                );

            if (
                Array.isArray(recent) &&
                recent.length
            ) {

                lastSelectedVideo =
                    videos.find(
                        video =>
                            video.id === recent[0]
                    ) || null;

            }

        }
        catch (e) {}

    }


    /*
    ---------------------------------------------------
     Library

     Sorted newest-first by contract "date" regardless of
     whatever sort the sidebar (.video-library) is currently
     using - the landing's default is always newest, not
     whatever the user picked for the sidebar.
    ---------------------------------------------------
    */

    if (libraryContainer) {

        const landingVideos =
            window.VideoSorter &&
            typeof VideoSorter.organize === "function"
                ? VideoSorter.organize({
                    videos,
                    sort: "newest"
                })
                : videos;

        landingVideos.forEach(
            video => {

                libraryContainer.appendChild(
                    createLandingCircle(video)
                );

            }
        );

    }


    /*
    ---------------------------------------------------
     View Again
    ---------------------------------------------------
    */

    if (
        continueContainer &&
        continueSection &&
        lastSelectedVideo
    ) {

        continueContainer.appendChild(
            createWatchAgainCard(
                lastSelectedVideo
            )
        );

        continueSection.classList.remove(
            "is-empty"
        );

        if (mediaRow) {

            mediaRow.classList.remove(
                "is-empty"
            );

        }

    }

}


/*
-------------------------------------------------------
 Watch Again card
-------------------------------------------------------
*/

function createWatchAgainCard(video) {

    const card =
        document.createElement("button");

    card.type =
        "button";

    card.className =
        "video-landing-recent-card";


    const thumbnail =
        document.createElement("img");

    thumbnail.className =
        "video-landing-recent-thumbnail";

    thumbnail.loading =
        "lazy";

    thumbnail.src =
        video.thumbnail || "";

    thumbnail.alt =
        video.title || "";


    const info =
        document.createElement("div");

    info.className =
        "video-landing-recent-info";


    const title =
        document.createElement("div");

    title.className =
        "video-landing-recent-title";

    title.textContent =
        video.title || "";


    const subtitle =
        document.createElement("div");

    subtitle.className =
        "video-landing-recent-subtitle";

    subtitle.textContent =
        "Last watched";


    info.appendChild(title);
    info.appendChild(subtitle);

    card.appendChild(thumbnail);
    card.appendChild(info);


    card.addEventListener(
        "click",
        () => {

            openVideo(video);

        }
    );


    return card;

}


/*
-------------------------------------------------------
 Featured
-------------------------------------------------------
*/

function createLandingFeatured(video) {

    const wrapper =
        document.createElement("div");

    wrapper.className =
        "video-landing-featured";


    const button =
        document.createElement("button");

    button.type =
        "button";

    button.className =
        "video-landing-watch";


    const thumbnail =
        document.createElement("div");

    thumbnail.className =
        "video-landing-watch-thumbnail";


    if (video.thumbnail) {

        const image =
            document.createElement("img");

        image.src =
            video.thumbnail;

        image.alt =
            video.title || "";

        image.loading =
            "lazy";

        thumbnail.appendChild(
            image
        );

    }


    const watchLabel =
        document.createElement("span");

    watchLabel.className =
        "video-landing-watch-label";

    watchLabel.textContent =
        "Watch";


    button.appendChild(thumbnail);
    button.appendChild(watchLabel);


    button.addEventListener(
        "click",
        () => {

            openVideo(video);

        }
    );


    wrapper.appendChild(button);

    return wrapper;

}


/*
-------------------------------------------------------
 Landing Circle
-------------------------------------------------------
*/

function createLandingCircle(video) {

    const button =
        document.createElement("button");

    button.type =
        "button";

    button.className =
        "video-landing-circle-card";


    const circle =
        document.createElement("div");

    circle.className =
        "video-landing-circle";


    if (video.thumbnail) {

        const image =
            document.createElement("img");

        image.src =
            video.thumbnail;

        image.alt =
            video.title || "";

        image.loading =
            "lazy";

        circle.appendChild(image);

    }


    button.appendChild(circle);


    const title =
        document.createElement("span");

    title.className =
        "video-landing-circle-title";

    title.textContent =
        video.title || "";

    button.appendChild(title);


    const dateText =
        window.DateDisplay &&
        typeof DateDisplay.format === "function"
            ? DateDisplay.format(video.date)
            : "";

    if (dateText) {

        const date =
            document.createElement("span");

        date.className =
            "video-landing-circle-date";

        date.textContent =
            dateText;

        button.appendChild(date);

    }


    const favorite =
        document.createElement("span");

    favorite.className =
        "video-landing-favorite";

    favorite.setAttribute(
        "role",
        "button"
    );

    favorite.setAttribute(
        "tabindex",
        "0"
    );

    favorite.setAttribute(
        "aria-label",
        "Favorite " +
        (video.title || "video")
    );


    function refreshFavorite() {

        const active =
            !!(
                window.VideoFavorites &&
                VideoFavorites.has(video.id)
            );

        favorite.classList.toggle(
            "is-favorite",
            active
        );

        favorite.textContent =
            active ? "♥" : "♡";

        favorite.setAttribute(
            "aria-pressed",
            String(active)
        );

    }


    function toggleFavorite(event) {

        event.preventDefault();
        event.stopPropagation();

        if (window.VideoFavorites) {
            VideoFavorites.toggle(video.id);
        }

        refreshFavorite();

        if (
            window.VideoLibrary &&
            typeof VideoLibrary.render === "function"
        ) {

            VideoLibrary.render();

        }

        renderLanding();

    }


    favorite.addEventListener(
        "click",
        toggleFavorite
    );


    favorite.addEventListener(
        "keydown",
        event => {

            if (
                event.key === "Enter" ||
                event.key === " "
            ) {

                toggleFavorite(event);

            }

        }
    );


    button.appendChild(favorite);

    refreshFavorite();


    button.addEventListener(
        "click",
        () => {

            openVideo(video);

        }
    );


    return button;

}


/*
=========================================================
 STATUS BAR
=========================================================
*/

function setStatusMessage(message) {

    if (statusMessageElement) {

        statusMessageElement.textContent =
            message || "";

    }

}


/*
---------------------------------------------------------
 Update status bar

 The centered message contains the item title.

 The indicator is now playback time for native videos.

 IMPORTANT:
 We intentionally do NOT use VideoLibrary.getIndex()
 or VideoLibrary.getCount() here.

 Therefore the video viewer can no longer display:

    3 / 4

as though videos were document pages.
---------------------------------------------------------
*/

function updateStatusBar(video) {

    if (statusMessageElement) {

        statusMessageElement.textContent =
            video
                ? (video.title || "")
                : "MMicj";

    }


    /*
    Keep legacy title element empty so the title is
    never duplicated.
    */

    if (statusTitleElement) {

        statusTitleElement.textContent = "";

    }


    /*
    Playback indicator
    */

    if (video) {

        updateVideoTimer();

    }
    else if (statusIndicatorElement) {

        statusIndicatorElement.textContent = "";

    }

}


/*
=========================================================
 PLAYER
=========================================================
*/

function ensureIframePlayer() {

    if (iframeElement) {
        return iframeElement;
    }


    iframeElement =
        document.createElement("iframe");

    iframeElement.id =
        "videoIframePlayer";

    iframeElement.className =
        "video-iframe-player";


    iframeElement.setAttribute(
        "allow",
        "autoplay; fullscreen; picture-in-picture"
    );


    iframeElement.setAttribute(
        "referrerpolicy",
        "strict-origin-when-cross-origin"
    );


    iframeElement.setAttribute(
        "allowfullscreen",
        ""
    );


    iframeElement.setAttribute(
        "frameborder",
        "0"
    );


    iframeElement.style.display =
        "none";


    if (
        videoElement &&
        videoElement.parentNode
    ) {

        videoElement.parentNode.insertBefore(
            iframeElement,
            videoElement.nextSibling
        );

    }


    return iframeElement;

}


function clearActivePlayer() {

    if (videoElement) {

        videoElement.pause();

        videoElement.removeAttribute(
            "src"
        );

        videoElement.load();

        videoElement.style.display =
            "none";

    }


    if (iframeElement) {

        iframeElement.src =
            "about:blank";

        iframeElement.style.display =
            "none";

    }


    if (statusIndicatorElement) {

        statusIndicatorElement.textContent =
            "";

    }

}


function loadVideoPlayer(video) {

    if (!video) {
        return;
    }


    const isYouTube =
        window.ContentContract &&
        typeof ContentContract.isYouTubeUrl === "function" &&
        ContentContract.isYouTubeUrl(
            video.video
        );


    clearActivePlayer();


    /*
    ---------------------------------------------------
     YouTube
    ---------------------------------------------------
    */

    if (isYouTube) {

        activePlayerType =
            "iframe";


        const iframe =
            ensureIframePlayer();


        iframe.src =
            window.ContentContract &&
            typeof ContentContract.toYouTubeEmbedUrl === "function"
                ? ContentContract.toYouTubeEmbedUrl(
                    video.video
                )
                : video.video;


        iframe.style.display =
            "block";

        iframe.style.width =
            "100%";

        iframe.style.height =
            "100%";

        iframe.style.maxWidth =
            "100%";

        iframe.style.maxHeight =
            "100%";


        /*
        We cannot read YouTube playback position from
        the iframe without loading the YouTube IFrame API.

        Do not display a fake page count.
        */

        if (statusIndicatorElement) {

            statusIndicatorElement.textContent =
                "";

        }


        return;

    }


    /*
    ---------------------------------------------------
     Normal video file
    ---------------------------------------------------
    */

    activePlayerType =
        "video";


    if (!videoElement) {
        return;
    }


    videoElement.style.display =
        "block";


    videoElement.src =
        video.video;


    /*
    Start with a clean timer.
    */

    if (statusIndicatorElement) {

        statusIndicatorElement.textContent =
            "00:00 / 00:00";

    }


    videoElement.load();


    const playRequest =
        videoElement.play();


    if (
        playRequest &&
        typeof playRequest.catch === "function"
    ) {

        playRequest.catch(() => {});

    }

}


/*
=========================================================
 RECENT
=========================================================
*/

function recordRecentVideo(video) {

    if (!video || !video.id) {
        return;
    }


    const key =
        "skyvideo-recent";


    let ids = [];


    try {

        const value =
            JSON.parse(
                localStorage.getItem(key) || "[]"
            );

        ids =
            Array.isArray(value)
                ? value
                : [];

    }
    catch (e) {}


    ids =
        ids.filter(
            id => id !== video.id
        );


    ids.unshift(
        video.id
    );


    try {

        localStorage.setItem(
            key,
            JSON.stringify(
                ids.slice(0, 50)
            )
        );

    }
    catch (e) {}

}


/*
=========================================================
 MEDIA MANAGER
=========================================================
*/

function stopForMediaManager() {

    clearActivePlayer();


    currentVideo =
        null;


    activePlayerType =
        "video";


    if (titleElement) {

        titleElement.textContent =
            "";

    }


    updateStatusBar(null);


    if (viewerElement) {

        viewerElement.classList.remove(
            "has-video"
        );

    }


    if (landingElement) {

        landingElement.classList.remove(
            "hidden"
        );

    }


    renderLanding();

}


/*
=========================================================
 OPEN VIDEO
=========================================================
*/

function openVideo(video) {

    if (!video || !videoElement) {
        return;
    }


    if (
        window.MediaManager &&
        typeof MediaManager.claim === "function"
    ) {

        MediaManager.claim(
            "video",
            stopForMediaManager
        );

    }


    currentVideo =
        video;


    lastSelectedVideo =
        video;


    recordRecentVideo(video);


    /*
    ---------------------------------------------------
     Close narrow library drawer.
    ---------------------------------------------------
    */

    if (
        window.VideoUI &&
        typeof VideoUI.closeDrawer === "function"
    ) {

        VideoUI.closeDrawer();

    }


    /*
    ---------------------------------------------------
     Update title
    ---------------------------------------------------
    */

    if (titleElement) {

        titleElement.textContent =
            video.title || "";

    }


    /*
    Clear old timer BEFORE loading the new video.
    */

    if (statusIndicatorElement) {

        statusIndicatorElement.textContent =
            "00:00 / 00:00";

    }


    updateStatusBar(video);


    /*
    ---------------------------------------------------
     Hide landing
    ---------------------------------------------------
    */

    if (landingElement) {

        landingElement.classList.add(
            "hidden"
        );

    }


    /*
    ---------------------------------------------------
     Load source
    ---------------------------------------------------
    */

    loadVideoPlayer(video);


    /*
    ---------------------------------------------------
     Viewer state
    ---------------------------------------------------
    */

    if (viewerElement) {

        viewerElement.classList.add(
            "has-video"
        );

    }


    refreshVideoLayout();


    window.requestAnimationFrame(
        () => {

            refreshVideoLayout();

        }
    );


    renderLanding();

}


/*
=========================================================
 CLOSE VIDEO
=========================================================
*/

function closeVideo() {

    if (!videoElement) {
        return;
    }


    /*
    Release true browser fullscreen first.
    */

    if (
        document.fullscreenElement &&
        (
            document.fullscreenElement === videoElement ||
            document.fullscreenElement === iframeElement
        )
    ) {

        document.exitFullscreen?.().catch(
            () => {}
        );

    }


    clearActivePlayer();


    if (
        window.MediaManager &&
        typeof MediaManager.release === "function"
    ) {

        MediaManager.release(
            "video"
        );

    }


    currentVideo =
        null;


    activePlayerType =
        "video";


    if (titleElement) {

        titleElement.textContent =
            "";

    }


    updateStatusBar(null);


    if (viewerElement) {

        viewerElement.classList.remove(
            "has-video"
        );

    }


    /*
    ---------------------------------------------------
     Show landing again.

     Previously waited 1s (setTimeout) before removing "hidden"
     so the landing would float back in. The landing is already
     "hidden" from openVideo() by this point, so removing it here
     immediately still transitions cleanly from its hidden
     position (see .video-landing in video.css) - it just no
     longer waits a second to start.
    ---------------------------------------------------
    */

    if (landingElement) {

        if (window.__skyVideoLandingTimer) {

            window.clearTimeout(
                window.__skyVideoLandingTimer
            );

            window.__skyVideoLandingTimer =
                null;

        }

        landingElement.classList.add(
            "hidden"
        );

        landingElement.classList.remove(
            "hidden"
        );

    }


    renderLanding();

}


/*
=========================================================
 METADATA
=========================================================
*/

function handleMetadata() {

    /*
    Update playback timer immediately when duration
    becomes available.
    */

    updateVideoTimer();


    const width =
        videoElement.videoWidth;

    const height =
        videoElement.videoHeight;


    if (!width || !height) {
        return;
    }


    const ratio =
        width / height;


    if (viewerElement) {

        viewerElement.dataset.videoWidth =
            width;

        viewerElement.dataset.videoHeight =
            height;

        viewerElement.dataset.videoRatio =
            ratio;

    }


    refreshVideoLayout();

}


/*
=========================================================
 COMPUTE VIDEO BOX
=========================================================
*/

function computeVideoBoxSize() {

    if (!viewerElement) {
        return null;
    }


    const styles =
        window.getComputedStyle(
            viewerElement
        );


    const paddingTop =
        parseFloat(styles.paddingTop) || 0;

    const paddingBottom =
        parseFloat(styles.paddingBottom) || 0;

    const paddingLeft =
        parseFloat(styles.paddingLeft) || 0;

    const paddingRight =
        parseFloat(styles.paddingRight) || 0;


    const GUTTER =
        16;


    const availableWidth =
        viewerElement.clientWidth -
        paddingLeft -
        paddingRight -
        GUTTER;


    const availableHeight =
        viewerElement.clientHeight -
        paddingTop -
        paddingBottom -
        GUTTER;


    if (
        availableWidth <= 0 ||
        availableHeight <= 0
    ) {

        return null;

    }


    const ratio =
        parseFloat(
            viewerElement.dataset.videoRatio
        ) ||
        (16 / 9);


    let width;
    let height;


    if (
        availableWidth /
        availableHeight >
        ratio
    ) {

        height =
            availableHeight;

        width =
            height * ratio;

    }
    else {

        width =
            availableWidth;

        height =
            width / ratio;

    }


    return {
        width,
        height
    };

}


/*
=========================================================
 REFRESH VIDEO LAYOUT
=========================================================
*/

function refreshVideoLayout() {

    if (
        !viewerElement ||
        !videoElement
    ) {

        return;

    }


    /*
    -------------------------------------------------------
     No active video
    -------------------------------------------------------
    */

    if (!currentVideo) {

        if (videoElement) {

            videoElement.style.display =
                "none";

        }


        if (iframeElement) {

            iframeElement.style.display =
                "none";

        }


        return;

    }


    /*
    -------------------------------------------------------
     YouTube iframe
    -------------------------------------------------------
    */

    if (activePlayerType === "iframe") {

        if (videoElement) {

            videoElement.style.display =
                "none";

        }


        if (iframeElement) {

            iframeElement.style.display =
                "block";

            iframeElement.style.width =
                "100%";

            iframeElement.style.height =
                "100%";

        }


        return;

    }


    /*
    -------------------------------------------------------
     Native video
    -------------------------------------------------------
    */

    videoElement.style.display =
        "block";


    const box =
        computeVideoBoxSize();


    if (box) {

        videoElement.style.width =
            box.width + "px";

        videoElement.style.height =
            box.height + "px";

    }
    else {

        videoElement.style.width =
            "100%";

        videoElement.style.height =
            "100%";

    }


    videoElement.style.maxWidth =
        "100%";

    videoElement.style.maxHeight =
        "100%";

    videoElement.style.objectFit =
        "contain";

}


/*
=========================================================
 PLAYBACK
=========================================================
*/

function play() {

    if (!videoElement) {
        return;
    }

    return videoElement.play();

}


function pause() {

    if (!videoElement) {
        return;
    }

    videoElement.pause();

}


function togglePlay() {

    if (!videoElement) {
        return;
    }


    if (videoElement.paused) {

        return play();

    }


    pause();

}


/*
=========================================================
 MUTE
=========================================================
*/

function setMuted(value) {

    if (!videoElement) {
        return;
    }

    videoElement.muted =
        Boolean(value);

}


function toggleMute() {

    if (!videoElement) {
        return;
    }

    videoElement.muted =
        !videoElement.muted;

}


/*
=========================================================
 FULLSCREEN
=========================================================
*/

function fullscreen() {

    const target =
        activePlayerType === "iframe"
            ? iframeElement
            : videoElement;


    if (!target) {
        return;
    }


    if (document.fullscreenElement) {

        document.exitFullscreen();

        return;

    }


    if (target.requestFullscreen) {

        target.requestFullscreen();

    }

}


/*
=========================================================
 CURRENT VIDEO
=========================================================
*/

function getCurrentVideo() {

    return currentVideo;

}


/*
=========================================================
 PUBLIC API
=========================================================
*/

return {

    init,

    openVideo,

    closeVideo,

    play,

    pause,

    togglePlay,

    setMuted,

    toggleMute,

    fullscreen,

    getCurrentVideo,

    renderLanding

};

})();