"use strict";

/*
=========================================================

 SkyReader Key/Value Store

 Responsibilities

- Generic per-key persistence (favorites, recent reading, etc.)
- JSON serialization over localStorage
- Deliberately NOT named "Storage" -- that name collides with
  the native browser Web Storage interface (window.Storage),
  which silently swallows calls like Storage.get() instead of
  throwing a clear "undefined" error.

=========================================================
*/

window.SRStore=(function(){

const store={};

store.get=function(key,fallback){

    try{

        const raw=localStorage.getItem(key);

        return raw===null ? fallback : JSON.parse(raw);

    }catch(e){

        console.warn("SRStore read failed for \""+key+"\".",e);

        return fallback;

    }

};

store.set=function(key,value){

    try{

        localStorage.setItem(key,JSON.stringify(value));

    }catch(e){

        console.warn("SRStore write failed for \""+key+"\".",e);

    }

};

return store;

})();