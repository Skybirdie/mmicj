"use strict";

window.Library={

searchText:"",

_selectHandler:null,

onSelect(handler){

    this._selectHandler =
        typeof handler === "function" ? handler : null;

},

select(book,page=null){

    if(!book)return;

    /* One centralized selection sound covers grid, list, Read Again and
       Viewer Landing selections. Only this route plays selection audio. */
    if(window.AudioController && typeof AudioController.playSelect==="function"){
        AudioController.playSelect();
    }

    /* Mark the selected library card before handing the book
   to the reader/navigation layer. */
this.setSelectedCard(book.id);

if(this._selectHandler){
    return this._selectHandler(book,page);
}

return this.open(book.id,page);

},


getOrganization(panel="main"){
    const defaults={sort:panel==="viewer"?"newest":"random",filter:"all",category:""};
    const org=SkyReader.ui.organization||(SkyReader.ui.organization={});
    return Object.assign(defaults,org[panel]||{});
},

setOrganization(panel="main",changes={}){
    const org=SkyReader.ui.organization||(SkyReader.ui.organization={});
    org[panel]=Object.assign({sort:"random",filter:"all",category:"all"},org[panel]||{},changes);
    if(panel==="main"){
        this.applyOrganization();
        // State changes must always rebuild the visible library immediately.
        this.build();
    }
},

applyOrganization(){
    const org=this.getOrganization("main");
    const organized=window.LibrarySorter
        ? LibrarySorter.organize({books:SkyReader.library,sort:org.sort,filter:org.filter,category:org.category})
        : [...SkyReader.library];
    const query=(this.searchText||"").trim().toLowerCase();
    SkyReader.filteredLibrary=!query ? organized : organized.filter(book=>{
        const haystack=[book.title,book.subtitle,book.author,book.category].map(v=>String(v||"").toLowerCase());
        return haystack.some(value=>value.includes(query));
    });
    this.syncOrganizationControls();
},

populateCategories(){
    const select=document.getElementById("libraryCategory");
    if(!select)return;
    const current=this.getOrganization("main").category||"all";
    select.innerHTML='<option value="all">All categories</option>';
    const categories=window.LibrarySorter&&LibrarySorter.categories ? LibrarySorter.categories(SkyReader.library) : [];
    categories.forEach(category=>{
        const option=document.createElement("option");
        option.value=category;
        option.textContent=category;
        select.appendChild(option);
    });
    select.value=current;
},

syncOrganizationControls(){
    const org=this.getOrganization("main");
    const sort=document.getElementById("librarySort");
    const category=document.getElementById("libraryCategory");
    if(sort)sort.value=org.sort;
    if(category)category.value=org.category||"all";
    const filterButton=document.getElementById("libraryFilterButton");
    if(filterButton){
        const active=(org.category||"all")!=="all";
        filterButton.classList.toggle("isFiltered",active);
        filterButton.setAttribute("aria-pressed",active?"true":"false");
    }
},

organizedBooks(panel="viewer"){
    const org=this.getOrganization(panel);
    if(window.LibrarySorter)return LibrarySorter.organize({books:SkyReader.library,sort:org.sort,filter:org.filter,category:org.category});
    return [...SkyReader.library];
},

build(){

this.buildShelf();

this.buildList();

this.buildViewerLibrary();

},



buildViewerLibrary(){

const shelf=document.getElementById("viewerShelfView");
if(!shelf)return;

shelf.innerHTML="";

this.organizedBooks("viewer").forEach(book=>{

const card=this.createShelfCard(book,{includeDate:true});
card.classList.add("viewerBookCard");

shelf.appendChild(card);

});

this.updateViewerContinue();

},

updateViewerContinue(){

    const wrap=document.getElementById("viewerContinue");

    if(!wrap)return;

    const book=this.getReadAgainBook();


    /* Preserve the existing Viewer Landing
       visibility and layout behavior. */

    if(!book){

        wrap.classList.add("hidden");

        if(
            typeof RecentShelf!=="undefined" &&
            typeof RecentShelf.hide==="function"
        ){

            RecentShelf.hide();

        }

        return;

    }


    wrap.classList.remove("hidden");


    /* RecentShelf now provides the visual card,
       while the existing viewerContinue wrapper
       continues to control the landing layout. */

    if(
        typeof RecentShelf!=="undefined" &&
        typeof RecentShelf.refresh==="function"
    ){

        RecentShelf.refresh();

    }

},


buildShelf(){

const shelf=

document.getElementById("shelfView");

shelf.innerHTML="";

if(!SkyReader.filteredLibrary.length){
    shelf.innerHTML='<div class="libraryEmptyState">No books match the current sort, filter, or search.</div>';
    return;
}

SkyReader.filteredLibrary.forEach(book=>{

shelf.appendChild(

this.createShelfCard(book)

);

});

},

buildList(){

const list=

document.getElementById("listView");

list.innerHTML="";

if(!SkyReader.filteredLibrary.length){
    list.innerHTML='<div class="libraryEmptyState">No books match the current sort, filter, or search.</div>';
    return;
}

SkyReader.filteredLibrary.forEach(book=>{

list.appendChild(

this.createListItem(book)

);

});

},

createFavoriteButton(book){

const button=document.createElement("button");

button.type="button";

button.className="favoriteButton";

const isActive=Boolean(
    window.Favorites &&
    typeof Favorites.has==="function" &&
    Favorites.has(book.id)
);

button.classList.toggle("active",isActive);

button.setAttribute("aria-pressed",isActive?"true":"false");

const setLabel=active=>{
    const label=active?"Remove from favorites":"Add to favorites";
    button.setAttribute("aria-label",label);
    button.title=label;
};

setLabel(isActive);

button.innerHTML=
    '<svg class="icon favoriteIconOutline"><use href="#icon-favorite-outline"></use></svg>'+
    '<svg class="icon favoriteIconFilled"><use href="#icon-favorite-filled"></use></svg>';

button.addEventListener("click",event=>{

    /* The button lives inside a card whose own onclick opens the book --
       stopPropagation keeps a favorite tap from also opening the reader. */
    event.stopPropagation();
    event.preventDefault();

    if(!window.Favorites || typeof Favorites.toggle!=="function")return;

    const nowActive=Favorites.toggle(book.id);

    button.classList.toggle("active",nowActive);
    button.setAttribute("aria-pressed",nowActive?"true":"false");
    setLabel(nowActive);

    /* "Favorites" in the library dropdown is a sort mode, not a filter --
       LibrarySorter.organize() checks options.sort for it. Unfavoriting a
       book while viewing that mode should remove its card immediately
       rather than leaving a stale card that no longer belongs there. */
    if(this.getOrganization("main").sort==="favorites"){
    this.applyOrganization();
    this.build();
}

});

return button;

},


setSelectedCard(bookId){

    const shelves = [
        document.getElementById("shelfView"),
        document.getElementById("listView"),
        document.getElementById("viewerShelfView")
    ];

    shelves.forEach(shelf => {

        if(!shelf)return;

        shelf.querySelectorAll(".bookCard, .listItem").forEach(card => {

            card.classList.toggle(
                "selected",
                String(card.dataset.id) === String(bookId)
            );

        });

    });

},

createShelfCard(book,options={}){

const card=document.createElement("div");

card.className="bookCard";

card.dataset.id=book.id;

/* Keep the currently open book visibly selected even when
   the library cards are rebuilt. */
if(
    SkyReader.currentMagazine &&
    String(SkyReader.currentMagazine.id) === String(book.id)
){
    card.classList.add("selected");
}

/* Optional per-book card background. Leave unset for the clean default.
   Later, a manifest entry can provide cardBackground without changing the layout. */
if(book.cardBackground){
    card.style.setProperty(
        "--card-background-image",
        `url("${book.cardBackground}")`
    );
}

const thumbnail=document.createElement("div");

thumbnail.className="bookThumbnail";

const image=document.createElement("img");

image.loading="lazy";

image.src=book.thumbnail;
image.alt=book.title||"";
const fallbackThumbnail="assets/default-thumbnail.png";
image.addEventListener("error",()=>{
    if(image.dataset.fallbackApplied==="true"){
        thumbnail.classList.add("thumbnailFallback");
        return;
    }
    image.dataset.fallbackApplied="true";
    image.src=fallbackThumbnail;
});

thumbnail.appendChild(image);

const title=document.createElement("div");

title.className="bookTitle";

title.textContent=book.title;

const subtitle=document.createElement("div");

subtitle.className="bookSubtitle";

subtitle.textContent=

book.subtitle||"";

const favoriteButton=this.createFavoriteButton(book);

card.append(

thumbnail,

favoriteButton,

title,

subtitle

);

/* Viewer Landing shelf cards show a release date beneath the title,
   matching the format and (muted, smaller-than-title) styling used by
   the video and slideshow landing cards - see DateDisplay.format()
   (js/dateDisplay.js). Only requested for #viewerShelfView, so this
   stays behind an opt-in flag rather than changing every bookCard. */
if(options.includeDate){

    const dateText=
        window.DateDisplay &&
        typeof DateDisplay.format==="function"
            ? DateDisplay.format(book.date)
            : "";

    if(dateText){

        const date=document.createElement("div");

        date.className="bookDate";

        date.textContent=dateText;

        card.appendChild(date);

    }

}

card.onclick=()=>{

this.select(book,1);

};

return card;

},

createListItem(book){

const item=document.createElement("div");

item.className="listItem";

item.dataset.id=book.id;

/* Keep the currently open book visibly selected in list view. */
if(
    SkyReader.currentMagazine &&
    String(SkyReader.currentMagazine.id) === String(book.id)
){
    item.classList.add("selected");
}

const thumbWrap=document.createElement("div");
thumbWrap.className="listThumb";

const image=document.createElement("img");
image.loading="lazy";
image.src=book.thumbnail||"assets/default-thumbnail.png";
image.alt=book.title||"";
image.addEventListener("error",()=>{
    if(image.dataset.fallbackApplied==="true"){
        image.style.display="none";
        return;
    }
    image.dataset.fallbackApplied="true";
    image.src="assets/default-thumbnail.png";
});
thumbWrap.appendChild(image);

const info=document.createElement("div");
info.className="listInfo";

const title=document.createElement("div");
title.className="listTitle";
title.textContent=book.title;

const subtitle=document.createElement("div");
subtitle.className="listSubtitle";
subtitle.textContent=book.subtitle||"";

const favoriteButton=this.createFavoriteButton(book);

info.append(title,subtitle);
item.append(thumbWrap,info,favoriteButton);

item.onclick=()=>{

this.select(book,1);

};

return item;

},

filter(text){

    this.searchText=String(text||"").toLowerCase();

    this.applyOrganization();

    /* Search changes the authoritative filtered collection.
       Rebuild both visible library representations so the UI immediately
       reflects the new filtered result. */
    this.buildShelf();
    this.buildList();

},

getReadAgainBook(){
    const id=SkyReader.resume && SkyReader.resume.magazineId;
    if(!id)return null;
    return SkyReader.library.find(book=>book.id===id)||null;
},


open(id,page=null){

const book=

SkyReader.library.find(

b=>b.id===id

);

if(!book)return;

SkyReader.currentMagazine=book;

/* Keep the selected card visually synchronized with the
   book that is currently open in the reader. */
this.setSelectedCard(book.id);

StorageManager.save();


SRNavigation.openMagazine(book,page);

},

initializeEvents(){

const search=document.getElementById("searchBox");
const searchToggle=document.getElementById("topSearchButton");

if(search){
    search.addEventListener("input",e=>{
        this.filter(e.target.value);
    });

    search.addEventListener("keydown",event=>{
        if(event.key==="Escape"){
            event.preventDefault();
            event.stopPropagation();
            search.value="";
            this.filter("");
            search.blur();
        }
    });
}

if(searchToggle && search){
    const searchGroup=document.getElementById("topSearchGroup");

    const toggleSearch=()=>{
    if(!searchGroup)return;

    const isOpen=searchGroup.classList.toggle("searchOpen");

    if(isOpen){
        requestAnimationFrame(()=>{
            search.focus({preventScroll:true});
            search.select();
        });
    }else{
        search.value="";
        this.filter("");
        search.blur();
    }
};

searchToggle.addEventListener("click",toggleSearch);

    /* Keep the visual state synchronized with the actual focused control.
       This is presentation only; the existing input/filter event remains
       authoritative for search behavior. */
    search.addEventListener("focus",()=>{
        if(searchGroup)searchGroup.classList.add("searchOpen");
    });
}

/* Restore the library view controls.  Moving Search into the top bar must
   not remove the independent Grid/List controls. */
const shelfButton=document.getElementById("shelfViewButton");
if(shelfButton){
    shelfButton.addEventListener("click",()=>{
        this.showShelf();
    });
}

const listButton=document.getElementById("listViewButton");
if(listButton){
    listButton.addEventListener("click",()=>{
        this.showList();
    });
}

const librarySort=document.getElementById("librarySort");
const libraryCategory=document.getElementById("libraryCategory");
const librarySortButton=document.getElementById("librarySortButton");
const libraryFilterButton=document.getElementById("libraryFilterButton");
const librarySortMenu=document.getElementById("librarySortMenu");
const libraryFilterMenu=document.getElementById("libraryFilterMenu");
const closeOrgMenus=()=>{ librarySortMenu?.classList.add("hidden"); libraryFilterMenu?.classList.add("hidden"); };
if(librarySortButton)librarySortButton.addEventListener("click",event=>{ event.stopPropagation(); libraryFilterMenu?.classList.add("hidden"); librarySortMenu?.classList.toggle("hidden"); });
if(libraryFilterButton)libraryFilterButton.addEventListener("click",event=>{ event.stopPropagation(); librarySortMenu?.classList.add("hidden"); libraryFilterMenu?.classList.toggle("hidden"); });
document.addEventListener("click",event=>{ if(!event.target.closest("#libraryOrganizationControls"))closeOrgMenus(); });
const applySort=()=>{ if(librarySort){ this.setOrganization("main",{sort:String(librarySort.value||"alphabetical")}); closeOrgMenus(); } };
const applyCategory=()=>{ if(libraryCategory){ this.setOrganization("main",{category:String(libraryCategory.value||"all")}); closeOrgMenus(); } };
if(librarySort){ librarySort.addEventListener("change",applySort); librarySort.addEventListener("input",applySort); }
if(libraryCategory){ libraryCategory.addEventListener("change",applyCategory); libraryCategory.addEventListener("input",applyCategory); }


const libraryDrawerClose=document.getElementById("libraryDrawerClose");
if(libraryDrawerClose){
    libraryDrawerClose.addEventListener("click",()=>{
        SkyReader.toggleLibrary(false);
    });
}

const narrowLibraryToggle=document.getElementById("narrowLibraryToggle");
if(narrowLibraryToggle){
    const syncNarrowLibraryToggle=()=>{
        const open=SkyReader.ui.libraryOpen===true;
        narrowLibraryToggle.setAttribute("aria-expanded",open?"true":"false");
        narrowLibraryToggle.title=open?"Close Library":"Open Library";
        narrowLibraryToggle.setAttribute("aria-label",open?"Close Library":"Open Library");
        narrowLibraryToggle.classList.toggle("isOpen",open);
    };
    syncNarrowLibraryToggle();
    narrowLibraryToggle.addEventListener("click",()=>{
        const opening=SkyReader.ui.libraryOpen!==true;
        if(opening){
            if(typeof Library.buildShelf==="function") Library.buildShelf();
            if(typeof Library.buildList==="function") Library.buildList();

        }
        SkyReader.toggleLibrary(opening);
        syncNarrowLibraryToggle();
    });
    window.addEventListener("sr:library-toggle",syncNarrowLibraryToggle);
}

const settingsButton=document.getElementById("settingsButton");

if(settingsButton){

settingsButton.addEventListener("click",()=>{

if(typeof SettingsPanel!=="undefined")SettingsPanel.toggle();

});

}


window.addEventListener("resize",()=>{

this.handleResize();

});

document.addEventListener("keydown",e=>{

this.handleKeyboard(e);

});

},

showShelf(){

SkyReader.toggleView(true);

StorageManager.setShelfView(true);

},

showList(){

SkyReader.toggleView(false);

StorageManager.setShelfView(false);

},

toggleLibrary(){

SkyReader.toggleLibrary();

},

handleResize(){

const narrow=window.innerWidth<=999;
const wasNarrow=this._wasNarrow;
this._wasNarrow=narrow;

if(narrow){
    /* Narrow mode uses the same left library as a pull-out drawer.
       Do not repeatedly force it closed on every resize event. */
    if(wasNarrow===false || typeof wasNarrow==="undefined"){
        SkyReader.toggleLibrary(false);
    }
    window.dispatchEvent(new Event("sr:library-toggle"));
    return;
}

if(window.innerWidth>=1000){
    SkyReader.toggleLibrary(true);
}

},

handleKeyboard(e){

if(e.target.tagName==="INPUT")return;

switch(e.key){

case "Escape":

if(Reader.isOpen()){

    if(typeof SRNavigation!=="undefined" &&
       typeof SRNavigation.closeMagazine==="function"){

        SRNavigation.closeMagazine();

    }

}else if(window.innerWidth>999){

    /*
     * On wide screens ESC may restore the library because it is
     * permanently part of the desktop layout.
     */
    SkyReader.toggleLibrary(true);

}

break;

case "l":

case "L":

this.toggleLibrary();

break;

case "/":

e.preventDefault();

const search=document.getElementById("searchBox");

if(search){

search.focus();
search.select();

}

break;

}

},

sortByTitle(){ this.setOrganization("main",{sort:"alphabetical"}); },

sortNewest(){ this.setOrganization("main",{sort:"newest"}); },

sortOldest(){ this.setOrganization("main",{sort:"oldest"}); },

sortRecent(){ this.setOrganization("main",{sort:"recent"}); },

sortRandom(){ this.setOrganization("main",{sort:"random"}); },


openFirstBook(){

if(!SkyReader.filteredLibrary.length)return;

this.open(

SkyReader.filteredLibrary[0].id

);

},

refresh(){

this.build();

if(SkyReader.ui.shelfView){

this.showShelf();

}else{

this.showList();

}

},

initialize(){

this.populateCategories();
this.applyOrganization();
// Manifest data is now authoritative; render immediately on first load.
this.build();

this.initializeEvents();

if(SkyReader.ui.shelfView){

this.showShelf();

}else{

this.showList();

}

this.handleResize();

}

};