/* =========================================================
   Front Page share button  (js/frontShare.js  v1.1.0)

   A plain "share this link" button that lives on the Front Page only.

   It is deliberately NOT part of the app's share mode:
     - it does not use shareManager.js / shareViewer.js
     - it never adds body.sky-share-mode or touches ?contractz= links
     - it shares one fixed public URL, not a book/video/slideshow

   Behaviour
     1. Devices/browsers with the Web Share API get the native share
        sheet (Messages, WhatsApp, Mail, ...). Nothing else is shown.
     2. Everywhere else the link is copied to the clipboard, silently,
        and the same brief link-copied.gif the other share links use
        appears in the middle of the screen. No text, no alert().
     3. Cancelling the native sheet does nothing (not an error).
     4. If the link genuinely could not be copied, nothing is shown, so
        the confirmation is never displayed for a copy that didn't happen.

   The button itself is markup inside #frontPage (index.html), so it is
   shown and hidden by the Front Page's own app-section-active /
   app-section-hidden state. No other section can ever see it, and this
   script never has to know which section is active.
   ========================================================= */
(function(){
    "use strict";

    const SHARE_URL   = "https://meditationmornings.glide.page";
    const SHARE_TITLE = "Meditation Mornings";
    const SHARE_TEXT  = "Meditation Mornings in Christ Jesus";

    /* Same image and on-screen time as the app's other share links
       (see LINK_COPIED_* in shareManager.js). Its own element, so this
       button never shares state with the share-mode code. */
    const FEEDBACK_ID  = "frontShareCopiedFeedback";
    const FEEDBACK_SRC = "assets/link-copied.gif";
    const FEEDBACK_MS  = 1100;

    let feedbackTimer = 0;

    function showCopiedFeedback(){
        if(!document.body) return;

        let el = document.getElementById(FEEDBACK_ID);
        if(!el){
            el = document.createElement("img");
            el.id = FEEDBACK_ID;
            el.alt = "Link copied";
            el.setAttribute("aria-hidden", "true");
            el.draggable = false;
            document.body.appendChild(el);
        }

        window.clearTimeout(feedbackTimer);

        /* Reset src on every trigger so the GIF restarts from its first
           frame on repeated taps instead of freezing on its last frame. */
        el.classList.remove("visible");
        el.src = "";
        el.src = FEEDBACK_SRC;

        window.requestAnimationFrame(()=>{
            el.classList.add("visible");
        });

        feedbackTimer = window.setTimeout(()=>{
            el.classList.remove("visible");
        }, FEEDBACK_MS);
    }

    async function copyLink(){
        /* Preferred: async Clipboard API (needs HTTPS / localhost). */
        if(navigator.clipboard && typeof navigator.clipboard.writeText === "function"){
            try{
                await navigator.clipboard.writeText(SHARE_URL);
                return true;
            }catch(_){
                /* fall through to the legacy path */
            }
        }

        /* Legacy fallback for insecure contexts / older WebViews. */
        try{
            const field = document.createElement("textarea");
            field.value = SHARE_URL;
            field.setAttribute("readonly", "");
            field.style.cssText =
                "position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;";
            document.body.appendChild(field);
            field.select();
            field.setSelectionRange(0, field.value.length);
            const ok = document.execCommand("copy");
            field.remove();
            return !!ok;
        }catch(_){
            return false;
        }
    }

    async function handleShare(){
        if(typeof navigator.share === "function"){
            try{
                await navigator.share({
                    title: SHARE_TITLE,
                    text:  SHARE_TEXT,
                    url:   SHARE_URL
                });
                return;
            }catch(error){
                /* The person closed the share sheet: nothing to do. */
                if(error && error.name === "AbortError") return;
                /* Any other failure: fall back to copying the link. */
            }
        }

        if(await copyLink()){
            showCopiedFeedback();
        }
    }

    function init(){
        const button = document.getElementById("frontShareButton");
        if(!button || button.dataset.frontShareBound === "true") return;
        button.dataset.frontShareBound = "true";
        button.addEventListener("click", handleShare);
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init, {once:true});
    }else{
        init();
    }
})();
