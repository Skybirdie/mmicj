"use strict";
/* Newest/Oldest use the material visibility/publication "date"; dateAdd is upload provenance. */
window.SlideshowSorter = (function () {
    const modes = { ALPHABETICAL:"alphabetical", NEWEST:"newest", OLDEST:"oldest", CATEGORY:"category", RANDOM:"random", RECENT:"recent", FAVORITES:"favorites" };
    const copy = source => Array.isArray(source) ? [...source] : [];
    const dateValue = value => { const digits=String(value??"").replace(/[^0-9]/g,""); if(/^\d{8,14}$/.test(digits)) return Number(digits); const parsed=Date.parse(String(value??"")); return Number.isFinite(parsed)?parsed:0; };
    const category = x => String(x.category||"Uncategorized").trim()||"Uncategorized";
    const title = x => String(x.title||"");
    const searchable = x => [x.title,x.subtitle,x.category,x.author,x.id,...(x.slides||[]).flatMap(s=>[s.title,s.caption])].filter(Boolean).join(" ").toLowerCase();
    function categories(source){return [...new Set(copy(source).map(category))].sort((a,b)=>a.localeCompare(b));}
    function recentValue(x){ try { return Number(localStorage.getItem("skyslideshow-recent:"+x.id)||0); } catch(e){ return 0; } }
    function organize(options={}){
        let result=copy(options.slideshows);
        const filter=options.filter||"all", cat=options.category||"all", search=String(options.search||"").toLowerCase();
        if(cat!=="all") result=result.filter(x=>category(x).toLowerCase()===String(cat).toLowerCase());
        if(filter==="favorites") result=result.filter(x=>window.SlideshowFavorites&&SlideshowFavorites.has(x.id));
        if(search) result=result.filter(x=>searchable(x).includes(search));
        const mode=options.sort||modes.ALPHABETICAL;
        if(mode===modes.FAVORITES) result=result.filter(x=>window.SlideshowFavorites&&SlideshowFavorites.has(x.id));
        else if(mode===modes.RANDOM){for(let i=result.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}}
        else result.sort((a,b)=>{
            if(mode===modes.NEWEST)return dateValue(b.date)-dateValue(a.date)||title(a).localeCompare(title(b));
            if(mode===modes.OLDEST)return dateValue(a.date)-dateValue(b.date)||title(a).localeCompare(title(b));
            if(mode===modes.CATEGORY)return category(a).localeCompare(category(b))||title(a).localeCompare(title(b));
            if(mode===modes.RECENT)return recentValue(b)-recentValue(a)||title(a).localeCompare(title(b));
            return title(a).localeCompare(title(b));
        });
        return result;
    }
    return {modes,categories,organize,available:()=>Object.values(modes)};
})();
