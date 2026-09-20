"use strict";

/*
=========================================================

 SkyReader Table Of Contents

 Responsibilities

• Read PDF outline
• Display chapters
• Jump to pages
• Standalone module

=========================================================
*/

window.TableOfContents=(function(){

const toc={};

let root;

let list;

let initialized=false;

let outline=[];

/*-------------------------------------------------------
 Build
-------------------------------------------------------*/

toc.build=function(parent){

    if(initialized){

        return;

    }

    root=document.createElement("aside");

    root.id="srTableOfContents";

    root.className="sr-toc-panel";

    root.hidden=true;

    const header=document.createElement("div");

    header.className="sr-toc-header";

    const title=document.createElement("h3");

    title.textContent="Contents";

    const close=document.createElement("button");

    close.className="sr-toc-close";

    close.textContent="✕";

    close.addEventListener(

        "click",

        ()=>{

            toc.hide();

        }

    );

    header.appendChild(title);

    header.appendChild(close);

    list=document.createElement("div");

    list.className="sr-toc-list";

    root.appendChild(header);

    root.appendChild(list);

    parent.appendChild(root);

    initialized=true;

};

/*-------------------------------------------------------
 Load Outline
-------------------------------------------------------*/

toc.load=function(pdfOutline){

    outline=Array.isArray(pdfOutline)

        ? pdfOutline

        : [];

    toc.refresh();

};

/*-------------------------------------------------------
 Refresh
-------------------------------------------------------*/

toc.refresh=function(){

    if(!initialized){

        return;

    }

    list.innerHTML="";

    if(outline.length===0){

        const empty=document.createElement("div");

        empty.className="sr-toc-empty";

        empty.textContent=

            "No Table of Contents Available.";

        list.appendChild(empty);

        return;

    }

    outline.forEach(item=>{

        list.appendChild(

            createEntry(item)

        );

    });

};

/*-------------------------------------------------------
 Entry
-------------------------------------------------------*/

function createEntry(item){

    const row=document.createElement("button");

    row.className="sr-toc-item";

    row.textContent=

        item.title||

        "Untitled";

    row.style.paddingLeft=

        ((item.level||0)*18+12)+"px";

    row.addEventListener(

        "click",

        ()=>{

            if(

                typeof item.page==="number"

            ){

                SRNavigation.goToPage(

                    item.page

                );

            }

            toc.hide();

        }

    );

    return row;

}

/*-------------------------------------------------------
 Visibility
-------------------------------------------------------*/

toc.show=function(){

    root.hidden=false;

};

toc.hide=function(){

    root.hidden=true;

};

toc.toggle=function(){

    if(root.hidden){

        toc.show();

    }

    else{

        toc.hide();

    }

};

/*-------------------------------------------------------
 Helpers
-------------------------------------------------------*/

toc.count=function(){

    return outline.length;

};

toc.element=function(){

    return root;

};

toc.initialized=function(){

    return initialized;

};

/*-------------------------------------------------------
 Cleanup
-------------------------------------------------------*/

toc.destroy=function(){

    outline=[];

    if(

        root &&

        root.parentNode

    ){

        root.parentNode.removeChild(root);

    }

    root=null;

    list=null;

    initialized=false;

};

return toc;

})();