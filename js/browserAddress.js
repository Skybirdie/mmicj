/* =========================================================
   Browser address  (js/browserAddress.js  v1.0.0)

   Keeps the address bar in step with what is open, so the
   browser's own share command (and "copy link") shares a link
   that reflects the open item or section:

       /?view=<front|reader|video|slideshow>
       /?view=<section>&item=<section>/<id>

   The Worker turns such a link into its preview card (see
   serveBasePage in worker.js): the open item's own thumbnail and
   title, or assets/base-logo.jpg when no item is open.

   Deliberately small and passive
     - It only READS state from the existing viewers
       (AppSwitcher.current, Reader.book, VideoViewer.getCurrentVideo,
       SlideshowViewer.getCurrent, FrontMediaRenderer.getCurrent).
       No viewer, library or share code was changed for it.
     - It uses history.replaceState, never pushState, so the Back
       button and the page's history are untouched.
     - It does nothing inside an iframe (Glide): there the address
       bar belongs to the embedding page.
     - It does nothing in share mode (/s/... links, ?contractz= /
       ?k= links) or when the app is not at the base path.
     - It does not touch the in-app share links (ShareManager,
       itemShare.js) or the Front Page share button (frontShare.js).

   There is no "item opened / closed" event in the app, so the
   state is checked on a short timer while the page is visible, and
   immediately when the section changes or the tab comes back.
   Nothing is written unless the address would actually change.
   ========================================================= */
(function(){
    "use strict";

    const POLL_MS = 700;
    const VIEWS = ["front", "reader", "video", "slideshow"];
    const ITEM_SECTIONS = ["reader", "video", "slideshow"];

    let timer = 0;

    function isEmbedded(){
        try{
            return window.self !== window.top;
        }catch(_){
            return true;
        }
    }

    /* Anything that is not the plain app at the base path is left alone:
       share links, legacy contract links, other pages. */
    function addressIsOurs(){
        try{
            if(window.location.pathname !== "/") return false;

            const params = new URLSearchParams(window.location.search);
            if(params.has("contractz") || params.has("contract") || params.has("k")) return false;

            if(window.__SKY_SHARE_TARGET) return false;
            if(document.body && document.body.classList.contains("sky-share-mode")) return false;

            return true;
        }catch(_){
            return false;
        }
    }

    function clean(value){
        return value === null || value === undefined ? "" : String(value).trim();
    }

    function itemSectionOf(item, fallback){
        const raw = clean(item && (item.section || item.type)).toLowerCase();
        if(raw === "book" || raw === "reader") return "reader";
        if(raw === "video") return "video";
        if(raw === "slideshow") return "slideshow";
        return ITEM_SECTIONS.indexOf(fallback) >= 0 ? fallback : "";
    }

    /* The item open in the active section, or null. */
    function activeItem(view){
        try{
            if(view === "reader"){
                return window.Reader && typeof Reader.isOpen === "function" && Reader.isOpen()
                    ? Reader.book()
                    : null;
            }
            if(view === "video"){
                return window.VideoViewer && typeof VideoViewer.getCurrentVideo === "function"
                    ? VideoViewer.getCurrentVideo()
                    : null;
            }
            if(view === "slideshow"){
                return window.SlideshowViewer && typeof SlideshowViewer.getCurrent === "function"
                    ? SlideshowViewer.getCurrent()
                    : null;
            }
            if(view === "front"){
                /* The Front Page shows its own item (the centerpiece, or the
                   door the person picked) in FrontMediaRenderer. */
                return window.FrontMediaRenderer && typeof FrontMediaRenderer.getCurrent === "function"
                    ? FrontMediaRenderer.getCurrent()
                    : null;
            }
        }catch(_){
            /* fall through */
        }
        return null;
    }

    function currentState(){
        /* Set by AppSwitcher.show(); absent until the app has started,
           which avoids reporting its pre-start default section. */
        const view = clean(document.documentElement.dataset.activeApp).toLowerCase();
        if(VIEWS.indexOf(view) < 0) return null;

        const item = activeItem(view);
        const id = clean(item && item.id);
        const section = id ? itemSectionOf(item, view) : "";

        return {
            view,
            item: id && section ? section + "/" + id : ""
        };
    }

    function sync(){
        if(document.hidden) return;
        if(!addressIsOurs()) return;

        const state = currentState();
        if(!state) return;

        const url = new URL(window.location.href);
        const sameView = url.searchParams.get("view") === state.view;
        const sameItem = (url.searchParams.get("item") || "") === state.item;
        if(sameView && sameItem) return;

        url.searchParams.set("view", state.view);
        if(state.item){
            url.searchParams.set("item", state.item);
        }else{
            url.searchParams.delete("item");
        }

        try{
            window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        }catch(_){
            /* Some sandboxed contexts refuse; the address simply stays. */
        }
    }

    function start(){
        if(timer) return;
        sync();
        timer = window.setInterval(sync, POLL_MS);
    }

    function stop(){
        if(!timer) return;
        window.clearInterval(timer);
        timer = 0;
    }

    function init(){
        if(isEmbedded()) return;

        window.addEventListener("app:switched", sync);
        window.addEventListener("pageshow", sync);
        document.addEventListener("visibilitychange", ()=>{
            if(document.hidden){
                stop();
            }else{
                start();
            }
        });

        if(!document.hidden) start();
    }

    window.BrowserAddress = { sync };

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init, {once:true});
    }else{
        init();
    }
})();
