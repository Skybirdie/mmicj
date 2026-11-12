/* =========================================================
   installedFrame.js — keep the INSTALLED app inside its window

   Problem: in an installed app (PWA, standalone window) the viewport
   units the layout was sized with (100vw / 100dvh / 100svh) can come out
   larger than the window the user can actually see (system bars, nav bar
   / gesture indicator, taskbar, display scaling). #app was then taller
   than the screen and, because <body> centres it with overflow:hidden,
   it was cropped equally at the top AND the bottom: the top bar, the
   status / page indicator bar and the welcome bar slid under the device
   bars and could not be reached.

   Fix: measure the real visible height and publish it as --mm-app-h on
   <html>. css/installed-frame.css sizes the app shells from it.

   SCOPE (deliberately narrow):
   - Runs ONLY when the app is installed / standalone. In a normal
     browser tab it does nothing at all: no class, no variable, so the
     stylesheet's rules never match and nothing changes there.
   - Does not touch layout itself, storage, the network or any other
     module. If anything throws, the app falls back to its old sizing.
   ========================================================= */
(function(){
    "use strict";

    var de = document.documentElement;
    if(!de) return;

    function isInstalled(){
        try{
            if(window.navigator && window.navigator.standalone === true) return true; /* iOS home-screen app */
            var mm = window.matchMedia;
            if(!mm) return false;
            return !!(
                mm("(display-mode: standalone)").matches ||
                mm("(display-mode: fullscreen)").matches ||
                mm("(display-mode: minimal-ui)").matches ||
                mm("(display-mode: window-controls-overlay)").matches
            );
        }catch(e){ return false; }
    }

    if(!isInstalled()) return;

    de.classList.add("mm-installed");

    var last = 0;
    var frame = 0;

    function measure(){
        frame = 0;
        try{
            /* The smaller of the layout viewport and the window's inner
               height: never taller than what is really visible, and it
               shrinks with the window (desktop resize, rotation). */
            var a = de.clientHeight || 0;
            var b = window.innerHeight || 0;
            var h = (a > 0 && b > 0) ? Math.min(a, b) : (a || b);
            if(!(h >= 200)) return;   /* ignore transient zero/tiny readings */
            if(h === last) return;
            last = h;
            de.style.setProperty("--mm-app-h", h + "px");
        }catch(e){ /* keep the previous value / CSS fallback */ }
    }

    function schedule(){
        if(frame) return;
        frame = (window.requestAnimationFrame || function(f){ return setTimeout(f, 16); })(measure);
    }

    function scheduleSettled(){
        /* rotation: the window reports its final size a moment late */
        schedule();
        setTimeout(schedule, 250);
        setTimeout(schedule, 700);
    }

    measure();

    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", scheduleSettled, { passive: true });
    window.addEventListener("pageshow", scheduleSettled, { passive: true });
    document.addEventListener("visibilitychange", function(){
        if(!document.hidden) scheduleSettled();
    });
    if(window.visualViewport && window.visualViewport.addEventListener){
        window.visualViewport.addEventListener("resize", schedule, { passive: true });
    }
    /* the first layout can still be settling when this script runs */
    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", scheduleSettled, { once: true });
    }
    window.addEventListener("load", scheduleSettled, { once: true });
})();
