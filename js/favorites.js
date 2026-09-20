"use strict";

/*
=========================================================

 SkyReader Favorites

 Responsibilities

• Favorite magazines
• Persistent storage
• Favorite queries
• Standalone module

=========================================================
*/

window.Favorites=(function(){

const favorites={};

const STORAGE_KEY="skyreader-favorites";

/*-------------------------------------------------------
 Load
-------------------------------------------------------*/
// Change "Storage" to "SRStore":
function load(){

    return SRStore.get(STORAGE_KEY,[]);

}
/*-------------------------------------------------------
 Save
-------------------------------------------------------*/
// Change "Storage" to "SRStore":
function save(data){

    SRStore.set(STORAGE_KEY,data);

}

/*-------------------------------------------------------
 Normalize
-------------------------------------------------------*/

function normalize(data){

    return [...new Set(data)];

}

/*-------------------------------------------------------
 Add
-------------------------------------------------------*/

favorites.add=function(book){

    if(!book){

        return;

    }

    const data=load();

    data.push(book);

    save(

        normalize(data)

    );

};

/*-------------------------------------------------------
 Remove
-------------------------------------------------------*/

favorites.remove=function(book){

    save(

        load().filter(

            id=>id!==book

        )

    );

};

/*-------------------------------------------------------
 Toggle
-------------------------------------------------------*/

favorites.toggle=function(book){

    if(

        favorites.has(book)

    ){

        favorites.remove(book);

        return false;

    }

    favorites.add(book);

    return true;

};

/*-------------------------------------------------------
 Exists
-------------------------------------------------------*/

favorites.has=function(book){

    return load().includes(book);

}

/*-------------------------------------------------------
 Count
-------------------------------------------------------*/

favorites.count=function(){

    return load().length;

};

/*-------------------------------------------------------
 All IDs
-------------------------------------------------------*/

favorites.ids=function(){

    return load();

};

/*-------------------------------------------------------
 All Books
-------------------------------------------------------*/

favorites.books=function(){

    const ids=

        favorites.ids();

    return Manifest

        .books()

        .filter(

            book=>

            ids.includes(

                book.id

            )

        );

};

/*-------------------------------------------------------
 First Favorite
-------------------------------------------------------*/

favorites.first=function(){

    const books=

        favorites.books();

    return books.length

        ? books[0]

        : null;

};

/*-------------------------------------------------------
 Last Favorite
-------------------------------------------------------*/

favorites.last=function(){

    const books=

        favorites.books();

    return books.length

        ? books[

            books.length-1

        ]

        : null;

};

/*-------------------------------------------------------
 Clear
-------------------------------------------------------*/

favorites.clear=function(){

    save([]);

};

/*-------------------------------------------------------
 Export
-------------------------------------------------------*/

favorites.export=function(){

    return{

        favorites:

        favorites.ids()

    };

};

/*-------------------------------------------------------
 Import
-------------------------------------------------------*/

favorites.import=function(data){

    if(

        !data ||

        !Array.isArray(

            data.favorites

        )

    ){

        return;

    }

    save(

        normalize(

            data.favorites

        )

    );

};

/*-------------------------------------------------------
 Summary
-------------------------------------------------------*/

favorites.summary=function(){

    return{

        count:

        favorites.count(),

        books:

        favorites.books()

    };

};

return favorites;

})();