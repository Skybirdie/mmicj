"use strict";

/*
=========================================================
 SkyReader UI

 Responsibilities

 • Toolbar
 • Library toggle
 • Reader controls
 • Keyboard
 • Mouse
 • Touch
 • Progress display
 • Loading indicator
 • Simple animations

=========================================================
*/

window.UI=(function(){

const ui={};

/*-------------------------------------------------------
  DOM
-------------------------------------------------------*/

const dom={};

let initialized=false;

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let controlsVisible=true;

let sidebarVisible=true;
let libraryRevealTimer=null;

let fullscreen=false;

let rotation=0;

let zoom=1;
let panX=0;
let panY=0;
let panActive=false;
let panPointerId=null;
let panLastX=0;
let panLastY=0;

let touchStartX=0;

let touchStartY=0;

let pinchDistance=0;
let pinching=false;


/*-------------------------------------------------------
  Initialization
-------------------------------------------------------*/

ui.initialize=function(){

if(initialized){

return;

}

initialized=true;

cacheDom();
if(dom.productionErrorClose){
    dom.productionErrorClose.addEventListener("click",clearProductionError);
}



connectReader();

};

/*-------------------------------------------------------
  DOM Cache
-------------------------------------------------------*/

function cacheDom(){

dom.reader=

document.getElementById(

"reader"

);

dom.topBar=document.getElementById("topBar");

dom.viewer=

document.getElementById(

"viewerArea"

);

dom.pageContainer =
document.getElementById(
"pageContainer"
);
dom.library=

document.getElementById(

"library"

);

dom.toolbar=

document.getElementById(

"toolbar"

);

dom.loading=

document.getElementById(

"loading"

);

dom.loadingText=

document.getElementById(

"loadingText"

);

dom.productionError=document.getElementById("productionError");
dom.productionErrorTitle=document.getElementById("productionErrorTitle");
dom.productionErrorText=document.getElementById("productionErrorText");
dom.productionErrorClose=document.getElementById("productionErrorClose");

dom.progress=

document.getElementById(

"progress"

);


dom.previousButton=

document.getElementById(

"previousButton"

);

dom.nextButton=

document.getElementById(

"nextButton"

);

dom.rotateButton=

document.getElementById(

"rotateButton"

);

dom.zoomInButton=

document.getElementById(

"btnZoomIn"

);

dom.zoomOutButton=

document.getElementById(

"btnZoomOut"

);

dom.muteButton=

document.getElementById(

"muteButton"

);

dom.viewerFullscreenButton = document.getElementById("viewerFullscreenButton");

dom.bookmarkPanelButton = document.getElementById("bookmarkPanelButton");

dom.bookmarkAddButton = document.getElementById("bookmarkAddButton");

dom.bookmarkFlag = document.getElementById("bookmarkFlag");

dom.title=
document.getElementById("readerTitle");

dom.pageIndicator=
document.getElementById("pageIndicator");

dom.pageJump=document.getElementById("pageJump");

dom.pageJumpInput=document.getElementById("pageJumpInput");

dom.pageJumpButton=document.getElementById("pageJumpButton");

}

/*-------------------------------------------------------
  SVG Icons
-------------------------------------------------------*/

function updateMuteIcon(){

if(!dom.muteButton)return;

const muted=!!(window.AudioController && typeof AudioController.isMuted==="function" && AudioController.isMuted());

dom.muteButton.innerHTML=`<svg class="icon"><use href="#${muted?"icon-muted":"icon-volume"}"></use></svg>`;
dom.muteButton.classList.toggle("active",muted);
dom.muteButton.setAttribute("aria-label",muted?"Unmute":"Mute");
dom.muteButton.title=muted?"Unmute":"Mute";

}

/*-------------------------------------------------------
  Production Error Feedback
-------------------------------------------------------*/

function clearProductionError(){
    if(!dom.productionError)return;
    dom.productionError.hidden=true;
    if(dom.productionErrorText)dom.productionErrorText.textContent="";
}

function showProductionError(error,title="MMicj could not complete that action."){
    if(!dom.productionError)return;
    const message=error instanceof Error ? error.message : String(error||"Unknown error.");
    if(dom.productionErrorTitle)dom.productionErrorTitle.textContent=title||"MMicj could not complete that action.";
    if(dom.productionErrorText)dom.productionErrorText.textContent=message;
    dom.productionError.hidden=false;
}

ui.showError=function(error,title){ showProductionError(error,title); };
ui.clearError=function(){ clearProductionError(); };

/*-------------------------------------------------------
  Reader Events
-------------------------------------------------------*/

function connectReader(){

/*
 * Keep the Reader loading text synchronized with the shared
 * SkyMedia loading sequence. The sequence advances on its own
 * timer, so Reader progress events alone cannot update the visible
 * message between progress calls.
 */
document.addEventListener(
    "skymedia:loading-message",
    (event)=>{

        if(
            !event ||
            !event.detail ||
            !dom.loadingText
        ){
            return;
        }

        dom.loadingText.textContent =
            event.detail.text || "Loading...";
    }
);

Reader.on(

"progress",

(percent,text)=>{

if(dom.loadingText){

 dom.loadingText.textContent=text;

 }

if(dom.progress){

dom.progress.value=percent;

}

});

Reader.on(

"ready",

(book,pages)=>{

if(dom.loadingText){

 dom.loadingText.textContent="";

 }

});

Reader.on(

"closed",

()=>{

ui.hideToolbar();

if(dom.progress){

dom.progress.value=0;

}

});

}


/*-------------------------------------------------------
  Bookmark Overlay Positioning
-------------------------------------------------------*/

let bookmarkPositionFrame=null;
let bookmarkPositionAttempts=0;

/*
 * Bookmark storage is always logical-page based.  Display mode is only a
 * presentation concern: a single page can have one bookmark, while a spread
 * can display zero, one, or two independently bookmarked logical pages.
 */
function getBookmarkSpread(pos){
    const currentPage=Number(pos && pos.page);
    const spread=typeof Reader!=="undefined" && typeof Reader.spread==="function"
        ? Reader.spread()
        : null;
    if(spread && Number.isFinite(Number(spread.start)) && Number.isFinite(Number(spread.end))){
        return {start:Number(spread.start),end:Number(spread.end)};
    }
    return {start:currentPage,end:currentPage};
}

function visibleBookmarksForCurrentView(bookmarks,pos){
    const spread=getBookmarkSpread(pos);
    return (Array.isArray(bookmarks)?bookmarks:[]).filter(bookmark=>{
        const page=Number(bookmark.page);
        return page>=spread.start && page<=spread.end;
    });
}

function bookmarkFlags(){
    if(!dom.bookmarkFlag)return [];
    return [dom.bookmarkFlag,...document.querySelectorAll('.bookmarkFlag.bookmarkFlagExtra')];
}

function clearExtraBookmarkFlags(){
    document.querySelectorAll('.bookmarkFlag.bookmarkFlagExtra').forEach(el=>el.remove());
}

function makeBookmarkFlag(bookmark,index){
    let flag=index===0 ? dom.bookmarkFlag : null;

    if(!flag){
        flag=document.createElement('div');
        flag.className='bookmarkFlag bookmarkFlagExtra';
        flag.setAttribute('aria-label','Remove bookmark');
        document.body.appendChild(flag);
    }

    /*
     * Use the custom PNG for the page overlay.
     * Fall back to the existing SVG if the PNG cannot load.
     */
    if(!flag.querySelector('img.bookmarkCustomIcon')){
        const img=document.createElement('img');
        img.className='icon bookmarkCustomIcon';
        img.src='assets/icons/bookmark.png';
        img.alt='';

        img.onerror=function(){
            img.onerror=null;

            const svg=document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            );

            svg.setAttribute('class','icon');

            const use=document.createElementNS(
                'http://www.w3.org/2000/svg',
                'use'
            );

            use.setAttribute('href','#icon-bookmark-add-filled');

            svg.appendChild(use);
            img.replaceWith(svg);
        };

        flag.innerHTML='';
        flag.appendChild(img);
    }

    flag.dataset.bookmarkId=String(bookmark.id||'');
    flag.dataset.bookmarkPage=String(bookmark.page);

    return flag;
}

function positionBookmarkFlagsWhenReady(items,onReady){

    if(bookmarkPositionFrame){
        cancelAnimationFrame(bookmarkPositionFrame);
        bookmarkPositionFrame=null;
    }

    bookmarkPositionAttempts=0;

    const check=()=>{

        bookmarkPositionAttempts++;

        let allReady=true;

        const visiblePages=[
            ...document.querySelectorAll(
                '.sky180Page:not(.sky180SyntheticPage)'
            )
        ].filter(page=>{

            const rect=page.getBoundingClientRect();

            return rect.width>1 &&
                   rect.height>1 &&
                   rect.bottom>0 &&
                   rect.right>0 &&
                   rect.top<window.innerHeight &&
                   rect.left<window.innerWidth;

        });

        for(const item of items){

            const pageNumber=Number(item.bookmark.page);

            const target=visiblePages.find(page=>
                Number(page.dataset.page)===pageNumber
            );

            if(!target || !item.flag){

                allReady=false;
                continue;

            }

            const rect=target.getBoundingClientRect();

            /*
             * Determine whether another real physical page is visibly
             * positioned to the right of this page.
             *
             * If so, this is the left page of a true visible spread.
             * Otherwise it is a single physical page or the right page.
             *
             * This correctly treats the cover as a single physical page
             * even if the reader's logical spread state includes it in a
             * synthetic/internal spread.
             */
            const isLeftPage=visiblePages.some(other=>{

                if(other===target)return false;

                const otherRect=other.getBoundingClientRect();

                const verticallyAligned=
                    Math.abs(otherRect.top-rect.top)<10;

                const toTheRight=
                    otherRect.left>=rect.right-10;

                return verticallyAligned && toTheRight;

            });

            const gutterInset=8;

            const x=isLeftPage
                ? rect.left+gutterInset-item.flag.offsetWidth/2
                : rect.right-item.flag.offsetWidth/2;

            const y=
                rect.top-item.flag.offsetHeight/2;

            item.flag.style.left=
                `${Math.round(x)}px`;

            item.flag.style.top=
                `${Math.round(y)}px`;

        }

        if(allReady || bookmarkPositionAttempts>=30){

            bookmarkPositionFrame=null;

            if(typeof onReady==="function"){
                onReady();
            }

            return;

        }

        bookmarkPositionFrame=
            requestAnimationFrame(check);

    };

    bookmarkPositionFrame=
        requestAnimationFrame(check);

}


function scheduleBookmarkFlagReposition(){

    /*
     * Hide the bookmark while StPageFlip settles the physical page.
     * The final refresh will calculate its position and reveal it once.
     */
    bookmarkFlags().forEach(flag=>{
        flag.classList.remove("active");
    });

    const refresh=()=>{
        if(typeof refreshBookmarkState==="function"){
            refreshBookmarkState();
        }
    };

    /*
     * The first frame allows the page-turn state to settle.
     * The later pass handles the cover-page case where StPageFlip
     * completes its physical positioning slightly later.
     */
    requestAnimationFrame(()=>{
        requestAnimationFrame(refresh);
    });

    setTimeout(refresh,350);

}


function hideBookmarkFlag(){
    bookmarkFlags().forEach(flag=>{
        flag.classList.remove('visible','active','turning');
        flag.dataset.bookmarkBook='';
        flag.dataset.bookmarkPage='';
        flag.dataset.bookmarkId='';
    });
    clearExtraBookmarkFlags();
}



function clearBookmarkOverlay(){

    hideBookmarkFlag();

    if(dom.bookmarkAddButton){

        dom.bookmarkAddButton.classList.remove('bookmarked');

        dom.bookmarkAddButton.innerHTML=
            '<svg class="icon">'+
            '<use href="#icon-bookmark-add-outline"></use>'+
            '</svg>';

        dom.bookmarkAddButton.setAttribute(
            'aria-pressed',
            'false'
        );

        dom.bookmarkAddButton.setAttribute(
            'aria-label',
            'Bookmark this page'
        );

        dom.bookmarkAddButton.title=
            'Bookmark this page';

    }

}



/*-------------------------------------------------------
  Bookmark State
-------------------------------------------------------*/

function refreshBookmarkState(){
    if(!window.Bookmarks || typeof SRNavigation==='undefined' ||
       typeof SRNavigation.bookmark!=='function')return;

    const pos=SRNavigation.bookmark();
    if(!pos || !pos.book)return;

    const bookmarks=typeof Bookmarks.forBook==='function'
        ? Bookmarks.forBook(pos.book) : [];
    const visible=visibleBookmarksForCurrentView(bookmarks,pos);
    const bookmarked=visible.length>0;

    if(dom.bookmarkAddButton){
        /* The toolbar describes the current visible reading location. */
        dom.bookmarkAddButton.classList.toggle('bookmarked',bookmarked);
        dom.bookmarkAddButton.innerHTML=`<svg class="icon"><use href="${bookmarked?'#icon-bookmark-add-filled':'#icon-bookmark-add-outline'}"></use></svg>`;
        dom.bookmarkAddButton.setAttribute('aria-pressed',bookmarked?'true':'false');
        dom.bookmarkAddButton.setAttribute('aria-label',bookmarked?'Page bookmarked':'Bookmark this page');
        dom.bookmarkAddButton.title=bookmarked?'Page bookmarked':'Bookmark this page';
    }

    if(!bookmarked){ hideBookmarkFlag(); return; }

    clearExtraBookmarkFlags();
    const items=visible.map((bookmark,index)=>({bookmark,flag:makeBookmarkFlag(bookmark,index)}));
    items.forEach(({flag,bookmark})=>{
        flag.dataset.bookmarkBook=String(pos.book.id||pos.book);
        flag.classList.remove('turning','active');
    });

    positionBookmarkFlagsWhenReady(items,()=>{
        const current=typeof SRNavigation.bookmark==='function' ? SRNavigation.bookmark() : null;
        if(!current || !current.book)return;
        items.forEach(({flag})=>flag.classList.add('active'));
    });
}

/*-------------------------------------------------------
  Bookmark Turn Reset
-------------------------------------------------------*/

function resetBookmarkFlagForTurn(){

    bookmarkFlags().forEach(flag=>{
        flag.classList.add("turning");
        flag.classList.remove("visible","active");
    });

}


/*-------------------------------------------------------
  Toolbar
-------------------------------------------------------*/

function connectToolbar(){


if(dom.previousButton){

dom.previousButton.onclick=()=>{

    if(pinching)return;

    resetBookmarkFlagForTurn();

    if(typeof SRNavigation!=="undefined"){
        SRNavigation.previous();
    }

};

}

if(dom.nextButton){
dom.nextButton.onclick=()=>{

    if(pinching)return;

    resetBookmarkFlagForTurn();

    if(typeof SRNavigation!=="undefined"){
        SRNavigation.next();
    }

};

}

document.addEventListener("click",event=>{
    const flag=event.target && event.target.closest ? event.target.closest('.bookmarkFlag') : null;
    if(!flag || !flag.classList.contains('active'))return;
    if(!window.Bookmarks)return;
    const id=flag.dataset.bookmarkId;
    if(id)Bookmarks.remove(id);
    refreshBookmarkState();
    if(window.BookmarkPanel && typeof BookmarkPanel.visible==='function' && BookmarkPanel.visible()){
        BookmarkPanel.refresh();
    }
});


if(dom.rotateButton){

dom.rotateButton.onclick=rotateReader;

}

if(dom.zoomInButton){

dom.zoomInButton.onclick=()=>{

setZoom(zoom+0.15);

};

}

if(dom.zoomOutButton){

dom.zoomOutButton.onclick=()=>{

setZoom(zoom-0.15);

};

}

if(dom.muteButton){

dom.muteButton.onclick=()=>{

if(window.AudioController){
AudioController.toggleMute();
}

updateMuteIcon();

};

updateMuteIcon();

}

if(dom.bookmarkPanelButton){

dom.bookmarkPanelButton.onclick=()=>{

if(!window.BookmarkPanel || typeof BookmarkPanel.toggle!=="function")return;

BookmarkPanel.toggle();

dom.bookmarkPanelButton.setAttribute(
"aria-pressed",
BookmarkPanel.visible()?"true":"false"
);

};

}

if(dom.bookmarkAddButton){

dom.bookmarkAddButton.onclick=()=>{

if(!window.Bookmarks || typeof SRNavigation==="undefined" || typeof SRNavigation.bookmark!=="function")return;

const pos=SRNavigation.bookmark();

if(!pos.book)return;

Bookmarks.add(pos.book,pos.page);

refreshBookmarkState();

if(window.BookmarkPanel && typeof BookmarkPanel.visible==="function" && BookmarkPanel.visible()){
BookmarkPanel.refresh();
}

};

refreshBookmarkState();

}



}

/*-------------------------------------------------------
  Library
-------------------------------------------------------*/

function toggleLibrary(){

sidebarVisible=!sidebarVisible;

if(!dom.library)return;

dom.library.classList.toggle(

"hidden",

!sidebarVisible

);

}

/*-------------------------------------------------------
  Zoom
-------------------------------------------------------*/

function setZoom(value){

zoom=Math.max(
1,
Math.min(4,value)
);

/*
 * Zoom and pan are coupled states.  A smaller zoom leaves less room for
 * translation, so never allow an old pan offset from a larger zoom level
 * to survive outside the new bounds.
 */
if(zoom<=1){
    zoom=1;
    panX=0;
    panY=0;
}else{
    clampPan();
}

if(dom.pageContainer){
    dom.pageContainer.style.transition="transform .15s ease";
    updateTransform();
}

}

/*-------------------------------------------------------
  Rotation
-------------------------------------------------------*/

function rotateReader(){

rotation=(rotation+90)%360;

if(dom.pageContainer){

dom.pageContainer.style.transition=

"transform .25s ease";

updateTransform();

}

}

function updateTransform(){

if(!dom.pageContainer)return;

dom.pageContainer.style.transform=

`translate3d(${panX}px,${panY}px,0) rotate(${rotation}deg) scale(${zoom})`;

dom.pageContainer.classList.toggle("skyreader-zoomed",zoom>1);
dom.pageContainer.classList.toggle("skyreader-panning",panActive);

positionReaderArrows();

}

function positionReaderArrows(){

if(!dom.toolbar || !dom.viewer)return;

const previous=dom.previousButton;
const next=dom.nextButton;
if(!previous || !next)return;

/*
 * Navigation controls belong to the viewer, not to the rendered book.
 * Keep them just inside the viewer's left/right edges at every rotation.
 * This prevents the controls from drifting into the center of a two-page
 * spread when the book is rotated 180 degrees or when the book is narrower
 * than the viewer.
 */
const viewerRect=dom.viewer.getBoundingClientRect();
const toolbarRect=dom.toolbar.getBoundingClientRect();
const gap=10;
const buttonWidth=previous.offsetWidth || 42;
const buttonHeight=previous.offsetHeight || 42;

const leftX=viewerRect.left-toolbarRect.left+gap;
const rightX=viewerRect.right-toolbarRect.left-buttonWidth-gap;
const topY=viewerRect.top-toolbarRect.top+
    Math.max(0,(viewerRect.height-buttonHeight)/2);

const centerX=viewerRect.left-toolbarRect.left + (viewerRect.width-buttonWidth)/2;
const centerY=viewerRect.top-toolbarRect.top + (viewerRect.height-buttonHeight)/2;

const place=(button,x,y,angle)=>{
    button.style.left=`${Math.round(x)}px`;
    button.style.top=`${Math.round(y)}px`;
    button.style.right="auto";
    button.style.bottom="auto";
    button.style.transform=`rotate(${angle}deg)`;
};

/* Keep the controls attached to the viewer, but rotate their positions and
   glyphs with the reader orientation. The glyphs themselves begin as: 
   previous=left, next=right. */
switch(rotation){
    case 90:
        place(previous,centerX,viewerRect.top-toolbarRect.top+gap,90);
        place(next,centerX,viewerRect.bottom-toolbarRect.top-buttonHeight-gap,90);
        break;
    case 180:
        place(previous,rightX,centerY,180);
        place(next,leftX,centerY,180);
        break;
    case 270:
        place(previous,centerX,viewerRect.bottom-toolbarRect.top-buttonHeight-gap,270);
        place(next,centerX,viewerRect.top-toolbarRect.top+gap,270);
        break;
    default:
        place(previous,leftX,topY,0);
        place(next,rightX,topY,0);
        break;
}

}


/*-------------------------------------------------------
  Page Animation
-------------------------------------------------------*/

function animatePageTurn(direction){

    /* Compatibility shim only. The UI no longer owns page-turn animation.
       All page movement belongs to SRNavigation/Sky180FlipEngine. */
    if(typeof SRNavigation==="undefined")return;

    if(direction==="next"){
        SRNavigation.next();
    }else{
        SRNavigation.previous();
    }

}

/*-------------------------------------------------------
  Public Helpers
-------------------------------------------------------*/

ui.showToolbar=function(){

/* Never expose reader controls while the viewer is in its landing/library state. */
if(typeof Reader!=="undefined" && typeof Reader.isOpen==="function" && !Reader.isOpen()){
    controlsVisible=false;
    if(dom.toolbar){
        dom.toolbar.classList.add("hidden");
    }
    return;
}

if(dom.toolbar){

dom.toolbar.classList.remove(

"hidden"

);

}

controlsVisible=true;

};

ui.hideToolbar=function(){

if(dom.toolbar){

dom.toolbar.classList.add(

"hidden"

);

}

controlsVisible=false;

};

ui.toggleToolbar=function(){

if(controlsVisible){

ui.hideToolbar();

}

else{

ui.showToolbar();

}

};

window.addEventListener("resize",()=>{

requestAnimationFrame(positionReaderArrows);

scheduleBookmarkFlagReposition();

});

/*-------------------------------------------------------
  Finish Initialization
-------------------------------------------------------*/

const originalInitialize=

ui.initialize;

ui.initialize=function(){

originalInitialize();

connectToolbar();

/*
 * resetBookmarkFlagForTurn() was previously only wired to the
 * previous/nextButton onclick handlers, so any other way of turning a
 * page -- dragging/swiping the book directly, which St.PageFlip
 * handles with its own internal pointer listeners -- never triggered
 * it. The flag would then stay visibly "stuck" through a turn instead
 * of disappearing, exactly when navigating via a live in-book gesture
 * rather than the toolbar arrows.
 *
 * Renderer forwards Sky180FlipEngine's own "state" event (see
 * renderer.js), which fires for every flip regardless of what
 * initiated it -- so hooking the reset here instead makes it
 * trigger-source-agnostic: any state other than "read" means a flip is
 * in progress, and the flag should already be hidden by then.
 */
if(typeof Renderer!=="undefined" && typeof Renderer.on==="function"){

Renderer.on("state",state=>{

if(state!=="read"){
    resetBookmarkFlagForTurn();
}else{
    requestAnimationFrame(()=>{
        scheduleBookmarkFlagReposition();
    });
}

});

}

/* The DOM cache is populated by originalInitialize(), so attach the
 * viewer-focus control only after the button actually exists.  The old
 * registration ran while this module was being evaluated, before
 * cacheDom(), leaving the button without a click handler. */
if(dom.viewerFullscreenButton){
  dom.viewerFullscreenButton.onclick=toggleViewerFocus;
  updateViewerFocusIcon(document.getElementById("app")?.classList.contains("viewerFocus"));
}

};

/*-------------------------------------------------------
  Input Controller
-------------------------------------------------------*/

function requestNavigation(direction){

if(Reader.loading()){

return;

}

if(typeof SRNavigation==="undefined")return;

if(direction==="next"){
    SRNavigation.next();
}else{
    SRNavigation.previous();
}

}

/*-------------------------------------------------------
  Keyboard
-------------------------------------------------------*/

function connectKeyboard(){

document.addEventListener(

"keydown",

event=>{

/* Editable controls own their keyboard input.  In particular, Search must
 * not allow reader shortcuts such as R/Rotate to consume typed characters. */
if(
    event.target instanceof HTMLInputElement ||
    event.target instanceof HTMLTextAreaElement ||
    event.target instanceof HTMLSelectElement ||
    event.target?.isContentEditable
){
    return;
}

switch(event.key){

/*
 * Page navigation is owned by SRNavigation.
 * Do not call Animation.pageTurn() here.
 * This prevents a second page-turn system from competing
 * with Sky180FlipEngine/StPageFlip.
 */
case "ArrowRight":
case "PageDown":
    if(Reader.isOpen() && typeof SRNavigation!=="undefined"){
        event.preventDefault();
        SRNavigation.next();
    }
    return;

case "ArrowLeft":
case "PageUp":
    if(Reader.isOpen() && typeof SRNavigation!=="undefined"){
        event.preventDefault();
        SRNavigation.previous();
    }
    return;

case " ":
    return;

case "Home":

if(Reader.isOpen() && typeof SRNavigation!=="undefined" &&
   typeof SRNavigation.goToPage==="function"){
    event.preventDefault();
    SRNavigation.goToPage(1);
}

break;

case "End":

if(Reader.isOpen() && typeof SRNavigation!=="undefined" &&
   typeof SRNavigation.goToPage==="function"){
    event.preventDefault();
    SRNavigation.goToPage(Reader.pages());
}

break;

case "r":
case "R":

    if(Reader.isOpen()){
        event.preventDefault();
        rotateReader();
    }

    return;

case "+":

case "=":

setZoom(zoom+0.15);

break;

case "-":

setZoom(zoom-0.15);

break;

}

});

}

/*-------------------------------------------------------
  Mouse Wheel
-------------------------------------------------------*/

let wheelLocked=false;

function connectWheel(){

document.addEventListener(
"wheel",
event=>{

if(!event.ctrlKey)return;

event.preventDefault();

if(event.deltaY<0)setZoom(zoom+0.1);
else setZoom(zoom-0.1);

},
{passive:false}
);

}

/*-------------------------------------------------------
  Touch
-------------------------------------------------------*/

function connectTouch(){

/* StPageFlip owns physical page swipes. */

}

/*-------------------------------------------------------
  Grab / Pan while zoomed
-------------------------------------------------------*/

function clampPan(){

if(!dom.viewer || !dom.pageContainer)return;

const viewerRect=dom.viewer.getBoundingClientRect();

/*
 * Use the page's actual untransformed layout size rather than the viewer
 * size.  This is important for responsive portrait/landscape layouts: the
 * amount of legal pan depends on the rendered book, not on the viewport.
 *
 * offsetWidth/offsetHeight are layout dimensions and therefore do not
 * include our scale/translate transform.  Rotation swaps the axes at 90/270.
 */
let baseWidth=dom.pageContainer.offsetWidth;
let baseHeight=dom.pageContainer.offsetHeight;

if(rotation%180!==0){
    const swap=baseWidth;
    baseWidth=baseHeight;
    baseHeight=swap;
}

const maxX=Math.max(0,(baseWidth*zoom-viewerRect.width)/2);
const maxY=Math.max(0,(baseHeight*zoom-viewerRect.height)/2);

panX=Math.max(-maxX,Math.min(maxX,panX));
panY=Math.max(-maxY,Math.min(maxY,panY));

}

function updatePan(){

clampPan();

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
    updateTransform();
}

}

