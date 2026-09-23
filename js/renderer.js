"use strict";

/*
=========================================================
 SkyReader Renderer
 Version 3.0

 PDF.js rendering engine + page-surface manager.

 Responsibilities
 • Load PDF documents
 • Create one page surface per PDF page
 • Render PDF pages to those canvases
 • Keep a small rendering window for performance
 • Manage PDF page cache
 • Resize the viewer
 • Provide the existing Renderer navigation API
 • Render PDF hyperlinks on each page

 NOT responsible for page-turn animation.
 Sky180FlipEngine owns the presentation/transition layer.
=========================================================
*/

window.Renderer=(function(){

const renderer={};

let pdf=null;
let currentBook=null;
let currentPage=1;
let pageCount=0;
let pageRatio=1;
let renderScale=2;
let viewer=null;
let pageContainer=null;
let pageSurfaces=new Map();
let flipSurfaces=[];
let pageCache=new Map();
let renderedPages=new Set();
let renderingQueue=new Set();
let resizeObserver=null;
let currentViewport=null;
let renderGeneration=0;
let initialized=false;

/* Monotonic presentation token used to reject stale asynchronous opens. */
let presentationToken=0;
let openToken=0;

/* Active PDF.js loading task. It is cancelled when a newer book replaces it. */
let activeLoadingTask=null;

const RENDER_WINDOW=6;

renderer.events={
    progress:null,
    ready:null,
    page:null,
    error:null,
    state:null
};

function emit(name,...args){
    const fn=renderer.events[name];
    if(typeof fn==="function") fn(...args);
}

function progress(percent,text){

    /*
     * The shared loading sequence supplies the visible
     * loading message while the existing loading GIF
     * remains active.
     */
    if (
        window.SkyMediaLoading &&
        SkyMediaLoading.isActive()
    ) {

        SkyMediaLoading.update(
            percent
        );


        emit(
            "progress",
            percent,
            SkyMediaLoading.message()
        );


        return;
    }


    /*
     * Normal fallback when the shared sequence is not active.
     */
    emit(
        "progress",
        percent,
        text
    );
}

/* Must match PDF_PROXY_PATH in worker.js. */
const PDF_PROXY_PATH="/__sky_pdf_proxy";

async function resolvePdfUrl(value){
    const raw=String(value||"").trim();
    if(!raw) throw new Error("Book is missing a PDF URL.");

    /* Absolute/data/blob URLs are already complete and must be preserved —
       EXCEPT that a cross-origin http(s) PDF (e.g. Glide's GCS bucket) is
       routed through this app's own /__sky_pdf_proxy instead of being
       fetched directly. A direct cross-origin fetch hides the response
       headers PDF.js needs (Accept-Ranges/Content-Length) unless the
       remote host's CORS policy explicitly exposes them, which is not
       something this app controls for a third-party bucket. Without that
       visibility PDF.js silently downloads the entire file instead of
       streaming it — harmless for a small PDF, a multi-minute stall for
       one bloated by embedded video/audio. Routing through the Worker
       makes the browser's request same-origin, where none of that
       header-visibility restriction applies. */
    if(/^(?:https?:)/i.test(raw)){
        try{
            const parsed=new URL(raw);
            if(parsed.origin!==window.location.origin){
                return window.location.origin+PDF_PROXY_PATH+"?src="+encodeURIComponent(raw);
            }
        }catch(error){
            /* Malformed — fall through and let PDF.js report the real error. */
        }
        return raw;
    }
    if(/^(?:data:|blob:)/i.test(raw)) return raw;

    const primary=new URL(raw,window.location.href).href;

    /* Preserve the contract exactly when it resolves to a real resource. */
    try{
        const response=await fetch(primary,{method:"HEAD",cache:"no-store"});
        if(response.ok) return primary;
    }catch(error){
        /* Some servers reject HEAD. PDF.js will get the authoritative result. */
    }

    /* A bare filename is commonly supplied by Glide. If the project has its
       PDFs under /pdf/, try that conventional location before failing. */
    if(!raw.includes("/") && !raw.includes("\\")){
        const fallback=new URL("pdf/"+encodeURIComponent(raw),window.location.href).href;
        try{
            const response=await fetch(fallback,{method:"HEAD",cache:"no-store"});
            if(response.ok) return fallback;
        }catch(error){}
    }

    return primary;
}

/*-------------------------------------------------------
 Initialization
-------------------------------------------------------*/

renderer.initialize=function(){
    if(initialized) return;

    viewer=document.getElementById("viewerArea");
    pageContainer=document.getElementById("pageContainer");

    if(!viewer) throw new Error("viewerArea not found.");
    if(!pageContainer) throw new Error("pageContainer not found.");

    resizeObserver=new ResizeObserver(()=>{
        renderer.resize();
    });

    resizeObserver.observe(viewer);

    if(typeof Sky180FlipEngine!=="undefined"){
        Sky180FlipEngine.initialize({container:pageContainer});

        Sky180FlipEngine.on("page",page=>{
            currentPage=page;
            renderer.ensureRenderWindow(page);
            emit("page",currentPage,pageCount);
        });

Sky180FlipEngine.on("state",state=>{
    emit("state",state);
});

        Sky180FlipEngine.on("orientation",()=>{
            renderer.resize();
        });

        Sky180FlipEngine.on("error",error=>{
            emit("error",error);
        });
    }
    else{
        throw new Error("Sky180FlipEngine is not loaded.");
    }

    initialized=true;
};

/*-------------------------------------------------------
 Public information
-------------------------------------------------------*/

renderer.page=()=>currentPage;
renderer.pages=()=>pageCount;
renderer.book=()=>currentBook;
renderer.loaded=()=>pdf!==null;
renderer.spread=function(){
    if(typeof Sky180FlipEngine!=="undefined" && typeof Sky180FlipEngine.spread==="function"){
        return Sky180FlipEngine.spread();
    }

    if(isSinglePageDevice()){
        return {start:currentPage,end:currentPage,isCover:currentPage===1,label:String(currentPage)};
    }

    const start=currentPage===1 ? 1 : (currentPage%2===0 ? currentPage : currentPage-1);
    const end=Math.min(pageCount,start===1 ? 1 : start+1);
    return {start,end,isCover:start===1,label:start===end?String(start):start+"–"+end};
};

/*-------------------------------------------------------
 Page surfaces
-------------------------------------------------------*/

/*
 * createPageSurface() used to build the FULL page DOM — canvas,
 * 2d context, the media-annotation layer, and eight addEventListener
 * calls — for every single page in the book, synchronously, before
 * StPageFlip was even handed the page array. For a large book that is
 * hundreds of canvases + contexts + listener attachments on the main
 * thread before a single pixel is visible, which is the actual cause
 * of the long blank wait on big items (see loadingSequence.js notes).
 *
 * StPageFlip's loadFromHTML() does need one real DOM node per page up
 * front (it uses the array length/order to build its spread/page
 * collection), but it does NOT need that node to already contain a
 * canvas or listeners. So page creation is now split in two:
 *
 *   createPageShell()     - cheap. Runs for all N pages at open time.
 *   hydratePageSurface()  - expensive. Runs once, lazily, only for a
 *                            page that actually enters the render
 *                            window (see getSurface()).
 *
 * The same DOM node is mutated in place (children appended to it
 * later), so the reference StPageFlip already holds keeps working —
 * nothing is swapped out from under it.
 */
function createPageShell(pageNumber){
    const surface=document.createElement("div");
    surface.className="sky180Page";
    surface.dataset.page=String(pageNumber);
    surface.dataset.density="soft";
    surface.setAttribute("aria-label","Page "+pageNumber);

    pageSurfaces.set(pageNumber,{
        element:surface,
        canvas:null,
        ctx:null,
        annotationLayer:null,
        annotationRenderer:null,
        rendered:false,
        rendering:false,
        hydrated:false,
        viewport:null
    });

    return surface;
}

function hydratePageSurface(pageNumber){
    const item=pageSurfaces.get(pageNumber);
    if(!item || item.hydrated) return item;

    const surface=item.element;

    const canvas=document.createElement("canvas");
    canvas.className="pageCanvas";
    canvas.dataset.page=String(pageNumber);

    const ctx=canvas.getContext("2d",{
        alpha:false,
        desynchronized:true
    });

    surface.appendChild(canvas);

    /* PDF.js media annotation layer. StPageFlip carries this DOM layer with the page. */
    const annotationLayer=document.createElement("div");
    annotationLayer.className="annotationLayer skyreaderMediaAnnotationLayer";

    /* Media annotations are interactive content, not page-turn targets.
       Stop their mouse/touch/pointer events from bubbling into StPageFlip
       while leaving the native video/button behavior intact. */
    /* The annotation layer itself must NOT become a page-sized mouse shield.
       Its empty area belongs to StPageFlip, including the curl/drag zone.
       Only the actual media annotation and its controls are interactive. */
    ["pointerdown","pointerup","mousedown","mouseup","touchstart","touchend","click"].forEach(type=>{
        annotationLayer.addEventListener(type,event=>{
            const target=event.target;
            if(target && target.closest &&
               target.closest(".mediaAnnotation")){
                event.stopPropagation();
            }
        });
    });

    surface.appendChild(annotationLayer);

    /* A clean direct click/tap on the final real PDF page closes the book.
       PDF hyperlinks remain exempt so their normal link behavior is preserved. */
    let pointerStart=null;
    surface.addEventListener("pointerdown",event=>{
        pointerStart={x:event.clientX,y:event.clientY};
    },{passive:true});
    surface.addEventListener("pointerup",event=>{
        if(!pointerStart) return;
        const dx=event.clientX-pointerStart.x;
        const dy=event.clientY-pointerStart.y;
        pointerStart=null;
        if(Math.hypot(dx,dy)>8) return;
        if(Number(pageNumber)!==Number(pageCount)) return;
        if(event.target.closest && event.target.closest(".pdfLink")) return;
        if(event.target.closest && event.target.closest(".skyreaderMediaAnnotationLayer")) return;
        document.dispatchEvent(new CustomEvent("skyreader:last-page-click"));
    },{passive:true});

    item.canvas=canvas;
    item.ctx=ctx;
    item.annotationLayer=annotationLayer;
    item.hydrated=true;

    return item;
}

function createSyntheticPageSurface(position){
    const surface=document.createElement("div");
    surface.className="sky180Page sky180SyntheticPage";
    surface.dataset.synthetic=position;
    surface.dataset.density="soft";
    surface.setAttribute("aria-hidden","true");
    return surface;
}

function isSinglePageDevice(){
    const narrow=window.matchMedia && window.matchMedia("(max-width: 760px)").matches;
    const coarse=window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    const touch=Number(navigator.maxTouchPoints||0)>0;
    const tabletTouch=touch && window.innerWidth<=1024;
    return Boolean(narrow || (coarse && tabletTouch));
}

function createAllPageSurfaces(twoPageDocument=false){
    pageSurfaces.clear();

    const surfaces=[];

    if(isSinglePageDevice()){
        for(let page=1;page<=pageCount;page++){
            surfaces.push(createPageShell(page));
        }

        /* StPageFlip is more reliable with at least two internal surfaces.
           A one-page PDF gets an invisible companion that can never be
           navigated to; the real PDF still remains a single-page reader. */
        if(pageCount===1){
            surfaces.push(createSyntheticPageSurface("single-page-end"));
        }
    }else if(twoPageDocument){
        /* A two-page PDF is a complete spread by itself. Do not add the
           normal cover/closing synthetic pages: StPageFlip would otherwise
           pair page 1 with the opening mask and page 2 with the closing mask,
           preventing the document from ever existing as a real 1–2 spread. */
        for(let page=1;page<=pageCount;page++){
            surfaces.push(createPageShell(page));
        }
    }else{
        surfaces.push(createSyntheticPageSurface("opening"));

        for(let page=1;page<=pageCount;page++){
            surfaces.push(createPageShell(page));
        }

        if(pageCount%2===0){
            surfaces.push(createSyntheticPageSurface("closing"));
        }
    }

    flipSurfaces=surfaces;
    return surfaces;
}


function getSurface(pageNumber){
    const item=pageSurfaces.get(pageNumber);
    if(!item) return null;

    /* Build the canvas/context/annotation-layer/listeners only now,
       the first time this specific page is actually about to be
       rendered — not for every page in the book at open time. */
    if(!item.hydrated) hydratePageSurface(pageNumber);

    return item;
}

/*-------------------------------------------------------
 Document loading
-------------------------------------------------------*/

renderer.open=async function(book,options={}){
    if(!book || !book.pdf) return;

    /*
     * Cold-start lifecycle: do not tear down the presentation engine when
     * there is no document currently open. The previous unconditional
     * renderer.close() caused a needless destroy/recreate cycle during the
     * first launch after a fresh load.
     *
     * When replacing an existing document, however, the normal cleanup path
     * is still used.
     */
    const hasOpenDocument = Boolean(pdf || currentBook ||
        (typeof Sky180FlipEngine!=="undefined" &&
         typeof Sky180FlipEngine.active==="function" &&
         Sky180FlipEngine.active()));

    if(hasOpenDocument){
        renderer.close();
    }else if(pageContainer){
        pageContainer.innerHTML="";
    }

    currentBook=book;
    const token=++openToken;
    const presentation=++presentationToken;

    if (
    window.SkyMediaLoading
) {

    SkyMediaLoading.start({
        percent: 5,
        onMessage: function (text) {
            const loadingText =
                document.getElementById("loadingText");

            if (loadingText) {
                loadingText.textContent =
                    text || "Loading...";
            }
        }
    });
}


progress(
    5,
    "Opening document"
);

    try{
        const pdfUrl=await resolvePdfUrl(book.pdf);
        progress(8,"Loading PDF");

        const task=pdfjsLib.getDocument({
            url:pdfUrl,
            enableXfa:false,
            useSystemFonts:true
        });

        activeLoadingTask=task;

        /*
         * This fetch/parse phase is timed on purpose. getDocument() only
         * needs the document's structure (xref/trailer), not the full byte
         * content of every embedded object — PDF.js streams the rest on
         * demand PROVIDED the server advertises byte-range support
         * (Accept-Ranges + a real Content-Length, no Content-Encoding on
         * the response). If that support is missing or broken for this
         * asset, PDF.js silently falls back to downloading the ENTIRE file
         * before this promise resolves — and a book with large embedded
         * video/audio attachments can turn that into a multi-minute stall
         * that has nothing to do with page count. If fetchMs below comes
         * back large, check the .pdf request in the Network tab: a 206
         * response with Accept-Ranges: bytes means streaming worked; a
         * single 200 response sized to the whole file means it didn't.
         */
        const fetchStartedAt=performance.now();

        let resolvedPdf;
        try{
            resolvedPdf=await task.promise;
        }finally{
            if(activeLoadingTask===task){
                activeLoadingTask=null;
            }
        }

        const fetchMs=Math.round(performance.now()-fetchStartedAt);
        if(fetchMs>2000){
            console.warn(
                "[Renderer] PDF fetch/parse for \""+pdfUrl+"\" took "+fetchMs+"ms. "+
                "If this book has large embedded media, check whether the server "+
                "returned 206 Partial Content (range requests working) or a single "+
                "200 response (full-file download, no streaming)."
            );
        }

        if(
    token!==openToken ||
    presentation!==presentationToken
){
    /* A newer open owns the loading overlay. Do not stop its sequence. */
    return;
}

        /*
         * Only commit to the shared `pdf` variable once this load is
         * confirmed to still be the current one. Two overlapping loads
         * (the user picking a different book while one is still
         * loading) can have their pdfjsLib.getDocument() promises
         * settle in either order - assigning `pdf` unconditionally
         * here let a stale/superseded load clobber the correct one
         * even though it was about to bail out on the very next line,
         * breaking all further rendering for the book actually wanted.
         */
        pdf=resolvedPdf;

        pageCount=pdf.numPages;

        const first=await pdf.getPage(1);

        if(token!==openToken || presentation!==presentationToken) return;

        currentViewport=first.getViewport({scale:1});
        pageRatio=currentViewport.width/currentViewport.height;

        const singlePage=isSinglePageDevice();
        const twoPageDocument=(!singlePage && pageCount===2);

    const requestedStart=Math.max(
            1,
            Math.min(pageCount,Number(options.startPage)||1)
        );

        currentPage=1;

        createAllPageSurfaces(twoPageDocument);

        await Sky180FlipEngine.open({
            container:pageContainer,
            pages:flipSurfaces,
            pageCount,
            startPage:1,
            singlePage,
            twoPageDocument,
            width:currentViewport.width,
            height:currentViewport.height,
            showCover:false,
            flippingTime:650
        });

        if(token!==openToken || presentation!==presentationToken) return;

        renderer.resize();

        /*
         * Initial spread: normal desktop two-page view needs both visible pages
         * ready before the reader is released. One- and two-page PDFs use the
         * compact single-page presentation fallback; page 2 is still rendered
         * by the normal background window.
         */
        const initialPages=(singlePage || pageCount===1) ? [1] : [1,2];

        const paintStartedAt=performance.now();

        await Promise.all(
            initialPages.map(pageNumber=>renderPage(pageNumber,true,token))
        );

        if(token!==openToken) return;

        const paintMs=Math.round(performance.now()-paintStartedAt);
        if(paintMs>1500){
            console.warn(
                "[Renderer] Painting the initial page(s) ("+initialPages.join(",")+
                ") took "+paintMs+"ms. Note: since annotation/media wiring is now "+
                "backgrounded (see scheduleAnnotationWork), this number reflects "+
                "pdf.js's own page.render() cost, not link/video setup."
            );
        }

        if (
    window.SkyMediaLoading
) {

    SkyMediaLoading.stop();
}


emit(
    "ready",
    book,
    pageCount
);

        /* Prepare and restore a requested/saved spread after page 1 is visible. */
        if(requestedStart>1){
            await renderPage(requestedStart,true,token);

            if(token!==openToken) return;

            Sky180FlipEngine.goTo(requestedStart);
            currentPage=Sky180FlipEngine.page();
            emit("page",currentPage,pageCount);
            scheduleWindow(currentPage,token);
        }
        else{
            scheduleWindow(1,token);
        }

    }
    catch(error){

    if(token!==openToken) return;


    if (
        window.SkyMediaLoading
    ) {

        SkyMediaLoading.stop();
    }


    emit(
        "error",
        error
    );


    throw error;
}
};

/*-------------------------------------------------------
 Resize
-------------------------------------------------------*/

renderer.resize=function(){
    if(!viewer || !pageRatio) return;

    /* StPageFlip owns the actual spread dimensions. */
    Sky180FlipEngine.resize();

    const host=document.getElementById("sky180FlipHost");

    if(!host) return;

    /*
     * Page geometry belongs to Sky180FlipEngine/StPageFlip. Renderer only
     * owns the PDF canvas content. Do not size page surfaces against the
     * full viewer host here; doing so makes short books extend outside the
     * actual centered book rectangle and can produce duplicate image areas.
     */
};

/*-------------------------------------------------------
 PDF page cache
-------------------------------------------------------*/

async function getPage(number){
    if(pageCache.has(number)) return pageCache.get(number);

    const page=await pdf.getPage(number);
    pageCache.set(number,page);
    return page;
}

/*-------------------------------------------------------
 Rendering window
-------------------------------------------------------*/

function getWindowPages(center){
    const pages=[];

    const start=Math.max(1,center-2);
    const end=Math.min(pageCount,start+RENDER_WINDOW-1);

    for(let page=start;page<=end;page++){
        pages.push(page);
    }

    return pages;
}

renderer.ensureRenderWindow=function(center=currentPage){
    if(!pdf) return;

    scheduleWindow(center,openToken);
};

function scheduleWindow(center,token){
    const targets=getWindowPages(center);

    let delay=0;

    for(const pageNumber of targets){
        if(renderedPages.has(pageNumber) || renderingQueue.has(pageNumber)){
            continue;
        }

        renderingQueue.add(pageNumber);

        const run=async()=>{
            try{
                await renderPage(pageNumber,false,token);
            }
            catch(error){
                if(token===openToken) console.warn("[Renderer] Page render failed",pageNumber,error);
            }
            finally{
                renderingQueue.delete(pageNumber);
            }
        };

        /* Give the visible page priority, then yield between pages. */
        setTimeout(run,delay);
        delay+=25;
    }

    trimPageCache(center);
}

/*-------------------------------------------------------
 Render one page
-------------------------------------------------------*/

async function renderPage(pageNumber,visible=false,token=openToken){
    if(!pdf || token!==openToken) return;

    const surface=getSurface(pageNumber);
    if(!surface || surface.rendered || surface.rendering) return;

    surface.rendering=true;

    try{
        if(visible){
            progress(
                Math.round((pageNumber/pageCount)*100),
                "Rendering page "+pageNumber
            );
        }

        /*
         * [PageDiag] getPage() vs page.render() breakdown.
         *
         * The video's own load pipeline (see [VideoDiag]) only starts
         * after the play button is pressed — so it cannot explain a page
         * that is blank before the button is even visible. If a page is
         * blank on arrival, the delay is somewhere in getting this page's
         * canvas painted at all, and that splits into two very different
         * causes:
         *   - getPage(): pdf.js locating/fetching/parsing this page's
         *     object (and, for a non-linearized PDF, potentially having to
         *     pull in far more of the file than just this page — e.g. an
         *     embedded video sitting between here and the xref table).
         *   - page.render(): actually painting the content stream to the
         *     canvas, once the page object is in hand.
         * Logged unconditionally for now (this is a diagnostic build) so
         * we can see page 4's numbers next to an ordinary page's.
         */
        const pageDiagStart=performance.now();
        const page=await getPage(pageNumber);
        const pageDiagGotPage=performance.now();

        if(token!==openToken) return;

        const viewport=page.getViewport({scale:renderScale});
        surface.viewport=viewport;

        surface.canvas.width=viewport.width;
        surface.canvas.height=viewport.height;

        const ctx=surface.ctx;

        ctx.setTransform(1,0,0,1,0,0);
        ctx.clearRect(0,0,surface.canvas.width,surface.canvas.height);

        await page.render({
            canvasContext:ctx,
            viewport,
            /*
             * [PageDiag] Candidate fix, testing directly:
             *
             * pdf.js's page.render() defaults annotationMode to
             * AnnotationMode.ENABLE, meaning it paints annotation
             * appearance streams onto the canvas itself, *in addition to*
             * this app's own AnnotationLayer overlay (renderMediaAnnotations,
             * below) which is what actually produces the play button. The
             * canvas-level annotation paint is therefore redundant here.
             *
             * Page 4's Screen/RichMedia annotation is the one annotation
             * in this whole book that references embedded media, and it's
             * the one page where page.render() (not getPage(), not the
             * video element's own load) stalled for ~52s. Disabling
             * annotation painting at the canvas level costs nothing
             * visually (the AnnotationLayer still draws the play button)
             * and directly tests whether the annotation's appearance
             * stream is what page.render() was stuck on.
             */
            annotationMode:(window.pdfjsLib && pdfjsLib.AnnotationMode) ? pdfjsLib.AnnotationMode.DISABLE : 0
        }).promise;

        if(token!==openToken) return;

        const pageDiagRendered=performance.now();
        console.info(
            "[PageDiag] Page "+pageNumber+" canvas path\n"+
            "  getPage (fetch/parse): "+Math.round(pageDiagGotPage-pageDiagStart)+"ms\n"+
            "  page.render (canvas):  "+Math.round(pageDiagRendered-pageDiagGotPage)+"ms\n"+
            "  total:                 "+Math.round(pageDiagRendered-pageDiagStart)+"ms"
        );

        surface.rendered=true;
        renderedPages.add(pageNumber);

        if(pageNumber===currentPage){
            currentViewport=viewport;
            renderer.resize();
        }

        /*
         * Links and media annotations are wiring, not pixels — and for a
         * page carrying an embedded video/audio attachment, wiring them up
         * (page.getAnnotations() + PDF.js's AnnotationLayer/MediaAnnotation
         * construction) can be disproportionately slow compared to painting
         * the page image itself. That cost used to be awaited right here,
         * inside renderPage(), which means it was awaited by every caller
         * of renderPage() too — including renderer.open()'s
         * Promise.all(initialPages.map(renderPage)) gate that the loading
         * screen waits on before revealing the book at all.
         *
         * The page is "on screen" the moment its canvas is painted, above.
         * Annotation/media wiring is intentionally NOT awaited here — it
         * runs in the background and attaches whenever it finishes,
         * without holding up first paint, the render-window scheduler, or
         * (most importantly) the initial "ready" reveal.
         */
        scheduleAnnotationWork(pageNumber,surface,page,viewport,token);

    }
    finally{
        surface.rendering=false;
    }
}

/*-------------------------------------------------------
 Deferred link/media-annotation wiring (see renderPage above)
-------------------------------------------------------*/

function scheduleAnnotationWork(pageNumber,surface,page,viewport,token){
    (async()=>{
        const linksStart=performance.now();
        try{
            await renderLinks(surface,page,viewport);
            if(token!==openToken) return;

            const mediaStart=performance.now();
            await renderMediaAnnotations(surface,page,viewport,pageNumber);
            if(token!==openToken) return;

            const doneAt=performance.now();
            const linksMs=Math.round(mediaStart-linksStart);
            const mediaMs=Math.round(doneAt-mediaStart);

            /*
             * Loud on purpose. If a page's annotation/media wiring is slow
             * enough for a person to notice, this line says so and says
             * which half (hyperlinks vs. embedded media) is responsible,
             * instead of leaving it to be re-discovered by guesswork.
             */
            if(linksMs+mediaMs>750){
                console.warn(
                    "[Renderer] Page "+pageNumber+" annotation wiring was slow — "+
                    "links: "+linksMs+"ms, media: "+mediaMs+"ms."
                );
            }
        }catch(error){
            if(token===openToken){
                console.warn("[Renderer] Annotation wiring failed for page",pageNumber,error);
            }
        }
    })();
}

/*-------------------------------------------------------
 Hyperlinks
-------------------------------------------------------*/

async function renderLinks(surface,page,viewport){
    surface.element
        .querySelectorAll(".pdfLink")
        .forEach(link=>link.remove());

    const annotations=await page.getAnnotations();

    for(const annotation of annotations){
        if(annotation.subtype!=="Link") continue;

        const link=document.createElement("a");
        link.className="pdfLink";
        link.style.position="absolute";
        link.style.left=(annotation.rect[0]/viewport.width*100)+"%";
        link.style.top=((viewport.height-annotation.rect[3])/viewport.height*100)+"%";
        link.style.width=((annotation.rect[2]-annotation.rect[0])/viewport.width*100)+"%";
        link.style.height=((annotation.rect[3]-annotation.rect[1])/viewport.height*100)+"%";
        link.style.cursor="pointer";
        link.style.background="transparent";
        link.style.zIndex="20";

        if(annotation.url){
            /* External PDF links open in a separate browser tab/window.
               Keep the reader page intact while allowing the device/browser
               to decide whether the new destination becomes a tab or window. */
            link.href=annotation.url;
            link.target="_blank";
            link.rel="noopener noreferrer";
        }
        else if(annotation.dest){
            link.href="#";
            link.onclick=async event=>{
                event.preventDefault();

                const destination=await pdf.getDestination(annotation.dest);
                if(!destination) return;

                const pageIndex=await pdf.getPageIndex(destination[0]);
                renderer.goTo(pageIndex+1);
            };
        }

        surface.element.appendChild(link);
    }
}

/*-------------------------------------------------------
 PDF media annotations

 PDF.js 5.4.54 adds playback support for embedded media in
 Screen/RichMedia annotations. Existing Link annotations stay
 handled by SkyReader's current hyperlink layer.
-------------------------------------------------------*/
async function renderMediaAnnotations(surface,page,viewport,pageNumber){
    if(!surface || !surface.annotationLayer) return;

    const layer=surface.annotationLayer;
    layer.innerHTML="";
    surface.annotationRenderer=null;

    const annotations=await page.getAnnotations({intent:"display"});
    const mediaAnnotations=annotations.filter(annotation=>
        annotation && (
            annotation.subtype==="Screen" ||
            annotation.subtype==="RichMedia" ||
            annotation.subtype==="Sound" ||
            annotation.subtype==="Movie"
        )
    );

    if(!mediaAnnotations.length) return;

    console.info("[SkyReader] PDF media annotations:", mediaAnnotations);

    /*
       IMPORTANT:
       Embedded Screen/RichMedia playback was added to PDF.js after the
       5.4.x line. The current PDF.js MediaAnnotationElement creates the
       actual play button and, on click, retrieves the embedded attachment
       through PDFLinkService.getAttachmentContent().

       Do not create a second diagnostic button here: PDF.js itself owns the
       interactive media control.
    */
    if(!window.pdfjsLib || !pdfjsLib.AnnotationLayer){
        console.warn("[SkyReader] PDF.js AnnotationLayer unavailable.",mediaAnnotations);
        return;
    }

    try{
        const EventBus=window.PDFEventBus;
        const eventBus=EventBus ? new EventBus() : null;
        const linkService=window.PDFLinkService ? new window.PDFLinkService({
            eventBus,
            externalLinkTarget:2,
            externalLinkRel:"noopener noreferrer"
        }) : null;

        if(!linkService){
            console.warn("[SkyReader] PDFLinkService unavailable.",mediaAnnotations);
            return;
        }

        if(typeof linkService.setDocument==="function"){
            linkService.setDocument(pdf);
        }

        const pdfViewport=viewport.clone ? viewport.clone({dontFlip:true}) : viewport;

        const rendererLayer=new pdfjsLib.AnnotationLayer({
            div:layer,
            page,
            viewport:pdfViewport,
            annotationCanvasMap:new Map(),
            accessibilityManager:null,
            annotationEditorUIManager:null,
            structTreeLayer:null,
            linkService,
            annotationStorage:pdf?.annotationStorage || null
        });

        surface.annotationRenderer=rendererLayer;

        await rendererLayer.render({
            viewport:pdfViewport,
            annotations:mediaAnnotations,
            page,
            div:layer,
            linkService,
            renderForms:false,
            enableScripting:false
        });

        const mediaContainer=layer.querySelector(".mediaAnnotation");
        const playButton=layer.querySelector(".mediaAnnotation .mediaPlayButton");

        if(mediaContainer){
            console.info("[SkyReader] PDF.js media annotation rendered:",mediaContainer);
            if(playButton){
                playButton.title=playButton.title || "Play embedded video";
                playButton.setAttribute("aria-label",playButton.getAttribute("aria-label") || "Play embedded video");
            }

            /*
             * [VideoDiag] Embedded-video lifecycle timing.
             *
             * The annotation/canvas path above is not where the visible
             * delay lives — PDF.js creates the actual <video> only after
             * its play button is pressed, and everything between that
             * press and the first visible frame happens outside the
             * annotation layer entirely (attachment retrieval, Blob/src
             * assignment, then the browser's own media pipeline).
             *
             * This block times exactly that path — press -> element
             * created -> src assigned -> loadstart -> loadedmetadata ->
             * loadeddata -> canplay — and logs one summary once the video
             * is ready to play. It does not touch page rendering, the
             * annotation scheduler, or worker.js.
             */
            let playPressedAt=null;
            if(playButton){
                playButton.addEventListener("pointerdown",()=>{
                    if(playPressedAt===null) playPressedAt=performance.now();
                },{capture:true,passive:true});
                playButton.addEventListener("click",()=>{
                    if(playPressedAt===null) playPressedAt=performance.now();
                },{capture:true,passive:true});
            }

            /*
             * Keep playback controls inside the SkyReader viewer instead of
             * relying on browser-native video menus, which can open outside
             * the viewer/under browser chrome at small viewport sizes.
             * PDF.js creates the actual <video> only after its play button is
             * pressed, so watch the media annotation for that element.
             */
            const installMediaControls=()=>{
                const video=mediaContainer.querySelector("video.mediaContent");
                if(!video || video.dataset.skyreaderControlsInstalled==="1") return;

                video.dataset.skyreaderControlsInstalled="1";
                video.controls=false;
                video.setAttribute("playsinline","");
                video.setAttribute("webkit-playsinline","");

                /* --- [VideoDiag] instrumentation start --- */
                (()=>{
                    const t0=playPressedAt!==null ? playPressedAt : performance.now();
                    const t0Label=playPressedAt!==null ? "" : " (no press captured — timing from element creation)";
                    const elapsed=()=>Math.round(performance.now()-t0);
                    const timings={"element created":elapsed()};

                    const record=(label)=>{
                        if(timings[label]!==undefined) return;
                        timings[label]=elapsed();
                    };

                    const report=()=>{
                        const lines=Object.keys(timings)
                            .map(label=>"  "+label.padEnd(18)+String(timings[label])+"ms")
                            .join("\n");
                        console.info(
                            "[VideoDiag] Page "+pageNumber+" embedded video"+t0Label+"\n"+lines
                        );
                    };

                    /* currentSrc reflects whichever mechanism PDF.js used —
                       a .src assignment, a src attribute, or a <source>
                       child — so polling it catches "src assigned" without
                       assuming which one PDF.js picked. */
                    if(video.currentSrc){
                        record("src assigned");
                    }else{
                        let rafId=null;
                        const pollSrc=()=>{
                            if(video.currentSrc){
                                record("src assigned");
                                return;
                            }
                            rafId=requestAnimationFrame(pollSrc);
                        };
                        rafId=requestAnimationFrame(pollSrc);
                        video.addEventListener("loadstart",()=>{
                            if(rafId!==null) cancelAnimationFrame(rafId);
                        },{once:true});
                    }

                    video.addEventListener("loadstart",()=>record("loadstart"),{once:true});
                    video.addEventListener("loadedmetadata",()=>record("loadedmetadata"),{once:true});
                    video.addEventListener("loadeddata",()=>record("loadeddata"),{once:true});
                    video.addEventListener("canplay",()=>{
                        record("canplay");
                        report();
                    },{once:true});
                    video.addEventListener("error",()=>{
                        console.warn(
                            "[VideoDiag] Page "+pageNumber+" embedded video errored before canplay",
                            video.error
                        );
                    },{once:true});
                })();
                /* --- [VideoDiag] instrumentation end --- */

                const controls=document.createElement("div");
                controls.className="skyreaderMediaControls";
                controls.setAttribute("role","group");
                controls.setAttribute("aria-label","Video controls");

                const playPause=document.createElement("button");
                playPause.type="button";
                playPause.className="skyreaderMediaControl skyreaderMediaPlayPause";

                const restart=document.createElement("button");
                restart.type="button";
                restart.className="skyreaderMediaControl skyreaderMediaRestart";
                restart.textContent="↻";
                restart.title="Restart video";
                restart.setAttribute("aria-label","Restart video");

                const mute=document.createElement("button");
                mute.type="button";
                mute.className="skyreaderMediaControl skyreaderMediaMute";

                const fullscreen=document.createElement("button");
                fullscreen.type="button";
                fullscreen.className="skyreaderMediaControl skyreaderMediaFullscreen";
                fullscreen.textContent="⛶";
                fullscreen.title="Fullscreen video";
                fullscreen.setAttribute("aria-label","Fullscreen video");

                controls.append(playPause,restart,mute,fullscreen);
                mediaContainer.appendChild(controls);

                let controlsTimer=null;
                const showControls=()=>{
                    controls.classList.add("skyreaderMediaControlsVisible");
                    if(controlsTimer) clearTimeout(controlsTimer);
                    controlsTimer=setTimeout(()=>{
                        controls.classList.remove("skyreaderMediaControlsVisible");
                    },10000);
                };
                const keepControlsVisible=()=>showControls();

                ["pointerenter","pointermove","pointerdown","pointerup","touchstart","touchend","click"].forEach(type=>{
                    mediaContainer.addEventListener(type,keepControlsVisible,{passive:true});
                });

                const update=()=>{
                    const playing=!video.paused && !video.ended;
                    playPause.textContent=playing ? "❚❚" : (video.ended ? "↻" : "▶");
                    playPause.title=video.ended ? "Replay video" : (playing ? "Pause video" : "Play video");
                    playPause.setAttribute("aria-label",playPause.title);
                    mute.textContent=video.muted ? "🔇" : "🔊";
                    mute.title=video.muted ? "Unmute video" : "Mute video";
                    mute.setAttribute("aria-label",mute.title);
                };

                /*
                 * Only stopPropagation for touch/pointer start-end events —
                 * calling preventDefault() on touchstart/touchend (or
                 * pointerdown/pointerup for a touch-type pointer) tells the
                 * browser to skip synthesizing the follow-up "click" event
                 * for that tap. That's harmless on desktop (native mouse
                 * clicks fire regardless of what happens on mousedown/up),
                 * but on mobile it silently killed every button's click
                 * handler below — which is why these controls worked on
                 * desktop but not on touch devices. stopPropagation() alone
                 * is enough to keep the tap from reaching the media
                 * container's click-to-toggle handler or bubbling out to
                 * the page-turn layer.
                 */
                const stopTurn=event=>{
                    event.preventDefault();
                    event.stopPropagation();
                };
                const stopTurnPassive=event=>{
                    event.stopPropagation();
                };
                ["mousedown","mouseup","click"].forEach(type=>
                    controls.addEventListener(type,stopTurn)
                );
                ["pointerdown","pointerup","touchstart","touchend"].forEach(type=>
                    controls.addEventListener(type,stopTurnPassive)
                );

                playPause.addEventListener("click",()=>{
                    if(video.ended){
                        video.currentTime=0;
                        video.play().catch(()=>{});
                    }else if(video.paused){
                        video.play().catch(()=>{});
                    }else{
                        video.pause();
                    }
                });

                restart.addEventListener("click",()=>{
                    video.currentTime=0;
                    video.play().catch(()=>{});
                });

                mute.addEventListener("click",()=>{
                    video.muted=!video.muted;
                    update();
                });

                fullscreen.addEventListener("click",()=>{
                    const request=video.requestFullscreen || video.webkitRequestFullscreen;
                    if(typeof request==="function") request.call(video);
                });

                video.addEventListener("play",()=>{ update(); showControls(); });
                video.addEventListener("pause",()=>{ update(); showControls(); });
                video.addEventListener("ended",()=>{ update(); showControls(); });
                video.addEventListener("volumechange",()=>{ update(); showControls(); });
                video.addEventListener("click",()=>{
                    if(video.paused || video.ended){
                        if(video.ended) video.currentTime=0;
                        video.play().catch(()=>{});
                    }else{
                        video.pause();
                    }
                });

                update();
                showControls();
            };

            installMediaControls();
            const mediaObserver=new MutationObserver(installMediaControls);
            mediaObserver.observe(mediaContainer,{childList:true,subtree:true});
            mediaContainer._skyreaderMediaObserver=mediaObserver;
        }else{
            console.warn("[SkyReader] PDF.js returned no mediaAnnotation element.",mediaAnnotations);
        }
    }catch(error){
        console.error("[SkyReader] PDF media annotation rendering failed:",error,mediaAnnotations);
    }
}
/*-------------------------------------------------------
 Page/cache cleanup
-------------------------------------------------------*/

function trimPageCache(center){
    const keep=new Set(getWindowPages(center));

    for(const key of pageCache.keys()){
        if(!keep.has(key)) pageCache.delete(key);
    }
}

/*-------------------------------------------------------
 Navigation API
-------------------------------------------------------*/

renderer.next=function(){
    if(!pdf) return false;
    return Sky180FlipEngine.next();
};

renderer.previous=function(){
    if(!pdf) return false;
    return Sky180FlipEngine.previous();
};

renderer.goTo=async function(page){
    if(!pdf) return false;

    page=Math.max(1,Math.min(pageCount,Number(page)||1));

    /* Prepare the target page before asking the engine to move. */
    const token=openToken;

    await renderPage(page,true,token);

    if(token!==openToken || !pdf) return false;

    Sky180FlipEngine.goTo(page);
    currentPage=Sky180FlipEngine.page();
    scheduleWindow(currentPage,token);

    return true;
};

renderer.refresh=function(){
    if(!pdf) return;

    for(const item of pageSurfaces.values()){
        item.rendered=false;
    }

    renderedPages.clear();
    renderingQueue.clear();

    scheduleWindow(currentPage,openToken);
};

renderer.statistics=function(){
    return {
        book:currentBook,
        currentPage,
        pageCount,
        cachedPages:pageCache.size,
        renderedPages:renderedPages.size,
        renderScale,
        renderWindow:RENDER_WINDOW,
        spread:renderer.spread(),
        flipping:Sky180FlipEngine.busy()
    };
};

/*-------------------------------------------------------
 Cleanup
-------------------------------------------------------*/

renderer.close=function(){
    openToken++;
    presentationToken++;

    if(activeLoadingTask){
        try{
            activeLoadingTask.destroy();
        }catch(error){}
        activeLoadingTask=null;
    }

    if(window.SkyMediaLoading){
        SkyMediaLoading.stop();
    }

    if(typeof Sky180FlipEngine!=="undefined"){
        Sky180FlipEngine.close();
    }

    pageSurfaces.clear();
    pageCache.clear();
    renderedPages.clear();
    renderingQueue.clear();

    currentBook=null;
    currentPage=1;
    pageCount=0;
    pageRatio=1;
    currentViewport=null;

    if(pageContainer){
        pageContainer.innerHTML="";
    }

    pdf=null;
};

renderer.destroy=function(){
    renderer.close();

    if(resizeObserver){
        resizeObserver.disconnect();
        resizeObserver=null;
    }

    viewer=null;
    pageContainer=null;
    initialized=false;
};

/*-------------------------------------------------------
 Events
-------------------------------------------------------*/

renderer.on=function(name,callback){
    if(Object.prototype.hasOwnProperty.call(renderer.events,name)){
        renderer.events[name]=callback;
    }
    return renderer;
};

/*-------------------------------------------------------
 Configuration
-------------------------------------------------------*/

renderer.setRenderScale=function(scale){
    scale=Math.max(1,Math.min(4,Number(scale)||2));

    if(scale===renderScale) return;

    renderScale=scale;
    renderer.refresh();
};

renderer.getRenderScale=function(){
    return renderScale;
};

renderer.version="3.1.0";

return renderer;

})();

/*-------------------------------------------------------
 Automatic initialization
-------------------------------------------------------*/

document.addEventListener("DOMContentLoaded",()=>{
    Renderer.initialize();
});