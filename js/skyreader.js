"use strict";

window.SkyReader={

version:"1.0.0",

library:[],

filteredLibrary:[],

currentMagazine:null,

currentPage:0,

pageCount:0,

currentCanvas:null,

currentPDF:null,

currentViewport:null,

renderQueue:[],

rendering:false,

renderedPages:new Map(),

pageCache:new Map(),

thumbnails:new Map(),

zoom:1,

minZoom:1,

maxZoom:4,

zoomStep:.1,

rotation:0,

fitMode:"width",

panX:0,

panY:0,

pageWidth:0,

pageHeight:0,

pageRatio:1,

canvasScale:2,

touch:{
startX:0,
startY:0,
lastX:0,
lastY:0,
pinching:false,
startDistance:0
},

mouse:{
dragging:false,
wheelLock:false
},

animation:{
duration:340,
rotating:false,
turning:false
},

sound:{
enabled:true,
volume:.5
},

ui:{
libraryOpen:true,
shelfView:true,
organization:{
main:{sort:"alphabetical",filter:"all",category:""},
viewer:{sort:"alphabetical",filter:"all",category:""}
},
loading:false,
loadingProgress:0,
loadingMessage:"Ready"
},

resume:{
magazineId:null,
page:0
},

settings:{
background:"assets/background.jpg",
theme:"light",
showStatus:true,
rememberReading:true,
rememberZoom:true,
rememberView:true,
pageTurnSound:true,
readAgainVisible:true
},

selectors:{},

init(){

this.selectors={

app:document.getElementById("app"),

libraryPanel:document.getElementById("libraryPanel"),

readerPanel:document.getElementById("readerPanel"),

viewerBackground:document.getElementById("viewerBackground"),

viewerArea:document.getElementById("viewerArea"),

viewerLibrary:document.getElementById("viewerLibrary"),

viewerLibraryScroll:document.getElementById("viewerLibraryScroll"),

pageContainer:document.getElementById("pageContainer"),

canvas:document.getElementById("pageCanvas"),

toolbar:document.getElementById("toolbar"),

statusBar:document.getElementById("statusBar"),

statusMessage:document.getElementById("statusMessage"),

loadingBar:document.getElementById("loadingBar"),

loadingProgress:document.getElementById("loadingProgress"),

loadingText:document.getElementById("loadingText"),

searchBox:document.getElementById("searchBox"),

continueCard:document.getElementById("continueCard"),

shelfView:document.getElementById("shelfView"),

listView:document.getElementById("listView"),


settingsButton:document.getElementById("settingsButton"),

previousButton:document.getElementById("previousButton"),

nextButton:document.getElementById("nextButton"),

rotateButton:document.getElementById("rotateButton"),

muteButton:document.getElementById("muteButton"),

shelfViewButton:document.getElementById("shelfViewButton"),

listViewButton:document.getElementById("listViewButton")

};

},

setStatus(message){

this.ui.loadingMessage=message;

if(this.selectors.statusMessage){

this.selectors.statusMessage.textContent=message;

}

},

setLoading(percent,message){

this.ui.loading=true;

this.ui.loadingProgress=percent;

if(message)this.ui.loadingMessage=message;

if(this.selectors.loadingProgress){

this.selectors.loadingProgress.style.width=percent+"%";

}

if(this.selectors.loadingText){

this.selectors.loadingText.textContent=this.ui.loadingMessage;

}

},

finishLoading(message="Ready"){

this.ui.loading=false;

this.ui.loadingProgress=100;

this.ui.loadingMessage=message;

if(this.selectors.loadingProgress){

this.selectors.loadingProgress.style.width="100%";

}

if(this.selectors.loadingText){

this.selectors.loadingText.textContent=message;

}

},

resetViewer(){

/* Transient reader state only. SkyReader.resume is deliberately preserved
   because it is the sole reading-memory state used by Read Again. */
this.currentMagazine=null;
this.currentPage=0;
this.pageCount=0;
this.currentCanvas=null;
this.currentPDF=null;
this.currentViewport=null;
this.zoom=1;
this.rotation=0;
this.panX=0;
this.panY=0;
this.pageWidth=0;
this.pageHeight=0;
this.pageRatio=1;
this.renderQueue=[];
this.rendering=false;
this.renderedPages.clear();
this.pageCache.clear();
this.thumbnails.clear();
this.touch={startX:0,startY:0,lastX:0,lastY:0,pinching:false,startDistance:0};
this.mouse={dragging:false,wheelLock:false};
this.animation.rotating=false;
this.animation.turning=false;

},

toggleLibrary(open){

if(typeof open==="boolean"){

this.ui.libraryOpen=open;

}else{

this.ui.libraryOpen=!this.ui.libraryOpen;

}

const panel=this.selectors.libraryPanel;

if(!panel)return;

if(window.innerWidth<=999){
  panel.classList.toggle("visible",this.ui.libraryOpen);
  panel.classList.toggle("libraryCollapsed",!this.ui.libraryOpen);
  window.dispatchEvent(new Event("sr:library-toggle"));
  return;
}

if(window.innerWidth>=1000){

panel.classList.toggle("visible",this.ui.libraryOpen);
panel.classList.toggle("libraryCollapsed",!this.ui.libraryOpen);
return;

}

panel.classList.toggle("open",this.ui.libraryOpen);

},

showViewerLibrary(animate=true){

const landing=this.selectors.viewerLibrary;
if(!landing)return;

landing.classList.remove("isLeaving");
landing.classList.remove("isOpening");
landing.classList.remove("isReturning");
if(animate){
    void landing.offsetWidth;
    landing.classList.add("isReturning");
}

if(typeof Library!=="undefined" && typeof Library.buildViewerLibrary==="function"){
    Library.buildViewerLibrary();
}

},

hideViewerLibrary(immediate=false){

const landing=this.selectors.viewerLibrary;
if(!landing)return;

landing.classList.remove("isReturning");

if(immediate){
    landing.classList.add("isOpening");
}else{
    landing.classList.remove("isOpening");
    landing.classList.add("isLeaving");
}

},

toggleView(shelf=true){

this.ui.shelfView=shelf;

this.selectors.shelfView.classList.toggle("hidden",!shelf);

this.selectors.listView.classList.toggle("hidden",shelf);

this.selectors.shelfViewButton.classList.toggle("active",shelf);

this.selectors.listViewButton.classList.toggle("active",!shelf);

},

clampZoom(){

this.zoom=Math.max(

this.minZoom,

Math.min(

this.maxZoom,

this.zoom

)

);

},

updateCanvasTransform(){

if(!this.selectors.pageContainer)return;

this.selectors.pageContainer.style.transform=

`translate(${this.panX}px,${this.panY}px) rotate(${this.rotation}deg) scale(${this.zoom})`;

}

};

document.addEventListener("DOMContentLoaded",()=>{

SkyReader.init();

});