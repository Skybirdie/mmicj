"use strict";

/*
=========================================================

 SkyReader

 Application Bootstrap

 Coordinates all application modules.

=========================================================
*/

window.App=(function(){

const app={};

/*-------------------------------------------------------
  SkyReader
-------------------------------------------------------*/

let initialized=false;

let started=false;

let manifestLoaded=false;

let shareMode=false;
let shareStarted=false;

/*-------------------------------------------------------
  Configuration
-------------------------------------------------------*/

const config={

debug:false,

version:"1.0.0",

defaultView:"library"

};

/*-------------------------------------------------------
  Status
-------------------------------------------------------*/

app.initialized=function(){

    return initialized;

};

app.started=function(){

    return started;

};

app.manifestLoaded=function(){

    return manifestLoaded;

};


app.isShareMode=function(){

    return shareMode;

};

app.shareStarted=function(){

    return shareStarted;

};

app.version=function(){

    return config.version;

};

/*-------------------------------------------------------
  Logging
-------------------------------------------------------*/

function log(){

    if(!config.debug){

        return;

    }

    console.log(

        "[SkyReader]",

        ...arguments

    );

}

/*-------------------------------------------------------
  Configure
-------------------------------------------------------*/

app.configure=function(options={}){

    Object.assign(

        config,

        options

    );

};

/*-------------------------------------------------------
  Initialize Modules
-------------------------------------------------------*/

async function initializeModules(){

    log("Initializing modules...");

    StorageManager.load();

    document.documentElement.dataset.theme=SkyReader.settings.theme||"light";

    const themeMeta=document.querySelector('meta[name="theme-color"]');

    if(themeMeta)
        themeMeta.content=
            (SkyReader.settings.theme==="dark")
                ? "#181b20"
                : "#ffffff";

    Renderer.initialize();

    Reader.initialize();

    SRNavigation.initialize();

    UI.initialize();

    initialized=true;

    log("Modules initialized.");

}

/*-------------------------------------------------------
  Cache DOM
-------------------------------------------------------*/

function cacheDom(){

    log("Caching UI...");

    if(typeof UI.cache==="function"){

        UI.cache();

    }

}

/*-------------------------------------------------------
  Attach Events
-------------------------------------------------------*/

function attachEvents(){

    log("Attaching events...");

    SRNavigation.attach();

    if(typeof UI.attach==="function"){

        UI.attach();

    }

}

/*-------------------------------------------------------
  Load Manifest
-------------------------------------------------------*/

async function loadManifest(){

    log("Loading manifest...");

    await Manifest.load();

    manifestLoaded=true;

    log("Manifest loaded.");

}

/*-------------------------------------------------------
  Build Library
-------------------------------------------------------*/

async function buildLibrary(){

    log("Building library...");

    SkyReader.filteredLibrary = [...SkyReader.library];

    Library.initialize();

    // Explicit post-load handoff: render from the final normalized collection.
    if(typeof Library.applyOrganization==="function")
        Library.applyOrganization();

    if(typeof Library.build==="function")
        Library.build();

    log(

        "Library ready:",

        SkyReader.library.length,

        "books"

    );

}

/*-------------------------------------------------------
  Show Default View
-------------------------------------------------------*/

function showDefaultView(){

    switch(config.defaultView){

        case "reader":

            UI.showReader();

            break;

        default:

            UI.showLibrary();

            break;

    }

}


/*-------------------------------------------------------
  Initialize Feature Modules
-------------------------------------------------------*/

function initializeFeatureModules(){

    /*
     * Each of these is an optional, independently-loaded feature module.
     * A missing script is expected and silently skipped via the typeof
     * guard below. A broken module (one that IS loaded but throws
     * while building its UI) must not be allowed to take the rest of
     * startup down with it -- initializeFeatureModules() runs before
     * connectModules(), which is what wires up book selection, so an
     * uncaught error here previously meant the whole library silently
     * stopped responding to clicks. Each block is isolated so that
     * can't happen again.
     */

    const featureModules=[

        [
            "BookmarkPanel",
            ()=>BookmarkPanel.build(document.body)
        ],

        [
            "RecentShelf",
            ()=>RecentShelf.build(
                document.getElementById("viewerContinue")
            )
        ],

        [
            "TableOfContents",
            ()=>TableOfContents.build(document.body)
        ],

        [
            "ReaderStatus",
            ()=>ReaderStatus.build(document.body)
        ],

        [
            "ReadingStats",
            ()=>ReadingStats.build(document.body)
        ]

    ];

    featureModules.forEach(([name,run])=>{

        const module=window[name];

        if(
            typeof module==="undefined" ||
            typeof module.build!=="function"
        ){

            return;

        }

        try{

            run();

        }catch(error){

            console.error(
                `[SkyReader] ${name}.build() failed -- continuing without it.`,
                error
            );

        }

    });

}

/*-------------------------------------------------------
  Wire Modules
-------------------------------------------------------*/

function connectModules(){

    log("Connecting modules...");

    /*---------------------------------------------------
      Library → Navigation

      Library reports selection; it does not know how the
      Reader is opened. App coordinates the handoff.
    ---------------------------------------------------*/

    if(typeof Library.onSelect==="function"){

        Library.onSelect(async(book,startPage=null)=>{

            /*
             * Start the visual handoff immediately. The previous loading
             * overlay was only useful after Reader.open() had progressed,
             * while the viewer-library landing remained on top until the
             * bookOpened event. That made the opening delay feel like the
             * app was stuck on the landing screen.
             *
             * BeginBookOpen hides the landing immediately and exposes the
             * loading.gif overlay before PDF.js/StPageFlip initialization.
             */

            if(
                typeof UI!=="undefined" &&
                typeof UI.beginBookOpen==="function"
            ){

                UI.beginBookOpen("Loading book...");

            }

            /*
             * Give the browser one paint opportunity to display the loader
             * before starting the potentially expensive PDF open.
             */

            await new Promise(
                resolve=>requestAnimationFrame(resolve)
            );

            const opened =
                await SRNavigation.openMagazine(
                    book,
                    startPage
                );

            if(
                !opened &&
                typeof UI!=="undefined" &&
                typeof UI.clearLoading==="function"
            ){

                UI.clearLoading();

            }

            if(!opened)
                return;

            /*
             * Floating reader controls are only available while a book
             * is actively open.
             */

            if(
                typeof UI!=="undefined" &&
                typeof UI.showToolbar==="function"
            ){

                UI.showToolbar();

            }

            if(
                typeof RecentReading!=="undefined" &&
                typeof RecentReading.record==="function"
            ){

                RecentReading.record(
                    book.id,
                    startPage || 1
                );

            }

            if(
                typeof ReadingStats!=="undefined" &&
                typeof ReadingStats.begin==="function"
            ){

                ReadingStats.begin(
                    book.id
                );

            }

            if(
                typeof ReaderStatus!=="undefined" &&
                typeof ReaderStatus.show==="function"
            ){

                ReaderStatus.show(
                    book
                );

            }

            if(
                typeof TableOfContents!=="undefined" &&
                typeof TableOfContents.load==="function"
            ){

                TableOfContents.load(
                    book
                );

            }

            return true;

        });

    }

    /*---------------------------------------------------
      Reader close
    ---------------------------------------------------*/

    if(typeof UI.onCloseReader==="function"){

        UI.onCloseReader(async()=>{

            await SRNavigation.closeMagazine();

            if(
                typeof ReadingStats!=="undefined" &&
                typeof ReadingStats.end==="function"
            ){

                ReadingStats.end();

            }

            if(
                typeof ReaderStatus!=="undefined" &&
                typeof ReaderStatus.hide==="function"
            ){

                ReaderStatus.hide();

            }

            if(
                typeof TableOfContents!=="undefined" &&
                typeof TableOfContents.clear==="function"
            ){

                TableOfContents.clear();

            }

        });

    }

    if(typeof UI.onRotate==="function"){

        UI.onRotate(()=>{

            SRNavigation.rotate();

        });

    }

    if(typeof UI.onNext==="function"){

        UI.onNext(()=>{

            SRNavigation.next();

        });

    }

    if(typeof UI.onPrevious==="function"){

        UI.onPrevious(()=>{

            SRNavigation.previous();

        });

    }

    if(typeof UI.onMute==="function"){

        UI.onMute(()=>{

            AudioController.toggleMute();

        });

    }

}


/*-------------------------------------------------------
  Share Mode
-------------------------------------------------------*/

async function startShareMode(){

    log("Starting Share Mode...");

    shareMode=true;

    /*
     * There are now TWO kinds of Share Mode links:
     *
     * 1. Legacy/KV shares:
     *
     *      /s/<16-character-key>
     *
     *    The Worker injects window.SkyMediaContract.
     *
     * 2. New direct-ID shares:
     *
     *      /s/<section>/<id>
     *
     *    The Worker injects ONLY window.__SKY_SHARE_TARGET.
     *
     *    The direct-ID route intentionally does not carry the
     *    complete contract. In that case Manifest.load() must
     *    load the normal application data so ShareManager can
     *    resolve the target ID.
     *
     *    Therefore we must NOT assume that SkyMediaContract exists.
     */

    const directTarget =
        window.__SKY_SHARE_TARGET &&
        typeof window.__SKY_SHARE_TARGET==="object"
            ? window.__SKY_SHARE_TARGET
            : null;

    const hasDirectTarget =
        !!(
            directTarget &&
            String(
                directTarget.section || ""
            ).trim() &&
            String(
                directTarget.id || ""
            ).trim()
        );

    /*
     * Legacy contract shares already have their complete item
     * contract supplied by the Worker.

     *
     * Manifest.load() handles both cases because the Manifest/
     * GlideContract layer is responsible for deciding whether
     * a supplied contract exists and otherwise loading the
     * normal application manifest.
     */

    if(hasDirectTarget){

        log(
            "Direct Share target detected:",
            directTarget.section,
            directTarget.id
        );

    }else if(window.SkyMediaContract){

        log(
            "Contract Share detected."
        );

    }else{

        /*
         * This is still a Share Mode request, but no target or
         * contract was supplied. Let ShareManager produce the
         * proper diagnostic rather than silently showing the
         * normal application.
         */

        log(
            "Share Mode started without an explicit target or contract."
        );

    }

    /*
     * IMPORTANT:
     *
     * We now initialize the application modules before Manifest.load().
     *
     * The old Share Mode path jumped directly into Manifest.load()
     * before the normal application initialization sequence. That
     * worked only when the Worker supplied the complete contract.
     *
     * Direct-ID shares need the existing application data machinery
     * available so the target ID can be resolved.
     */

    await initializeModules();

    cacheDom();

    attachEvents();

    /*
     * Load the manifest/data source.
     *
     * For a direct-ID share, this resolves the ID against the
     * application's normal manifest.
     *
     * For a legacy contract share, Manifest.load() continues to
     * use the supplied window.SkyMediaContract.
     */

    await Manifest.load();

    manifestLoaded=true;

    log(
        "Manifest loaded for Share Mode."
    );

    /*
     * ShareManager owns:
     *
     *   - target detection
     *   - target lookup
     *   - section handling
     *   - ShareViewer handoff
     *
     * Do not duplicate that logic here.
     */

    if(
        typeof window.ShareManager==="undefined" ||
        typeof ShareManager.openDeepLink!=="function"
    ){

        throw new Error(
            "Share Mode: ShareManager deep-link handler is not available."
        );

    }

    const opened =
        await ShareManager.openDeepLink();

    if(!opened){

        throw new Error(
            "Share Mode: the requested shared item could not be opened."
        );

    }

    shareStarted=true;

    const reloadScreen =
        document.getElementById(
            "reloadScreen"
        );

    if(reloadScreen){

        reloadScreen.classList.add(
            "isReady"
        );

        window.setTimeout(
            ()=>reloadScreen.remove(),
            500
        );

    }

    log(
        "Share Mode started."
    );
}

/*-------------------------------------------------------
  Start
-------------------------------------------------------*/

app.start=async function(){

    if(started){

        return;

    }

    if(
        typeof window.ShareManager!=="undefined" &&
        typeof ShareManager.isShareMode==="function" &&
        ShareManager.isShareMode()
    ){

        await startShareMode();

        started=true;

        return;

    }

    log("Starting SkyReader...");

    await initializeModules();

    cacheDom();

    attachEvents();

    await loadManifest();

    await buildLibrary();

    initializeFeatureModules();

    connectModules();

    showDefaultView();

    started=true;

    const reloadScreen =
        document.getElementById(
            "reloadScreen"
        );

    if(reloadScreen){

        reloadScreen.classList.add(
            "isReady"
        );

        window.setTimeout(
            ()=>reloadScreen.remove(),
            500
        );

    }

    log(
        "SkyReader started."
    );

};


/*-------------------------------------------------------
  Shutdown
-------------------------------------------------------*/

app.shutdown=function(){

    log(
        "Shutting down..."
    );

    started=false;

};

/*-------------------------------------------------------
  Restart
-------------------------------------------------------*/

app.restart=async function(){

    app.shutdown();

    await app.start();

};

/*-------------------------------------------------------
  Diagnostics
-------------------------------------------------------*/

app.modules=function(){

    return{

        SkyReader:
            typeof SkyReader!=="undefined",

        StorageManager:
            typeof StorageManager!=="undefined",

        Manifest:
            typeof Manifest!=="undefined",

        Library:
            typeof Library!=="undefined",

        Reader:
            typeof Reader!=="undefined",

        Renderer:
            typeof Renderer!=="undefined",

        UI:
            typeof UI!=="undefined",

        SRNavigation:
            typeof SRNavigation!=="undefined",

        Animation:
            typeof Animation!=="undefined",

        AudioController:
            typeof AudioController!=="undefined"

    };

};

app.status=function(){

    return{

        initialized,

        started,

        manifestLoaded,

        version:
            config.version,

        modules:
            app.modules()

    };

};

/*-------------------------------------------------------
  Global Error Handling
-------------------------------------------------------*/

window.addEventListener(

    "error",

    function(event){

        console.error(

            "[SkyReader]",

            event.error ||
            event.message

        );

    }

);

window.addEventListener(

    "unhandledrejection",

    function(event){

        console.error(

            "[SkyReader]",

            event.reason

        );

    }

);

/*-------------------------------------------------------
  Ready Banner
-------------------------------------------------------*/

function readyBanner(){

    if(!config.debug){

        return;

    }

    console.group(

        "SkyReader "+
        config.version

    );

    console.log(
        "Application Ready"
    );

    console.table(
        app.modules()
    );

    console.groupEnd();

}

/*-------------------------------------------------------
  DOM Ready
-------------------------------------------------------*/

async function bootstrap(){

    try{

        await app.start();

        readyBanner();

    }

    catch(error){

        console.error(
            "SkyReader failed to start.",
            error
        );

        if(
            typeof UI!=="undefined" &&
            typeof UI.showError==="function"
        ){

            UI.showError(
                error,
                "SkyReader could not start."
            );

        }

    }

}

/*-------------------------------------------------------
  Startup entry point

  index.html's own DOMContentLoaded handler is the single
  authoritative boot sequence for the whole app: it awaits
  App.start() itself, then brings up Video, Slideshow, and
  the Front Page in a defined order once Reader/Manifest
  data is ready.

  bootstrap() above is kept available (app.bootstrap) for
  manual/console use, but is no longer auto-invoked here.

  It previously also ran on DOMContentLoaded, which meant
  App.start() — and everything that depends on it, like
  SlideshowLibrary.load() — ran twice, concurrently,
  rebuilding library lists out from under the user mid-
  click.
-------------------------------------------------------*/

app.bootstrap =
    bootstrap;

/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

return app;

})();