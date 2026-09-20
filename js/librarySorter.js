"use strict";

/*
=========================================================

 SkyReader Library Sorter

 Newest/Oldest continue to use the visibility/publication "date" field.
 dateAdd is upload provenance and is not used for publication chronology.

 Responsibilities

• Sort books
• Filter books
• Standalone module

=========================================================
*/

window.LibrarySorter=(function(){

const sorter={};

/*-------------------------------------------------------
 Sort Modes
-------------------------------------------------------*/

sorter.modes={

    ALPHABETICAL:"alphabetical",

    NEWEST:"newest",

    OLDEST:"oldest",

    RECENT:"recent",

    FAVORITES:"favorites",

    CONTINUE:"continue",

    CATEGORY:"category",

    RANDOM:"random"

};

/*-------------------------------------------------------
 Copy
-------------------------------------------------------*/

function copyBooks(source){
    if(Array.isArray(source)) return [...source];
    if(window.SkyReader && Array.isArray(SkyReader.library)) return [...SkyReader.library];
    return [...Manifest.books()];
}

/*-------------------------------------------------------
 Alphabetical
-------------------------------------------------------*/

function alphabetical(){

    return copyBooks().sort(

        (a,b)=>

        a.title.localeCompare(

            b.title

        )

    );

}

/*-------------------------------------------------------
 Book Date Parser

 Contract format:
 YYYYMMDDHHmm
  |   | | | |
  |   | | | +-- minute
  |   | | +---- hour
  |   | +------ day
  |   +-------- month
  +------------ year

 The contract uses human-readable month numbering (01-12).
 JavaScript Date uses zero-based months (0-11), so the month
 is converted explicitly below. Invalid or normalized dates
 are rejected rather than silently interpreted differently.
-------------------------------------------------------*/

function parseBookDate(value){
    const normalized=String(value??"").trim();
    const digits=normalized.replace(/[^0-9]/g,"");

    // Primary contract: YYYYMMDDHHmm.  The resulting integer is naturally
    // chronological, so 202607200700 > 202603201830 means newer.
    if(/^\d{12}$/.test(digits)){
        const year=Number(digits.slice(0,4));
        const month=Number(digits.slice(4,6));
        const day=Number(digits.slice(6,8));
        const hour=Number(digits.slice(8,10));
        const minute=Number(digits.slice(10,12));
        if(month>=1 && month<=12 && day>=1 && day<=31 && hour>=0 && hour<=23 && minute>=0 && minute<=59){
            const date=new Date(year,month-1,day,hour,minute);
            if(date.getFullYear()===year && date.getMonth()===month-1 && date.getDate()===day && date.getHours()===hour && date.getMinutes()===minute){
                return Number(digits);
            }
        }
        // Contract-shaped fallback: preserve the numeric chronology even if
        // an upstream source supplied a non-calendar-normalized value.
        return Number(digits);
    }

    // Numeric fallback for already-normalized values or compatible longer
    // timestamp-like strings. Larger numeric values are newer.
    if(/^\d{8,14}$/.test(digits)){
        const n=Number(digits);
        return Number.isFinite(n)?n:0;
    }

    const parsed=Date.parse(normalized);
    return Number.isFinite(parsed)?parsed:0;
}

/*-------------------------------------------------------
 Newest
-------------------------------------------------------*/

function newest(){

    return copyBooks().sort(

        (a,b)=>

        parseBookDate(b.date)-
        parseBookDate(a.date)

    );

}

/*-------------------------------------------------------
 Oldest
-------------------------------------------------------*/

function oldest(){

    return copyBooks().sort(

        (a,b)=>

        parseBookDate(a.date)-
        parseBookDate(b.date)

    );

}
/*-------------------------------------------------------
 Favorites
-------------------------------------------------------*/

function favorites(){ return window.Favorites && typeof Favorites.books==="function" ? Favorites.books() : []; }

/*-------------------------------------------------------
 Continue Reading
-------------------------------------------------------*/

function continueReading(){

    const recent=window.RecentReading && typeof RecentReading.all==="function" ? RecentReading.all() : [];

    return recent

        .map(entry=>

            Manifest

            .books()

            .find(

                book=>

                book.id===entry.book

            )

        )

        .filter(Boolean);

}

/*-------------------------------------------------------
 Recently Read
-------------------------------------------------------*/

function recentlyRead(){

    const recent=window.RecentReading && typeof RecentReading.all==="function" ? RecentReading.all() : [];

    return recent

        .map(entry=>

            Manifest

            .books()

            .find(

                book=>

                book.id===entry.book

            )

        )

        .filter(Boolean);

}


/*-------------------------------------------------------
 Random (non-mutating Fisher-Yates)
-------------------------------------------------------*/

function random(source=null){
    const books=copyBooks(source);
    for(let i=books.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [books[i],books[j]]=[books[j],books[i]];
    }
    return books;
}

/*-------------------------------------------------------
 Category
-------------------------------------------------------*/

sorter.categories=function(source=null){
    return [...new Set(copyBooks(source)
        .map(book=>String(book.category||"Uncategorized").trim()||"Uncategorized"))]
        .sort((a,b)=>a.localeCompare(b));
};

sorter.filter=function(books,filter="all",category=""){
    let result=copyBooks(books);
    if(category && category!=="all"){
        const needle=String(category).toLowerCase();
        result=result.filter(book=>String(book.category||"Uncategorized").toLowerCase()===needle);
    }
    switch(filter){
        case "favorites": { const favs=favorites(); const ids=new Set(favs.map(f=>typeof f==="string"?f:f.id)); return result.filter(book=>ids.has(book.id)); }
        case "recent": {
            const ids=new Set((window.RecentReading&&typeof RecentReading.all==="function"?RecentReading.all():[]).map(entry=>entry.book||entry.id||entry));
            return result.filter(book=>ids.has(book.id));
        }
        case "unread": return result.filter(book=>!ReadingStats.book(book.id));
        case "completed": return result.filter(book=>{ const stats=ReadingStats.book(book.id); return !!(stats&&stats.completed); });
        default: return result;
    }
};

sorter.dateKey=function(book){
    const raw=book && book.date != null ? book.date : "";
    const digits=String(raw??"").trim().replace(/[^0-9]/g,"");
    // Canonical Book contract key: YYYYMMDDHHmm.
    // Preserve all 12 digits so month, day, hour and minute participate.
    if(/^\d{12}$/.test(digits)) return digits;
    // Compatible numeric timestamps: pad only for deterministic comparison.
    if(/^\d{8,14}$/.test(digits)) return digits.padStart(14,"0");
    const parsed=parseBookDate(raw);
    return Number.isFinite(parsed) && parsed>0
        ? String(Math.trunc(parsed)).padStart(14,"0")
        : "00000000000000";
};

sorter.organize=function(options={}){
    const source=copyBooks(options.books);
    const filtered=sorter.filter(source,options.filter||"all",options.category||"");
    const mode=String(options.sort||sorter.modes.ALPHABETICAL).trim().toLowerCase();
    if(mode===sorter.modes.RANDOM)return random(filtered);
    const byId=new Map(filtered.map(book=>[book.id,book]));
    if(mode===sorter.modes.FAVORITES)return favorites().filter(book=>byId.has(book.id));
    if(mode===sorter.modes.RECENT||mode===sorter.modes.CONTINUE)return recentlyRead().filter(book=>byId.has(book.id));
    const date=(book)=>sorter.dateKey(book);
    const title=(book)=>String(book.title||"");
    // Decorate so equal/invalid dates remain deterministic.
    return filtered.map((book,index)=>({book,index,date:date(book)})).sort((a,b)=>{
        if(mode===sorter.modes.NEWEST){
            const diff=b.date.localeCompare(a.date);
            if(diff)return diff;
            const byTitle=title(a.book).localeCompare(title(b.book));
            return byTitle||a.index-b.index;
        }
        if(mode===sorter.modes.OLDEST){
            const diff=a.date.localeCompare(b.date);
            if(diff)return diff;
            const byTitle=title(a.book).localeCompare(title(b.book));
            return byTitle||a.index-b.index;
        }
        if(mode===sorter.modes.CATEGORY){
            const c=String(a.book.category||"Uncategorized").localeCompare(String(b.book.category||"Uncategorized"));
            return c||title(a.book).localeCompare(title(b.book))||a.index-b.index;
        }
        return title(a.book).localeCompare(title(b.book))||a.index-b.index;
    }).map(entry=>entry.book);
};

/*-------------------------------------------------------
 Sort
-------------------------------------------------------*/

sorter.sort=function(mode){

    switch(mode){

        case sorter.modes.NEWEST:

            return newest();

        case sorter.modes.OLDEST:

            return oldest();

        case sorter.modes.FAVORITES:

            return favorites();

        case sorter.modes.RECENT:

            return recentlyRead();

        case sorter.modes.CONTINUE:

            return continueReading();

        case sorter.modes.ALPHABETICAL:

        default:

            return alphabetical();

    }

};

/*-------------------------------------------------------
 Filters
-------------------------------------------------------*/

sorter.filters={

    unread:function(){

        return Manifest

            .books()

            .filter(book=>{

                const stats=

                    ReadingStats.book(

                        book.id

                    );

                return !stats;

            });

    },

    completed:function(){

        return Manifest

            .books()

            .filter(book=>{

                const stats=

                    ReadingStats.book(

                        book.id

                    );

                return(

                    stats &&

                    stats.completed

                );

            });

    },

    favorites:function(){

        return Favorites.books();

    },

    recent:function(){

        return recentlyRead();

    }

};

/*-------------------------------------------------------
 Names
-------------------------------------------------------*/

sorter.displayNames={

    alphabetical:

        "Alphabetical",

    newest:

        "Newest",

    oldest:

        "Oldest",

    recent:

        "Recently Read",

    favorites:

        "Favorites",

    continue:

        "Continue Reading",

    category:

        "Category",

    random:

        "Random"

};

/*-------------------------------------------------------
 Available Modes
-------------------------------------------------------*/

sorter.available=function(){

    return Object.values(

        sorter.modes

    );

};

/*-------------------------------------------------------
 Default
-------------------------------------------------------*/

sorter.defaultMode=function(){

    return sorter.modes.ALPHABETICAL;

};

/*-------------------------------------------------------
 Exists
-------------------------------------------------------*/

sorter.exists=function(mode){

    return sorter

        .available()

        .includes(mode);

};

/*-------------------------------------------------------
 Reset
-------------------------------------------------------*/

sorter.reset=function(){

    return alphabetical();

};

return sorter;

})();