function connectZoomPan(){

if(!dom.viewer)return;

const isControl=target=>{
    if(!target || !target.closest)return false;
    return !!target.closest(
        "button,input,textarea,select,a,#pageJump,.readerArrow,.toolbar"
    );
};

dom.viewer.addEventListener("pointerdown",event=>{

if(zoom<=1 || isControl(event.target))return;
if(event.pointerType==="touch" && event.isPrimary===false)return;

panActive=true;
panPointerId=event.pointerId;
panLastX=event.clientX;
panLastY=event.clientY;

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
    dom.pageContainer.classList.add("skyreader-panning");
}

if(dom.viewer.setPointerCapture){
    try{ dom.viewer.setPointerCapture(event.pointerId); }catch(_){}
}

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

dom.viewer.addEventListener("pointermove",event=>{

if(!panActive || event.pointerId!==panPointerId)return;

const dx=event.clientX-panLastX;
const dy=event.clientY-panLastY;

panLastX=event.clientX;
panLastY=event.clientY;

panX+=dx;
panY+=dy;

updatePan();

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

const finish=event=>{

if(!panActive)return;
if(event.pointerId!=null && event.pointerId!==panPointerId)return;

/* Prevent StPageFlip from interpreting the end of a pan as a page turn. */
if(event.preventDefault)event.preventDefault();
if(event.stopPropagation)event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

panActive=false;

if(dom.pageContainer){
    dom.pageContainer.classList.remove("skyreader-panning");
}

if(dom.viewer.releasePointerCapture && panPointerId!=null){
    try{ dom.viewer.releasePointerCapture(panPointerId); }catch(_){}
}

panPointerId=null;

};

dom.viewer.addEventListener("pointerup",finish,{passive:true,capture:true});
dom.viewer.addEventListener("pointercancel",finish,{passive:true,capture:true});
dom.viewer.addEventListener("lostpointercapture",finish,{passive:true,capture:true});

/*
 * Keep legacy touch browsers covered as well.  These handlers only
 * engage while zoomed and only for one finger, leaving the existing
 * two-finger pinch handler untouched.
 */
dom.viewer.addEventListener("touchstart",event=>{

if(zoom<=1 || event.touches.length!==1 || isControl(event.target))return;

const t=event.touches[0];

panActive=true;
panPointerId="touch";
panLastX=t.clientX;
panLastY=t.clientY;

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

dom.viewer.addEventListener("touchmove",event=>{

if(!panActive || panPointerId!=="touch" || event.touches.length!==1)return;

const t=event.touches[0];

panX+=t.clientX-panLastX;
panY+=t.clientY-panLastY;

panLastX=t.clientX;
panLastY=t.clientY;

updatePan();

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},{passive:false,capture:true});

const finishTouch=()=>{

if(panPointerId!=="touch")return;

panActive=false;
panPointerId=null;

if(dom.pageContainer){
    dom.pageContainer.classList.remove("skyreader-panning");
}

};

dom.viewer.addEventListener("touchend",finishTouch,{passive:true,capture:true});
dom.viewer.addEventListener("touchcancel",finishTouch,{passive:true,capture:true});

}

/*-------------------------------------------------------
  Pinch Zoom
-------------------------------------------------------*/

function connectPinch(){

if(!dom.viewer){

return;

}

/*
 * Pinch zoom is anchored to the midpoint between the two fingers.
 * Keeping that point stationary prevents the page from appearing to
 * "flow" toward a corner as the zoom level changes.
 */
let pinchCenterX=0;
let pinchCenterY=0;

const midpoint=(touches)=>({
    x:(touches[0].clientX+touches[1].clientX)/2,
    y:(touches[0].clientY+touches[1].clientY)/2
});

const distanceBetween=(touches)=>{
    const dx=touches[0].clientX-touches[1].clientX;
    const dy=touches[0].clientY-touches[1].clientY;
    return Math.hypot(dx,dy);
};

const setPinchZoom=(nextZoom,cx,cy)=>{

const previousZoom=zoom;

nextZoom=Math.max(1,Math.min(4,nextZoom));

if(nextZoom<=1){
    zoom=1;
    panX=0;
    panY=0;
}else{
    const rect=dom.viewer.getBoundingClientRect();

    /* Point relative to the viewer's visual center. */
    const focalX=cx-(rect.left+rect.width/2);
    const focalY=cy-(rect.top+rect.height/2);

    /*
     * Scale around the pinch midpoint.  This is the inverse of the
     * transform scaling, so the content beneath the fingers stays put.
     */
    const ratio=nextZoom/previousZoom;
    panX=focalX-(focalX-panX)*ratio;
    panY=focalY-(focalY-panY)*ratio;

    zoom=nextZoom;
    clampPan();
}

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
    updateTransform();
}

};

dom.viewer.addEventListener(
"touchstart",
event=>{

if(event.touches.length!==2){

return;

}

pinching=true;
panActive=false;
panPointerId=null;

const center=midpoint(event.touches);
pinchCenterX=center.x;
pinchCenterY=center.y;
pinchDistance=distanceBetween(event.touches);

if(dom.pageContainer){
    dom.pageContainer.style.transition="none";
}

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

},

{passive:false,capture:true}
);

dom.viewer.addEventListener(
"touchmove",
event=>{

if(event.touches.length!==2 || !pinching){

return;

}

event.preventDefault();
event.stopPropagation();
if(event.stopImmediatePropagation)event.stopImmediatePropagation();

const distance=distanceBetween(event.touches);
const center=midpoint(event.touches);

if(pinchDistance>0){
    const factor=distance/pinchDistance;
    setPinchZoom(zoom*factor,center.x,center.y);
}

pinchDistance=distance;
pinchCenterX=center.x;
pinchCenterY=center.y;

},

{passive:false,capture:true}
);

const finishPinch=()=>{

if(!pinching)return;

pinching=false;
pinchDistance=0;

/* A final clamp guarantees a clean state after a rapid pinch-out. */
if(zoom<=1){
    zoom=1;
    panX=0;
    panY=0;
}else{
    clampPan();
}

if(dom.pageContainer){
    dom.pageContainer.style.transition="transform .15s ease";
    updateTransform();
}

};

dom.viewer.addEventListener("touchend",finishPinch,{passive:true,capture:true});
dom.viewer.addEventListener("touchcancel",finishPinch,{passive:true,capture:true});

}

/*-------------------------------------------------------
  Auto Hide Toolbar
-------------------------------------------------------*/

let toolbarTimer=null;

function resetToolbarTimer(){

if(typeof Reader!=="undefined" && typeof Reader.isOpen==="function" && !Reader.isOpen()){
    ui.hideToolbar();
    clearTimeout(toolbarTimer);
    return;
}

ui.showToolbar();

clearTimeout(

toolbarTimer

);

toolbarTimer=

setTimeout(()=>{

ui.hideToolbar();

},10000);

}

function connectToolbarAutoHide(){

["mousemove",

"touchstart",

"keydown"]

.forEach(type=>{

document.addEventListener(

type,

resetToolbarTimer,

{passive:true}

);

});

}

/*-------------------------------------------------------
  Finish Initialization
-------------------------------------------------------*/

const previousInitialize=

ui.initialize;

ui.initialize=function(){

previousInitialize();

connectKeyboard();

connectWheel();

connectTouch();

/* Zoomed-book drag/pan must be connected explicitly.
 * Responsive resizing does not constitute zoom; the zoom state is the
 * controller's own `zoom` value and is considered zoomed only when zoom > 1.
 * Without this registration the page-flip engine remains the only gesture
 * handler, so a drag is interpreted as a page turn even though the page is
 * visually scaled. */
connectZoomPan();

connectPinch();

connectToolbarAutoHide();

resetToolbarTimer();

};

/*-------------------------------------------------------
  Reader Information
-------------------------------------------------------*/

function updateReaderTitle(){

if(!dom.title)return;

const book=Reader.book();

dom.title.textContent=

book

?

book.title

:

"MMicj";

}



function updatePageIndicator(){

if(!dom.pageIndicator)return;

if(!Reader.isOpen()){
    dom.pageIndicator.textContent="";
    dom.pageIndicator.classList.remove("pageIndicatorActive");
    dom.pageIndicator.setAttribute("aria-hidden","true");
    dom.pageIndicator.tabIndex=-1;
    return;
}

dom.pageIndicator.classList.add("pageIndicatorActive");
dom.pageIndicator.removeAttribute("aria-hidden");
dom.pageIndicator.tabIndex=0;

const spread=typeof Reader.spread==="function"
    ? Reader.spread()
    : {label:String(Reader.page())};

dom.pageIndicator.textContent=spread.label+" / "+Reader.pages();

if(dom.pageJumpInput){
    dom.pageJumpInput.max=String(Reader.pages());
}

}

function updateProgress(){

if(!dom.progress)return;

if(!Reader.isOpen()){

dom.progress.value=0;

return;

}

dom.progress.max=

Reader.pages();

dom.progress.value=

Reader.page();

}

/*-------------------------------------------------------
  Reader Reset
-------------------------------------------------------*/

ui.resetReaderInteractionState=function(){
    zoom=1; panX=0; panY=0; rotation=0;
    panActive=false; panPointerId=null; panLastX=0; panLastY=0;
    touchStartX=0; touchStartY=0; pinchDistance=0; pinching=false;
    if(dom.pageContainer){
        dom.pageContainer.style.transition="none";
        dom.pageContainer.style.transform="translate(0px,0px) rotate(0deg) scale(1)";
    }
};

/*-------------------------------------------------------
  Library Animation
-------------------------------------------------------*/

ui.showLibrary=function(delayReturn=false){

if(libraryRevealTimer){
    window.clearTimeout(libraryRevealTimer);
    libraryRevealTimer=null;
}

/*
 * On narrow screens the library drawer is user-controlled.
 * Closing a book must return to the viewer landing without
 * automatically opening the drawer.
 */
const narrowScreen=window.innerWidth<=999;

/*
 * Previously waited 1s (via delayReturn -> setTimeout) before
 * revealing the landing after a book closed. Now reveals
 * immediately - delayReturn is still passed through to
 * SkyReader.showViewerLibrary() below, which uses it purely to
 * decide whether to play the "isReturning" float-in animation
 * (see #viewerLibrary.isReturning in style.css), not to delay it.
 */
/*
 * Desktop: library remains visible.
 * Narrow: viewer landing can appear, but the drawer stays closed.
 */
sidebarVisible=!narrowScreen;

if(typeof SkyReader!=="undefined" &&
   typeof SkyReader.showViewerLibrary==="function"){

    SkyReader.showViewerLibrary(Boolean(delayReturn));

}

if(dom.library){

    dom.library.classList.toggle(
        "libraryHidden",
        narrowScreen
    );

}

};

ui.hideLibrary=function(){

if(libraryRevealTimer){
    window.clearTimeout(libraryRevealTimer);
    libraryRevealTimer=null;
}

sidebarVisible=false;

if(typeof SkyReader!=="undefined" &&
   typeof SkyReader.hideViewerLibrary==="function"){
    SkyReader.hideViewerLibrary();
}

if(dom.library){

dom.library.classList.add(

"libraryHidden"

);

}

};

ui.toggleLibrary=function(){

sidebarVisible

?

ui.hideLibrary()

:

ui.showLibrary();

};

/*-------------------------------------------------------
  Loading Indicator
-------------------------------------------------------*/

function showLoading(text){

if(!dom.loading)return;

if(dom.loadingText){
    dom.loadingText.textContent=text||"Loading...";
}
else{
    dom.loading.setAttribute("aria-label",text||"Loading...");
}

dom.loading.setAttribute("aria-busy","true");
dom.loading.classList.add("visible");

}

function hideLoading(){

if(!dom.loading)return;

dom.loading.setAttribute("aria-busy","false");
dom.loading.classList.remove("visible");

}

ui.hideLoading=function(){

    hideLoading();

};

function beginBookOpen(text="Loading..."){

    // Prevent stale reader controls from remaining visible while the
    // previous book is cleared and the new book is still loading.
    ui.hideToolbar();

    clearProductionError();
    showLoading(text);

    if(libraryRevealTimer){
        window.clearTimeout(libraryRevealTimer);
        libraryRevealTimer=null;
    }

    sidebarVisible=false;

    if(typeof SkyReader!=="undefined" &&
       typeof SkyReader.hideViewerLibrary==="function"){
        SkyReader.hideViewerLibrary(true);
    }

    if(dom.library){
        dom.library.classList.add("libraryHidden");
    }

}

function connectPageJump(){

if(!dom.pageIndicator || !dom.pageJump || !dom.pageJumpInput)return;

const close=()=>{
    dom.pageJump.hidden=true;
    dom.pageJump.setAttribute("aria-hidden","true");
};

const open=()=>{
    if(!Reader.isOpen())return;
    dom.pageJump.hidden=false;
    dom.pageJump.setAttribute("aria-hidden","false");
    dom.pageJumpInput.min="1";
    dom.pageJumpInput.max=String(Reader.pages());
    dom.pageJumpInput.value=String(Reader.page());
    requestAnimationFrame(()=>{
        dom.pageJumpInput.focus();
        dom.pageJumpInput.select();
    });
};

const submit=async()=>{
    if(!Reader.isOpen())return;

    const raw=String(dom.pageJumpInput.value||"").trim();
    if(!/^\d+$/.test(raw)){
        dom.pageJumpInput.focus();
        dom.pageJumpInput.select();
        return;
    }

    const page=Math.max(1,Math.min(Reader.pages(),Number(raw)));

    /* Use the normal navigation path so desktop clicks, mobile taps,
       and direct page jumps all share the same reader guards. */
    const result=typeof SRNavigation!=="undefined" &&
        typeof SRNavigation.goToPage==="function"
        ? await SRNavigation.goToPage(page)
        : await Reader.goToPage(page);

    if(result!==false)close();
};

dom.pageIndicator.addEventListener("click",open);

dom.pageIndicator.addEventListener("keydown",event=>{
    if(event.key==="Enter" || event.key===" "){
        event.preventDefault();
        open();
    }
});

if(dom.pageJumpButton)dom.pageJumpButton.addEventListener("click",submit);

dom.pageJumpInput.addEventListener("keydown",event=>{
    if(event.key==="Enter"){event.preventDefault();submit();}
    if(event.key==="Escape"){event.preventDefault();close();}
});

dom.pageJumpInput.addEventListener("input",()=>{
    /* Keep the field numeric even on browsers that allow free-form input. */
    dom.pageJumpInput.value=dom.pageJumpInput.value.replace(/[^0-9]/g,"");
});

document.addEventListener("click",event=>{
    if(dom.pageJump.hidden)return;
    if(event.target===dom.pageIndicator || dom.pageJump.contains(event.target))return;
    close();
});

}

/*-------------------------------------------------------
  Reader Events
-------------------------------------------------------*/

Reader.on(

"bookOpened",

()=>{

clearProductionError();

/*
 * Reader.close() sets #statusMessage to "MMicj" as the idle
 * status-bar text (see reader.js). Nothing on the open path
 * cleared it back out again, so it kept sitting next to the
 * real title in #readerTitle once a book was open. #readerTitle
 * already carries the actual title via updateReaderTitle()
 * below, so #statusMessage has nothing left to say here.
 */
const statusMessage=document.getElementById("statusMessage");
if(statusMessage){
    statusMessage.textContent="";
}

updateReaderTitle();

updatePageIndicator();

updateProgress();

hideLoading();

ui.hideLibrary();

requestAnimationFrame(positionReaderArrows);

scheduleBookmarkFlagReposition();

}

);

Reader.on(

"pageChanged",

(page,total)=>{

if(dom.previousButton){
    const atFirst=Number(page||1)<=1;
    dom.previousButton.classList.toggle("isFirstPage",atFirst);
    dom.previousButton.setAttribute("aria-hidden",atFirst?"true":"false");
}

/*
 * Use the page supplied by Reader directly.
 * Reader.pageChanged is emitted from the actual
 * Sky180FlipEngine/StPageFlip flip event, so this keeps
 * the visible indicator synchronized with the real spread.
 */

if(dom.pageIndicator){

    const spread=typeof Reader.spread==="function"
        ? Reader.spread()
        : {label:String(page)};

    dom.pageIndicator.textContent=
        spread.label+" / "+(total||Reader.pages());

}

if(dom.progress){

    dom.progress.max=total||Reader.pages();
    dom.progress.value=page;

}

requestAnimationFrame(()=>{
    scheduleBookmarkFlagReposition();
});

});

Reader.on(

"progress",

(percent,text)=>{

showLoading(text);

}

);

Reader.on(

"error",

(error)=>{
    hideLoading();
    showProductionError(error,"Unable to open this publication.");
}

);

Reader.on(

"closed",

()=>{

ui.hideToolbar();

/* The "Focus viewer" toggle (viewerFullscreenButton) pins #app into a
   fixed, full-viewport overlay that hides the top bar, welcome
   messages, and library panel so only the book shows. That state is
   independent of the book itself, so closing the book — by the close
   button, by Next on the last page, or by any other route — must
   explicitly drop it here or the app is left stuck looking fullscreen
   with no book left to show. */
exitViewerFocus();

updateReaderTitle();

updatePageIndicator();

updateProgress();

/* Library return is owned by Reader.close() so every close route uses
   exactly one authoritative delayed return. */

}

);

function updateViewerFocusIcon(active){
if(!dom.viewerFullscreenButton)return;
const use=dom.viewerFullscreenButton.querySelector("use");
if(use)use.setAttribute("href",active?"#icon-fullscreen-exit":"#icon-fullscreen");
dom.viewerFullscreenButton.setAttribute("aria-pressed",active?"true":"false");
dom.viewerFullscreenButton.setAttribute("aria-label",active?"Restore interface":"Focus viewer");
dom.viewerFullscreenButton.title=active?"Restore interface":"Focus viewer";
}

function toggleViewerFocus(){
const app=document.getElementById("app");
if(!app)return;
const active=app.classList.toggle("viewerFocus");
updateViewerFocusIcon(active);
requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));
}

/*
 * Explicit exit (as opposed to toggleViewerFocus, which flips whichever
 * state is currently active). Used whenever an item that could be in
 * focus/fullscreen view is intentionally closed, so the app always lands
 * back in normal mode rather than whatever state it happened to be in.
 * Safe to call unconditionally: a no-op when focus mode isn't active.
 */
function exitViewerFocus(){
const app=document.getElementById("app");
if(!app)return;
if(!app.classList.contains("viewerFocus"))return;
app.classList.remove("viewerFocus");
updateViewerFocusIcon(false);
requestAnimationFrame(()=>window.dispatchEvent(new Event("resize")));
}

/*-------------------------------------------------------
  Responsive Layout
-------------------------------------------------------*/

function updateLayout(){

const mobile=

window.innerWidth<760;

document.body.classList.toggle(

"mobile",

mobile

);

document.body.classList.toggle(

"desktop",

!mobile

);

}

window.addEventListener(

"resize",

updateLayout

);

/*-------------------------------------------------------
  Fullscreen
-------------------------------------------------------*/

ui.toggleFullscreen=

async function(){

try{

    if(!document.fullscreenElement){

        await document.documentElement.requestFullscreen();

    }else{

        await document.exitFullscreen();

    }

}catch(error){

    /*
     * The fullscreenchange event remains the authoritative source
     * of fullscreen state.  Do not manually force the state here.
     */
    console.warn("[UI] Fullscreen change failed",error);

}

};

document.addEventListener(
"fullscreenchange",
()=>{

    fullscreen=!!document.fullscreenElement;

    /*
     * Reader fullscreen uses the same browser fullscreen API as before.
     * The additional class only controls the Reader interface chrome.
     * Other sections are not affected.
     */
    document.documentElement.classList.toggle(
        "readerFullscreen",
        fullscreen
    );

    document.body.classList.toggle(
        "readerFullscreen",
        fullscreen
    );

    /*
     * Keep the Reader toolbar and application top bar synchronized
     * with fullscreen.
     */
    if(fullscreen){

    ui.hideToolbar();

}else if(typeof Reader!=="undefined" &&
         typeof Reader.isOpen==="function" &&
         Reader.isOpen()){

    ui.showToolbar();

}

    requestAnimationFrame(()=>{

        positionReaderArrows();

        window.dispatchEvent(new Event("resize"));

    });

}
);

/*-------------------------------------------------------
  Public Helpers
-------------------------------------------------------*/

ui.setTitle=function(text){

if(dom.title){

dom.title.textContent=text;

}

};

ui.beginBookOpen=function(text){

beginBookOpen(text);

};

ui.setLoading=function(text){

showLoading(text);

};

ui.clearLoading=function(){

hideLoading();

};

ui.refresh=function(){

updateReaderTitle();

updatePageIndicator();

updateProgress();

};

ui.isFullscreen=function(){

return fullscreen;

};

/*-------------------------------------------------------
  Finish Initialization
-------------------------------------------------------*/

const initializePart4=

ui.initialize;

ui.initialize=function(){

initializePart4();

connectPageJump();

updateLayout();

ui.refresh();

};

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return ui;

})();