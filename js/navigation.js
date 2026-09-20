"use strict";


/*
=========================================================

 SkyReader Navigation

 Responsibilities

 • Navigation requests
 • Validation
 • Animation coordination
 • Reader coordination
 • Future history/bookmarks

=========================================================
*/

window.SRNavigation=(function(){

const navigation={};

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let initialized=false;

let busy=false;

let currentBook=null;

/* A single opening transaction is shared by all requests for the same
   publication. This prevents a cold-start click from creating a second
   open/close cycle while the first PDF/flip engine is still initializing. */
let openingPromise=null;
let openingBookId=null;
let openingSerial=0;

/*-------------------------------------------------------
  Configuration
-------------------------------------------------------*/

const config={

animation:true,

rememberPosition:true,

wheelEnabled:true,

keyboardEnabled:true,

touchEnabled:true

};

/*-------------------------------------------------------
  Status
-------------------------------------------------------*/

navigation.initialized=function(){

return initialized;

};

navigation.busy=function(){

return busy;

};

navigation.book=function(){

return currentBook;

};

/*-------------------------------------------------------
  Internal Lock
-------------------------------------------------------*/

function lock(){

busy=true;

}

function unlock(){

busy=false;

}

/*-------------------------------------------------------
  Validation
-------------------------------------------------------*/

function canNavigate(){

if(!initialized){

return false;

}

if(busy){

return false;

}

if(typeof Sky180FlipEngine!=="undefined" && Sky180FlipEngine.busy()){

return false;

}


return true;

}

/*-------------------------------------------------------
  Navigation Request
-------------------------------------------------------*/

async function request(action){

if(!canNavigate()){

return false;

}

lock();

try{

await action();

return true;

}

finally{

unlock();

}

}

/*-------------------------------------------------------
  Reader State
-------------------------------------------------------*/

navigation.setCurrentBook=function(book){

currentBook=book;

};

navigation.clearCurrentBook=function(){

currentBook=null;

};

/*-------------------------------------------------------
  Initialization
-------------------------------------------------------*/

navigation.initialize=function(options={}){

if(initialized){

return;

}

Object.assign(

config,

options

);

initialized=true;

document.addEventListener("skyreader:open-book",event=>{
    const detail=event.detail||{};
    const book=SkyReader.library.find(item=>item.id===detail.id);
    if(book){
        navigation.openMagazine(book,detail.page||1);
    }
});

document.addEventListener("skyreader:last-page-click",()=>{
    if(Reader.isOpen() && !busy){
        navigation.closeMagazine();
    }
});

};

/*-------------------------------------------------------
  Configuration
-------------------------------------------------------*/

navigation.config=function(){

return{

...config

};

};

navigation.configure=function(options={}){

Object.assign(

config,

options

);

};



/*-------------------------------------------------------
  Reader Close Cleanup
-------------------------------------------------------*/

function clearReaderBookmarkOverlay(){

    if(typeof hideBookmarkFlag==="function"){

        hideBookmarkFlag();

        return;

    }

    /* Fallback in case UI internals are not directly exposed. */
    document
        .querySelectorAll(".bookmarkFlag")
        .forEach(flag=>{

            flag.classList.remove(
                "visible",
                "active",
                "turning"
            );

            flag.dataset.bookmarkBook="";
            flag.dataset.bookmarkPage="";
            flag.dataset.bookmarkId="";

        });

    document
        .querySelectorAll(".bookmarkFlag.bookmarkFlagExtra")
        .forEach(flag=>flag.remove());

}


/*-------------------------------------------------------
  Go To Page
-------------------------------------------------------*/

navigation.goToPage=function(targetPage){

    return request(async()=>{

        const total=Reader.pages();

        if(!total){
            return false;
        }

        targetPage=Math.max(
            1,
            Math.min(total,Number(targetPage)||1)
        );

        if(targetPage===Reader.page()){
            return true;
        }

        /*
         * Reader remains the public reading controller.
         * Renderer prepares the requested PDF page and
         * Sky180FlipEngine performs the visual movement.
         */
        await Reader.goToPage(targetPage);

        if(config.rememberPosition){
            /* Reader persists the position through its page event. */
        }

        return true;

    });

};

/*-------------------------------------------------------
  Next Page
-------------------------------------------------------*/

navigation.next = async function(){

    if(busy) return false;

    const page = Number(Reader.page() || 1);
    const total = Number(Reader.pages() || 0);

    if(!total) return false;

    /* A true two-page desktop PDF is already a complete 1–2 spread.
       StPageFlip has no third page to turn to, so Next must close the reader
       rather than asking PageFlip to flip a nonexistent spread. */
    const twoPageDocument =
        typeof Sky180FlipEngine!=="undefined" &&
        typeof Sky180FlipEngine.isTwoPageDocument==="function" &&
        Sky180FlipEngine.isTwoPageDocument();

    if(twoPageDocument){

    clearReaderBookmarkOverlay();

    Reader.close({playSound:true});

    AudioController.readerClosed();

    currentBook=null;

    /*
 * On narrow screens the library is a user-controlled drawer.
 * Closing a book must not automatically open it.
 */
if(
    window.innerWidth<=999 &&
    typeof SkyReader!=="undefined" &&
    typeof SkyReader.toggleLibrary==="function"
){

    SkyReader.toggleLibrary(false);

    window.dispatchEvent(
        new Event("sr:library-toggle")
    );

}


    return true;

}

    // Current page represents the first page of the visible spread.
    // 11 pages -> final spread starts at 10.
    // 10 pages -> final spread starts at 10.
    const singlePage=
        typeof Sky180FlipEngine!=="undefined" &&
        typeof Sky180FlipEngine.isSinglePage==="function" &&
        Sky180FlipEngine.isSinglePage();

    const finalSpreadStart = singlePage
        ? total
        : (total <= 1 ? 1 : (total % 2 === 0 ? total : total - 1));

    if(page >= finalSpreadStart){

    clearReaderBookmarkOverlay();

    Reader.close({playSound:true});

    AudioController.readerClosed();

    currentBook=null;

    /*
 * On narrow screens the library is a user-controlled drawer.
 * Closing a book must not automatically open it.
 */
if(
    window.innerWidth<=999 &&
    typeof SkyReader!=="undefined" &&
    typeof SkyReader.toggleLibrary==="function"
){

    SkyReader.toggleLibrary(false);

    window.dispatchEvent(
        new Event("sr:library-toggle")
    );

}


    return true;

}

    return request(async()=>{
        await Reader.next();
        return true;
    });
};

/*-------------------------------------------------------
  Previous Page
-------------------------------------------------------*/

navigation.previous=function(){

    if(!Reader.isOpen()){
        return false;
    }

    /* A previous request means the previous MAGAZINE SPREAD. */
    return request(async()=>{
        return Reader.previous();
    });

};

/*-------------------------------------------------------
  Open Magazine
-------------------------------------------------------*/

navigation.openMagazine = async function(book,startPage=null){

/*
 * If the requested book is already open, do not create a second
 * Reader.open() transaction. Navigate directly to the requested page.
 *
 * Because this path bypasses Reader.open(), it also bypasses the
 * "bookOpened" event that normally hides the loading indicator.
 */
if(
    !openingPromise &&
    Reader.isOpen() &&
    currentBook &&
    currentBook.id===book.id
){

    const targetPage=Number(startPage);

    if(
        Number.isFinite(targetPage) &&
        targetPage>=1
    ){

        const moved=await navigation.goToPage(targetPage);

        if(
            typeof UI!=="undefined" &&
            typeof UI.hideLoading==="function"
        ){

            UI.hideLoading();

        }

        return moved;

    }

    if(
        typeof UI!=="undefined" &&
        typeof UI.hideLoading==="function"
    ){

        UI.hideLoading();

    }

    return true;

}

    /* Never interrupt an active opening transaction with a second book.
       The original transaction is allowed to finish; this is the primary
       guard against the intermittent Continue/Read Again freeze. */
    if(openingPromise && openingBookId!==book.id){
        return false;
    }

    /* If a different book is already fully open, close it before replacing it. */
    if(!openingPromise && Reader.isOpen() && currentBook && currentBook.id!==book.id){
        Reader.close({playSound:false});
        AudioController.readerClosed();
        currentBook=null;
    }

    if(busy && !openingPromise){
        return false;
    }

    lock();
    openingBookId=book.id;
    const serial=++openingSerial;

    let transaction;
    transaction=(async()=>{

        try{
            currentBook=book;

            /* A new opening transaction owns the viewer immediately. Cancel
               any delayed return from the book that just closed and hide the
               Viewer Library before Reader.open() begins. */
            if(typeof UI!=="undefined" && typeof UI.beginBookOpen==="function")
                UI.beginBookOpen("Loading...");
            else if(typeof UI!=="undefined" && typeof UI.hideLibrary==="function")
                UI.hideLibrary();

            await Reader.open(book,startPage);

            /* Do not publish a superseded transaction as the active book. */
            if(serial!==openingSerial){
                return false;
            }

            AudioController.readerOpened(book);
            if(window.innerWidth<=999 && typeof SkyReader!=="undefined" &&
               typeof SkyReader.toggleLibrary==="function") {
                SkyReader.toggleLibrary(false);
                window.dispatchEvent(new Event("sr:library-toggle"));
            }
            return true;

        }catch(error){
            if(serial===openingSerial){
                if(Reader.isOpen()){
                    try{ Reader.close({playSound:false}); }catch(e){}
                }
                currentBook=null;

                if(typeof UI!=="undefined" &&
                   typeof UI.showLibrary==="function"){
                    UI.showLibrary();
                }

                console.error("[Nav] Book open failed",error);
            }
            return false;

        }finally{
            if(serial===openingSerial){
                openingPromise=null;
                openingBookId=null;
                unlock();
            }
        }

    })();

    openingPromise=transaction;
    return transaction;
};

/*-------------------------------------------------------
  Close Magazine
-------------------------------------------------------*/

navigation.closeMagazine=

async function(){

    if(!Reader.isOpen()){

        clearReaderBookmarkOverlay();

        return;

    }

    return request(async()=>{

        clearReaderBookmarkOverlay();

        Reader.close({playSound:true});

        AudioController.readerClosed();

        currentBook=null;
       
    /*
 * On narrow screens the library is a user-controlled drawer.
 * Closing a book must not automatically open it.
 */
if(
    window.innerWidth<=999 &&
    typeof SkyReader!=="undefined" &&
    typeof SkyReader.toggleLibrary==="function"
){

    SkyReader.toggleLibrary(false);

    window.dispatchEvent(
        new Event("sr:library-toggle")
    );

}



    });

};

/*-------------------------------------------------------
  Reader Memory
-------------------------------------------------------*/

navigation.remember=function(enabled){

    config.rememberPosition=

        Boolean(enabled);

};

navigation.isRemembering=function(){

    return config.rememberPosition;

};


/*-------------------------------------------------------
  Input State
-------------------------------------------------------*/

let wheelLocked=false;

let touchStartX=0;
let touchStartY=0;

const TOUCH_THRESHOLD=60;

/*-------------------------------------------------------
  Keyboard
-------------------------------------------------------*/

function onKeyDown(event){

    if(!config.keyboardEnabled){
        return;
    }

    const nextKey=
        event.key==="ArrowRight" ||
        event.key==="PageDown" ||
        event.code==="ArrowRight" ||
        event.code==="PageDown";

    const previousKey=
        event.key==="ArrowLeft" ||
        event.key==="PageUp" ||
        event.code==="ArrowLeft" ||
        event.code==="PageUp";

    if(nextKey){
        event.preventDefault();
        navigation.next();
        return;
    }

    if(previousKey){
        event.preventDefault();
        navigation.previous();
        return;
    }

    /* Escape belongs to the Library publication search while its field is
       focused. Do not let the global reader Escape path close the book or
       schedule a Viewer Library landing. */
    if(event.key==="Escape" && event.target &&
       event.target.id==="searchBox"){
        return;
    }

    switch(event.key){

        case "Escape":

            event.preventDefault();

            navigation.closeMagazine();

            break;

        case "Home":

            event.preventDefault();

            navigation.goToPage(1);

            break;

        case "End":

            event.preventDefault();

            navigation.goToPage(

                Reader.pages()

            );

            break;

    }

}

/*-------------------------------------------------------
  Mouse Wheel
-------------------------------------------------------*/

function onWheel(event){

    if(!config.wheelEnabled){
        return;
    }

    if(!Reader.isOpen() || event.ctrlKey){
        return;
    }

    /*
     * Phase 4.0:
     * Page-turn wheel input belongs to the reader viewport only.
     *
     * Previously this listener was attached to document, so scrolling the
     * Library could also reach navigation.next()/previous(). The reader
     * remains document-level for compatibility, but the event target must
     * be inside #viewerArea before it can become a page-turn request.
     */
    const viewer=document.getElementById("viewerArea");

    if(!viewer){
        return;
    }

    if(!viewer.contains(event.target)){
        return;
    }

    /* Do not discard a wheel request merely because StPageFlip is in its
       short transition state. The navigation layer owns the request lock;
       this is especially important on the final spread of 1- and 2-page
       documents, where the request may need to close the reader. */
    if(wheelLocked || busy){
        return;
    }

    wheelLocked=true;

    setTimeout(()=>{

        wheelLocked=false;

    },250);

    if(event.deltaY>0){

        navigation.next();

    }else{

        navigation.previous();

    }

}

/*-------------------------------------------------------
  Touch
-------------------------------------------------------*/

let touchTracking=false;
let suppressClickUntil=0;

function isSinglePageTouchReader(){
    return typeof Sky180FlipEngine!=="undefined" &&
           typeof Sky180FlipEngine.isSinglePage==="function" &&
           Sky180FlipEngine.isSinglePage();
}

function onTouchStart(event){
    if(!config.touchEnabled || !isSinglePageTouchReader()) return;

    /* Pinch/2-finger gestures belong to zoom and must never become a turn. */
    if(event.touches.length!==1){
        touchTracking=false;
        return;
    }

    const target=event.target;
    if(target && target.closest && target.closest("#toolbar")){
        touchTracking=false;
        return;
    }

    touchTracking=true;
    touchStartX=event.touches[0].clientX;
    touchStartY=event.touches[0].clientY;
}

function onTouchMove(event){
    if(!touchTracking || event.touches.length!==1) return;

    const dx=event.touches[0].clientX-touchStartX;
    const dy=event.touches[0].clientY-touchStartY;

    /* Ignore vertical movement.  Once a horizontal gesture is established,
     * prevent the browser from treating it as a competing scroll gesture. */
    if(Math.abs(dx)>TOUCH_THRESHOLD && Math.abs(dx)>Math.abs(dy)){
        event.preventDefault();
    }
}

function onTouchEnd(event){
    if(!touchTracking || !config.touchEnabled || !isSinglePageTouchReader()){
        touchTracking=false;
        return;
    }

    touchTracking=false;

    if(typeof Sky180FlipEngine!=="undefined" && Sky180FlipEngine.busy()) return;

    const touch=event.changedTouches && event.changedTouches[0];
    if(!touch) return;

    const dx=touch.clientX-touchStartX;
    const dy=touch.clientY-touchStartY;

    if(Math.abs(dx)<TOUCH_THRESHOLD || Math.abs(dx)<=Math.abs(dy)) return;

    /* Stop the click synthesized after a successful swipe from activating a
     * page underneath the finger. */
    suppressClickUntil=Date.now()+500;
    event.preventDefault();

    if(dx<0) navigation.next();
    else navigation.previous();
}

function onReaderClickCapture(event){
    if(Date.now()<suppressClickUntil){
        event.preventDefault();
        event.stopPropagation();
        suppressClickUntil=0;
    }
}

/*-------------------------------------------------------
  Rotation
-------------------------------------------------------*/

navigation.rotate=function(){

    if(!Reader.isOpen()){
        return;
    }

    UI.rotateReader();

};

/*-------------------------------------------------------
  Event Registration
-------------------------------------------------------*/

navigation.attach=function(){

    document.addEventListener(

        "keydown",

        onKeyDown

    );

    /* Page-turn wheel input must be captured before StPageFlip can consume
     * wheel events in its curl/edge region. The handler itself already
     * limits requests to #viewerArea and ignores Ctrl+wheel. */
    const wheelViewer=document.getElementById("viewerArea");
    if(wheelViewer){
        wheelViewer.addEventListener("wheel",onWheel,{passive:true,capture:true});
    }

    /* Dedicated mobile single-page swipe path.  StPageFlip mouse/touch
     * input is disabled in single-page mode so there is exactly one owner
     * for the gesture: left=next, right=previous. */
    const viewer=document.getElementById("viewerBackground");
    if(viewer){
        viewer.addEventListener("touchstart",onTouchStart,{passive:true});
        viewer.addEventListener("touchmove",onTouchMove,{passive:false});
        viewer.addEventListener("touchend",onTouchEnd,{passive:false});
        viewer.addEventListener("click",onReaderClickCapture,true);
    }

};

/*-------------------------------------------------------
  Event Removal
-------------------------------------------------------*/

navigation.detach=function(){

    document.removeEventListener(

        "keydown",

        onKeyDown

    );

    const wheelViewer=document.getElementById("viewerArea");
    if(wheelViewer){
        wheelViewer.removeEventListener("wheel",onWheel,true);
    }

    const viewer=document.getElementById("viewerBackground");
    if(viewer){
        viewer.removeEventListener("touchstart",onTouchStart);
        viewer.removeEventListener("touchmove",onTouchMove);
        viewer.removeEventListener("touchend",onTouchEnd);
        viewer.removeEventListener("click",onReaderClickCapture,true);
    }

};

/*-------------------------------------------------------
  Enable / Disable
-------------------------------------------------------*/

navigation.enableKeyboard=function(enabled){

    config.keyboardEnabled=

        Boolean(enabled);

};

navigation.enableWheel=function(enabled){

    config.wheelEnabled=

        Boolean(enabled);

};

navigation.enableTouch=function(enabled){

    config.touchEnabled=

        Boolean(enabled);

};


/*-------------------------------------------------------
  History
-------------------------------------------------------*/

const history=[];

navigation.history=function(){

    return history.slice();

};

navigation.clearHistory=function(){

    history.length=0;

};

function pushHistory(action,data={}){

    history.push({

        action,

        data,

        page:Reader.isOpen()

            ? Reader.page()

            : null,

        book:currentBook,

        time:Date.now()

    });

}

/*-------------------------------------------------------
  Bookmarks (Future Hooks)
-------------------------------------------------------*/

navigation.bookmark=function(){

    return{

        book:currentBook,

        page:Reader.page()

    };

};

navigation.restoreBookmark=function(bookmark){

    if(!bookmark){

        return false;

    }

    if(!currentBook){
        return false;
    }

    const bookmarkBookId=String(bookmark.bookId ?? bookmark.book ?? "");
    if(!bookmarkBookId || bookmarkBookId!==String(currentBook.id ?? "")){
        return false;
    }

    navigation.goToPage(

        bookmark.page

    );

    return true;

};

/*-------------------------------------------------------
  Table of Contents Hook
-------------------------------------------------------*/

navigation.openSection=function(page){

    return navigation.goToPage(page);

};

/*-------------------------------------------------------
  Internal PDF Link Hook
-------------------------------------------------------*/

navigation.followLink=function(page){

    return navigation.goToPage(page);

};

/*-------------------------------------------------------
  Search Hook
-------------------------------------------------------*/

navigation.openSearchResult=function(page){

    return navigation.goToPage(page);

};

/*-------------------------------------------------------
  Wrapped Navigation
-------------------------------------------------------*/

const originalNext=navigation.next;

navigation.next=function(){

    pushHistory("next");

    return originalNext();

};

const originalPrevious=navigation.previous;

navigation.previous=function(){

    pushHistory("previous");

    return originalPrevious();

};

const originalGoTo=navigation.goToPage;

navigation.goToPage=function(page){

    pushHistory("goto",{

        page

    });

    return originalGoTo(page);

};

/*-------------------------------------------------------
  Magazine Events
-------------------------------------------------------*/

const originalOpen=navigation.openMagazine;

navigation.openMagazine=

async function(book,startPage=null){

    pushHistory("open",{

        book,
        startPage

    });

    return originalOpen(book,startPage);

};

const originalClose=navigation.closeMagazine;

navigation.closeMagazine=

async function(){

    pushHistory("close");

    return originalClose();

};

/*-------------------------------------------------------
  Public Status
-------------------------------------------------------*/

navigation.status=function(){

    return{

        initialized,

        busy,

        currentBook,

        page:Reader.isOpen()

            ? Reader.page()

            : null,

        pages:Reader.isOpen()

            ? Reader.pages()

            : 0

    };

};

/*-------------------------------------------------------
  Cleanup
-------------------------------------------------------*/

navigation.destroy=function(){

    navigation.detach();

    history.length=0;

    currentBook=null;

    busy=false;

    initialized=false;

};

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return navigation;

})();

navigation.version="3.0.0";

console.log("SRNavigation module loaded", window.SRNavigation);