"use strict";

/*
=========================================================
 SkyMedia Front Page — Centerpiece Media Renderer

 Keeps the Front Page centerpiece independent from the full
 Reader / Video Viewer / Slideshow applications.
=========================================================
*/
window.FrontMediaRenderer = (function(){
    let host=null, activeItem=null, cleanupFn=null, generation=0;
let resizeObserver=null;



    function icon(name){
        const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
        svg.setAttribute("class","icon"); svg.setAttribute("aria-hidden","true");
        const use=document.createElementNS("http://www.w3.org/2000/svg","use");
        use.setAttribute("href",`#icon-${name}`); svg.appendChild(use); return svg;
    }
    function control(name,label,onClick){
        const b=document.createElement("button"); b.type="button"; b.className="front-media-control"; b.title=label; b.setAttribute("aria-label",label); b.appendChild(icon(name));
        b.addEventListener("click",e=>{e.preventDefault();e.stopPropagation();onClick(b);}); return b;
    }
    function shell(item,type){
    host.innerHTML="";
    host.dataset.mediaType=type;

    const CENTERPIECE_LABELS = {
        "Meditation": "Meditation Mondays",
        "Book Club": "Book Club Tuesdays",
        "Affirmations": "We Affirm Wednesdays",
        "Feed My Sheep": "Feed My Sheep Fridays",
        "BYOB": "BYOB Sundays",
        "Sayings": "Sayings Saturdays",
        "Testimonies": "Testimony Thursdays"
    };

    const category = String(item?.category || "").trim();

    const matchedCategory = Object.keys(CENTERPIECE_LABELS).find(
        key => key.toLowerCase() === category.toLowerCase()
    );

    const title=document.createElement("div");
    title.className="front-media-title";
    title.textContent =
        matchedCategory
            ? CENTERPIECE_LABELS[matchedCategory]
            : category || "";

    const content=document.createElement("div");
    content.className="front-media-content";

    const controls=document.createElement("div");
    controls.className="front-media-controls";

    const controlsLeft=document.createElement("div");
    controlsLeft.className="front-media-controls-left";

    const controlsCenter=document.createElement("div");
    controlsCenter.className="front-media-controls-center";

    const controlsRight=document.createElement("div");
    controlsRight.className="front-media-controls-right";

    controls.append(
        controlsLeft,
        controlsCenter,
        controlsRight
    );

    const status=document.createElement("span");
    status.className="front-media-status";

    host.append(
        title,
        content,
        controls,
        status
    );

    return {
        content,
        controls,
        controlsLeft,
        controlsCenter,
        controlsRight,
        status
    };
}

function openFull(item){
    if(!item || !item.id) return;

    try{
        if(window.AppSwitcher){
            AppSwitcher.show(item.section);
        }

        requestAnimationFrame(()=>{
    try{
        if(item.section === "reader" &&
           window.Library &&
           typeof Library.open === "function"){
            Library.open(item.id);
        }
        else if(item.section === "video" &&
                window.VideoLibrary &&
                typeof VideoLibrary.select === "function"){
            VideoLibrary.select(item.id);
        }
        else if(item.section === "slideshow" &&
                window.SlideshowLibrary &&
                typeof SlideshowLibrary.select === "function"){
            SlideshowLibrary.select(item.id);
        }

        window.setTimeout(()=>{
            try{
                if(item.section === "reader"){
                    /*
                     * Do NOT fullscreen #viewerArea directly. It is an
                     * inner content-only div: the reader's toolbar,
                     * status bar, and background all live in sibling
                     * elements (#toolbar, #statusBar, #viewerBackground).
                     * Fullscreening #viewerArea alone pulls only that
                     * div into the browser's top layer — everything
                     * else (background image, close button, page
                     * controls) is left outside it and simply isn't
                     * rendered, and #viewerArea's own transparent
                     * background reveals the browser's default black
                     * ::backdrop. That produced a black screen with no
                     * visible way to exit, and a broken layout once
                     * fullscreen was dismissed (e.g. via the device
                     * back button).
                     *
                     * The Reader's own real fullscreen path
                     * (ui.toggleFullscreen) fullscreens the whole
                     * document instead, which keeps the reader's
                     * chrome (including the close button) inside the
                     * fullscreen element. Match that here so book
                     * playback opened from the Front Page behaves the
                     * same way as opening it from the Reader itself.
                     */
                    if(!document.fullscreenElement){
                        document.documentElement.requestFullscreen?.().catch(()=>{});
                    }
                }
                else if(item.section === "video"){
                    /*
                     * Fullscreen the complete Video Viewer rather than the
                     * <video> element itself. This keeps SkyMedia overlays
                     * such as the share-feedback toast inside the browser's
                     * fullscreen top layer. The player still expands to the
                     * available viewer space through the existing viewer CSS.
                     */
                    const viewer = document.getElementById("videoViewer");
                    if(viewer && !document.fullscreenElement){
                        viewer.requestFullscreen?.().catch(()=>{});
                    }
                }
                else if(item.section === "slideshow"){
                    const viewer = document.getElementById("slideshowViewer");
                    if(viewer && !document.fullscreenElement){
                        viewer.requestFullscreen?.().catch(()=>{});
                    }
                }
            }catch(error){
                console.error("[FrontMediaRenderer] Unable to enter fullscreen.", error);
            }
        }, 100);
    }catch(error){
        console.error("[FrontMediaRenderer] Unable to open full viewer.", error);
    }
});

    }catch(error){
        console.error("[FrontMediaRenderer] Unable to switch to full viewer.", error);
    }
}
    function addOpenControl(controlsRight,item){
        controlsRight.appendChild(control("fullscreen","Open full viewer",()=>openFull(item)));
    }
    function renderVideo(item,token){
        const ui=shell(item,"video");

        /*
         * The unified Content Contract uses:
         *
         *     media = video URL
         *
         * YouTube is special because it cannot be rendered by a
         * normal <video> element.  The full Video Viewer already
         * resolves YouTube URLs through ContentContract and renders
         * them in an iframe.  The Front Page centerpiece must use
         * that same path.
         */

        const raw=item?.raw || item || {};

        function resolveVideoMedia(value){
            if(value == null) return "";

            if(typeof value === "string"){
                let url=value.trim();

                if(!url) return "";

                /*
                 * Glide can return a URL as:
                 *
                 * [URL](URL)
                 */
                const markdownMatch=
                    url.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

                if(markdownMatch){
                    url=
                        (markdownMatch[2] || markdownMatch[1] || "")
                            .trim();
                }

                return url;
            }

            if(typeof value === "object"){
                if(typeof value.url === "string"){
                    return resolveVideoMedia(value.url);
                }

                if(typeof value.video === "string"){
                    return resolveVideoMedia(value.video);
                }

                if(typeof value.media === "string"){
                    return resolveVideoMedia(value.media);
                }
            }

            if(Array.isArray(value)){
                return value.length
                    ? resolveVideoMedia(value[0])
                    : "";
            }

            return "";
        }

        /*
         * media is authoritative.  The remaining fields are
         * compatibility fallbacks for already-normalized runtime
         * objects.
         */
        let videoUrl=
            resolveVideoMedia(raw.media);

        if(!videoUrl){
            videoUrl=
                resolveVideoMedia(raw.video);
        }

        if(!videoUrl){
            videoUrl=
                resolveVideoMedia(raw.videoUrl);
        }

        if(!videoUrl){
            videoUrl=
                resolveVideoMedia(raw.url);
        }

        if(!videoUrl){
            console.error(
                "[FrontMediaRenderer] No video media URL found.",
                {
                    id:item?.id,
                    title:item?.title,
                    media:raw.media
                }
            );

            ui.status.textContent="Video unavailable";
            return;
        }

        /*
         * Thumbnails are part of the unified contract and may also
         * arrive from Glide wrapped as Markdown links. Keep the
         * thumbnail separate from media: it is the visual poster for
         * MP4 video and the fallback image for failed previews.
         */
        function resolveThumbnail(value){
            if(value == null) return "";
            if(typeof value === "string"){
                let url=value.trim();
                if(!url) return "";
                const match=url.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
                if(match) url=(match[2] || match[1] || "").trim();
                return url;
            }
            if(typeof value === "object" && typeof value.url === "string")
                return resolveThumbnail(value.url);
            return "";
        }

        const thumbnailUrl=
            resolveThumbnail(raw.thumbnail) ||
            resolveThumbnail(item.thumbnail) ||
            "assets/default-thumbnail.png";

        /*
         * IMPORTANT:
         *
         * Keep this test aligned with VideoViewer.loadVideoPlayer().
         * ContentContract is now responsible for recognizing the
         * YouTube URL and converting it to the /embed/ form.
         */
        const isYouTube=
            window.ContentContract &&
            typeof ContentContract.isYouTubeUrl === "function" &&
            ContentContract.isYouTubeUrl(videoUrl);

        if(isYouTube){

            const iframe=
                document.createElement("iframe");

            iframe.className="front-media-video";
            iframe.title=item.title || "YouTube video";

            iframe.setAttribute(
                "allow",
                "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            );

            iframe.setAttribute(
                "allowfullscreen",
                ""
            );

            iframe.setAttribute(
                "frameborder",
                "0"
            );

            iframe.setAttribute(
                "loading",
                "lazy"
            );

            iframe.playsInline=true;

            const embedUrl=
                typeof ContentContract.toYouTubeEmbedUrl === "function"
                    ? ContentContract.toYouTubeEmbedUrl(videoUrl)
                    : videoUrl;

            /*
             * Use the exact same conversion as VideoViewer.
             */
            iframe.src=embedUrl;

            ui.content.appendChild(iframe);

            /*
             * YouTube playback is controlled by the YouTube iframe.
             * Do not create HTMLMediaElement controls here because
             * play(), pause(), currentTime and muted do not apply to
             * the iframe.
             */
            ui.status.textContent="";

            addOpenControl(
                ui.controlsRight,
                item
            );

            console.log(
                "[FrontMediaRenderer] YouTube centerpiece rendered.",
                {
                    id:item?.id,
                    source:videoUrl,
                    embed:embedUrl
                }
            );

            cleanupFn=()=>{
                iframe.src="about:blank";
                iframe.remove();
            };

            return;
        }

        /*
         * A legacy/Glide item can occasionally arrive in the video
         * section with an image URL in media. Do not send an image
         * URL to <video>: the browser will reject it and the centerpiece
         * can appear empty. Render image media directly instead.
         */
        function isImageMedia(url){
            const clean=String(url || "")
                .split("#")[0]
                .split("?")[0]
                .toLowerCase();

            return /\.(?:jpg|jpeg|png|webp|gif|avif|bmp|svg)$/.test(clean);
        }

        if(isImageMedia(videoUrl)){
            const image=
                document.createElement("img");

            image.className="front-media-video";
            image.src=videoUrl;
            image.alt=item.title || "";
            image.draggable=false;

            ui.content.appendChild(image);

            ui.status.textContent="";

            addOpenControl(
                ui.controlsRight,
                item
            );

            console.log(
                "[FrontMediaRenderer] Image media rendered in video centerpiece.",
                {
                    id:item?.id,
                    source:videoUrl
                }
            );

            cleanupFn=()=>{
                image.removeAttribute("src");
                image.remove();
            };

            return;
        }

        /*
         * Normal video files continue to use the native HTML5
         * video element.
         */
        const video=
            document.createElement("video");

        video.className="front-media-video";
        video.preload="metadata";
        video.poster=thumbnailUrl;
        video.playsInline=true;
        video.controls=false;
        video.setAttribute(
            "aria-label",
            item.title || "Video"
        );

        video.src=videoUrl;

        ui.content.appendChild(video);

        const play=
            control(
                "play",
                "Play video",
                b=>{
                    if(video.paused){
                        video.play().catch(error=>{
                            console.warn(
                                "[FrontMediaRenderer] Video play failed.",
                                error
                            );
                        });
                    }else{
                        video.pause();
                    }
                }
            );

        const mute=
            control(
                "volume",
                "Mute video",
                ()=>{
                    video.muted=!video.muted;

                    mute.innerHTML="";
                    mute.appendChild(
                        icon(
                            video.muted
                                ?"volume-off"
                                :"volume"
                        )
                    );

                    mute.title=
                        video.muted
                            ?"Unmute video"
                            :"Mute video";

                    mute.setAttribute(
                        "aria-label",
                        mute.title
                    );
                }
            );

        const progress=
            document.createElement("input");

        progress.type="range";
        progress.min="0";
        progress.max="100";
        progress.value="0";
        progress.step="0.1";
        progress.className=
            "front-media-progress";

        progress.setAttribute(
            "aria-label",
            "Video progress"
        );

        progress.addEventListener(
            "input",
            ()=>{
                if(video.duration){
                    video.currentTime=
                        (Number(progress.value)/100)*
                        video.duration;
                }
            }
        );

        ui.controlsLeft.append(mute);

        ui.controlsCenter.append(
            play,
            progress
        );

        addOpenControl(
            ui.controlsRight,
            item
        );

        const sync=()=>{
            play.innerHTML="";

            play.appendChild(
                icon(
                    video.paused
                        ?"play"
                        :"pause"
                )
            );

            play.title=
                video.paused
                    ?"Play video"
                    :"Pause video";

            play.setAttribute(
                "aria-label",
                play.title
            );

            if(video.duration){
                progress.value=
                    (video.currentTime/video.duration)*100;
            }

            ui.status.textContent=
                video.duration
                    ?`${formatTime(video.currentTime)} / ${formatTime(video.duration)}`
                    :"";
        };

        [
            "play",
            "pause",
            "timeupdate",
            "loadedmetadata",
            "ended"
        ].forEach(event=>{
            video.addEventListener(
                event,
                sync
            );
        });

        video.addEventListener(
            "ended",
            ()=>{
                progress.value=100;
            }
        );

        video.addEventListener(
            "error",
            ()=>{
                console.error(
                    "[FrontMediaRenderer] Centerpiece video failed to load.",
                    {
                        id:item?.id,
                        url:videoUrl,
                        media:raw.media,
                        error:video.error
                    }
                );

                ui.status.textContent=
                    "Video unavailable";
            }
        );

        cleanupFn=()=>{
            video.pause();
            video.removeAttribute("src");
            video.load();
        };

        sync();
    }
    function formatTime(v){if(!Number.isFinite(v))return "0:00";const m=Math.floor(v/60),s=Math.floor(v%60);return `${m}:${String(s).padStart(2,"0")}`;}

    /*
    ---------------------------------------------------------
    Slideshow background audio

    Slides/PDFs can carry their own configured audio track
    (item.raw.audioConfig, from ContentContract.normalizeAudio).
    Created once per render; playback is tied to the slideshow's
    own play/pause/restart state so it always starts from an
    explicit user gesture (satisfying autoplay policies) rather
    than trying to autoplay on load.
    ---------------------------------------------------------
    */
    function setupAudio(item){
        const url = item.raw && (typeof item.raw.audio === "string" ? item.raw.audio : item.raw.audio?.url);
        if(!url) return null;
        const audio=new Audio(url);
        audio.loop=false;
        audio.muted=false;
        return audio;
    }



async function renderSlideshow(item,token){
    const ui=shell(item,"slideshow");

    const slides=Array.isArray(item.raw.slides)?item.raw.slides.map(slide => typeof slide === "string" ? {image:slide} : slide).filter(slide => slide && slide.image):[];

    /*
    ---------------------------------------------------------
    PDF-backed slideshow
    ---------------------------------------------------------
    ContentContract intentionally exposes PDF slideshows with
    pdfUrl + an empty slides array. Render those pages directly
    with PDF.js so the Front Page can feature them without
    converting the source PDF into separate image files.
    ---------------------------------------------------------
    */

    if(!slides.length && item.raw.pdfUrl){
        let pdf=null;
        let index=1;
        let busy=false;
        let playing=false;
        let timer=null;

        const audio=setupAudio(item);

        const canvas=document.createElement("canvas");
        canvas.className="front-media-pdf";
        ui.content.appendChild(canvas);
        const zoom=window.SkyMediaZoom ? SkyMediaZoom.create(ui.content) : null;
        if(zoom) zoom.setTarget(canvas);

        const prevB=control(
            "previous",
            "Previous page",
            ()=>go(-1)
        );



        const playB=control(
            "play",
            "Play slideshow",
            ()=>{
                if(!pdf) return;

                playing=!playing;
                clear();

                if(playing){
                    if(!busy) schedule();
                    if(audio) audio.play().catch(()=>{});
                }else if(audio){
                    audio.pause();
                }

                sync();
            }
        );

        const nextB=control(
            "next",
            "Next page",
            ()=>go(1)
        );

        const muteB=control(
            "volume",
            "Mute slideshow",
            ()=>{
                if(!audio) return;
                audio.muted=!audio.muted;
                muteB.innerHTML="";
                muteB.appendChild(icon(audio.muted?"volume-off":"volume"));
                muteB.title=audio.muted?"Unmute slideshow":"Mute slideshow";
                muteB.setAttribute("aria-label",muteB.title);
            }
        );
        if(!audio){
            muteB.disabled=true;
            muteB.innerHTML="";
            muteB.appendChild(icon("volume-off"));
        }

        ui.controlsLeft.append(muteB);
        ui.controlsCenter.append(prevB,playB,nextB);
        addOpenControl(ui.controlsRight,item);



        function clear(){
            if(timer){
                clearTimeout(timer);
                timer=null;
            }
        }

        function update(){
            if(!pdf){
                ui.status.textContent="Loading…";
                prevB.disabled=true;
                nextB.disabled=true;
                return;
            }

            ui.status.textContent=`${index} / ${pdf.numPages}`;
            prevB.disabled=index<=1;
            nextB.disabled=index>=pdf.numPages;
        }

        function schedule(){
            clear();

            if(!playing || !pdf) return;

            timer=setTimeout(()=>{
                if(index < pdf.numPages){
                    index++;
                    draw().then(schedule).catch(error=>{
                        console.error(
                            "[FrontMediaRenderer] PDF slideshow advance failed.",
                            error
                        );
                        playing=false;
                        sync();
                    });
                }else{
                    index=1;
                    draw().then(schedule).catch(error=>{
                        console.error(
                            "[FrontMediaRenderer] PDF slideshow loop failed.",
                            error
                        );
                        playing=false;
                        sync();
                    });
                }
            },5000);
        }

        async function draw(){
            if(!pdf || token!==generation) return;

            busy=true;
            update();

            try{
                const page=await pdf.getPage(index);

                const base=page.getViewport({scale:1});

                const maxW=Math.max(
                    80,
                    ui.content.clientWidth-20
                );

                const maxH=Math.max(
                    80,
                    ui.content.clientHeight-20
                );

                const scale=Math.min(
                    maxW/base.width,
                    maxH/base.height
                );

                const viewport=page.getViewport({
                    scale:Math.max(.1,scale)
                });

                canvas.width=Math.ceil(viewport.width);
                canvas.height=Math.ceil(viewport.height);

                canvas.classList.remove("is-entering");
                void canvas.offsetWidth;

                await page.render({
                    canvasContext:canvas.getContext(
                        "2d",
                        {alpha:false}
                    ),
                    viewport
                }).promise;

                if(token===generation){
                    canvas.classList.add("is-entering");
                    update();
                }
            }finally{
                busy=false;
                if(playing && !timer) schedule();
            }
        }

        async function go(delta){
            if(!pdf || busy) return;

            const target=Math.max(
                1,
                Math.min(
                    pdf.numPages,
                    index+delta
                )
            );

            if(target===index) return;

            clear();
            playing=false;
            if(audio) audio.pause();
            index=target;

            sync();
            await draw();
        }

        function sync(){
            playB.innerHTML="";
            playB.appendChild(
                icon(playing?"pause":"play")
            );

            playB.title=playing
                ?"Pause slideshow"
                :"Play slideshow";

            playB.setAttribute(
                "aria-label",
                playB.title
            );
        }

        try{
            if(!window.pdfjsLib){
                throw new Error("PDF.js unavailable");
            }

            pdf=await pdfjsLib.getDocument({
                url:item.raw.pdfUrl
            }).promise;

            if(token!==generation) return;

            index=1;

await new Promise(resolve=>{
    requestAnimationFrame(()=>{
        requestAnimationFrame(resolve);
    });
});

if(token!==generation)return;

await draw();
sync();
update();

            if(playing) schedule();

        }catch(error){
            console.error(
                "[FrontMediaRenderer] PDF slideshow preview failed.",
                error
            );

            ui.content.innerHTML="";

            const img=document.createElement("img");
            img.className="front-media-fallback";
            img.src=
                item.thumbnail ||
                "assets/default-thumbnail.png";
            img.alt=item.title||"";

            ui.content.appendChild(img);
            ui.status.textContent=
                "PDF preview unavailable";
        }

        watchContentResize(ui.content,()=>{
    if(pdf && !busy){
        draw();
    }
});

cleanupFn=()=>{
    clear();
    resizeObserver?.disconnect();
    resizeObserver=null;
    zoom?.destroy();
    pdf=null;
    if(audio){
        audio.pause();
        audio.currentTime=0;
    }
};

        return;
    }

    /*
    ---------------------------------------------------------
    Normal image slideshow
    ---------------------------------------------------------
    */

    let index=0;
    let playing=false;
    let timer=null;

    const audio=setupAudio(item);

    const img=document.createElement("img");
    img.className="front-media-slide";
    img.alt=item.title||"";
    img.draggable=false;

    ui.content.appendChild(img);
    const zoom=window.SkyMediaZoom ? SkyMediaZoom.create(ui.content) : null;
    if(zoom) zoom.setTarget(img);

    function clear(){
        if(timer){
            clearTimeout(timer);
            timer=null;
        }
    }

    function show(){
        if(token!==generation) return;

        const s=slides[index];

        if(!s) return;

        img.classList.remove("is-entering");
        void img.offsetWidth;

        img.src=s.image||"";
        img.alt=s.title||item.title||"";
        img.classList.add("is-entering");

        ui.status.textContent=
            `${index+1} / ${slides.length}`;

        if(playing){
            timer=setTimeout(
                next,
                Math.max(
                    1,
                    Number(s.duration)||5
                )*1000
            );
        }
    }

    function next(){
        clear();

        if(!slides.length) return;

        if(index < slides.length-1){
            index++;
        }else{
            index=0;
        }

        show();
        sync();
    }

    function prev(){
        clear();

        if(index>0){
            index--;
            show();
        }

        playing=false;
        if(audio) audio.pause();
        sync();
    }

    let touchStartX=0;
    let touchStartY=0;

    ui.content.addEventListener(
        "touchstart",
        event=>{
            if(event.touches.length!==1) return;

            touchStartX=
                event.touches[0].clientX;

            touchStartY=
                event.touches[0].clientY;
        },
        {passive:true}
    );

    ui.content.addEventListener(
        "touchend",
        event=>{
            if(event.changedTouches.length!==1) return;

            const touch=event.changedTouches[0];

            const deltaX=
                touch.clientX-touchStartX;

            const deltaY=
                touch.clientY-touchStartY;

            if(Math.abs(deltaX)<=Math.abs(deltaY)){
                return;
            }

            if(Math.abs(deltaX)<40){
                return;
            }

            if(deltaX<0){
                next();
            }else{
                prev();
            }
        },
        {passive:true}
    );

    const prevB=control(
        "previous",
        "Previous slide",
        prev
    );



    const playB=control(
        "play",
        "Play slideshow",
        ()=>{
            playing=!playing;
            clear();

            if(playing){
                show();
                if(audio) audio.play().catch(()=>{});
            }else if(audio){
                audio.pause();
            }

            sync();
        }
    );

    const nextB=control(
        "next",
        "Next slide",
        next
    );

    const muteB=control(
        "volume",
        "Mute slideshow",
        ()=>{
            if(!audio) return;
            audio.muted=!audio.muted;
            muteB.innerHTML="";
            muteB.appendChild(icon(audio.muted?"volume-off":"volume"));
            muteB.title=audio.muted?"Unmute slideshow":"Mute slideshow";
            muteB.setAttribute("aria-label",muteB.title);
        }
    );
    if(!audio){
        muteB.disabled=true;
        muteB.innerHTML="";
        muteB.appendChild(icon("volume-off"));
    }

    ui.controlsLeft.append(muteB);

    ui.controlsCenter.append(
        prevB,
        playB,
        nextB
    );

    addOpenControl(
        ui.controlsRight,
        item
    );

    
    function sync(){
        playB.innerHTML="";

        playB.appendChild(
            icon(
                playing
                    ?"pause"
                    :"play"
            )
        );

        playB.title=playing
            ?"Pause slideshow"
            :"Play slideshow";

        playB.setAttribute(
            "aria-label",
            playB.title
        );
    }

    show();
    sync();

    cleanupFn=()=>{
        clear();
        zoom?.destroy();
        if(audio){
            audio.pause();
            audio.currentTime=0;
        }
    };
}


    async function renderPdf(item,token){
        const ui=shell(item,"reader");
        const canvas=document.createElement("canvas"); canvas.className="front-media-pdf"; ui.content.appendChild(canvas);
        const zoom=window.SkyMediaZoom ? SkyMediaZoom.create(ui.content) : null;
        if(zoom) zoom.setTarget(canvas);
        const prev=control("previous","Previous page",()=>go(-1)); const next=control("next","Next page",()=>go(1));
        ui.controlsCenter.append(prev,next); addOpenControl(ui.controlsRight,item);
        let pdf=null,page=1,busy=false;
        function update(){ui.status.textContent=pdf?`${page} / ${pdf.numPages}`:"Loading…";prev.disabled=!pdf||page<=1;next.disabled=!pdf||page>=pdf.numPages;}
        async function draw(direction=0){
            if(!pdf||token!==generation)return;
            busy=true;update();
            const p=await pdf.getPage(page);
            const base=p.getViewport({scale:1});
            const maxW=Math.max(80,ui.content.clientWidth-20),maxH=Math.max(80,ui.content.clientHeight-20);
            const scale=Math.min(maxW/base.width,maxH/base.height);
            const vp=p.getViewport({scale:Math.max(.1,scale)});
            canvas.width=Math.ceil(vp.width);canvas.height=Math.ceil(vp.height);
            canvas.classList.remove("is-entering","is-entering-next","is-entering-prev");
            void canvas.offsetWidth;
            await p.render({canvasContext:canvas.getContext("2d",{alpha:false}),viewport:vp}).promise;
            /*
             * Match the Reader's own page-turn treatment: a page-turn
             * sound plus a transition that visually reflects the
             * direction of travel, rather than the same flat fade for
             * both prev and next.
             */
            canvas.classList.add(
                direction>0 ? "is-entering-next" :
                direction<0 ? "is-entering-prev" :
                "is-entering"
            );
            busy=false;update();
        }
        async function go(delta){
            if(!pdf||busy)return;
            const target=Math.max(1,Math.min(pdf.numPages,page+delta));
            if(target===page)return;
            page=target;
            if(window.AudioController && typeof AudioController.playPageTurn==="function"){
                AudioController.playPageTurn();
            }
            await draw(delta>0?1:-1);
        }
        try{
            if(!window.pdfjsLib)throw new Error("PDF.js unavailable");
            const url=item.raw.pdf||item.raw.media||item.raw.url||item.raw.PDF||""; if(!url)throw new Error("PDF URL missing");
            pdf=await pdfjsLib.getDocument({url}).promise;

if(token!==generation)return;

await new Promise(resolve=>{
    requestAnimationFrame(()=>{
        requestAnimationFrame(resolve);
    });
});

if(token!==generation)return;

await draw();
        }catch(e){console.error("[FrontMediaRenderer] PDF preview failed",e);ui.content.innerHTML="";const img=document.createElement("img");img.className="front-media-fallback";img.src=item.thumbnail||"assets/default-thumbnail.png";img.alt=item.title||"";ui.content.appendChild(img);ui.status.textContent="PDF preview unavailable";}
        watchContentResize(ui.content,()=>{
    if(pdf && !busy){
        draw();
    }
});

cleanupFn=()=>{
    resizeObserver?.disconnect();
    resizeObserver=null;
    zoom?.destroy();
    pdf=null;
};

update();
    }

function stopPlayback(){
    if(cleanupFn){
        try{
            cleanupFn();
        }catch(error){
            console.warn("[FrontMediaRenderer] Playback cleanup failed.", error);
        }
        cleanupFn=null;
    }
}

function watchContentResize(content, redraw){
    if(resizeObserver){
        resizeObserver.disconnect();
        resizeObserver=null;
    }

    if(!content || typeof ResizeObserver==="undefined"){
        return;
    }

    let lastWidth=0;
    let lastHeight=0;
    let scheduled=false;

    resizeObserver=new ResizeObserver(entries=>{
        const rect=entries[0]?.contentRect;
        if(!rect) return;

        const width=Math.round(rect.width);
        const height=Math.round(rect.height);

        if(width<80 || height<80) return;

        if(width===lastWidth && height===lastHeight) return;

        lastWidth=width;
        lastHeight=height;

        if(scheduled) return;

        scheduled=true;

        requestAnimationFrame(()=>{
            scheduled=false;

            try{
                redraw();
            }catch(error){
                console.warn(
                    "[FrontMediaRenderer] Resize redraw failed.",
                    error
                );
            }
        });
    });

    resizeObserver.observe(content);
}


    function render(item){
    generation++;

    const token=generation;

    stopPlayback();

    activeItem=item;

        if(!host)return;
        if(!item){host.innerHTML="";return;}
        if(item.section==="video")renderVideo(item,token);
        else if(item.section==="slideshow")renderSlideshow(item,token);
        else if(item.section==="reader")renderPdf(item,token);
        else {const ui=shell(item,"unknown");const img=document.createElement("img");img.className="front-media-fallback";img.src=item.thumbnail||"assets/default-thumbnail.png";img.alt=item.title||"";ui.content.appendChild(img);addOpenControl(ui.controlsRight,item);}
    }
    function init(element){host=element||document.getElementById("frontMediaHost");return !!host;
    }

    function destroy(){
    generation++;

    stopPlayback();

    if(host)
        host.innerHTML="";

    activeItem=null;
    }

    return {
    init,
    render,
    destroy,
    stopPlayback,
    getCurrent:()=>activeItem
};
})();