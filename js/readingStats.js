"use strict";

/*
=========================================================

 SkyReader Reading Statistics

 Responsibilities

• Reading sessions
• Pages read
• Reading time
• Completed magazines
• Statistics

=========================================================
*/

window.ReadingStats=(function(){

const stats={};

const STORAGE_KEY="skyreader-reading-stats";

function load(){

    return Storage.get(STORAGE_KEY,{
        books:{},
        totals:{
            pagesRead:0,
            readingTime:0,
            sessions:0,
            completed:0
        }
    });

}

function save(data){

    Storage.set(STORAGE_KEY,data);

}

stats.beginSession=function(book,page){

    if(!book){

        return;
    }

    const data=load();

    if(!data.books[book]){

        data.books[book]={
            pagesRead:0,
            readingTime:0,
            lastPage:page,
            lastOpened:null,
            completed:false
        };

    }

    data.books[book].sessionStart=Date.now();

    data.books[book].lastOpened=
        new Date().toISOString();

    data.totals.sessions++;

    save(data);

};

stats.endSession=function(book,page,totalPages){

    if(!book){

        return;
    }

    const data=load();

    const entry=data.books[book];

    if(!entry){

        return;
    }

    if(entry.sessionStart){

        const minutes=

            Math.round(

                (Date.now()-entry.sessionStart)/60000

            );

        entry.readingTime+=minutes;

        data.totals.readingTime+=minutes;

        delete entry.sessionStart;

    }

    entry.lastPage=page;

    if(

        totalPages>0 &&

        page>=totalPages-1 &&

        !entry.completed

    ){

        entry.completed=true;

        data.totals.completed++;

    }

    save(data);

};

stats.pageRead=function(book,page){

    if(!book){

        return;
    }

    const data=load();

    const entry=data.books[book];

    if(!entry){

        return;
    }

    entry.pagesRead++;

    entry.lastPage=page;

    data.totals.pagesRead++;

    save(data);

};

stats.book=function(book){

    return load().books[book]||null;

};

stats.summary=function(){

    return load().totals;

};

stats.all=function(){

    return load();

};

stats.clear=function(){

    save({

        books:{},
        totals:{
            pagesRead:0,
            readingTime:0,
            sessions:0,
            completed:0
        }
    });

};

return stats;

})();