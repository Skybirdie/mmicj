"use strict";

/*
=========================================================
 SkyMedia Video Contract — Unified C3.0

 Video normalization is owned by ContentContract.
 This compatibility facade keeps VideoLibrary independent
 of the manifest source.
=========================================================
*/

window.VideoContract = (function () {

    function normalize(video, index = 0) {
        return ContentContract.normalizeVideo(video, index);
    }

    function parse(payload) {
        return ContentContract.parse(payload)
            .filter(item => item && item.type === "video")
            .map((item, index) => normalize(item, index))
            .filter(Boolean);
    }

    return {
        parse,
        normalize,
        unwrapMarkdownUrl: ContentContract.unwrapMarkdownUrl
    };

})();
