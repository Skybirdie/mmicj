"use strict";

/*
=========================================================
 SkyMedia Slideshow Contract — compatibility facade

 The authoritative contract is: media + audio + date.
 Existing slideshow code receives its runtime compatibility
 projection from ContentContract.
=========================================================
*/

window.SlideshowContract = (function () {

    function normalize(item, index = 0) {
        return ContentContract.normalizeSlideshow(item, index);
    }

    function parse(payload) {
        return ContentContract.parse(payload)
            .filter(item => item && item.type === "slideshow")
            .map((item, index) => normalize(item, index))
            .filter(item => item && (item.source === "pdf" ? !!item.pdfUrl : Array.isArray(item.slides) && item.slides.length > 0));
    }

    function normalizeSlide(slide) {
        return ContentContract.normalizeSlide(slide);
    }

    return {
        parse,
        normalize,
        normalizeSlide,
        unwrapMarkdownUrl: ContentContract.unwrapMarkdownUrl
    };

})();
