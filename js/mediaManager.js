"use strict";

/*
=========================================================
 SkyMedia Media Manager

 Owns the global "only one media source at a time" rule.

 Default:
     background playback = OFF

 Optional:
     background playback = ON

 Important:
     Background playback only affects navigation between
     sections. Selecting another media item ALWAYS stops
     the previous media first.

 Supported owners:
     - Video Viewer
     - Slideshow Viewer
     - Future media sections
=========================================================
*/

window.MediaManager = (function () {

    const STORAGE_KEY = "skymedia_background_playback";

    let active = null;


    /*
    -------------------------------------------------------
     Background playback preference
    -------------------------------------------------------
    */

    function getBackgroundPlayback() {

        try {

            return (
                localStorage.getItem(STORAGE_KEY) === "true"
            );

        } catch (error) {

            return false;

        }

    }


/*
     * SettingsPanel owns the actual settings control.  Do not query or bind
     * the checkbox here because SettingsPanel creates it dynamically after
     * this module is loaded.
     */



    function setBackgroundPlayback(value) {

        const enabled = Boolean(value);

        try {

            localStorage.setItem(
                STORAGE_KEY,
                enabled ? "true" : "false"
            );

        } catch (error) {
            /* Storage unavailable — preference remains
               active only for this session. */
        }

        /*
         * Turning the preference OFF immediately stops
         * anything currently playing in the background.
         *
         * We do NOT stop active media simply because the
         * setting was turned ON.
         */
        if (!enabled && active) {

            stopActive();

        }

        return enabled;

    }


    function toggleBackgroundPlayback() {

        return setBackgroundPlayback(
            !getBackgroundPlayback()
        );

    }


    /*
    -------------------------------------------------------
     Stop active media
    -------------------------------------------------------
    */

    function stopActive() {

        if (!active) {
            return;
        }

        const previous = active;

        active = null;

        try {

            if (typeof previous.stop === "function") {
                previous.stop();
            }

        } catch (error) {

            console.warn(
                "[MediaManager] Unable to stop media.",
                error
            );

        }

    }


    /*
    -------------------------------------------------------
     Claim media ownership
     
     Calling claim() ALWAYS stops the previous media.
     This is what guarantees that two media sources
     cannot play simultaneously.
    -------------------------------------------------------
    */

function claim(owner, stopFunction) {

    if (!owner || typeof stopFunction !== "function") {
        return;
    }

    /*
     * There can only ever be one active media owner.
     *
     * This intentionally stops the previous owner even when
     * the owner name is the same. Selecting another video or
     * another slideshow must stop the previous item first.
     */
    if (active) {
        stopActive();
    }

    active = {
        owner,
        stop: stopFunction
    };
}


    /*
    -------------------------------------------------------
     Release ownership
    -------------------------------------------------------
    */

    function release(owner) {

        if (!active) {
            return;
        }

        if (active.owner === owner) {
            active = null;
        }

    }


    /*
    -------------------------------------------------------
     Section navigation
     
     This is intentionally different from claim().
     
     Navigation respects the user's background playback
     preference.
    -------------------------------------------------------
    */

    function sectionChanged(sectionId) {

        if (!active) {
            return;
        }

        /*
         * If background playback is enabled, leave the
         * active media running.
         */
        if (getBackgroundPlayback()) {
            return;
        }

        stopActive();

    }


    /*
    -------------------------------------------------------
     Current owner
    -------------------------------------------------------
    */

    function getActiveOwner() {

        return active ? active.owner : null;

    }


    function isPlaying() {

        return !!active;

    }


    return {

        claim,
        release,
        stopActive,
        sectionChanged,

        getBackgroundPlayback,
        setBackgroundPlayback,
        toggleBackgroundPlayback,

        getActiveOwner,
        isPlaying

    };

})();