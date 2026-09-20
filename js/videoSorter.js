"use strict";

/*
=========================================================
 SkyVideoViewer Video Sorter / Filter

 Newest/Oldest use the material visibility/publication "date".
 dateAdd records upload provenance and is intentionally separate.

 Mirrors SkyReader's organization model while remaining
 independent of the Reader modules.
=========================================================
*/

window.VideoSorter=(function(){

const sorter={};

sorter.modes={
    ALPHABETICAL:"alphabetical",
    NEWEST:"newest",
    OLDEST:"oldest",
    CATEGORY:"category",
    RANDOM:"random",
    FAVORITES:"favorites",
    RECENT:"recent"
};

function copy(source){
    return Array.isArray(source) ? [...source] : (window.VideoLibrary&&VideoLibrary.getVideos ? [...VideoLibrary.getVideos()] : []);
}

function dateValue(value){
    const digits=String(value??"").replace(/[^0-9]/g,"");
    if(/^\d{12}$/.test(digits)) return Number(digits);
    if(/^\d{8,14}$/.test(digits)) return Number(digits);
    const parsed=Date.parse(String(value??""));
    return Number.isFinite(parsed)?parsed:0;
}

function title(video){ return String(video.title||""); }
function category(video){ return String(video.category||"Uncategorized").trim()||"Uncategorized"; }

sorter.categories=function(source){
    return [...new Set(copy(source).map(category))].sort((a,b)=>a.localeCompare(b));
};

sorter.recentIds=function(){
    try{
        const value=JSON.parse(localStorage.getItem("skyvideo-recent")||"[]");
        return Array.isArray(value)?value:[];
    }catch(e){ return []; }
};

sorter.filter=function(source,mode="all",cat="all"){
    let result=copy(source);
    if(cat && cat!=="all"){
        const needle=String(cat).toLowerCase();
        result=result.filter(video=>category(video).toLowerCase()===needle);
    }
    if(mode==="favorites") return result.filter(video=>window.VideoFavorites&&VideoFavorites.has(video.id));
    if(mode==="recent"){
        const ids=new Set(sorter.recentIds());
        return result.filter(video=>ids.has(video.id));
    }
    return result;
};

function random(source){
    const result=copy(source);
    if(result.length<2) return result;
    const first=result.shift();
    for(let i=result.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [result[i],result[j]]=[result[j],result[i]];
    }
    return [first,...result];
}

sorter.organize=function(options={}){
    const filtered=sorter.filter(options.videos,options.filter||"all",options.category||"all");
    const mode=options.sort||sorter.modes.ALPHABETICAL;
    if(mode===sorter.modes.RANDOM) return random(filtered);
    if(mode===sorter.modes.FAVORITES) return (window.VideoFavorites?VideoFavorites.videos(filtered):[]);
    if(mode===sorter.modes.RECENT){
        const order=sorter.recentIds();
        const rank=new Map(order.map((id,index)=>[id,index]));
        return filtered.sort((a,b)=>(rank.get(a.id)??999999)-(rank.get(b.id)??999999));
    }
    return filtered.sort((a,b)=>{
        if(mode===sorter.modes.NEWEST) return dateValue(b.date)-dateValue(a.date)||title(a).localeCompare(title(b));
        if(mode===sorter.modes.OLDEST) return dateValue(a.date)-dateValue(b.date)||title(a).localeCompare(title(b));
        if(mode===sorter.modes.CATEGORY) return category(a).localeCompare(category(b))||title(a).localeCompare(title(b));
        return title(a).localeCompare(title(b));
    });
};

sorter.displayNames={
    alphabetical:"Alphabetical",
    newest:"Newest",
    oldest:"Oldest",
    category:"Category",
    random:"Random",
    recent:"Recently Viewed",
    favorites:"Favorites"
};

sorter.available=function(){ return Object.values(sorter.modes); };
sorter.defaultMode=function(){ return sorter.modes.ALPHABETICAL; };

return sorter;

})();
