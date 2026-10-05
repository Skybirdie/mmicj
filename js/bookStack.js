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
const MIN_TOTAL_PX=6;     // total stack thickness for a very short book
const MAX_TOTAL_PX=14;    // total stack thickness for a very long book
const PX_PER_PAGE=0.15;
const MIN_SIDE_PX=1.5;    // any side that still has pages shows at least this
const EDGE_MARGIN_PX=2;   // keep this much clear of the host edge
const SINGLE_MAX_TOTAL_PX=14;   // single-page mode: both stacks combined
const SINGLE_EDGE_MARGIN_PX=1;  // single-page mode gutter is small
/* Individual "leaves" (groups of pages) drawn inside each stack. Each leaf is
   its own element with a hairline edge and a stepped end, so the stack reads
   as separate pages instead of one striped block. */
const LEAF_PX=2.5;          // target width of one leaf, desktop
const LEAF_PX_SINGLE=1.7;   // single-page mode has far less room
const MAX_LEAVES=10;
const MIN_TWO_LEAF_PX=3.2;
/* Perspective: every leaf further from the page is shorter, top and bottom,
   by LEAF_INSET_RATIO x the leaf's width on average, so the stack's outline
   slopes down from the top of the current page and up from its bottom.
   Larger = steeper. 0 turns the perspective off.

   The slope is deliberately a little coarse, like real paper: each leaf's own
   taper varies (STEP_VAR), consecutive leaves meet with a tiny notch (NOTCH,
   px), and the bottom edge differs very slightly from the top (BOTTOM_VAR, px).
   The left and right stacks use the pattern at different offsets so they are
   not mirror images. LEAF_IRREGULARITY scales all of it:
   0 = perfectly smooth, 1 = as designed, 2 = exaggerated. */
const LEAF_INSET_RATIO=1.5;
const LEAF_IRREGULARITY=2;
const STEP_VAR=[1,1.45,.65,1.25,.8,1.5,.7,1.15,.9,1.35];
const NOTCH=[0,.4,-.3,.45,-.35,.35,-.4,.3,-.25,.4];
const BOTTOM_VAR=[0,-.25,.3,-.2,.35,-.3,.15,.25,-.35,.2];
const LEAF_TONES=[100,88,96,82,92,85,98,90,86,94]; // % paper vs edge colour
/* The first and last pages (the covers) are the outermost page of the left
   and right stacks. They are drawn separately: a bright, crisp page that
   starts at the height of the furthest leaf and then runs straight out from it
   (flat top and bottom, it does not keep tapering), and is thicker than a leaf
   so it juts out sideways a pixel or two further than the pages in front of
   it. A leaf is about LEAF_PX wide, so COVER_PX = LEAF_PX + 1..2 gives the
   "juts out" look. */
let COVER_PX=3.8;             // cover thickness, desktop
let COVER_PX_SINGLE=2.4;      // single-page mode has far less room
/* A slight asymmetry that is pleasing to the eye: the front cover (left stack)
   sticks out a touch less at its bottom, the last page (right stack) a touch
   less at its top. Pixels; 0 = symmetric. */
let COVER_LEFT_BOTTOM_TRIM_PX=3;
let COVER_RIGHT_TOP_TRIM_PX=3;
/* Horizontal slant of the cover page (how far it juts out sideways). The front
   cover (left stack) juts out slightly LESS at its bottom edge than at its top
   edge; the last page (right stack) slightly LESS at its top edge than at its
   bottom edge. The edge against the leaves stays put; only the outer edge
   slants. Expressed as a fraction of the cover's own thickness, so it scales
   in single-page mode too. 0 = straight (no slant); keep it below ~0.6. */
let COVER_SLANT_RATIO=0.35;
const FAST_COLLAPSE_MS=120; // a side that is about to have no real page vanishes this fast

let overlay=null;
let leftEl=null;
let leftCoverEl=null;
let rightCoverEl=null;
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
 * How many real pages sit behind each side of the current view (the outermost
 * of those is the front cover on the left, the back cover on the right).
 * Same numbering as computeThickness / computeThicknessSingle. Pure.
 */
