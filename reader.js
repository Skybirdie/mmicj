"use strict";

/*
=========================================================
 SkyReader Reader Controller

 Responsibilities

 • Connect Renderer to UI
 • Open books
 • Remember reading position
 • Manage application state
 • Emit reader events

=========================================================
*/

window.Reader=(function(){

const reader={};

/*-------------------------------------------------------
  State
-------------------------------------------------------*/

let currentBook=null;

let currentPage=1;

let totalPages=0;

let loading=false;

let initialized=false;

/* Reader-level single-flight guard. */
let openingPromise=null;
let openingBookId=null;
let restoring=false;
let openGeneration=0;

/*-------------------------------------------------------
  Events
-------------------------------------------------------*/

reader.events={

bookOpened:null,

pageChanged:null,

progress:null,

ready:null,

closed:null,

error:null

};

/*-------------------------------------------------------
  Utilities
-------------------------------------------------------*/

function emit(name,...args){

const fn=reader.events[name];

if(typeof fn==="function"){

fn(...args);

}

}

/*-------------------------------------------------------
  Initialization
-------------------------------------------------------*/

reader.initialize=function(){

if(initialized)return;

initialized=true;

Renderer.on(

"progress",

(percent,text)=>{

loading=true;

emit(

"progress",

percent,

text

);

}

);

Renderer.on(

"ready",

(book,pages)=>{

loading=false;

currentBook=book;

totalPages=pages;

emit(

"ready",

book,

pages

);

}

);

Renderer.on(

"page",

(page)=>{

currentPage=page;

if(!restoring){
    saveReadingPosition();
}

emit(

"pageChanged",

page,

totalPages

);

}

);

Renderer.on(

"error",

(error)=>{

loading=false;

emit(

"error",

error

);

});

};

/*-------------------------------------------------------
  Book Opening
-------------------------------------------------------*/

reader.open=async function(book,startPage=null){
    if(!book)return false;

    /* Same-book requests share the active transaction. */
    if(openingPromise && openingBookId===book.id){
        return openingPromise;
    }

    const generation=++openGeneration;
    openingBookId=book.id;

    let transaction;
    transaction=(async()=>{

    const savedPage=(
        SkyReader.resume.magazineId===book.id
    ) ? Number(SkyReader.resume.page)||0 : 0;

    const explicitPage=Number(startPage)||0;
    const requestedPage=Math.max(1,explicitPage||savedPage||1);
    const effectiveSavedPage=explicitPage>0 ? explicitPage : savedPage;

    currentBook=book;
    restoring=effectiveSavedPage>0;

    try{
        loading=true;

        await Renderer.open(book,{startPage:requestedPage});

        /* A newer book selection has superseded this transaction. */
        if(generation!==openGeneration){
            return false;
        }

        currentPage=Renderer.page();
        totalPages=Renderer.pages();

        /*
         * The PDF itself is authoritative. A supplied pageCount may be
         * stale, missing, or simply wrong. Preserve the supplied value for
         * diagnostics, but correct the live book object to the actual count.
         */
        if(window.Manifest &&
           typeof Manifest.reconcileBookCount==="function"){
            Manifest.reconcileBookCount(book,totalPages);
        }else{
            book.pageCount=totalPages;
        }

        emit("bookOpened",book);

        saveReadingPosition();

        return true;

    }finally{
        restoring=false;
        loading=false;
        if(openingPromise===transaction && openingBookId===book.id){
            openingPromise=null;
            openingBookId=null;
        }
    }

    })();

    openingPromise=transaction;
    return transaction;
};

/*-------------------------------------------------------
  Navigation
-------------------------------------------------------*/

reader.next=function(){

return Renderer.next();

};

reader.previous=function(){

return Renderer.previous();

};

reader.goTo=function(page){

return Renderer.goTo(page);

};

/*-------------------------------------------------------
  Reading Memory
-------------------------------------------------------*/

function saveReadingPosition(){

    if(!currentBook)return;

    SkyReader.currentMagazine = currentBook;

    SkyReader.currentPage = currentPage;

    SkyReader.resume.magazineId = currentBook.id;

    SkyReader.resume.page = currentPage;

    if(typeof RecentReading!=="undefined" &&
       typeof RecentReading.updatePage==="function"){
        RecentReading.updatePage(currentBook.id,currentPage);
    }

    StorageManager.save();

    if(typeof Library!=="undefined" && typeof Library.updateReadAgain==="function") Library.updateReadAgain();
    if(typeof RecentShelf!=="undefined" && typeof RecentShelf.refresh==="function") RecentShelf.refresh();


}

/* Compatibilty For Patch Attempt 2 */

reader.pageCount = reader.pages;
reader.currentPage = reader.page;
reader.goToPage = reader.goTo;


/*-------------------------------------------------------
  Public Information
-------------------------------------------------------*/

reader.page=function(){

return currentPage;

};

reader.pages=function(){

return totalPages;

};

reader.spread=function(){

if(typeof Renderer.spread==="function")return Renderer.spread();

const start=currentPage===1 ? 1 : (currentPage%2===0 ? currentPage : currentPage-1);
const end=Math.min(totalPages,start===1 ? 1 : start+1);

return {
    start,
    end,
    isCover:start===1,
    label:start===end?String(start):start+"–"+end
};

};

reader.book=function(){

return currentBook;

};

reader.loading=function(){

return loading;

};

reader.isOpen=function(){

return currentBook!==null;

};

/*-------------------------------------------------------
  Closing
-------------------------------------------------------*/

reader.close=function(options={playSound:true}){

if(typeof clearBookmarkOverlay==="function"){
    clearBookmarkOverlay();
}


openGeneration++;

if(!currentBook){

return;

}

/* The book may have been opened in true browser fullscreen (either via
   the Reader's own fullscreen button or via the Front Page "open full
   viewer" control, both of which fullscreen document.documentElement).
   Every legitimate close route funnels through here, so this is the one
   place that needs to hand control back to the browser chrome — without
   it, the document stays the fullscreenElement and the app is left
   stuck looking fullscreen even though the book is gone. */
if(document.fullscreenElement === document.documentElement){
    document.exitFullscreen?.().catch(()=>{});
}

/* Centralized production close sound. Missing audio is safely ignored by
   AudioController, and mute applies before any playback attempt. */
const playSound = options && options.playSound === true;
if(playSound && window.AudioController && typeof AudioController.playBookClose==="function"){
    AudioController.playBookClose();
}

/* Persist only the publication/page memory used by Read Again. */
saveReadingPosition();

Renderer.close();

const previousBook=currentBook;

currentBook=null;

currentPage=1;
totalPages=0;
loading=false;

if(typeof SkyReader!=="undefined" && typeof SkyReader.resetViewer==="function")
    SkyReader.resetViewer();

if(typeof UI!=="undefined" && typeof UI.resetReaderInteractionState==="function")
    UI.resetReaderInteractionState();

/* Persist the preserved resume fields while forcing transient zoom state
   back to its clean default. */
if(typeof StorageManager!=="undefined" && typeof StorageManager.save==="function")
    StorageManager.save();

emit(

"closed",

previousBook

);

/* Every legitimate book-close route funnels through Reader.close().
   Own the single one-second Viewer Library return here so toolbar,
   mouse-wheel/final-spread, direct-page, and Escape closes behave alike.
   Opening a new book immediately cancels this timer via beginBookOpen(). */
if(typeof UI!=="undefined" && typeof UI.showLibrary==="function")
    UI.showLibrary(true);

/*
 * Reset the Reader status bar to its idle state.
 * The Reader starts with "MMicj"; closing a book must return
 * the status bar to exactly that same state rather than leaving
 * the last book title/page information visible.
 */
const statusMessage=document.getElementById("statusMessage");
const readerTitle=document.getElementById("readerTitle");
const pageIndicator=document.getElementById("pageIndicator");
const pageJump=document.getElementById("pageJump");

if(statusMessage){
    statusMessage.textContent="MMicj";
}

if(readerTitle){
    readerTitle.textContent="";
}

if(pageIndicator){
    pageIndicator.textContent="";
    pageIndicator.classList.remove("pageIndicatorActive");
    pageIndicator.setAttribute("aria-hidden","true");
}

if(pageJump){
    pageJump.hidden=true;
    pageJump.setAttribute("aria-hidden","true");
}

};

const readerCloseButton = document.getElementById("readerCloseButton");

if(readerCloseButton){
    readerCloseButton.addEventListener("click",()=>{
        if(typeof Reader!=="undefined" &&
           typeof Reader.close==="function"){
            Reader.close({playSound:true});
        }
    });
}

/*-------------------------------------------------------
  Refresh
-------------------------------------------------------*/

reader.refresh=function(){

if(!Renderer.loaded()){

return;

}

Renderer.refresh();

};

/*-------------------------------------------------------
  Statistics
-------------------------------------------------------*/

reader.statistics=function(){

return{

book:currentBook,

page:currentPage,

pages:totalPages,

loading,

renderer:Renderer.statistics()

};

};

/*-------------------------------------------------------
  Event Registration
-------------------------------------------------------*/

reader.on=function(name,callback){

if(

Object.prototype.hasOwnProperty.call(

reader.events,

name

)

){

reader.events[name]=callback;

}

return reader;

};

/*-------------------------------------------------------
  Bookmark API
-------------------------------------------------------*/

reader.bookmarks={

add(page=currentPage){
    if(!currentBook || !window.Bookmarks)return null;
    return Bookmarks.add(currentBook,page);
},

remove(id){
    return window.Bookmarks ? Bookmarks.remove(id) : false;
},

has(page=currentPage){
    return !!(currentBook && window.Bookmarks && Bookmarks.has(currentBook,page));
},

list(){
    return currentBook && window.Bookmarks ? Bookmarks.forBook(currentBook) : [];
},

all(){
    return window.Bookmarks ? Bookmarks.all() : [];
}

};

reader.annotations={

enable(){

console.warn(

"Annotations planned."

);

},

disable(){

console.warn(

"Annotations planned."

);

}

};

/*-------------------------------------------------------
  Helpers
-------------------------------------------------------*/

reader.hasBook=function(){

return currentBook!==null;

};

reader.currentBook=function(){

return currentBook;

};

reader.currentPage=function(){

return currentPage;

};

reader.totalPages=function(){

return totalPages;

};


reader.goToPage = function(page){

    return reader.goTo(page);

};

reader.pageCount = function(){

    return Renderer.pages();

};

/*-------------------------------------------------------
  Automatic Initialization
-------------------------------------------------------*/

document.addEventListener(

"DOMContentLoaded",

()=>{

reader.initialize();

});


/*-------------------------------------------------------
  Version
-------------------------------------------------------*/

reader.version="2.1.0";

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return reader;

})();