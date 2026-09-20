
"use strict";

/*
=========================================================

 SkyReader Bookmark Panel

 Responsibilities

• Display all bookmarks
• Display book name and page
• Jump to bookmark
• Delete bookmark
• Available regardless of current book
• Standalone module

=========================================================
*/

window.BookmarkPanel=(function(){

const panel={};

let root;
let list;

let initialized=false;

/*-------------------------------------------------------
 Build
-------------------------------------------------------*/

panel.build=function(parent){

    if(initialized){

        return;

    }

    if(!parent){

        return;

    }

    root=document.createElement("aside");

    root.id="srBookmarkPanel";

    root.className="sr-bookmark-panel";

    root.hidden=true;

    const header=document.createElement("div");
    header.className="sr-bookmark-header";

    const title=document.createElement("h3");
    title.textContent="Bookmarks";

    const close=document.createElement("button");
    close.className="sr-bookmark-close";
    close.innerHTML="✕";

    close.addEventListener(

        "click",

        ()=>{

            panel.hide();

        }

    );

    header.appendChild(title);
    header.appendChild(close);

    list=document.createElement("div");
    list.className="sr-bookmark-list";

    root.appendChild(header);
    root.appendChild(list);

    parent.appendChild(root);

    initialized=true;

};

/*-------------------------------------------------------
 Find Book
-------------------------------------------------------*/

function findBook(bookId){

    if(
        typeof SkyReader==="undefined" ||
        !Array.isArray(SkyReader.library)
    ){

        return null;

    }

    const id=String(bookId ?? "").trim();

    if(!id){

        return null;

    }

    return SkyReader.library.find(

        book=>String(book.id ?? "").trim()===id

    ) || null;

}

/*-------------------------------------------------------
 Refresh
-------------------------------------------------------*/

panel.refresh=function(){

    if(!initialized){

        return;

    }

    list.innerHTML="";

    /*
     * The bookmark panel is global.
     * Retrieve bookmarks from every book.
     */

    const storedItems=
        typeof Bookmarks.all==="function"
            ? Bookmarks.all()
            : [];

    const validItems=[];

    storedItems.forEach(item=>{

        if(!item)return;

        const book=SkyReader.library.find(

            candidate=>
                String(candidate.id)===String(item.bookId)

        );

        /*
         * Remove bookmarks whose book no longer exists.
         */

        if(!book){

            if(typeof Bookmarks.remove==="function"){
                Bookmarks.remove(item.id);
            }

            return;

        }

        const page=Number(item.page);

        /*
         * Page must be a valid positive page number.
         */

        if(!Number.isInteger(page) || page<1){

            if(typeof Bookmarks.remove==="function"){
                Bookmarks.remove(item.id);
            }

            return;

        }

        /*
         * If the book has a known page count, reject bookmarks
         * that point beyond the actual book.
         *
         * Unknown page counts are allowed because the reader
         * may determine the count dynamically.
         */

        const pageCount=Number(book.pageCount);

        if(
            Number.isFinite(pageCount) &&
            pageCount>0 &&
            page>pageCount
        ){

            if(typeof Bookmarks.remove==="function"){
                Bookmarks.remove(item.id);
            }

            return;

        }

        validItems.push({

            item:item,
            book:book

        });

    });

    if(validItems.length===0){

        const empty=document.createElement("div");

        empty.className="sr-bookmark-empty";

        empty.textContent="No bookmarks.";

        list.appendChild(empty);

        return;

    }

    validItems.forEach(entry=>{

        list.appendChild(

            createBookmark(
                entry.item,
                entry.book
            )

        );

    });

};
/*-------------------------------------------------------
 Bookmark Row
-------------------------------------------------------*/

function createBookmark(item,book){

    const row=document.createElement("div");

    row.className="sr-bookmark-row";

    const page=document.createElement("button");

    page.type="button";

    page.className="sr-bookmark-page";


const bookTitle=document.createElement("span");

bookTitle.className="sr-bookmark-book";

bookTitle.textContent=
    book.title || "Untitled";

const pageNumber=document.createElement("span");

pageNumber.className="sr-bookmark-page-number";

pageNumber.textContent=
    "Page "+item.page;

page.appendChild(bookTitle);
page.appendChild(pageNumber);



    page.addEventListener(

    "click",

    ()=>{

        if(!book)return;

        if(
            typeof Library!=="undefined" &&
            typeof Library.select==="function"
        ){

            Library.select(
                book,
                Number(item.page)
            );

            panel.hide();

        }

    }

);

    const remove=document.createElement("button");

    remove.type="button";

    remove.className="sr-bookmark-delete";

    remove.textContent="🗑";

    remove.setAttribute(
        "aria-label",
        "Delete bookmark"
    );

    remove.title="Delete bookmark";

    remove.addEventListener(

        "click",

        event=>{

            event.stopPropagation();

            if(
                window.Bookmarks &&
                typeof Bookmarks.remove==="function"
            ){

                Bookmarks.remove(item.id);

            }

            panel.refresh();

        }

    );

    row.appendChild(page);

    row.appendChild(remove);

    return row;

}


/*-------------------------------------------------------
 Visibility
-------------------------------------------------------*/

panel.show=function(){

    if(!initialized){

        /*
         * Normally the application builds the panel during
         * initialization. This fallback keeps the toolbar
         * button functional even if that build step has not
         * occurred yet.
         */

        const parent=document.getElementById("readerPanel");

        if(parent){

            panel.build(parent);

        }

    }

    if(!initialized || !root){

        return;

    }

    /*
     * Make the panel visible first.
     * Refreshing its contents must never prevent the panel
     * itself from opening.
     */

    root.hidden=false;

    panel.refresh();

};

panel.hide=function(){

    if(root){

        root.hidden=true;

    }

};

panel.toggle=function(){

    /*
     * Lazy-build the panel if necessary.
     */

    if(!initialized){

        const parent=document.getElementById("readerPanel");

        if(parent){

            panel.build(parent);

        }

    }

    if(!root){

        return;

    }

    if(root.hidden){

        panel.show();

    }else{

        panel.hide();

    }

};

/*-------------------------------------------------------
 Helpers
-------------------------------------------------------*/

panel.visible=function(){

    return Boolean(
        root &&
        !root.hidden
    );

};

panel.element=function(){

    return root;

};

/*-------------------------------------------------------
 Destroy
-------------------------------------------------------*/

panel.destroy=function(){

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

return panel;

})();

