"use strict";

/*
=========================================================
 SkyReader PDF Engine

 Responsibilities

 • Wrap PDF.js
 • Open local PDFs
 • Open remote PDFs (Glide-ready)
 • Provide pages to Renderer
 • Hide PDF.js implementation details

=========================================================
*/

window.PDFEngine = (function () {

const engine = {};

/*-------------------------------------------------------
  Internal State
-------------------------------------------------------*/

let pdfDocument = null;

let currentSource = null;

let totalPages = 0;

let loaded = false;

let metadata = null;


/*-------------------------------------------------------
  Public Information
-------------------------------------------------------*/

engine.isLoaded = function () {

    return loaded;

};

engine.pageCount = function () {

    return totalPages;

};

engine.currentSource = function () {

    return currentSource;

};

engine.document = function () {

    return pdfDocument;

};

engine.metadata = function () {

    return metadata;

};


/*-------------------------------------------------------
  Initialize
-------------------------------------------------------*/

engine.initialize = function () {

    pdfDocument = null;

    currentSource = null;

    totalPages = 0;

    loaded = false;

    metadata = null;

};


/*-------------------------------------------------------
  Normalize Source

  Accepts either

      PDFEngine.open(book)

  or

      PDFEngine.open(url)

-------------------------------------------------------*/

function normalizeSource(source) {

    if (typeof source === "string") {

        return {

            url: source

        };

    }

    return source;

}


/*-------------------------------------------------------
  Open PDF

  Supports

      PDFEngine.open(book)

  or

      PDFEngine.open(url)

-------------------------------------------------------*/

engine.open = async function (source) {

    source = normalizeSource(source);

    currentSource = source;

    loaded = false;

    totalPages = 0;

    metadata = null;

    pdfDocument = null;

    const loadingTask = pdfjsLib.getDocument({

        url: source.url,

        enableXfa: false,

        useSystemFonts: true

    });

    pdfDocument = await loadingTask.promise;

    totalPages = pdfDocument.numPages;

    loaded = true;

    try{

        metadata = await pdfDocument.getMetadata();

    }

    catch(error){

        metadata = null;

    }

    return pdfDocument;

};


/*-------------------------------------------------------
  Get Page
-------------------------------------------------------*/

engine.getPage = async function(pageNumber){

    if(!loaded){

        throw new Error("PDF not loaded.");

    }

    pageNumber = Math.max(

        1,

        Math.min(

            totalPages,

            pageNumber

        )

    );

    return await pdfDocument.getPage(pageNumber);

};


/*-------------------------------------------------------
  Close
-------------------------------------------------------*/

engine.close = function(){

    if(

        pdfDocument &&

        pdfDocument.destroy

    ){

        pdfDocument.destroy();

    }

    pdfDocument = null;

    currentSource = null;

    totalPages = 0;

    loaded = false;

    metadata = null;

};


/*-------------------------------------------------------
  Worker
-------------------------------------------------------*/

engine.worker = function(url){

    if(

        typeof pdfjsLib === "undefined"

    ){

        return;

    }

    if(

        !url ||

        typeof url !== "string"

    ){

        return;

    }

    pdfjsLib.GlobalWorkerOptions.workerSrc = url;

};


/*-------------------------------------------------------
  Export
-------------------------------------------------------*/

engine.initialize();

return engine;

})();