"use strict";

window.SlideshowViewer = (function () {
    let root, stage, title, status, audio, landing, current = null, index = 0, timer = null, playing = false, muted = false, transitionBusy = false, transitionGeneration = 0, pendingAdvance = false;
    let audioMode = "none";
    let audioCompleted = false;
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

    // Opening transaction state.  These must live at viewer scope so the
    // library and viewer share one authoritative single-flight lifecycle.
    let openingPromise = null;
    let openingItemId = null;
    let openGeneration = 0;

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
                /* The selected audio is the lifetime of the looping cycle.
                   Once it ends, stop wrapping back to slide 1. If the last
                   slide is already visible, finish there; fullscreen remains
                   active until the user explicitly closes the item. */
                if (playing && slideCount() && index >= slideCount() - 1) finish();
            }
        });
        window.addEventListener("resize", refreshLayout);
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
        const list = window.SlideshowLibrary ? SlideshowLibrary.getDisplayed() : [];
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
            const s=document.createElement("span"); s.className="slideshow-landing-card-title"; s.textContent=item.title;
            b.append(img,s);
            b.addEventListener("click",()=>open(item)); container.appendChild(b);
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
        if(status) {
            const total=slideCount();
            status.textContent=current && total ? `${index+1} / ${total}` : "";
        }
    }
    function setStatus(message){
        const el=document.getElementById("slideshowPlaybackStatus");
        if(el) el.textContent=message||"";
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


    function startSelectedAudio(){
        stopAudio();
        audioCompleted=false;
        if(!current)return;
        if(audioMode === "original" && current.audio && audio){ audio.src=current.audio; audio.muted=muted; audio.load(); if(playing)audio.play().catch(()=>{}); }
        else if(audioMode === "music" && (selectedMusicTrack || MUSIC_LIBRARY.length)){
            const track=selectedMusicTrack || MUSIC_LIBRARY[0];
            musicAudio=new Audio(track.url);
            musicAudio.loop=false;
            musicAudio.muted=muted;
            musicAudio.addEventListener("ended",()=>{
                audioCompleted=true;
                /* Let the slideshow finish naturally on the final slide, but
                   never treat audio completion as a request to close or leave
                   fullscreen. */
                if(playing && slideCount() && index >= slideCount() - 1) finish();
            });
            if(playing)musicAudio.play().catch(()=>{});
        }
    }
    function setAudioMode(mode){
        const select=document.getElementById("slideshowAudioMode");
        const requested=["none","original","effects","music"].includes(mode)?mode:"none";
        if(requested==="original" && !current?.audio) audioMode="none"; else audioMode=requested;
        if(select) select.value=audioMode;
        if(select){ const original=select.querySelector('option[value="original"]'); if(original) original.disabled=!current?.audio; const music=select.querySelector('option[value="music"]'); if(music) music.disabled=!MUSIC_LIBRARY.length; }
        startSelectedAudio();
        setStatus(audioMode==="original"?"Original sound":audioMode==="music"?"Music":audioMode==="effects"?"Page turn effects":"No sound");
    }


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

        matches.forEach(track => {

            const item = document.createElement("button");
            item.type = "button";
            item.className = "slideshow-music-picker-item";

            if (selectedMusicTrack && selectedMusicTrack.file === track.file) {
                item.classList.add("is-selected");
            }

            item.textContent = track.title;

            item.addEventListener("click", () => {
                selectedMusicTrack = track;
                setAudioMode("music");
                closeMusicPicker();
            });

            list.appendChild(item);

        });
    }

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

    function closeMusicPicker() {

        if (!musicPickerEl) {
            return;
        }

        musicPickerEl.panel.hidden = true;
        musicPickerOpen = false;

        /*
        Leaving the dropdown showing "Music" without an
        actual selection is confusing — revert it to
        whatever mode is genuinely active.
        */

        const select = document.getElementById("slideshowAudioMode");

        if (select) {
            select.value = audioMode;
        }
    }
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
            /*
             * Automatic playback reaching the final slide is not a close
             * action.  Remain on the final slide (and, when applicable,
             * remain fullscreen).  An explicit NEXT at the end is handled
             * separately below and is the user's close/leave action.
             */
            finish();
        }else if(!fromTimer){
            /*
             * NEXT while already on the final slide is an explicit request
             * to leave the slideshow.  close() exits browser fullscreen and
             * performs the normal viewer cleanup.
             */
            close();
        }
    }
    function previous(){if(!current)return;if(index>0){playing=false;show(index-1,-1);setStatus("Paused");}}
    function togglePlay(){
        if(!current)return;
        playing=!playing;
        if(playing){
            pendingAdvance=false;
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

    function toggleMute(){
    muted = !muted;

    if (audio) {
        audio.muted = muted;

        if (!muted && playing && audio.src) {
            audio.play().catch(() => {});
        }
    }

    if (musicAudio) {
        musicAudio.muted = muted;

        if (!muted && playing && musicAudio.src) {
            musicAudio.play().catch(() => {});
        }
    }

    return muted;
}

function finish(){
    /*
     * Reaching the final slide naturally is not a close action.  Keep the
     * final slide visible and preserve fullscreen until the user explicitly
     * presses NEXT, Close, or Escape.
     */
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
        /* Invalidate any in-flight PDF/image opening before tearing down the
           visible viewer.  A late PDF.js promise must never resurrect the
           slideshow after Close/Escape. */
        openGeneration++;
        openingPromise=null;
        openingItemId=null;
        transitionGeneration++;
        if(document.fullscreenElement){
            document.exitFullscreen?.().catch?.(()=>{});
        }
        window.__skyFrontPageFullscreenLaunch = false;
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
            landing.classList.add("hidden");
            window.setTimeout(()=>{
                if(!landing || root?.classList.contains("has-slideshow")) return;
                landing.classList.remove("hidden");
            },1000);
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

    if (!item) return false;

    /*
     * Single-flight opening.  The library owns selection, but the viewer
     * owns the asynchronous load.  Never allow a second click to start a
     * competing PDF.js/Page render while the first load is unresolved.
     */
    if (openingPromise) {
        if (openingItemId === item.id) return openingPromise;
        return false;
    }

    const generation = ++openGeneration;
    openingItemId = item.id;

    let transaction;
    transaction = (async()=>{
        try {
            if (
                window.MediaManager &&
                typeof MediaManager.claim === "function"
            ) {
                MediaManager.claim("slideshow", stopForMediaManager);
            }

            current = item;
            index = 0;
            playing = true;
            stopTimer();

            if(item.source==="pdf" || item.pdfUrl){
                /* pdf.js loads asynchronously from a CDN module (see
                   index.html). Wait for it on a cold start instead of
                   failing this attempt and only succeeding on the next
                   click once the module has finished loading. */
                if(window.pdfjsReady) await window.pdfjsReady;
                if(generation!==openGeneration || current!==item) return false;
                if(typeof pdfjsLib==="undefined") throw new Error("PDF support is unavailable");

                const task=pdfjsLib.getDocument({
                    url:item.pdfUrl,
                    enableXfa:false,
                    useSystemFonts:true
                });

                const loadedPdf=await task.promise;
                if(generation!==openGeneration || current!==item) {
                    try{ loadedPdf.destroy?.(); }catch(e){}
                    return false;
                }

                current.pdfDocument=loadedPdf;
                current.pdfPageCount=loadedPdf.numPages;

                if(window.Manifest && typeof Manifest.reconcileSlideshowCount==="function")
                    Manifest.reconcileSlideshowCount(current,current.pdfPageCount);
                else
                    current.slideCount=current.pdfPageCount;
            }

            if(generation!==openGeneration || current!==item) return false;

            const total=slideCount();
            if(!total) throw new Error("Slideshow contains no slides.");

            root.classList.add("has-slideshow");
            setPlaybackChrome(true);
            landing?.classList.add("hidden");
            stage.innerHTML="";
            if(zoomController){ zoomController.destroy(); zoomController=null; }
            if(window.SkyMediaZoom) zoomController=SkyMediaZoom.create(stage);
            updateTitle();
            updateStatus();
            setAudioMode(item.audio ? "original" : "none");

            await show(0);
            if(generation!==openGeneration || current!==item) return false;

            try{
                const key="skyslideshow-recent";
                const ids=JSON.parse(localStorage.getItem(key)||"[]");
                const nextIds=[item.id,...(Array.isArray(ids)?ids:[]).filter(id=>id!==item.id)].slice(0,10);
                localStorage.setItem(key,JSON.stringify(nextIds));
            }catch(e){}

            renderLanding();
            refreshLayout();
            return true;
        } catch(error) {
            if(generation===openGeneration) {
                console.error("[SlideshowViewer] Unable to open slideshow.",error);
                try{ stopAllMedia(); }catch(e){}
                if(current===item) {
                    current=null;
                    if(root) root.classList.remove("has-slideshow");
                    setPlaybackChrome(false);
                }
                if(window.MediaManager && typeof MediaManager.release==="function")
                    MediaManager.release("slideshow");
                setStatus("Unable to open slide show");
            }
            return false;
        } finally {
            if(openingPromise===transaction) {
                openingPromise=null;
                openingItemId=null;
            }
        }
    })();

    openingPromise=transaction;
    return transaction;
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
