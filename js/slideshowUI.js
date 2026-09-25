"use strict";

window.SlideshowUI=(function(){
    let initialized=false;
    let toolbarTimeout = null;
    const TOOLBAR_TIMEOUT = 10000;


    function init(){
        if(initialized)return true; initialized=true;
        const bind=(id,fn)=>{const el=document.getElementById(id);if(el)el.addEventListener("click",fn);};
        bind("slideshowPrevious",()=>SlideshowViewer.previous());
        bind("slideshowNext",()=>SlideshowViewer.next());
        bind("slideshowPlay",()=>{SlideshowViewer.togglePlay();updatePlay();});
        bind("slideshowRestart",()=>{SlideshowViewer.restart();updatePlay();});
        bind("slideshowMute",()=>{const m=SlideshowViewer.toggleMute();const el=document.getElementById("slideshowMute");if(el){el.title=m?"Unmute audio":"Mute audio";el.setAttribute("aria-label",m?"Unmute audio":"Mute audio");const use=el.querySelector("use");if(use)use.setAttribute("href",m?"#icon-volume-off":"#icon-volume");}});
        bind("slideshowShare",()=>{const item=SlideshowViewer.getCurrent?.(); if(item&&window.ShareManager)ShareManager.share("slideshow",item);});
        bind("slideshowFullscreen",()=>SlideshowViewer.toggleFullscreen());
        bindToolbarTimeout();
        bind("slideshowClose",()=>SlideshowViewer.close());
        bind("slideshowNarrowLibraryToggle",toggleDrawer);
        bind("slideshowLibraryDrawerClose",closeDrawer);
        document.querySelectorAll("[data-slideshow-view]").forEach(b=>b.addEventListener("click",()=>{SlideshowLibrary.setView(b.dataset.slideshowView);document.querySelectorAll("[data-slideshow-view]").forEach(x=>x.classList.toggle("active",x===b));}));
        /* Filtering, like the Reader section, is category-only - "favorites"
           is exposed as a Sort mode instead, so there is no separate
           all/favorites filter grouping here. */
        const sort=document.getElementById("slideshowSort"),cat=document.getElementById("slideshowCategory");
        const closeSlideshowOrgMenus=()=>{document.getElementById("slideshowSortMenu")?.classList.add("hidden");document.getElementById("slideshowFilterMenu")?.classList.add("hidden");};
        sort?.addEventListener("change",()=>{SlideshowLibrary.setSort(sort.value);closeSlideshowOrgMenus();});
        cat?.addEventListener("change",()=>{SlideshowLibrary.setCategory(cat.value);closeSlideshowOrgMenus();});
        document.getElementById("slideshowSortButton")?.addEventListener("click",()=>toggleMenu("slideshowSortMenu","slideshowFilterMenu"));
        document.getElementById("slideshowFilterButton")?.addEventListener("click",()=>toggleMenu("slideshowFilterMenu","slideshowSortMenu"));
        const audioModeSelect=document.getElementById("slideshowAudioMode");
        audioModeSelect?.addEventListener("change",e=>{
            if(e.target.value==="music"){
                SlideshowViewer.openMusicPicker();
            }else{
                SlideshowViewer.closeMusicPicker();
                SlideshowViewer.setAudioMode(e.target.value);
            }
        });

        /*
         * Native <select> elements do not fire a "change" event when the
         * user chooses the option that is already selected.  After a music
         * track is chosen, #slideshowAudioMode intentionally remains on
         * "music", so choosing Music again would otherwise do nothing and
         * the track picker would never reopen.
         *
         * Intercept the opening gesture only when Music is already selected.
         * This leaves normal native-select behavior intact for every other
         * audio mode and makes Music behave like a reusable picker trigger.
         */
        audioModeSelect?.addEventListener("pointerdown",e=>{
            if(e.button!==0 || e.currentTarget.value!=="music") return;
            e.preventDefault();
            e.stopPropagation();
            SlideshowViewer.openMusicPicker();
        });

        audioModeSelect?.addEventListener("keydown",e=>{
            if(e.currentTarget.value!=="music") return;
            if(e.key!=="Enter" && e.key!==" ") return;
            e.preventDefault();
            e.stopPropagation();
            SlideshowViewer.openMusicPicker();
        });
        document.addEventListener("click",e=>{if(!e.target.closest(".slideshow-organization-controls")){document.getElementById("slideshowSortMenu")?.classList.add("hidden");document.getElementById("slideshowFilterMenu")?.classList.add("hidden");}});
        const searchGroup=document.getElementById("slideshowSearchGroup"), searchButton=document.getElementById("slideshowSearchButton"), searchBox=document.getElementById("slideshowSearchBox");
        searchButton?.addEventListener("click",()=>{const open=searchGroup?.classList.toggle("searchOpen");if(open)searchBox?.focus();else{if(searchBox)searchBox.value="";SlideshowLibrary.setSearch("");}});
        searchBox?.addEventListener("input",()=>SlideshowLibrary.setSearch(searchBox.value));
        document.getElementById("slideshowSettingsButton")?.addEventListener("click",()=>{if(typeof SettingsPanel!=="undefined")SettingsPanel.toggle();});
        return true;
    }

function showToolbar() {
    const viewer = document.getElementById("slideshowViewer");

    if (!viewer) {
        return;
    }

    viewer.classList.remove("slideshow-toolbar-hidden");

    if (toolbarTimeout) {
        window.clearTimeout(toolbarTimeout);
    }

    toolbarTimeout = window.setTimeout(() => {
        viewer.classList.add("slideshow-toolbar-hidden");
    }, TOOLBAR_TIMEOUT);
}

function bindToolbarTimeout() {
    const viewer = document.getElementById("slideshowViewer");

    if (!viewer) {
        return;
    }

    const wakeEvents = [
        "pointermove",
        "pointerdown",
        "touchstart",
        "mousemove",
        "keydown"
    ];

    wakeEvents.forEach(eventName => {
        viewer.addEventListener(eventName, showToolbar, {
            passive: true
        });
    });

    showToolbar();
}


    function populateCategories(){const select=document.getElementById("slideshowCategory");if(!select)return; SlideshowLibrary.getCategories().forEach(c=>{const o=document.createElement("option");o.value=c;o.textContent=c;select.appendChild(o);});}
    function toggleMenu(open,close){document.getElementById(close)?.classList.add("hidden");document.getElementById(open)?.classList.toggle("hidden");}
    function toggleDrawer(){document.getElementById("slideshowSection")?.classList.toggle("slideshow-drawer-open");const b=document.getElementById("slideshowNarrowLibraryToggle");b?.setAttribute("aria-expanded",String(document.getElementById("slideshowSection")?.classList.contains("slideshow-drawer-open")));}
    function closeDrawer(){document.getElementById("slideshowSection")?.classList.remove("slideshow-drawer-open");document.getElementById("slideshowNarrowLibraryToggle")?.setAttribute("aria-expanded","false");}
    function updatePlay(){const el=document.getElementById("slideshowPlay");if(!el)return;const playing=typeof SlideshowViewer.isPlaying==="function"&&SlideshowViewer.isPlaying();el.title=playing?"Pause slide show":"Play slide show";el.setAttribute("aria-label",el.title);const use=el.querySelector("use");if(use)use.setAttribute("href",playing?"#icon-pause":"#icon-play");}
    return {init,openDrawer:toggleDrawer,closeDrawer};
})();
