"use strict";

/*
=========================================================
 SkyMedia Loading Sequence

 Shared loading-message service for Reader / Video /
 Slideshow / Share Mode and other SkyMedia media loaders.

 Behavior
 • One message at a time.
 • Each message remains visible for 3.5 seconds.
 • Sequence loops while loading continues.
 • Existing loading GIF remains untouched.
 • Current message can be retrieved at any time.
 • Emits a DOM event.
 • Supports optional callback.
=========================================================
*/

window.SkyMediaLoading = (function () {

    const MESSAGE_INTERVAL = 3500;

    const MESSAGES = [

        "1. In the beginning was the Word,",
        "and the Word was with God,",
        "and the Word was God.",

        "2. The same was in the beginning with God.",

        "3. All things were made by him;",
        "and without him was not any thing made that was made.",

        "4. In him was life;",
        "and the life was the light of men.",

        "5. And the light shineth in darkness;",
        "and the darkness comprehended it not.",

        "12. But as many as received him,",
        "to them gave he power to become the sons of God,",
        "even to them that believe on his name:",

        "13. Which were born, not of blood,",
        "nor of the will of the flesh,",
        "nor of the will of man, but of God.",

        "14. And the Word was made flesh,",
        "and dwelt among us,",
        "and we beheld his glory,",
        "the glory as of the only begotten of the Father,",
        "full of grace and truth."
    ];


    let active = false;

    let timer = null;

    let index = 0;

    let currentText = "";

    let currentPercent = 0;

    let callback = null;


    /* =====================================================
       EMIT
    ===================================================== */

    function emit() {

        const detail = {

            text:
                currentText,

            percent:
                currentPercent,

            index,

            total:
                MESSAGES.length,

            active
        };


        document.dispatchEvent(

            new CustomEvent(
                "skymedia:loading-message",
                {
                    detail
                }
            )

        );


        if (
            typeof callback ===
                "function"
        ) {

            try {

                callback(
                    currentText,
                    currentPercent,
                    detail
                );

            } catch (error) {

                console.warn(
                    "[SkyMedia Loading] Callback failed:",
                    error
                );
            }
        }
    }


    /* =====================================================
       SHOW MESSAGE
    ===================================================== */

    function showMessage() {

        if (!active) {
            return;
        }

        currentText =
            MESSAGES[index];


        emit();


        index++;

        if (
            index >=
            MESSAGES.length
        ) {

            index = 0;
        }
    }


    /* =====================================================
       START
    ===================================================== */

    function start(
        options = {}
    ) {

        stop();

        active = true;

        index = 0;

        currentPercent =
            Number(
                options.percent
            ) || 0;

        callback =
            typeof options.onMessage ===
                "function"
                ? options.onMessage
                : null;


        showMessage();


        timer =
            window.setInterval(

                function () {

                    if (!active) {
                        return;
                    }

                    showMessage();

                },

                MESSAGE_INTERVAL
            );


        return currentText;
    }


    /* =====================================================
       UPDATE
    ===================================================== */

    function update(
        percent
    ) {

        if (!active) {
            return;
        }

        currentPercent =
            Number.isFinite(
                Number(percent)
            )
                ? Number(percent)
                : currentPercent;


        emit();
    }


    /* =====================================================
       STOP
    ===================================================== */

    function stop() {

        active = false;


        if (timer) {

            window.clearInterval(
                timer
            );

            timer = null;
        }


        callback = null;


        currentText = "";


        currentPercent = 100;


        document.dispatchEvent(

            new CustomEvent(
                "skymedia:loading-message",
                {
                    detail: {

                        text: "",

                        percent: 100,

                        index: -1,

                        total:
                            MESSAGES.length,

                        active: false
                    }
                }
            )

        );
    }


    /* =====================================================
       STATE
    ===================================================== */

    function isActive() {

        return active;
    }


    function message() {

        return currentText;
    }


    function messages() {

        return MESSAGES.slice();
    }


    return {

        start,

        update,

        stop,

        isActive,

        message,

        messages,

        interval:
            MESSAGE_INTERVAL
    };

})();