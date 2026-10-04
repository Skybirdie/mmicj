"use strict";

/*
=========================================================
 SkyReader BookStack
 Version 1.0

 Passive visual layer: draws thin stacks of page edges on the
 outer left/right sides of a two-page spread so the book looks
 thick. The left stack grows as pages are turned, the right
 stack shrinks.

 SAFETY RULES
 - Never touches StPageFlip, page surfaces, or layout.
 - The overlay is pointer-events:none and lives as a sibling of
   .stf__wrapper inside the engine's private host.
 - Every public method is wrapped in try/catch; a failure here
   can never block a book from opening or turning.
 - Off unless enabled (see BookStack.isEnabled()).
 - Desktop two-page spreads, plus single-page (mobile) mode.
   Two-page-document mode (a 2-page PDF) never shows a stack.
 - Single-page mode has no spare room inside the book host (the
   page fills its width), so it draws the stack in the viewer's own
   padding gutter (#viewerArea) and never changes layout.
 - Hidden while the reader is zoomed, panned or rotated.

 Enable / disable (per browser):
   - Settings panel switch ("Page edges"), or
   - localStorage "skyreader.bookStack" = "1" / "0", or
   - URL ?pagestack=1 / ?pagestack=0 (also saves the choice)
=========================================================
*/

window.BookStack=(function(){

const api={};

const STORAGE_KEY="skyreader.bookStack";
const DEFAULT_ENABLED=true;

/* Tunables */
const MIN_TOTAL_PX=4;     // total stack thickness for a very short book
const MAX_TOTAL_PX=14;    // total stack thickness for a very long book
const PX_PER_PAGE=0.14;
const MIN_SIDE_PX=1.5;    // any side that still has pages shows at least this
const EDGE_MARGIN_PX=2;   // keep this much clear of the host edge
const SINGLE_MAX_TOTAL_PX=10;   // single-page mode: both stacks combined
const SINGLE_EDGE_MARGIN_PX=1;  // single-page mode gutter is small
const FAST_COLLAPSE_MS=120; // a side that is about to have no real page vanishes this fast

let overlay=null;
let leftEl=null;
let rightEl=null;
let hostRef=null;

function readStored(){
    try{
        return window.localStorage.getItem(STORAGE_KEY);
    }catch(error){
        return null;
    }
}

function writeStored(value){
    try{
        window.localStorage.setItem(STORAGE_KEY,value);
    }catch(error){}
}

(function applyUrlParam(){
    try{
        const value=new URLSearchParams(window.location.search).get("pagestack");
        if(value==="1"||value==="0") writeStored(value);
    }catch(error){}
})();

api.isEnabled=function(){
    const stored=readStored();
    if(stored==="1") return true;
    if(stored==="0") return false;
    return DEFAULT_ENABLED;
};

api.setEnabled=function(enabled){
    writeStored(enabled?"1":"0");
    if(!enabled) api.detach();
    /* When enabling, the engine's next sync (or api.refresh from the
       engine) creates the overlay; nothing to do here. */
    try{
        window.dispatchEvent(new CustomEvent("skyreader:bookstack-changed",{detail:{enabled:!!enabled}}));
    }catch(error){}
};

/*
 * Pure geometry. Exported so it can be unit-tested without a DOM.
 *
 * Spread numbering matches Sky180FlipEngine for normal two-page books:
 *   spread 0 = [synthetic, page 1]        (cover)
 *   spread s = [page 2s, page 2s+1]
 *   closing spread of an even-length PDF = [last page, synthetic]
 *
 * Returns the thickness in px of each side's stack.
 */
api.computeThickness=function(pageCount,spreadIndex,availLeft,availRight){
    pageCount=Math.max(0,Math.floor(Number(pageCount)||0));
    spreadIndex=Math.max(0,Math.floor(Number(spreadIndex)||0));

    if(pageCount<3) return {left:0,right:0};

    const total=Math.max(MIN_TOTAL_PX,Math.min(MAX_TOTAL_PX,pageCount*PX_PER_PAGE));

    /* Real pages strictly before the left visible page / after the right one. */
    const leftCount=Math.max(0,2*spreadIndex-1);
    const rightCount=Math.max(0,pageCount-(2*spreadIndex+1));

    function side(count,avail){
        if(count<=0) return 0;
        let px=total*count/pageCount;
        px=Math.max(MIN_SIDE_PX,px);
        const room=Math.max(0,(Number(avail)||0)-EDGE_MARGIN_PX);
        return Math.max(0,Math.min(px,room));
    }

    return {
        left:side(leftCount,availLeft),
        right:side(rightCount,availRight)
    };
};

/*
 * Single-page (mobile) geometry. pageIndex is 0-based: page 1 = 0.
 * Pages before the visible one stack on the left, pages after it on the
 * right. Exported for unit tests.
 */
api.computeThicknessSingle=function(pageCount,pageIndex,availLeft,availRight){
    pageCount=Math.max(0,Math.floor(Number(pageCount)||0));
    pageIndex=Math.max(0,Math.floor(Number(pageIndex)||0));

    if(pageCount<3) return {left:0,right:0};

    const total=Math.max(MIN_TOTAL_PX,Math.min(SINGLE_MAX_TOTAL_PX,pageCount*PX_PER_PAGE));
    const leftCount=Math.min(pageIndex,pageCount-1);
    const rightCount=Math.max(0,pageCount-1-pageIndex);

    function side(count,avail){
        if(count<=0) return 0;
        const px=Math.max(MIN_SIDE_PX,total*count/pageCount);
        const room=Math.max(0,(Number(avail)||0)-SINGLE_EDGE_MARGIN_PX);
        return Math.max(0,Math.min(px,room));
    }

    return {
        left:side(leftCount,availLeft),
        right:side(rightCount,availRight)
    };
};

/* True when the reader's #pageContainer is zoomed, panned or rotated.
   (UI applies translate/rotate/scale there; the stack is only drawn
   for the untransformed book.) */
function containerTransformed(container){
    try{
        if(!container) return false;
        const value=window.getComputedStyle(container).transform;
        if(!value || value==="none") return false;
        const m=value.match(/matrix(3d)?\(([^)]+)\)/);
        if(!m) return true;
        const n=m[2].split(",").map(Number);
        const ident=m[1]
            ? [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
            : [1,0,0,1,0,0];
        if(n.length!==ident.length) return true;
        for(let k=0;k<ident.length;k++){
            if(Math.abs(n[k]-ident[k])>0.01) return true;
        }
        return false;
    }catch(error){
        return false;
    }
}

let lastInfo=null;
let watchedContainer=null;
let watchTimer=0;
let mutationObserver=null;

function scheduleRefresh(){
    if(watchTimer) return;
    watchTimer=window.requestAnimationFrame(()=>{
        watchTimer=0;
        if(lastInfo) api.update(Object.assign({},lastInfo,{animateMs:0,fromSpread:null}));
    });
}

/* transitionend bubbles from descendants (including the stack's own width
   transitions and the host's alignment transition); only the container's
   own transform transition matters here. */
function onContainerTransitionEnd(event){
    if(!event || event.target!==watchedContainer) return;
    if(event.propertyName && event.propertyName!=="transform") return;
    scheduleRefresh();
}

function watchContainer(container){
    if(watchedContainer===container) return;
    unwatchContainer();
    if(!container) return;
    watchedContainer=container;
    try{
        mutationObserver=new MutationObserver(scheduleRefresh);
        mutationObserver.observe(container,{attributes:true,attributeFilter:["style","class"]});
        container.addEventListener("transitionend",onContainerTransitionEnd);
    }catch(error){}
}

function unwatchContainer(){
    try{
        if(mutationObserver) mutationObserver.disconnect();
        if(watchedContainer) watchedContainer.removeEventListener("transitionend",onContainerTransitionEnd);
        if(watchTimer) window.cancelAnimationFrame(watchTimer);
    }catch(error){}
    mutationObserver=null;
    watchedContainer=null;
    watchTimer=0;
}

function ensureOverlay(mount,inViewer){
    if(overlay && hostRef===mount && overlay.parentNode===mount) return true;

    removeOverlay();

    try{
        overlay=document.createElement("div");
        overlay.className="skyBookStack"+(inViewer?" --in-viewer":"");
        overlay.setAttribute("aria-hidden","true");

        leftEl=document.createElement("div");
        leftEl.className="skyBookStackSide --left";
        rightEl=document.createElement("div");
        rightEl.className="skyBookStackSide --right";

        overlay.appendChild(leftEl);
        overlay.appendChild(rightEl);

        /* Desktop: behind the StPageFlip wrapper (StPageFlip inserts its
           wrapper with insertAdjacentHTML("afterbegin"); ours goes first in
           DOM order and has a lower z-index regardless). Single-page: first
           child of #viewerArea; it only occupies the padding gutter. */
        mount.insertBefore(overlay,mount.firstChild);
        hostRef=mount;
        return true;
    }catch(error){
        overlay=leftEl=rightEl=hostRef=null;
        return false;
    }
}

function removeOverlay(){
    try{
        if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }catch(error){}
    overlay=leftEl=rightEl=hostRef=null;
}

function hideOverlay(){
    if(leftEl) leftEl.style.opacity="0";
    if(rightEl) rightEl.style.opacity="0";
}

/*
 * info = {
 *   host:        the engine's flipHost element
 *   bounds:      flipbook.getBoundsRect() ({left,top,width,height,pageWidth})
 *   spreadIndex: spread the stack should represent (current, or target while turning)
 *   fromSpread:  (optional) spread being turned away from, during a turn
 *   pageCount:   real PDF page count
 *   singlePage / twoPageDocument: engine modes (two-page-document: no stack)
 *   (single-page mode: spreadIndex is the 0-based page index)
 *   animateMs:   >0 lets the thickness ease over that many ms (during a turn)
 * }
 */
api.update=function(info){
    try{
        if(!info || !info.host) return;

        if(!api.isEnabled() || info.twoPageDocument){
            lastInfo=null;
            unwatchContainer();
            api.detach();
            return;
        }

        lastInfo=info;

        const host=info.host;
        const bounds=info.bounds;
        if(!bounds || !(bounds.height>0) || !(bounds.width>0)) return;

        const single=!!info.singlePage;
        const container=host.closest?host.closest("#pageContainer"):null;
        const mount=single ? (host.closest?host.closest("#viewerArea"):null) : host;
        if(!mount) return;

        const block=host.querySelector(".stf__block");
        if(!block) return;

        watchContainer(container);

        if(!ensureOverlay(mount,single)) return;

        /* Zoomed / panned / rotated: edges would not line up; hide. */
        if(containerTransformed(container)){
            hideOverlay();
            return;
        }

        /* Bounds are relative to .stf__block; convert into mount-local
           coordinates (the mount is the host on desktop, #viewerArea in
           single-page mode). Rects are safe here because the container
           is untransformed (checked above); the host's own alignment
           translate is shared by block and host on desktop. */
        const mountRect=mount.getBoundingClientRect();
        const blockRect=block.getBoundingClientRect();
        const offsetX=blockRect.left-mountRect.left-(mount.clientLeft||0);
        const offsetY=blockRect.top-mountRect.top-(mount.clientTop||0);

        /* Visible page rectangle in mount coordinates. Desktop: the whole
           two-page book. Single page (portrait): the right half of the
           StPageFlip rectangle. */
        const pageW=Number(bounds.pageWidth)||0;
        const bookLeft=offsetX+Number(bounds.left)+(single?pageW:0);
        const bookRight=bookLeft+(single?pageW:Number(bounds.width));
        const bookTop=offsetY+Number(bounds.top);
        if(single && !(pageW>0)) return;

        const availLeft=bookLeft;
        const availRight=mount.clientWidth-bookRight;

        const t=single
            ? api.computeThicknessSingle(info.pageCount,info.spreadIndex,availLeft,availRight)
            : api.computeThickness(info.pageCount,info.spreadIndex,availLeft,availRight);

        const ms=Math.max(0,Math.min(1500,Number(info.animateMs)||0));
        overlay.classList.toggle("--animate",ms>0);
        if(ms>0) overlay.style.setProperty("--sky-stack-time",ms+"ms");

        /*
         * The cover's left side (and the closing page's right side, for
         * even-length books) is an empty synthetic page. A stack must never
         * sit beside an empty page:
         *   - turning AWAY from a real page toward an empty side: collapse
         *     that side's stack almost immediately instead of easing it out
         *     over the whole turn;
         *   - turning from an empty side toward a real page: hold that side
         *     at zero for the whole turn; the engine's settle ("read") call
         *     then grows it in once the turn has finished.
         */
        const pc=Math.max(0,Math.floor(Number(info.pageCount)||0));
        const to=Math.max(0,Math.floor(Number(info.spreadIndex)||0));
        const from=(info.fromSpread===undefined||info.fromSpread===null)
            ? null : Math.max(0,Math.floor(Number(info.fromSpread)||0));
        const emptyRightSpread=(!single && pc>=3 && pc%2===0) ? pc/2 : -1;
        const leftEmpty=n=>!single && n===0;
        const rightEmpty=n=>n===emptyRightSpread;

        let holdLeft=false,holdRight=false;
        let timeLeft=ms,timeRight=ms;

        if(ms>0 && from!==null && from!==to){
            if(leftEmpty(from) && !leftEmpty(to)) holdLeft=true;
            if(rightEmpty(from) && !rightEmpty(to)) holdRight=true;
            if(leftEmpty(to) && !leftEmpty(from)) timeLeft=FAST_COLLAPSE_MS;
            if(rightEmpty(to) && !rightEmpty(from)) timeRight=FAST_COLLAPSE_MS;
        }

        leftEl.style.setProperty("--sky-side-time",timeLeft+"ms");
        rightEl.style.setProperty("--sky-side-time",timeRight+"ms");
        if(holdLeft) t.left=0;
        if(holdRight) t.right=0;

        const top=bookTop+1;
        const height=Math.max(0,Number(bounds.height)-2);

        leftEl.style.top=top+"px";
        leftEl.style.height=height+"px";
        leftEl.style.left=(bookLeft-t.left)+"px";
        leftEl.style.width=t.left+"px";

        rightEl.style.top=top+"px";
        rightEl.style.height=height+"px";
        rightEl.style.left=bookRight+"px";
        rightEl.style.width=t.right+"px";

        leftEl.style.opacity=t.left>0?"1":"0";
        rightEl.style.opacity=t.right>0?"1":"0";
    }catch(error){
        try{ console.warn("[BookStack] update failed",error); }catch(ignore){}
        api.detach();
    }
};

api.detach=function(){
    removeOverlay();
    unwatchContainer();
    lastInfo=null;
};

api.version="1.2";

return api;

})();
