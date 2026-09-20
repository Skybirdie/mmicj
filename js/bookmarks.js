"use strict";

/* =========================================================
   SkyReader Bookmarks
   Persistent bookmarks keyed by stable book ID and 1-based page number.
========================================================= */
window.Bookmarks=(function(){
const bookmarks={};
const KEY="skyreader-bookmarks";

function load(){
    const data=SRStore.get(KEY,[]);
    return Array.isArray(data) ? data : [];
}
function save(data){ SRStore.set(KEY,data); }
function bookId(book){
    if(book && typeof book==="object") return String(book.id ?? "").trim();
    return String(book ?? "").trim();
}
function pageNumber(page){
    const value=Math.floor(Number(page));
    return Number.isFinite(value) && value>=1 ? value : 1;
}
function same(item,id,page){ return String(item.bookId ?? item.book ?? "")===id && Number(item.page)===page; }

bookmarks.add=function(book,page){
    const id=bookId(book);
    if(!id) return null;
    const number=pageNumber(page);
    const data=load();
    const existing=data.find(item=>same(item,id,number));
    if(existing) return existing;
    const item={
        id:"bm_"+Date.now()+"_"+Math.random().toString(36).slice(2,8),
        bookId:id,
        page:number,
        created:new Date().toISOString()
    };
    data.push(item);
    save(data);
    return item;
};

bookmarks.remove=function(id){
    const before=load();
    const data=before.filter(item=>String(item.id)!==String(id));
    save(data);
    return data.length!==before.length;
};

bookmarks.has=function(book,page){
    const id=bookId(book);
    if(!id) return false;
    return load().some(item=>same(item,id,pageNumber(page)));
};

bookmarks.forBook=function(book){
    const id=bookId(book);
    if(!id) return [];
    return load()
        .filter(item=>String(item.bookId ?? item.book ?? "")===id)
        .sort((a,b)=>Number(a.page)-Number(b.page));
};

bookmarks.all=function(){ return load(); };
bookmarks.clear=function(){ save([]); };
return bookmarks;
})();
