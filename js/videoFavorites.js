"use strict";

/*
=========================================================
 SkyVideoViewer Favorites

 Persistent favorites for videos. Kept separate from the
 SkyReader magazine favorites store.
=========================================================
*/

window.VideoFavorites=(function(){

const KEY="skyvideo-favorites";

function load(){
    try{
        const value=JSON.parse(localStorage.getItem(KEY)||"[]");
        return Array.isArray(value) ? [...new Set(value)] : [];
    }catch(e){
        console.warn("VideoFavorites read failed.",e);
        return [];
    }
}

function save(ids){
    try{ localStorage.setItem(KEY,JSON.stringify([...new Set(ids)])); }
    catch(e){ console.warn("VideoFavorites write failed.",e); }
}

const api={};

api.ids=function(){ return load(); };
api.has=function(id){ return load().includes(id); };
api.add=function(id){ if(!id)return; const ids=load(); if(!ids.includes(id)){ids.push(id);save(ids);} };
api.remove=function(id){ save(load().filter(item=>item!==id)); };
api.toggle=function(id){ if(api.has(id)){api.remove(id);return false;} api.add(id);return true; };
api.count=function(){ return load().length; };
api.clear=function(){ save([]); };
api.videos=function(source){
    const ids=new Set(load());
    const list=Array.isArray(source) ? source : (window.VideoLibrary&&VideoLibrary.getVideos ? VideoLibrary.getVideos() : []);
    return list.filter(video=>ids.has(video.id));
};

return api;

})();
