"use strict";

/*
=========================================================

 SkyReader Recent Reading

 Responsibilities

• Track recently opened magazines
• Continue Reading support
• Last page remembered
• Reading timestamps

=========================================================
*/

window.RecentReading=(function(){

const recent={};

const STORAGE_KEY="skyreader-recent";

const MAX_ITEMS=20;

/*-------------------------------------------------------
 Load
-------------------------------------------------------*/


function load(){

    return SRStore.get(STORAGE_KEY,[]);

}
/*-------------------------------------------------------
 Save
-------------------------------------------------------*/

function save(data){

    SRStore.set(STORAGE_KEY,data);

}

/*-------------------------------------------------------
 Record
-------------------------------------------------------*/

recent.record=function(book,page){

    if(!book){

        return;

    }

    let items=load();

    items=items.filter(

        item=>item.book!==book

    );

    items.unshift({

        book,

        page,

        opened:new Date().toISOString()

    });

    if(items.length>MAX_ITEMS){

        items.length=MAX_ITEMS;

    }

    save(items);

};

/*-------------------------------------------------------
 Update Page
-------------------------------------------------------*/

recent.updatePage=function(book,page){

    if(!book){

        return;

    }

    const items=load();

    const entry=items.find(

        item=>item.book===book

    );

    if(!entry){

        recent.record(book,page);

        return;

    }

    entry.page=page;

    entry.opened=new Date().toISOString();

    save(items);

};

/*-------------------------------------------------------
 Continue Reading
-------------------------------------------------------*/

recent.continueReading=function(book){

    const items=load();

    return items.find(

        item=>item.book===book

    )||null;

};

/*-------------------------------------------------------
 All
-------------------------------------------------------*/

recent.all=function(){

    return load();

};

/*-------------------------------------------------------
 Remove
-------------------------------------------------------*/

recent.remove=function(book){

    save(

        load().filter(

            item=>item.book!==book

        )

    );

};

/*-------------------------------------------------------
 Clear
-------------------------------------------------------*/

recent.clear=function(){

    save([]);

};

/*-------------------------------------------------------
 Exists
-------------------------------------------------------*/

recent.has=function(book){

    return load().some(

        item=>item.book===book

    );

};

/*-------------------------------------------------------
 Last
-------------------------------------------------------*/

recent.last=function(){

    const items=load();

    return items.length

        ? items[0]

        : null;

};

/*-------------------------------------------------------
 Count
-------------------------------------------------------*/

recent.count=function(){

    return load().length;

};

return recent;

})();