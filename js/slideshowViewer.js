"use strict";

window.SlideshowViewer = (function () {
    let root, stage, title, status, audio, landing, current = null, index = 0, timer = null, playing = false, muted = false, transitionBusy = false, transitionGeneration = 0, pendingAdvance = false;
    let audioMode = "none";
    let audioCompleted = false;
    let audioNeedsGesture = false;
    let audioCueTimer = null;
    let musicAudio = null;
    let effectAudio = null;
    const EFFECT_URL = "assets/audio/slide.mp3";
    const EFFECT_FALLBACK_URL = "assets/audio/pageturn.mp3";
    const MUSIC_LIBRARY = [];
    const MUSIC_MANIFEST_URL = "assets/slideshowMusic/manifest.json";
    let musicLibraryLoaded = false;
    let selectedMusicTrack = null;
    let musicPickerEl = null;
    let musicPickerOpen = false;
    let zoomController = null;

    function titleFromFilename(filename) {
        const base = String(filename || "")
            .replace(/\.[^/.]+$/, "")
            .replace(/[-_]+/g, " ")
            .trim();

        return base.replace(
            /\w\S*/g,
            word => word.charAt(0).toUpperCase() + word.slice(1)
        ) || filename;
    }

    function setPlaybackChrome(active){
        document.querySelectorAll(".slideshow-toolbar,.slideshow-status-bar,.slideshow-playback-status,.slideshow-viewer-title").forEach(el=>{el.hidden=!active;});
    }



    function init() {
        root = document.getElementById("slideshowViewer");
        stage = document.getElementById("slideshowStage");
        title = document.getElementById("slideshowViewerTitle");
        status = document.getElementById("slideshowStatus");
        audio = document.getElementById("slideshowAudio");
        landing = document.getElementById("slideshowLanding");
        if (!stage) return false;
        setPlaybackChrome(false);
        if (!document.documentElement.dataset.slideshowEscapeBound) {
            document.documentElement.dataset.slideshowEscapeBound = "true";
            document.addEventListener("keydown", event => {
                if (event.key !== "Escape") return;

                /* The music picker is a popup living inside the slideshow
                   viewer. Escape should dismiss whichever is the top-most
                   layer first. This check has to happen here, in the same
                   capture-phase listener that closes the whole viewer —
                   a stopPropagation() added inside the picker's own search
                   box cannot stop a capture-phase document listener, since
                   capture runs top-down before the event ever reaches the
                   search box. Without this check, Escape while the music
                   picker is open (whether or not its search box has focus)
                   closes the entire slideshow instead of just the popup. */
                if (musicPickerOpen) {
                    event.preventDefault();
                    event.stopPropagation();
                    closeMusicPicker();
                    return;
                }

                if (current) {
                    event.preventDefault();
                    event.stopPropagation();
                    close();
                }
            }, true);
        }
        audio?.addEventListener("ended", () => {
            if (audioMode === "original" && current?.audio) {
                audioCompleted = true;
                // Do not restart the audio. The slideshow may continue
                // through the remaining slides until it reaches the end.
                if (playing && slideCount() && index >= slideCount() - 1) finish();
            }
        });
        window.addEventListener("resize", refreshLayout);

        if (!window.__skySlideshowAppSwitchListenerBound) {

            window.__skySlideshowAppSwitchListenerBound = true;

            /*
             * Reader already floats #viewerLibrary back in when the
             * user switches to it via the app-switcher menu (its
             * "isReturning" keyframe animation naturally replays
             * once #app stops being display:none). .slideshow-landing
             * instead relies on a plain CSS transition tied to the
             * "hidden" class, which does NOT replay just from an
             * ancestor's display toggling - so without this listener,
             * switching to Slideshow showed the landing with no
             * float-in at all. Re-running the same add/remove
             * "hidden" sequence used in close() (with a forced
             * reflow in between, since here the landing starts out
             * visible rather than already hidden) reproduces that
             * same float-in on tab switch.
             */
            window.addEventListener("app:switched", event => {

                if (
                    !event.detail ||
                    event.detail.id !== "slideshow" ||
                    current ||
                    !landing
                ) {
                    return;
                }

                landing.classList.add("hidden");
                void landing.offsetWidth;
                landing.classList.remove("hidden");

            });

        }

        renderLanding();
        loadMusicLibrary();
        setAudioMode(current?.audio ? "original" : "effects");
        return true;
    }


    /*
    ---------------------------------------------------
     Music library

     Reads assets/slideshowMusic/manifest.json — a simple
     list the user maintains, since a static site has no
     way to list a folder's contents on its own. Each
     entry can be either a bare filename:

       "track.mp3"

     or an object with a custom display title:

       { "file": "track.mp3", "title": "My Track" }

     A missing or malformed manifest is not treated as an
     error — it just leaves the Music option unavailable
     rather than breaking anything else.
    ---------------------------------------------------
    */

    async function loadMusicLibrary() {

        try {

            const response = await fetch(MUSIC_MANIFEST_URL, { cache: "no-store" });

            if (!response.ok) {
                throw new Error("Music manifest not found: " + response.status);
            }

            const raw = await response.json();

            if (!Array.isArray(raw)) {
                throw new Error("Music manifest must be a JSON array.");
            }

            MUSIC_LIBRARY.length = 0;

            raw.forEach(entry => {

                const file =
                    typeof entry === "string"
                        ? entry
                        : (entry && entry.file) || "";

                if (!file) {
                    return;
                }

                const title =
                    (entry && typeof entry === "object" && entry.title) ||
                    titleFromFilename(file);

                MUSIC_LIBRARY.push({
                    file,
                    title,
                    url: MUSIC_MANIFEST_URL.replace("manifest.json", "") + file
                });

            });

        } catch (error) {

            console.warn("[SlideshowViewer] Unable to load music library.", error);

        } finally {

            musicLibraryLoaded = true;

            const select = document.getElementById("slideshowAudioMode");

            if (select) {

                const music = select.querySelector('option[value="music"]');

                if (music) {
                    music.disabled = !MUSIC_LIBRARY.length;
                }

            }

            if (musicPickerOpen) {
                renderMusicPickerList();
            }

        }
    }
    function renderLanding() {
        const container = document.getElementById("slideshowLandingLibrary"); if (!container) return;
        container.innerHTML = "";
        const recentContainer = document.getElementById("slideshowLandingRecent");
        if (recentContainer) recentContainer.innerHTML = "";
        const mediaRow = document.querySelector(".slideshow-landing-media-row");
        const rawList = window.SlideshowLibrary ? SlideshowLibrary.getSlideshows() : [];
        const list =
            window.SlideshowSorter &&
            typeof SlideshowSorter.organize === "function"
                ? SlideshowSorter.organize({ slideshows: rawList, sort: "newest" })
                : rawList;
        let recentItem = null;
        try {
            const ids = JSON.parse(localStorage.getItem("skyslideshow-recent") || "[]");
            if (Array.isArray(ids) && ids.length) recentItem = list.find(x => x.id === ids[0]) || null;
        } catch (e) {}

        /*
         * When there is no recent item, the media row (which holds the
         * View Again card) has to collapse instead of sitting there as
         * a fixed-height empty band — otherwise there is a permanent
         * gap between the hero and the library row below. The library
         * section's own flex-grow then absorbs the freed space.
         */
        if (mediaRow) {
            mediaRow.classList.toggle("is-empty", !recentItem);
        }

        if (recentContainer && recentItem) {
            const b = document.createElement("button"); b.type="button"; b.className="slideshow-landing-recent-card";
            const img=document.createElement("img");

img.className = "slideshow-landing-recent-thumbnail";
img.loading = "lazy";
img.alt = recentItem.title || "";

const fallbackThumbnail = "assets/default-thumbnail.png";

img.src =
    recentItem.thumbnail ||
    recentItem.slides?.[0]?.image ||
    fallbackThumbnail;

img.addEventListener("error", () => {

    if (img.dataset.fallbackApplied === "true") {
        return;
    }

    img.dataset.fallbackApplied = "true";
    img.src = fallbackThumbnail;


});



            const info=document.createElement("div"); info.className="slideshow-landing-recent-info";
            const title=document.createElement("div"); title.className="slideshow-landing-recent-title"; title.textContent=recentItem.title||"";
            const subtitle=document.createElement("div"); subtitle.className="slideshow-landing-recent-subtitle"; subtitle.textContent="Last viewed";
            info.append(title,subtitle);
            b.append(img,info);
            b.addEventListener("click",()=>open(recentItem)); recentContainer.appendChild(b);
        }
        list.forEach(item => {
            const b = document.createElement("button"); b.type="button"; b.className="slideshow-landing-card";
            const img = document.createElement("img");

img.className = "slideshow-landing-card-thumbnail";
img.loading = "lazy";
img.alt = item.title || "";

const fallbackThumbnail = "assets/default-thumbnail.png";

img.src =
    item.thumbnail ||
    item.slides?.[0]?.image ||
    fallbackThumbnail;

img.addEventListener("error", () => {

    if (img.dataset.fallbackApplied === "true") {
        return;
    }

    img.dataset.fallbackApplied = "true";
    img.src = fallbackThumbnail;

});
            const s = document.createElement("span");
s.className = "slideshow-landing-card-title";
s.textContent = item.title;

const cardChildren = [img, s];

const dateText =
    window.DateDisplay &&
    typeof DateDisplay.format === "function"
        ? DateDisplay.format(item.date)
        : "";

if (dateText) {
    const dateEl = document.createElement("span");
    dateEl.className = "slideshow-landing-card-date";
    dateEl.textContent = dateText;
    cardChildren.push(dateEl);
}

b.append(...cardChildren);

/*
 * Add the favorite control to every landing card.
 *
 * SlideshowLibrary owns the favorite implementation so
 * the landing cards use the same saved state and behavior
 * as the normal slideshow library.
 */
if (
    window.SlideshowLibrary &&
    typeof SlideshowLibrary.createFavorite === "function"
) {
    b.appendChild(
        SlideshowLibrary.createFavorite(item.id)
    );
}

b.addEventListener(
    "click",
    () => open(item)
);

container.appendChild(b);
        });
    }
    function slideCount(){
        if(!current) return 0;
        if(current.source === "pdf" || current.pdfUrl) {
            return Number(current.pdfPageCount || current.slideCount || 0);
        }
        return Array.isArray(current.slides) ? current.slides.length : 0;
    }

    function updateStatus(){
    const indicator = document.getElementById("slideshowIndicator");
    const total = slideCount();

    if(status) {
        status.textContent = current
            ? (current.title || "")
            : "MMicj";
    }

    if(indicator) {
        indicator.textContent =
            current && total ? `${index+1} / ${total}` : "";
    }
}
    function setStatus(message){
    const el = document.getElementById("slideshowPlaybackStatus");

    if(!el) return;

    const text = message || "";

    /*
     * Playback status is intentionally hidden during normal
     * slideshow operation. Only the final completion state
     * should be displayed.
     */
    if(text === "Finished"){
        el.textContent = text;
        el.hidden = false;
        return;
    }

    el.textContent = "";
    el.hidden = true;
}
    function updateTitle(){ if(title) title.textContent=current?current.title||"":""; }
    function stopTimer(){ if(timer){clearTimeout(timer);timer=null;} }
    function schedule(){
        stopTimer();
        if(!playing||!current)return;

        const slide = current.slides?.[index];
        const duration = Math.max(1, Number(slide?.duration) || 5);

        timer=setTimeout(()=>next(true),duration*1000);
    }
    function buildImageSlide(slide){
        const el=document.createElement("div");
        el.className="slideshow-slide";

        const img=document.createElement("img");
        img.src=slide.image;
        img.alt=slide.title||current?.title||"";
        img.draggable=false;
        el.appendChild(img);

        if(slide.caption){
            const cap=document.createElement("div");
            cap.className="slideshow-caption";
            cap.textContent=slide.caption;
            el.appendChild(cap);
        }

        return {element:el,ready:Promise.resolve(img)};
    }

    async function buildPdfSlide(pageNumber){
        const el=document.createElement("div");
        el.className="slideshow-slide";

        const canvas=document.createElement("canvas");
        canvas.setAttribute("aria-label", current?.title || "Slide");
        canvas.style.maxWidth="100%";
        canvas.style.maxHeight="100%";
        canvas.style.width="auto";
        canvas.style.height="auto";
        el.appendChild(canvas);

        if(!current?.pdfDocument){
            throw new Error("PDF slide show is not loaded.");
        }

        const page=await current.pdfDocument.getPage(pageNumber);
        const baseViewport=page.getViewport({scale:1});

        const maxWidth=Math.max(320,stage?.clientWidth||1200);
        const maxHeight=Math.max(220,stage?.clientHeight||700);
        const scale=Math.min(
            maxWidth/baseViewport.width,
            maxHeight/baseViewport.height
        );

        const viewport=page.getViewport({scale:Math.max(0.1,scale)});
        const dpr=window.devicePixelRatio||1;

        canvas.width=Math.ceil(viewport.width*dpr);
        canvas.height=Math.ceil(viewport.height*dpr);

        const context=canvas.getContext("2d",{alpha:false});
        context.setTransform(dpr,0,0,dpr,0,0);

        await page.render({
            canvasContext:context,
            viewport
        }).promise;

        return {element:el,ready:Promise.resolve(canvas)};
    }

    async function buildSlide(slideIndex){
        if(current?.source==="pdf" || current?.pdfUrl){
            return buildPdfSlide(slideIndex+1);
        }

        return buildImageSlide(current.slides[slideIndex]);
    }

function playSound(src, volume=1){

    if(muted || !src) {
        return;
    }

    /*
    -------------------------------------------------------
     Page-turn effects are also media.

     Stop any previous effect first.
    -------------------------------------------------------
    */

    if(effectAudio){
        effectAudio.pause();
        effectAudio.currentTime = 0;
        effectAudio = null;
    }

    effectAudio = new Audio(src);
    effectAudio.volume = volume;

    effectAudio.play().catch(() => {

        if(src !== EFFECT_FALLBACK_URL){

            if(effectAudio){
                effectAudio.pause();
            }

            effectAudio = new Audio(
                EFFECT_FALLBACK_URL
            );

            effectAudio.volume = volume;

            effectAudio.play().catch(() => {});

        }

    });

}

    function stopAudio(){

    audio?.pause();

    if(audio){
        audio.removeAttribute("src");
        audio.load();
    }

    musicAudio?.pause();

    if(effectAudio){
    effectAudio.pause();
    effectAudio.currentTime = 0;
    effectAudio = null;
}

if(musicAudio){
    musicAudio.pause();
    musicAudio.currentTime = 0;
    musicAudio.src = "";
    musicAudio.load();
    musicAudio = null;
}

}

function stopAllMedia() {

    playing = false;

    stopTimer();

    stopAudio();

}


function stopForMediaManager() {

    playing = false;
    stopTimer();
    stopAudio();

    if (
        current?.pdfDocument &&
        typeof current.pdfDocument.destroy === "function"
    ) {
        try {
            current.pdfDocument.destroy();
        } catch (e) {}
    }

    if (stage) {
        stage.innerHTML = "";
    }

    if (root) {
        root.classList.remove("has-slideshow");
    }

    setPlaybackChrome(false);

    current = null;
    index = 0;

    updateTitle();
    updateStatus();

    if (landing) {
        landing.classList.remove("hidden");
    }

    renderLanding();
}


    function startSelectedAudio() { /* ------------------------------------------------------- FULL AUDIO RESET Every time the sound mode changes, the previous audio source must be completely stopped and discarded. ------------------------------------------------------- */ stopAudio(); audioCompleted = false; audioNeedsGesture = false; if (!current) { updateAudioCue(); return; } /* ------------------------------------------------------- ORIGINAL ITEM AUDIO ------------------------------------------------------- */ if (audioMode === "original" && current.audio && audio) { let audioUrl = String(current.audio).trim(); /* * Support Markdown-style audio URLs if they occur * in content supplied by Glide. */ const markdownMatch = audioUrl.match( /^\[([^\]]+)\]\((https?:\/\/[^)]+)\)$/ ); if (markdownMatch) { audioUrl = markdownMatch[2]; } /* * Remove accidental surrounding quotes. */ audioUrl = audioUrl .replace(/^["']+|["']+$/g, "") .trim(); if (!audioUrl) { console.warn( "[SlideshowViewer] Original sound selected " + "but the audio URL is empty." ); updateAudioCue(); return; } console.log( "[SlideshowViewer] Loading original audio:", audioUrl ); audio.src = audioUrl; audio.preload = "auto"; audio.muted = muted; /* * Keep the source attached even if autoplay is rejected. */ audio.load(); /* * If playback was already active, attempt to continue * immediately. */ if (playing) { const playPromise = audio.play(); if ( playPromise && typeof playPromise.catch === "function" ) { playPromise.catch(error => { /* * NotAllowedError is expected when Share Mode * tries to begin unmuted audio without a * user gesture. */ audioNeedsGesture = true; console.warn( "[SlideshowViewer] Original sound autoplay " + "was blocked or failed:", error ); updateAudioCue(); }); } } /* * Show the cue immediately when this item has original * audio available. If autoplay succeeds, it changes to * the normal "Original sound" indication. */ if (audio.paused) { audioNeedsGesture = true; } updateAudioCue(); return; } /* ------------------------------------------------------- MUSIC ------------------------------------------------------- */ if (
    audioMode === "music" &&
    selectedMusicTrack
) { const track = selectedMusicTrack; musicAudio = new Audio(track.url); musicAudio.preload = "auto"; musicAudio.loop = false; musicAudio.muted = muted; musicAudio.addEventListener("ended", () => { /* * The selected music track has ended. * * Do not permanently stop the slideshow. The * slideshow may continue/loop according to its * normal playback behavior. */ audioCompleted = true; if ( playing && slideCount() && index >= slideCount() - 1 ) { finish(); } }); if (playing) { const playPromise = musicAudio.play(); if ( playPromise && typeof playPromise.catch === "function" ) { playPromise.catch(error => { audioNeedsGesture = true; console.warn( "[SlideshowViewer] Music autoplay was " + "blocked or failed:", error ); updateAudioCue(); }); } } if (musicAudio.paused) { audioNeedsGesture = true; } updateAudioCue(); return; } /* ------------------------------------------------------- NONE / PAGE TURN EFFECTS These modes intentionally have no continuous audio source. ------------------------------------------------------- */ updateAudioCue(); } 


function setAudioMode(mode) { const select = document.getElementById("slideshowAudioMode"); const requested = ["none", "original", "effects", "music"].includes(mode) ? mode : "none"; /* ------------------------------------------------------- DETERMINE THE ACTUAL NEW MODE FIRST ------------------------------------------------------- */ let nextMode = requested; if ( nextMode === "original" && !current?.audio ) { nextMode = "none"; } /* ------------------------------------------------------- LEAVING MUSIC This must happen BEFORE closeMusicPicker(). Otherwise closeMusicPicker() has no way to know that the user has already selected another audio mode. ------------------------------------------------------- */ if ( audioMode === "music" && nextMode !== "music" ) { /* * Stop the currently playing music immediately. */ if (musicAudio) { musicAudio.pause(); musicAudio.currentTime = 0; musicAudio.removeAttribute("src"); musicAudio.load(); musicAudio = null; } /* * Music is no longer the selected audio source. */ selectedMusicTrack = null; audioCompleted = false; audioNeedsGesture = false; } /* ------------------------------------------------------- SET THE NEW MODE BEFORE CLOSING THE PICKER ------------------------------------------------------- */ audioMode = nextMode; /* ------------------------------------------------------- CLOSE MUSIC PICKER Now that audioMode contains the NEW value, closing the picker cannot accidentally restore "music". ------------------------------------------------------- */ if (audioMode !== "music") { closeMusicPicker(); } /* ------------------------------------------------------- SYNCHRONIZE THE VISIBLE SELECTOR ------------------------------------------------------- */ if (select) { select.value = audioMode; const original = select.querySelector( 'option[value="original"]' ); if (original) { original.disabled = !current?.audio; } const music = select.querySelector( 'option[value="music"]' ); if (music) { music.disabled = !MUSIC_LIBRARY.length; } } /* ------------------------------------------------------- START ONLY THE NEWLY SELECTED AUDIO SOURCE ------------------------------------------------------- */ audioCompleted = false; audioNeedsGesture = false; startSelectedAudio(); /* ------------------------------------------------------- STATUS ------------------------------------------------------- */ setStatus( audioMode === "original" ? "Original sound" : audioMode === "music" ? "Music" : audioMode === "effects" ? "Page turn effects" : "No sound" ); updateAudioCue(); }


    /*
    ---------------------------------------------------
     Music picker popup

     Shown whenever the user chooses "Music" from the
     audio-mode dropdown. Lets them search/filter the
     tracks from the music library and pick one; picking
     a track is what actually switches audioMode to
     "music" — selecting the dropdown option alone just
     opens the picker.
    ---------------------------------------------------
    */

    function buildMusicPicker() {

        if (musicPickerEl) {
            return musicPickerEl;
        }

        const label = document.querySelector(".slideshow-audio-mode");

        if (!label) {
            return null;
        }

        const panel = document.createElement("div");
        panel.className = "slideshow-music-picker";
        panel.hidden = true;

        const search = document.createElement("input");
        search.type = "search";
        search.className = "slideshow-music-picker-search";
        search.placeholder = "Search music…";
        search.setAttribute("aria-label", "Search music");
        search.addEventListener("input", () => {
            renderMusicPickerList(search.value);
        });
        search.addEventListener("click", e => e.stopPropagation());
        search.addEventListener("keydown", e => e.stopPropagation());

        const list = document.createElement("div");
        list.className = "slideshow-music-picker-list";

        panel.append(search, list);
        label.appendChild(panel);

        musicPickerEl = { panel, search, list };

        return musicPickerEl;
    }

    function renderMusicPickerList(filter = "") {

        const picker = buildMusicPicker();

        if (!picker) {
            return;
        }

        const { list } = picker;
        list.innerHTML = "";

        const query = filter.trim().toLowerCase();

        const matches = MUSIC_LIBRARY.filter(
            track => !query || track.title.toLowerCase().includes(query)
        );

        if (!musicLibraryLoaded) {

            const loading = document.createElement("div");
            loading.className = "slideshow-music-picker-empty";
            loading.textContent = "Loading music…";
            list.appendChild(loading);
            return;
        }

        if (!matches.length) {

            const empty = document.createElement("div");
            empty.className = "slideshow-music-picker-empty";
            empty.textContent = MUSIC_LIBRARY.length
                ? "No matches."
                : "No music files available yet.";
            list.appendChild(empty);
            return;
        }

        matches.forEach(track => { const item = document.createElement("button"); item.type = "button"; item.className = "slideshow-music-picker-item"; if ( selectedMusicTrack && selectedMusicTrack.file === track.file ) { item.classList.add("is-selected"); } item.textContent = track.title; item.addEventListener("click", async event => { event.preventDefault(); event.stopPropagation(); console.log( "[SlideshowViewer] Music track selected:", track.title ); /* * The user's click is a real browser gesture. * Select the new track and make Music the active mode. */ selectedMusicTrack = track; audioMode = "music"; audioCompleted = false; audioNeedsGesture = false; /* * Synchronize the dropdown immediately. */ const select = document.getElementById("slideshowAudioMode"); if (select) { select.value = "music"; } /* * Stop and completely discard the previous music * instance before creating the new one. */ if (musicAudio) { musicAudio.pause(); musicAudio.currentTime = 0; musicAudio.removeAttribute("src"); musicAudio.load(); musicAudio = null; } /* * Start the newly selected track immediately. * * The click itself is the user's gesture, so this * playback request should normally be accepted by * the browser. */ startSelectedAudio(); /* * startSelectedAudio() normally starts the track when * playing is true. Make one additional direct attempt * here so selecting Music never requires a second * click on the slideshow Play button. */ if ( musicAudio && musicAudio.paused && !muted ) { try { await musicAudio.play(); audioNeedsGesture = false; console.log( "[SlideshowViewer] Selected music started:", track.title ); } catch (error) { audioNeedsGesture = true; console.warn( "[SlideshowViewer] Selected music could not " + "start immediately:", error ); } } updateAudioCue(); closeMusicPicker(); }); list.appendChild(item); });
    }


function updateAudioCue() { const cue = document.getElementById("slideshowAudioCue"); if (!cue) { return; } if ( audioMode === "original" && current?.audio && audioNeedsGesture ) { cue.textContent = "🔊 Audio available — Press Play to hear"; cue.hidden = false; cue.classList.add("is-audio-prompt"); /* * Keep the cue visible until the user actually starts * playback. It should not disappear simply because the * browser rejected autoplay. */ return; } if ( audioMode === "original" && current?.audio && playing && audio && !audio.paused ) { cue.textContent = "🔊 Original sound"; cue.hidden = false; cue.classList.remove("is-audio-prompt"); return; } /* * No cue is necessary for: * None * Page turn effects * Music * unless the selected music itself is waiting for Play. */ if (audioMode === "music" && audioNeedsGesture) { cue.textContent = "🎵 Music selected — Press Play to hear"; cue.hidden = false; cue.classList.add("is-audio-prompt"); return; } cue.hidden = true; cue.classList.remove("is-audio-prompt"); }


    function openMusicPicker() {

        const picker = buildMusicPicker();

        if (!picker) {
            return;
        }

        picker.panel.hidden = false;
        musicPickerOpen = true;

        picker.search.value = "";
        renderMusicPickerList();

        picker.search.focus();

        if (!document.documentElement.dataset.musicPickerOutsideBound) {

            document.documentElement.dataset.musicPickerOutsideBound = "true";

            document.addEventListener("click", event => {

                if (!musicPickerOpen || !musicPickerEl) {
                    return;
                }

                if (
                    musicPickerEl.panel.contains(event.target) ||
                    event.target.closest(".slideshow-audio-mode") === document.querySelector(".slideshow-audio-mode")
                ) {
                    return;
                }

                closeMusicPicker();

            });

        }
    }

    function closeMusicPicker() { if (!musicPickerEl) { musicPickerOpen = false; return; } musicPickerEl.panel.hidden = true; musicPickerOpen = false; /* * IMPORTANT: * * Do NOT change #slideshowAudioMode here. * * closeMusicPicker() can be called while setAudioMode() * is in the middle of changing from Music to another * mode. At that moment audioMode may still contain the * previous value ("music"). * * The audio-mode selector is synchronized exclusively by * setAudioMode(). */ }

    async function show(indexToShow,direction=1,autoAdvance=false){
        if(!current||transitionBusy)return;
        const generation=transitionGeneration;

        const total=slideCount();
        if(!total)return;

        index=Math.max(0,Math.min(indexToShow,total-1));
        updateStatus();

        let built;

        try{
            built=await buildSlide(index);
        }catch(error){
            setStatus("Unable to render slide");
            console.error("[SlideshowViewer] Slide render failed.",error);
            return;
        }

        const old=stage.querySelector(".slideshow-slide");
        const fresh=built.element;
        const zoomTarget=fresh.querySelector("img,canvas");
        if(zoomController) zoomController.setTarget(zoomTarget);

        const startTransition=()=>{
            if(generation!==transitionGeneration || !current)return;
            stage.appendChild(fresh);
            transitionBusy=true;

            SlideshowTransitions.run({
                stage,
                oldSlide:old,
                newSlide:fresh,
                direction,
                done:()=>{
                    if(generation!==transitionGeneration || !current)return;
                    transitionBusy=false;
                    if(pendingAdvance){
                        pendingAdvance=false;
                        if(playing){
                            next(true);
                            return;
                        }
                    }
                    if(playing) schedule();
                }
            });
        };

        if(built.ready){
            try{ await built.ready; }catch(e){}
        }

        startTransition();

        // Do not finish merely because the slideshow reached the last slide.
        // next() owns end-of-sequence behavior so an active original/music
        // track can cause the sequence to wrap back to slide 1 and continue
        // until that audio naturally ends.
    }

    function next(fromTimer=false){
        if(!current)return;
        if(transitionBusy){
            if(fromTimer && playing) pendingAdvance=true;
            return;
        }
        if(!fromTimer) stopTimer();
        const total=slideCount();
        if(!total)return;

        if(index<total-1){
            if(audioMode==="effects") playSound(EFFECT_URL);
            show(index+1,1,fromTimer);
            return;
        }

        // While selected original/music audio is still playing, repeat the
        // slide sequence. Once that audio has actually ended, continue only
        // forward to the final slide and finish there.
        const audioIsDrivingPlayback =
            (audioMode === "original" || audioMode === "music") &&
            !audioCompleted;

        if(audioIsDrivingPlayback){
            if(audioMode==="effects") playSound(EFFECT_URL);
            show(0,1,fromTimer);
        }else if(playing){
            finish();
        }
    }
    function previous(){if(!current)return;if(index>0){playing=false;show(index-1,-1);setStatus("Paused");}}
    function togglePlay(){
        if(!current)return;
        playing=!playing;
        if(playing){
            pendingAdvance=false;
            audioNeedsGesture = false;
            updateAudioCue();
            setStatus("Playing");
            startSelectedAudio();
            if(!transitionBusy) schedule();
        }else{
            pendingAdvance=false;
            setStatus("Paused");
            stopTimer();
            audio?.pause();
            musicAudio?.pause();
        }
    }

function restart(){
    if(!current) return;

    transitionGeneration++;
    pendingAdvance=false;

    console.log("[SlideshowViewer] Restart requested.");

    // Stop the current playback cycle.
    playing = false;
    stopTimer();
    stopAudio();

    // Reset slideshow position.
    index = 0;

    // Clear any transition lock so Restart cannot be blocked
    // by a previous slide transition.
    transitionBusy = false;

    // Remove the currently displayed slide.
    if(stage){
        stage.innerHTML = "";
    }

    // Start again from slide 1.
    playing = true;
    setStatus("Playing");
    updateStatus();

    // Restart the selected audio mode.
    startSelectedAudio();

    // Render slide 1.
    show(0, 1, false);

    // Restore the Play button to its Pause state.
    const playButton = document.getElementById("slideshowPlay");

    if(playButton){
        playButton.title = "Pause slide show";
        playButton.setAttribute("aria-label","Pause slide show");

        const use = playButton.querySelector("use");

        if(use){
            use.setAttribute("href","#icon-pause");
        }
    }
}

    function toggleMute() { muted = !muted; if (audio) { audio.muted = muted; } if (musicAudio) { musicAudio.muted = muted; } if (effectAudio) { effectAudio.muted = muted; } /* * If the user has just unmuted, try to resume the * currently selected audio source immediately. */ if (!muted) { let playPromise = null; if ( audioMode === "original" && audio && current?.audio && audio.paused ) { playPromise = audio.play(); } else if ( audioMode === "music" && musicAudio && musicAudio.paused ) { playPromise = musicAudio.play(); } if ( playPromise && typeof playPromise.then === "function" ) { playPromise .then(() => { audioNeedsGesture = false; updateAudioCue(); }) .catch(error => { audioNeedsGesture = true; console.warn( "[SlideshowViewer] Audio could not resume " + "after unmute:", error ); updateAudioCue(); }); } else { /* * If audio is already playing, there is no reason * to keep displaying the "Press Play" cue. */ if ( (audioMode === "original" && audio && !audio.paused) || (audioMode === "music" && musicAudio && !musicAudio.paused) ) { audioNeedsGesture = false; } updateAudioCue(); } } else { updateAudioCue(); } return muted; }

function finish(){
    playing=false;
    pendingAdvance=false;
    stopTimer();
    audio?.pause();
    musicAudio?.pause();
    setStatus("Finished");

    const el=document.getElementById("slideshowPlay");
    if(el){
        el.title="Play slide show";
        el.setAttribute("aria-label","Play slide show");

        const use=el.querySelector("use");
        if(use)use.setAttribute("href","#icon-play");
    }
}

    function close(){
        transitionGeneration++;
        if(document.fullscreenElement && document.fullscreenElement===root){
            document.exitFullscreen?.();
        }
stopAllMedia();

if (
    window.MediaManager &&
    typeof MediaManager.release === "function"
) {
    MediaManager.release("slideshow");
}

        if(current?.pdfDocument && typeof current.pdfDocument.destroy==="function"){
            try{ current.pdfDocument.destroy(); }catch(e){}
        }
        if(stage)stage.innerHTML="";
        if(zoomController){
            zoomController.destroy();
            zoomController=null;
        }
        if(root)root.classList.remove("has-slideshow");
        setPlaybackChrome(false);
        if(landing){
            /*
             * Previously waited 1s (setTimeout) before removing
             * "hidden" so the landing would float back in. The
             * landing is already "hidden" from open() by this
             * point, so removing it here immediately still
             * transitions cleanly from its hidden position (see
             * .slideshow-landing in slideshow.css) - it just no
             * longer waits a second to start.
             */
            landing.classList.add("hidden");
            landing.classList.remove("hidden");
        }
        current=null;
        index=0;
        updateTitle();
        updateStatus();
        setAudioMode("none");
    }
    function refreshLayout(){ if(!root||!stage)return; }
    function toggleFullscreen(){if(!root)return;if(document.fullscreenElement)document.exitFullscreen?.();else root.requestFullscreen?.().catch(()=>{});}

async function open(item) {

    if (!item) return;

/*
-------------------------------------------------------
 Claim global media ownership BEFORE assigning the new
 slideshow to `current`. MediaManager.claim() stops the
 previous owner first. Doing this after `current = item`
 would allow the cleanup callback to erase the new item.
-------------------------------------------------------
*/

if (
    window.MediaManager &&
    typeof MediaManager.claim === "function"
) {

    MediaManager.claim(
        "slideshow",
        stopForMediaManager
    );

}

    current = item;
    index = 0;
    playing = true;
    stopTimer();

    // existing PDF/image opening code continues...

        /*
         * PDF slide shows are opened lazily. PDF.js gives us the authoritative
         * page count; any supplied slideCount is retained as declaredSlideCount
         * and then corrected in memory.
         */
        if(item.source==="pdf" || item.pdfUrl){
            if(typeof pdfjsLib==="undefined"){
                setStatus("PDF support is unavailable");
                current=null;
                return;
            }

            try{
                const task=pdfjsLib.getDocument({
                    url:item.pdfUrl,
                    enableXfa:false,
                    useSystemFonts:true
                });

                current.pdfDocument=await task.promise;
                current.pdfPageCount=current.pdfDocument.numPages;

                if(window.Manifest &&
                   typeof Manifest.reconcileSlideshowCount==="function"){
                    Manifest.reconcileSlideshowCount(
                        current,
                        current.pdfPageCount
                    );
                }else{
                    current.slideCount=current.pdfPageCount;
                }
            }catch(error){
                console.error("[SlideshowViewer] Unable to open PDF slideshow.",error);
                setStatus("Unable to open PDF slide show");
                current=null;
                return;
            }
        }

        const total=slideCount();
        if(!total){
            current=null;
            return;
        }

        root.classList.add("has-slideshow");
        setPlaybackChrome(true);
        setStatus("");
        landing?.classList.add("hidden");

        stage.innerHTML="";
        if(zoomController){
            zoomController.destroy();
            zoomController=null;
        }
        if(window.SkyMediaZoom){
            zoomController=SkyMediaZoom.create(stage);
        }
        updateTitle();
        updateStatus();

        setAudioMode(item.audio ? "original" : "none");

        await show(0);

        try{
            const key="skyslideshow-recent";
            const ids=JSON.parse(localStorage.getItem(key)||"[]");
            const nextIds=[
                item.id,
                ...(Array.isArray(ids)?ids:[]).filter(id=>id!==item.id)
            ].slice(0,10);

            localStorage.setItem(key,JSON.stringify(nextIds));
        }catch(e){}

        renderLanding();
        refreshLayout();
    }




return {
    init,
    open,
    next,
    previous,
    togglePlay,
    restart,
    toggleMute,
    close,
    toggleFullscreen,
    renderLanding,
    setTransition:name=>SlideshowTransitions.set(name),
    setAudioMode,
    openMusicPicker,
    closeMusicPicker,
    getCurrent:()=>current,
    getMusicLibrary:()=>[...MUSIC_LIBRARY],
    isPlaying:()=>playing,
    isMuted:()=>muted
};


})();