api.sideCounts=function(pageCount,index,single){
    pageCount=Math.max(0,Math.floor(Number(pageCount)||0));
    index=Math.max(0,Math.floor(Number(index)||0));
    if(pageCount<3) return {left:0,right:0};
    if(single){
        return {
            left:Math.min(index,pageCount-1),
            right:Math.max(0,pageCount-1-index)
        };
    }
    return {
        left:Math.max(0,2*index-1),
        right:Math.max(0,pageCount-(2*index+1))
    };
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

/*
 * Geometry of the leaves of one stack (pure; unit-tested). Leaf 0 touches the
 * page. For each leaf: topIn/botIn = how far its inner (page-side) edge is
 * inset from the top/bottom of the stack, topOut/botOut = the same at its outer
 * edge. A leaf tapers from In to Out; the next leaf starts at the previous
 * leaf's Out plus a tiny notch, so the outline is a coarse slope, not a smooth
 * line. side = "left" | "right" (different pattern offset).
 */
api.leafGeometry=function(n,leafPx,side){
    n=Math.max(0,Math.floor(Number(n)||0));
    const step=(Number(leafPx)||LEAF_PX)*LEAF_INSET_RATIO;
    const irr=LEAF_IRREGULARITY;
    const off=(side==="left") ? 3 : 0;
    const len=STEP_VAR.length;
    const out=[];

    let topIn=0,botIn=0;
    for(let k=0;k<n;k++){
        const i=(k+off)%len;
        const dropTop=Math.max(0,step*(1+(STEP_VAR[i]-1)*irr));
        const dropBot=Math.max(0,dropTop+BOTTOM_VAR[i]*irr);
        const topOut=topIn+dropTop;
        const botOut=botIn+dropBot;
        out.push({topIn,botIn,topOut,botOut});
        topIn=Math.max(0,topOut+NOTCH[i]*irr);
        botIn=Math.max(0,botOut+NOTCH[(i+5)%len]*irr);
    }
    return out;
};

/*
 * Where the cover page starts: the outer edge of the furthest leaf, so it runs
 * straight out from it. Returns {top,bottom} insets in px; {0,0} with no leaves.
 */
api.outerInset=function(n,leafPx,side){
    const g=api.leafGeometry(n,leafPx,side);
    if(!g.length) return {top:0,bottom:0};
    const last=g[g.length-1];
    return {top:last.topOut,bottom:last.botOut};
};

/*
 * Top/bottom insets of the cover page on one side: where it starts (the furthest
 * leaf's outer edge) plus the small asymmetry trim. Pure.
 */
api.coverInsets=function(n,leafPx,side){
    const o=api.outerInset(n,leafPx,side);
    return {
        top:o.top+(side==="right" ? COVER_RIGHT_TOP_TRIM_PX : 0),
        bottom:o.bottom+(side==="left" ? COVER_LEFT_BOTTOM_TRIM_PX : 0)
    };
};

/*
 * Horizontal slant of the cover page, in px: how much narrower the narrow end
 * is than the wide end. Left cover: narrow at the bottom. Right cover: narrow
 * at the top. Pure; coverPx is the cover's thickness.
 */
api.coverSlantPx=function(coverPx){
    coverPx=Math.max(0,Number(coverPx)||0);
    return Math.max(0,Math.min(coverPx*0.6,coverPx*COVER_SLANT_RATIO));
};

/*
 * clip-path polygon (px) for the cover board of one side. Left: the outer
 * (left) edge is pulled in at the bottom. Right: the outer (right) edge is
 * pulled in at the top. Inner edge against the leaves is untouched. Pure.
 */
api.coverShape=function(coverPx,side){
    const s=api.coverSlantPx(coverPx).toFixed(2)+"px";
    return (side==="left")
        ? "polygon(0 0,100% 0,100% 100%,"+s+" 100%)"
        : "polygon(0 0,calc(100% - "+s+") 0,100% 100%,0 100%)";
};

/* How many leaves a stack of this thickness shows (0 = nothing drawn). */
api.leafCount=function(px,leafPx){
    px=Number(px)||0;
    leafPx=Number(leafPx)||LEAF_PX;
    if(px<=0) return 0;
    const n=Math.round(px/leafPx);
    /* Once there is room for two hairline-separated leaves, always show two,
       so even a short book's stack reads as more than one page. */
    return Math.max(px>=MIN_TWO_LEAF_PX?2:1,Math.min(MAX_LEAVES,n));
};

/*
 * (Re)build the leaves of one side. Leaves are positioned in percentages
 * of the side's width, so they scale smoothly while the width eases during a
 * page turn; they are only rebuilt when the leaf count changes. Leaf 0 is
 * the one touching the page: full height, darkest next to the page shadow.
 */
function setLeaves(el,sideName,n,leafPx){
    if(!el || n<=0) return;
    const key=n+":"+leafPx;
    if(el._leafKey===key) return;
    el._leafKey=key;

    const geo=api.leafGeometry(n,leafPx,sideName);

    while(el.firstChild) el.removeChild(el.firstChild);

    for(let k=0;k<n;k++){
        const g=geo[k];
        const leaf=document.createElement("div");
        leaf.className="skyBookStackLeaf";

        const slot=(sideName==="left") ? (n-1-k) : k;

        leaf.style.left=(slot*100/n)+"%";
        leaf.style.width=(100/n)+"%";
        leaf.style.top=g.topIn.toFixed(2)+"px";
        leaf.style.bottom=g.botIn.toFixed(2)+"px";

        /* Taper: across its own width each leaf also slopes from its inner
           inset to its outer inset, so the outline is a continuous (but
           slightly coarse) slope and a stack with only one or two leaves
           still shows perspective. */
        const dTop=(g.topOut-g.topIn);
        const dBot=(g.botOut-g.botIn);
        if(dTop>0 || dBot>0){
            const t=dTop.toFixed(2)+"px";
            const b=dBot.toFixed(2)+"px";
            const shape=(sideName==="left")
                ? "polygon(0 "+t+",100% 0,100% 100%,0 calc(100% - "+b+"))"
                : "polygon(0 0,100% "+t+",100% calc(100% - "+b+"),0 100%)";
            leaf.style.clipPath=shape;
            leaf.style.webkitClipPath=shape;
        }
        leaf.style.background="var(--sky-stack-paper)";
        leaf.style.background="color-mix(in srgb,var(--sky-stack-paper) "+
            LEAF_TONES[k%LEAF_TONES.length]+"%,var(--sky-stack-line))";
        el.appendChild(leaf);
    }
}

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
let resizeObserver=null;
let resizeTargets=[];

function scheduleRefresh(){
    if(watchTimer) return;
    watchTimer=window.requestAnimationFrame(()=>{
        watchTimer=0;
        if(!lastInfo) return;

        const next=Object.assign({},lastInfo,{animateMs:0,fromSpread:null});

        /* The engine may supply a function returning fresh bounds, so a
           late layout change is measured again instead of reusing the
           numbers from the first (possibly pre-layout) update. */
        try{
            if(typeof lastInfo.live==="function"){
                const live=lastInfo.live();
                if(live && live.bounds) next.bounds=live.bounds;
            }
        }catch(error){}

        api.update(next);
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

/* Re-measure whenever the host, the book block or the viewer is resized by
   anything (late layout, toolbar changes, fullscreen, font loading...). The
   first observe() callback also gives every open a fresh settled measurement. */
function watchLayout(targets){
    try{
        if(typeof window.ResizeObserver!=="function") return;
        const same=resizeTargets.length===targets.length &&
            resizeTargets.every((el,i)=>el===targets[i]);
        if(same) return;

        if(resizeObserver) resizeObserver.disconnect();
        resizeTargets=targets.slice();
        resizeObserver=new ResizeObserver(scheduleRefresh);
        resizeTargets.forEach(el=>{ if(el) resizeObserver.observe(el); });
    }catch(error){}
}

function unwatchContainer(){
    try{
        if(resizeObserver) resizeObserver.disconnect();
    }catch(error){}
    resizeObserver=null;
    resizeTargets=[];
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

        leftCoverEl=document.createElement("div");
        leftCoverEl.className="skyBookStackCover --left";
        leftCoverEl.appendChild(document.createElement("div")).className="skyBookStackCoverBoard";
        rightCoverEl=document.createElement("div");
        rightCoverEl.className="skyBookStackCover --right";
        rightCoverEl.appendChild(document.createElement("div")).className="skyBookStackCoverBoard";

        overlay.appendChild(leftEl);
        overlay.appendChild(rightEl);
        overlay.appendChild(leftCoverEl);
        overlay.appendChild(rightCoverEl);

        /* Desktop: behind the StPageFlip wrapper (StPageFlip inserts its
           wrapper with insertAdjacentHTML("afterbegin"); ours goes first in
           DOM order and has a lower z-index regardless). Single-page: first
           child of #viewerArea; it only occupies the padding gutter. */
        mount.insertBefore(overlay,mount.firstChild);
        hostRef=mount;
        return true;
    }catch(error){
        overlay=leftEl=rightEl=leftCoverEl=rightCoverEl=hostRef=null;
        return false;
    }
}

function removeOverlay(){
    try{
        if(overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }catch(error){}
    overlay=leftEl=rightEl=leftCoverEl=rightCoverEl=hostRef=null;
}

function hideOverlay(){
    if(leftEl) leftEl.style.opacity="0";
    if(rightEl) rightEl.style.opacity="0";
    if(leftCoverEl) leftCoverEl.style.opacity="0";
    if(rightCoverEl) rightCoverEl.style.opacity="0";
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
 *   live:        (optional) function returning {bounds} measured fresh, used
 *                when the layout changes after the first update
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
        watchLayout([host,block,mount]);

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

        const coverPx=single ? COVER_PX_SINGLE : COVER_PX;
        const counts=api.sideCounts(info.pageCount,info.spreadIndex,single);

        /* Room for the cover board is reserved first; the leaves get the rest. */
        const availLeft=bookLeft-(counts.left>=1?coverPx:0);
        const availRight=mount.clientWidth-bookRight-(counts.right>=1?coverPx:0);

        const t=single
            ? api.computeThicknessSingle(info.pageCount,info.spreadIndex,availLeft,availRight)
            : api.computeThickness(info.pageCount,info.spreadIndex,availLeft,availRight);

        /* One page behind a side is only the cover itself: no leaves. */
        if(counts.left<=1) t.left=0;
        if(counts.right<=1) t.right=0;

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
        leftCoverEl.style.setProperty("--sky-side-time",timeLeft+"ms");
        rightCoverEl.style.setProperty("--sky-side-time",timeRight+"ms");
        if(holdLeft) t.left=0;
        if(holdRight) t.right=0;

        const top=bookTop+1;
        const height=Math.max(0,Number(bounds.height)-2);

        const leafPx=single ? LEAF_PX_SINGLE : LEAF_PX;
        const leavesLeft=api.leafCount(t.left,leafPx);
        const leavesRight=api.leafCount(t.right,leafPx);
        setLeaves(leftEl,"left",leavesLeft,leafPx);
        setLeaves(rightEl,"right",leavesRight,leafPx);

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

        /* Covers: outermost edge of each stack, only while that side really
           has pages behind it (never beside an empty synthetic page) and
           there is room for the board. */
        /* The board starts at the height of the furthest leaf's outer edge
           and extends straight out from it (flat top and bottom). */
        const insetLeft=api.coverInsets(leavesLeft,leafPx,"left");
        const insetRight=api.coverInsets(leavesRight,leafPx,"right");

        const leftCoverX=bookLeft-t.left-coverPx;
        const rightCoverX=bookRight+t.right;
        const showLeftCover=counts.left>=1 && !holdLeft && leftCoverX>=0.5;
        const showRightCover=counts.right>=1 && !holdRight &&
            (mount.clientWidth-rightCoverX-coverPx)>=0.5;

        function placeCover(el,x,inset,show,side){
            el.style.top=(top+inset.top)+"px";
            el.style.height=Math.max(coverPx,height-inset.top-inset.bottom)+"px";
            el.style.width=coverPx+"px";
            el.style.left=x+"px";
            el.style.opacity=show?"1":"0";

            /* Horizontal slant: clip the inner board (the wrapper's drop
               shadow follows the clipped outline). */
            const board=el.firstChild;
            if(board){
                const shape=api.coverShape(coverPx,side);
                board.style.clipPath=shape;
                board.style.webkitClipPath=shape;
            }
        }

        placeCover(leftCoverEl,leftCoverX,insetLeft,showLeftCover,"left");
        placeCover(rightCoverEl,rightCoverX,insetRight,showRightCover,"right");
    }catch(error){
        try{ console.warn("[BookStack] update failed",error); }catch(ignore){}
        api.detach();
    }
};

/*
 * Live diagnostics / tuning from the browser console, no file edits or cache
 * involved:
 *   BookStack.info()  -> which build is running and the values it is using
 *   BookStack.tune({coverLeftBottomTrim:6, coverRightTopTrim:6, coverPx:4.5, coverSlantRatio:.5})
 *                     -> changes them immediately (until the page reloads);
 *                        copy the values you like into the constants above.
 */
api.info=function(){
    return {
        version:api.version,
        enabled:api.isEnabled(),
        coverLeftBottomTrim:COVER_LEFT_BOTTOM_TRIM_PX,
        coverRightTopTrim:COVER_RIGHT_TOP_TRIM_PX,
        coverPx:COVER_PX,
        coverPxSingle:COVER_PX_SINGLE,
        coverSlantRatio:COVER_SLANT_RATIO
    };
};

api.tune=function(values){
    try{
        values=values||{};
        const num=v=>(typeof v==="number" && isFinite(v) && v>=0) ? v : null;
        let v;
        if((v=num(values.coverLeftBottomTrim))!==null) COVER_LEFT_BOTTOM_TRIM_PX=v;
        if((v=num(values.coverRightTopTrim))!==null) COVER_RIGHT_TOP_TRIM_PX=v;
        if((v=num(values.coverPx))!==null) COVER_PX=v;
        if((v=num(values.coverPxSingle))!==null) COVER_PX_SINGLE=v;
        if((v=num(values.coverSlantRatio))!==null) COVER_SLANT_RATIO=v;
        if(lastInfo) api.update(Object.assign({},lastInfo,{animateMs:0,fromSpread:null}));
    }catch(error){}
    return api.info();
};

api.detach=function(){
    removeOverlay();
    unwatchContainer();
    lastInfo=null;
};

api.version="2.3";

return api;

})();
