"use strict";

/*
=========================================================
 SkyReader Sky180FlipEngine
 Version 1.0

 SkyReader-specific presentation engine.

 Responsibilities
 • Own the StPageFlip instance
 • Turn already-created SkyReader page surfaces
 • Expose only SkyReader page movement methods
 • Report flip state/page changes to Renderer

 IMPORTANT
 No other SkyReader module should reference St.PageFlip.
 Renderer owns PDF.js and page canvases.
 This engine owns only the page-flip presentation layer.
=========================================================
*/

window.Sky180FlipEngine=(function(){

const engine={};

let host=null;
let flipHost=null;
let flipbook=null;

let pageCount=0;
let currentPage=1;
let singlePageMode=false;
let twoPageDocumentMode=false;
let busy=false;
let initialized=false;
let engineReady=false;
let pendingReadyReject=null;
let normalFlippingTime=650;

/*
 * Bumped by every open() call and by close(). open() itself has no
 * way to be interrupted mid-flight otherwise: between creating
 * flipHost/appending it to host and constructing `new St.PageFlip()`,
 * it awaits two animation frames with nothing yet for close() to
 * destroy (flipbook is still null at that point). If a second
 * open() call - and its own close() beforehand - runs during that
 * window, the first call's suspended continuation would resume
 * afterward with no idea it had been superseded, and go on to
 * construct a PageFlip instance against a flipHost that has since
 * been detached from `host` (the second call's own close()/open()
 * already replaced it), silently overwriting the second call's
 * module-level flipbook/flipHost/pendingReadyReject state. That is
 * exactly the "picking a different book while one is still loading
 * breaks all rendering" failure. Checking this after the await lets
 * a superseded call bail out before touching any shared state.
 */
let openSequence=0;
let pageTurnAudioPlayed=false;
let pageCurlAudioPlayed=false;
let handlers={
    init:null,
    page:null,
    state:null,
    orientation:null,
    error:null
};

function emit(name,...args){
    const fn=handlers[name];
    if(typeof fn==="function") fn(...args);
}

function normalizeSpreadStart(page){
    page=Math.max(1,Math.min(pageCount,Number(page)||1));

    if(singlePageMode){
        return page;
    }

    if(twoPageDocumentMode){
        /* A true 1–2 document contains exactly two internal PageFlip pages.
           PageFlip index 0 is PDF page 1; index 1 is PDF page 2. */
        return page;
    }

    if(pageCount<=1 || page===1){
        return 1;
    }

    /* Real PDF page numbers now equal their StPageFlip indices. */
    return page%2===0 ? page : page-1;
}

function internalPageCount(){
    if(singlePageMode || twoPageDocumentMode) return pageCount;
    return pageCount+1+(pageCount%2===0 ? 1 : 0);
}

function lastSpreadIndex(){
    return Math.max(0,Math.floor(internalPageCount()/2)-1);
}

function spreadHostOffset(spreadIndex){
    if(singlePageMode || twoPageDocumentMode) return 0;
    if(!flipbook || typeof flipbook.getBoundsRect!=="function") return 0;

    const bounds=flipbook.getBoundsRect();
    const pageWidth=Number(bounds && bounds.pageWidth)||0;
    if(!pageWidth) return 0;

    /*
     * Opening spread: [transparent, cover]. Shift left by half a page so
     * the real cover is centered.
     *
     * Closing spread for even-length PDFs: [last page, transparent].
     * Shift right by half a page so the last real page is centered.
     */
    if(twoPageDocumentMode){
        return 0;
    }

    if(spreadIndex===0){
        return -pageWidth/2;
    }

    if(pageCount%2===0 && spreadIndex===lastSpreadIndex()){
        return pageWidth/2;
    }

    return 0;
}

function syncCenterShadowBounds(){
    if(!flipHost || !flipbook || typeof flipbook.getBoundsRect!=="function") return;

    const bounds=flipbook.getBoundsRect();
    if(!bounds) return;

    /*
     * StPageFlip's .stf__block fills the entire distribution element,
     * while getBoundsRect() describes the actual rendered book rectangle.
     * Keep the center shadow tied to that rectangle rather than the viewer.
     */
    const top=Number(bounds.top);
    const height=Number(bounds.height);
    if(!Number.isFinite(top) || !Number.isFinite(height) || height<=0) return;

    flipHost.style.setProperty("--sky180-book-top",`${top}px`);
    flipHost.style.setProperty("--sky180-book-height",`${height}px`);
}

function applyHostAlignment(spreadIndex=null,animate=false,transitionOverride=null){
    if(!flipHost || !flipbook) return;

    if(spreadIndex===null &&
       typeof flipbook.getPageCollection==="function" &&
       typeof flipbook.getPageCollection().getCurrentSpreadIndex==="function"){
        spreadIndex=flipbook.getPageCollection().getCurrentSpreadIndex();
    }

    const offset=spreadHostOffset(spreadIndex);
    const transitionTime=
        transitionOverride!=null
            ? Number(transitionOverride)||normalFlippingTime
            : (flipbook && flipbook.getSettings
                ? Number(flipbook.getSettings().flippingTime)||normalFlippingTime
                : normalFlippingTime);

    /*
     * Keep the host's layout position stable. Moving it with `left` changes
     * its layout box while StPageFlip is measuring/painting, which can create
     * the brief "book flies in from the right" effect on a newly selected
     * book. A transform moves only the rendered surface.
     */
    flipHost.style.transition=animate
        ? `transform ${Math.max(1,transitionTime)}ms cubic-bezier(.22,.61,.36,1)`
        : "none";
    flipHost.style.transform=`translate3d(${offset}px,0,0)`;

    if(!animate){
        requestAnimationFrame(()=>{
            if(flipHost) flipHost.style.transition="";
        });
    }
}

function prepareHostForTransition(targetSpreadIndex){
    applyHostAlignment(targetSpreadIndex,true);
}

function syncSyntheticMask(position){
    if(!flipHost) return;

    const viewer=document.getElementById("viewerBackground");
    if(!viewer) return;

    const synthetic=flipHost.querySelector(`.sky180SyntheticPage[data-synthetic="${position}"]`);
    if(!synthetic) return;

    let mask=synthetic.querySelector(":scope > .sky180SyntheticMask");
    if(!mask){
        mask=document.createElement("div");
        mask.className="sky180SyntheticMask";
        mask.setAttribute("aria-hidden","true");
        synthetic.appendChild(mask);
    }

    const style=getComputedStyle(viewer);
    const bgImage=style.backgroundImage;
    if(!bgImage || bgImage==="none") return;

    mask.style.backgroundImage=bgImage;
    mask.style.backgroundRepeat="no-repeat";
    mask.style.backgroundSize="100vw 100vh";
    mask.style.backgroundPosition="center center";
}


function setCustomFlipLighting(active,coverReverse=false,finalForward=false){
    if(!flipHost) return;

    flipHost.classList.toggle("sky180-is-flipping",!!active);

    /*
     * The center shadow lives inside the actual StPageFlip wrapper so its
     * height is exactly the book height, never the full viewer height.
     */
    const wrapper=flipHost.querySelector(".stf__wrapper");
    if(wrapper){
        wrapper.classList.toggle("sky180-lighting-active",!!active);
    }
    flipHost.classList.toggle("sky180-cover-reverse",!!coverReverse);
    flipHost.classList.toggle("sky180-final-forward",!!finalForward);
}


function pageIndexToSpreadStart(index){
    index=Math.max(0,Number(index)||0);
    if(singlePageMode){
        return Math.min(pageCount,index+1);
    }
    if(twoPageDocumentMode){
        return Math.min(pageCount,index+1);
    }
    /* Internal index 0 is the transparent opening partner. */
    if(index<=1) return 1;
    return index%2===0 ? index : index-1;
}

function syncCurrentPage(emitEvent=true){
    if(!flipbook) return currentPage;

    const index=typeof flipbook.getCurrentPageIndex==="function"
        ? flipbook.getCurrentPageIndex()
        : 1;
    const nextPage=pageIndexToSpreadStart(index);

    if(nextPage!==currentPage) currentPage=nextPage;
    if(emitEvent) emit("page",currentPage,pageCount);
    return currentPage;
}

function ensureLibrary(){
    if(typeof St==="undefined" || typeof St.PageFlip!=="function"){
        const error=new Error(
            "Sky180FlipEngine: page-flip.browser.js is not loaded."
        );
        emit("error",error);
        throw error;
    }
}

engine.initialize=function(options={}){
    if(initialized) return;

    host=options.container || document.getElementById("pageContainer");

    if(!host){
        throw new Error("Sky180FlipEngine: #pageContainer not found.");
    }

    ensureLibrary();

    initialized=true;
};

engine.open=async function(options={}){
    if(!initialized) engine.initialize(options);

    ensureLibrary();

    /*
     * Renderer.open() already closes an existing document before
     * starting a new presentation. Do not perform a second close here.
     *
     * A second close during the first PageFlip initialization can
     * invalidate the newly-created presentation while Renderer.open()
     * is still waiting for it to become ready.
     */

    const sequence=++openSequence;

    let resolveReady;
    let rejectReady;
    const readyPromise=new Promise((resolve,reject)=>{
        resolveReady=resolve;
        rejectReady=reject;
        pendingReadyReject=reject;
    });

    pageCount=Math.max(0,Number(options.pageCount)||0);
    singlePageMode=Boolean(options.singlePage);
    twoPageDocumentMode=Boolean(options.twoPageDocument) && !singlePageMode;
    currentPage=Math.max(1,Number(options.startPage)||1);
    normalFlippingTime=Number(options.flippingTime)||650;

    if(!options.pages || !options.pages.length){
        throw new Error("Sky180FlipEngine: no page surfaces supplied.");
    }

    /*
     * StPageFlip removes the element supplied to its constructor when
     * destroyed. Therefore it gets a private child of #pageContainer,
     * never #pageContainer itself.
     */
    engineReady=false;

    flipHost=document.createElement("div");
    flipHost.id="sky180FlipHost";
    flipHost.className="sky180FlipHost";
    flipHost.classList.toggle("sky180-single-page",singlePageMode);
    flipHost.classList.toggle("sky180-two-page-document",twoPageDocumentMode);




    /*
     * The StPageFlip wrapper is allowed to be shorter than the viewer.
     * Center that wrapper inside the host so short/tall PDFs do not jump
     * vertically when the page ratio changes.
     */
    flipHost.style.display="flex";
    flipHost.style.alignItems="flex-start";
    flipHost.style.justifyContent="center";
    flipHost.style.overflow="hidden";
    flipHost.style.position="relative";
    flipHost.style.transform="translate3d(0,0,0)";
    flipHost.classList.add("sky180-layout-pending");

    host.innerHTML="";
    host.appendChild(flipHost);

    /*
     * Test20: let the viewer/flex layout settle before StPageFlip measures
     * the host. This is especially important for the landscape book, whose
     * first measurement can otherwise occur before its final dimensions
     * have propagated through the container.
     */
    await new Promise(resolve=>requestAnimationFrame(()=>
        requestAnimationFrame(resolve)
    ));

    /*
     * Superseded by a newer open() (or cancelled outright by a
     * close()) while waiting out the frames above - flipbook does
     * not exist yet at this point for that newer call's close() to
     * have cleaned up, so it has no way to stop this continuation
     * except this check. Bail out now, before creating a PageFlip
     * instance against a flipHost that has likely already been
     * detached from `host` by whatever ran after us, and before
     * touching any of the shared module state it has since set up.
     */
    if(sequence!==openSequence){
        return;
    }

    flipbook=new St.PageFlip(
        flipHost,
        {
            width:options.width || 800,
            height:options.height || 1100,
            size:"stretch",


            minWidth:options.minWidth || 280,
            maxWidth:options.maxWidth || 1000,
            minHeight:options.minHeight || 380,
            maxHeight:options.maxHeight || 1400, 
            drawShadow:true,
            maxShadowOpacity:0.35,
            flippingTime:options.flippingTime || 650,
            usePortrait:singlePageMode,
            showCover:false,
            autoSize:true,
            mobileScrollSupport:true,
            swipeDistance:30,
            clickEventForward:true,
            /* Mobile uses the dedicated horizontal single-page swipe path in
             * SRNavigation. Desktop retains StPageFlip mouse interactions. */
            useMouseEvents:!singlePageMode
        }
    );





    /*
     * StPageFlip creates its UI wrapper when loadFromHTML() is called,
     * not in the constructor. Do not access getUI()/getWrapper() here.
     * The host/CSS owns centering; StPageFlip owns the book rectangle.
     */

    /* StPageFlip owns mouse and touch page gestures. */

    flipbook.on("init",event=>{
        const index=event && event.data ? event.data.page : 0;

        /*
         * Test20: StPageFlip has emitted init, but allow two more paint/layout
         * frames before declaring the engine ready. The explicit update()
         * then gives landscape books a settled first measurement without
         * changing the normal page-turn lifecycle.
         */
        requestAnimationFrame(()=>requestAnimationFrame(()=>{
            if(!flipbook) return;

            if(typeof flipbook.update==="function"){
                flipbook.update();
            }

            syncCenterShadowBounds();

            currentPage=pageIndexToSpreadStart(index);
            busy=false;
            engineReady=true;

            applyHostAlignment(
                flipbook.getPageCollection().getCurrentSpreadIndex(),
                false
            );

            /* Reveal only after the final initial position is known. */
            requestAnimationFrame(()=>{
                if(!flipHost || !flipbook) return;
                flipHost.classList.remove("sky180-layout-pending");
                flipHost.classList.add("sky180-layout-ready");
            });

            emit("init",currentPage,pageCount);
            pendingReadyReject=null;
            resolveReady({page:currentPage,pages:pageCount});
        }));
    });

    flipbook.on("flip",()=>{
        /* StPageFlip has already changed its page collection.
           Read the authoritative index from the instance. */
        syncCurrentPage(true);
    });

    flipbook.on("changeState",event=>{
        const state=event.data;
        busy=state!=="read";

        /* Embedded PDF videos belong to the page being viewed. As soon as
         * StPageFlip begins a page turn, pause any media currently playing
         * so audio/video cannot continue from a page that is no longer open. */
        if(state==="flipping" || state==="user_fold" || state==="fold_corner"){
            if(flipHost){
                flipHost.querySelectorAll(".skyreaderMediaAnnotationLayer video.mediaContent").forEach(video=>{
                    try{
                        video.pause();
                    }catch(error){}
                });
            }
        }

        /*
         * Keep custom lighting strictly scoped to the live turn. This avoids
         * the permanent center line that occurred with a static overlay.
         */
        let hoverCoverReverse=flipHost.classList.contains("sky180-cover-reverse");
        let hoverFinalForward=flipHost.classList.contains("sky180-final-forward");

        /*
         * Boundary hover is StPageFlip's `fold_corner` state.  Do not
         * intercept mouse movement and do not issue navigation here.  We
         * only prepare the existing synthetic backing surface so the normal
         * StPageFlip curl reveals camouflage instead of the page underneath.
         */
        if(state==="fold_corner" && flipbook &&
           typeof flipbook.getPageCollection==="function" &&
           typeof flipbook.getFlipController==="function"){
            const collection=flipbook.getPageCollection();
            const controller=flipbook.getFlipController();
            const spreadIndex=collection.getCurrentSpreadIndex();
            const spreads=collection.getSpread();
            const calc=typeof controller.getCalculation==="function"
                ? controller.getCalculation()
                : null;
            const direction=calc && typeof calc.getDirection==="function"
                ? calc.getDirection()
                : null;
            const lastIndex=spreads.length-1;

            hoverCoverReverse = spreadIndex===1 && direction===1;
            hoverFinalForward = spreadIndex===lastIndex-1 && direction===0;

            /*
             * IMPORTANT: boundary hover can be the very first interaction
             * with this spread.  The synthetic mask's background image was
             * previously prepared only by engine.previous()/engine.next().
             * That made the hover fix appear intermittent: after another
             * navigation the mask was already populated, but on a first
             * hover it was merely made opaque with no image behind it.
             *
             * Populate the existing synthetic backing surface at the moment
             * StPageFlip enters its real fold_corner state.  We do not alter
             * the current page, the curl, the navigation state, or the page
             * stack; we only ensure that the already-existing camouflage is
             * ready before StPageFlip paints the hover frame.
             */
            if(hoverCoverReverse){
                syncSyntheticMask("opening");
            }else if(hoverFinalForward){
                syncSyntheticMask("closing");
            }
        }

        const active=state==="flipping" || state==="user_fold" || state==="fold_corner";
        const coverReverse=hoverCoverReverse;
        const finalForward=hoverFinalForward;
        if(engineReady){
            setCustomFlipLighting(active,coverReverse,finalForward);
        }

        if(state==="read"){
            if(flipbook && typeof flipbook.getPageCollection==="function"){
                const settledSpreadIndex =
                    flipbook.getPageCollection().getCurrentSpreadIndex();

                /*
                 * The opening spread is intentionally offset by half a page
                 * so the real cover is centered.  When the 2–3 -> cover flip
                 * finishes, let that final centering settle gently instead
                 * of snapping on the same frame as StPageFlip enters `read`.
                 * Other spreads retain the original immediate alignment.
                 */
                applyHostAlignment(
                    settledSpreadIndex,
                    settledSpreadIndex===0,
                    settledSpreadIndex===0 ? 360 : null
                );
            }
            flipHost.classList.remove("sky180-cover-reverse","sky180-final-forward");
            if(flipbook && typeof flipbook.getPageCollection==="function") {
                flipHost.classList.toggle(
                    "sky180-open-spread",
                    flipbook.getPageCollection().getCurrentSpreadIndex()>0
                );
            }
            syncCurrentPage(true);
        }

        // Curl and turn are deliberately separate sounds. Hover/edge curl
        // gets pagecurl.mp3; the committed movement gets pageturn.mp3.
        if(state==="fold_corner"){
            if(!pageCurlAudioPlayed && window.AudioController && typeof AudioController.playPageCurl==="function"){
                pageCurlAudioPlayed=true;
                AudioController.playPageCurl();
            }
        }

        if(state==="user_fold" || state==="flipping"){
            if(!pageTurnAudioPlayed && window.AudioController && typeof AudioController.playPageTurn==="function"){
                pageTurnAudioPlayed=true;
                AudioController.playPageTurn();
            }
        }

        if(state==="flipping"){
            if(flipbook &&
               typeof flipbook.getPageCollection==="function" &&
               typeof flipbook.getFlipController==="function"){
                const collection=flipbook.getPageCollection();
                const controller=flipbook.getFlipController();
                const sourceIndex=collection.getCurrentSpreadIndex();
                const direction=typeof controller.getDirection==="function"
                    ? controller.getDirection()
                    : 0;
                const targetIndex=sourceIndex+(direction===1 ? -1 : 1);

                if(targetIndex>=0 && targetIndex<collection.getSpread().length){
                    applyHostAlignment(targetIndex,true);
                }
            }

        }

        if(state==="read" || state==="idle"){
            pageTurnAudioPlayed=false;
            pageCurlAudioPlayed=false;
        }
        emit("state",state);
    });

    flipbook.on("changeOrientation",event=>{
        emit("orientation",event.data);
    });

    /*
     * StPageFlip owns normal mouse/touch click, drag, and curl interaction.
     * Do not intercept mousedown here: doing so prevents StPageFlip from
     * establishing its own drag/curl gesture. Embedded media is isolated at
     * the annotation layer in Renderer instead.
     */

    try{
        flipbook.loadFromHTML(options.pages);
    }
    catch(error){
        emit("error",error);
        rejectReady(error);
        throw error;
    }

    return readyPromise;
};

engine.next=function(){
    if(!flipbook || busy || pageCount<=0) return false;

    const spread=typeof flipbook.getPageCollection==="function"
        ? flipbook.getPageCollection()
        : null;

    if(spread && typeof spread.getCurrentSpreadIndex==="function" &&
       typeof spread.getSpread==="function"){
        const index=spread.getCurrentSpreadIndex();
        const list=spread.getSpread();
        if(index>=list.length-1) return false;
    }

    busy=true;

    const targetSpreadIndex=
        spread.getCurrentSpreadIndex()+1;

    prepareHostForTransition(targetSpreadIndex);
    flipHost.classList.remove("sky180-cover-reverse");
    flipHost.classList.toggle(
        "sky180-final-forward",
        targetSpreadIndex===lastSpreadIndex()
    );
    flipHost.classList.remove("sky180-open-spread");
    if(targetSpreadIndex===lastSpreadIndex() && pageCount%2===0) syncSyntheticMask("closing");
    flipbook.flipNext();
    return true;
};

engine.previous=function(){
    if(!flipbook || busy) return false;

    const spread=typeof flipbook.getPageCollection==="function"
        ? flipbook.getPageCollection()
        : null;

    if(spread && typeof spread.getCurrentSpreadIndex==="function" &&
       spread.getCurrentSpreadIndex()<=0){
        return false;
    }

    busy=true;

    const targetSpreadIndex=
        spread.getCurrentSpreadIndex()-1;


    prepareHostForTransition(targetSpreadIndex);
    flipHost.classList.toggle("sky180-cover-reverse",targetSpreadIndex===0);
    flipHost.classList.remove("sky180-final-forward");
    flipHost.classList.remove("sky180-open-spread");
    if(targetSpreadIndex===0) syncSyntheticMask("opening");
    flipbook.flipPrev();
    return true;
};


engine.goTo=function(page){
    if(!flipbook) return false;

    const target=normalizeSpreadStart(page);
    const previous=currentPage;

    currentPage=target;

    /*
     * A direct page jump is not a normal FlipController turn.  Do not take
     * the engine's normal turn lock here: StPageFlip owns its own interaction
     * lifecycle, and a turnToPage() call may not emit the same changeState
     * sequence as flipNext()/flipPrev().  Leaving busy=true here can therefore
     * strand navigation until a later pointer interaction resets the state.
     */
    busy=false;

    try{
        const collection=flipbook.getPageCollection();
        const targetSpreadIndex=collection.getSpreadIndexByPage(target);

        applyHostAlignment(targetSpreadIndex,true);

        /*
         * StPageFlip uses zero-based page indexes internally.  In our
         * desktop two-page composition the synthetic opening page makes
         * the real PDF page number line up with the StPageFlip index.
         * Mobile single-page mode has no synthetic page, so real PDF page N
         * corresponds to internal index N-1.
         */
        const flipTarget=(singlePageMode || twoPageDocumentMode) ? target-1 : target;
        flipbook.turnToPage(flipTarget);
    }
    catch(error){
        currentPage=previous;
        busy=false;
        emit("error",error);
        return false;
    }

    /* No movement is needed when the requested spread is already visible. */
    if(target===previous){
        busy=false;
        emit("page",currentPage,pageCount);
    }

    return true;
};

engine.spread=function(){
    if(singlePageMode){
        return {start:currentPage,end:currentPage,isCover:currentPage===1,label:String(currentPage)};
    }

    if(twoPageDocumentMode){
        return {start:1,end:2,isCover:false,label:"1–2"};
    }

    const start=normalizeSpreadStart(currentPage);

    if(start===1){
        return {start:1,end:1,isCover:true,label:"1"};
    }

    const end=Math.min(pageCount,start+1);
    return {
        start,
        end,
        isCover:false,
        label:start===end?String(start):start+"–"+end
    };
};



engine.resize=function(){ /* * IMPORTANT: ResizeObserver can fire immediately after the private * StPageFlip host is appended, while loadFromHTML() is still building * the PageFlip UI. Calling update() during that interval can interrupt * the first initialization and produce the intermittent cold-start * failure where the book does not appear until a second interaction. * * Ignore resize requests until StPageFlip has emitted its init event. * Renderer will call resize again after Renderer.open() awaits the * engine readiness promise. */ if(!flipbook || !engineReady) return; /* * StPageFlip owns the book rectangle. Let it recalculate from the * available viewer size, then re-apply the opening/closing spread alignment. */ flipbook.update(); syncCenterShadowBounds(); if(typeof flipbook.getPageCollection==="function"){ applyHostAlignment( flipbook.getPageCollection().getCurrentSpreadIndex(), false ); } }; engine.page=function(){ return currentPage; }; engine.pages=function(){ return pageCount; }; engine.isSinglePage=function(){ return singlePageMode; }; engine.isTwoPageDocument=function(){ return twoPageDocumentMode; }; engine.busy=function(){ return busy; }; engine.active=function(){ return flipbook!==null; }; engine.close=function(){ openSequence++; if(pendingReadyReject){ try{ pendingReadyReject(new Error("Sky180FlipEngine: open cancelled.")); }catch(error){} pendingReadyReject=null; } if(flipbook){ try{ /* * A failed open can leave a PageFlip instance constructed but * not yet loaded. Its destroy() method assumes the UI exists, * so only destroy after loadFromHTML() has created the UI. */ const ui=typeof flipbook.getUI==="function" ? flipbook.getUI() : null; if(ui && typeof ui.destroy==="function"){ flipbook.destroy(); } } catch(error){ console.warn("[Sky180FlipEngine] destroy failed",error); } } if(flipHost){ flipHost.classList.remove("sky180-is-flipping","sky180-layout-pending","sky180-layout-ready"); } flipbook=null; flipHost=null; engineReady=false; pageCount=0; currentPage=1; singlePageMode=false; twoPageDocumentMode=false; busy=false; }; engine.destroy=engine.close; engine.on=function(name,callback){ if(Object.prototype.hasOwnProperty.call(handlers,name)){ handlers[name]=callback; } return engine; }; engine.version="1.6.0"; return engine; })();