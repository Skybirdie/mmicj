"use strict";

/*
=========================================================
 SkyReader Video Recent

 Persists the most recently opened video, mirroring the
 Reader's Read Again behavior without coupling video state
 to magazine reading state.
=========================================================
*/

window.VideoRecent=(function(){

const KEY="skyreader-video-recent";

function get(){
    return SRStore.get(KEY,null);
}

function set(video){
    const id=typeof video === "string" ? video : video?.id;
    if(id)SRStore.set(KEY,{id:id});
}

function clear(){
    SRStore.set(KEY,null);
}

function getVideo(source=[]){
    const recent=get();
    if(!recent || !recent.id || !Array.isArray(source))return null;
    return source.find(video=>video && video.id===recent.id) || null;
}

return {get,set,clear,getVideo};

})();
