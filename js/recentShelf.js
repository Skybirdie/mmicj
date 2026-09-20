"use strict";

/*
=========================================================

 SkyReader Recent Shelf

 Responsibilities

• Continue Reading shelf
• Recently opened magazines
• Standalone module

=========================================================
*/

window.RecentShelf=(function(){

const shelf={};

let root;

let list;

let initialized=false;

/*-------------------------------------------------------
 Build
-------------------------------------------------------*/

shelf.build=function(parent){

    if(initialized){

        return;

    }

    root=document.createElement("section");

    root.id="srRecentShelf";

    root.className="sr-recent-shelf";

    const title=document.createElement("h2");

    title.className="sr-recent-title";

    title.textContent="Read Again";

    list=document.createElement("div");

    list.className="sr-recent-list";

    root.appendChild(title);

    root.appendChild(list);

    parent.prepend(root);

    initialized=true;
    shelf.refresh();

};

/*-------------------------------------------------------
 Refresh
-------------------------------------------------------*/

shelf.refresh=function(){
    if(!initialized)return;

    list.innerHTML="";

    const id=SkyReader.resume && SkyReader.resume.magazineId;
    const book=id ? SkyReader.library.find(b=>b.id===id) : null;

    if(!book){
        root.hidden=true;
        return;
    }

    root.hidden=false;
    list.appendChild(createCard(book,{page:SkyReader.resume.page}));
};

/*-------------------------------------------------------
 Card
-------------------------------------------------------*/

function createCard(book,entry){

    const card=document.createElement("button");

    card.className="sr-recent-card";

    const thumbnail=document.createElement("img");

    thumbnail.className="sr-recent-thumbnail";

    thumbnail.loading="lazy";

    const fallbackThumbnail="assets/default-thumbnail.png";

    thumbnail.src=
        book.thumbnail ||
        fallbackThumbnail;

    thumbnail.addEventListener("error",()=>{
        if(thumbnail.dataset.fallbackApplied==="true") return;
        thumbnail.dataset.fallbackApplied="true";
        thumbnail.src=fallbackThumbnail;
    });

    thumbnail.alt=

        book.title;

    const info=document.createElement("div");

    info.className="sr-recent-info";

    const title=document.createElement("div");

    title.className="sr-recent-book";

    title.textContent=

        book.title;

    const page=document.createElement("div");

    page.className="sr-recent-page";

    page.textContent=

        "Last viewed: Page " +

        Math.max(1,Number(entry.page)||1);

    info.appendChild(title);

    info.appendChild(page);

    card.appendChild(thumbnail);

    card.appendChild(info);

    card.addEventListener(

        "click",

        ()=>{
            /* Read Again deliberately uses the exact same Library selection
               path as a normal library card.  It only differs by forcing
               the requested starting page to 1. */
            if(typeof Library!=="undefined" && typeof Library.select==="function"){
                Library.select(book,1);
            }
        }

    );

    return card;

}

/*-------------------------------------------------------
 Visibility
-------------------------------------------------------*/

shelf.show=function(){

    if(root){

        root.hidden=false;

    }

};

shelf.hide=function(){

    if(root){

        root.hidden=true;

    }

};

/*-------------------------------------------------------
 Helpers
-------------------------------------------------------*/

shelf.element=function(){

    return root;

};

shelf.initialized=function(){

    return initialized;

};

/*-------------------------------------------------------
 Destroy
-------------------------------------------------------*/

shelf.destroy=function(){

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

return shelf;

})();