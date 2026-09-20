"use strict";

/*
=========================================================

 SkyReader Reader Status

 Responsibilities

• Magazine title
• Current page
• Progress
• Progress bar

=========================================================
*/

window.ReaderStatus=(function(){

const status={};

let container;

let titleElement;

let pageElement;

let progressBar;

let progressFill;

/*-------------------------------------------------------
  Build
-------------------------------------------------------*/

status.build=function(parent){

    container=document.createElement("div");

    container.id="srReaderStatus";

    container.className="sr-reader-status";

    titleElement=document.createElement("div");

    titleElement.className="sr-status-title";

    pageElement=document.createElement("div");

    pageElement.className="sr-status-page";

    progressBar=document.createElement("div");

    progressBar.className="sr-progress";

    progressFill=document.createElement("div");

    progressFill.className="sr-progress-fill";

    progressBar.appendChild(progressFill);

    container.appendChild(titleElement);

    container.appendChild(pageElement);

    container.appendChild(progressBar);

    parent.appendChild(container);

};

/*-------------------------------------------------------
  Magazine Title
-------------------------------------------------------*/

status.setTitle=function(title){

    titleElement.textContent=

        title||"";

};

/*-------------------------------------------------------
  Progress
-------------------------------------------------------*/

status.update=function(current,total){

    current=Math.max(1,current);

    total=Math.max(1,total);

    const percent=

        Math.round(

            current/total*100

        );

    pageElement.textContent=

        "Page "+

        current+

        " of "+

        total+

        "    "+

        percent+

        "%";

    progressFill.style.width=

        percent+"%";

};

/*-------------------------------------------------------
  Visibility
-------------------------------------------------------*/

status.show=function(){

    container.hidden=false;

};

status.hide=function(){

    container.hidden=true;

};

/*-------------------------------------------------------
  Reset
-------------------------------------------------------*/

status.reset=function(){

    status.setTitle("");

    status.update(1,1);

};

/*-------------------------------------------------------
  Helpers
-------------------------------------------------------*/

status.element=function(){

    return container;

};

return status;

})();