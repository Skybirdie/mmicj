"use strict";

window.SlideshowFavorites = (function () {
    const KEY = "skyslideshow-favorites";
    function load() {
        try {
            const value = JSON.parse(localStorage.getItem(KEY) || "[]");
            return Array.isArray(value) ? [...new Set(value)] : [];
        } catch (e) { return []; }
    }
    function save(ids) {
        try { localStorage.setItem(KEY, JSON.stringify([...new Set(ids)])); } catch (e) {}
    }
    return {
        ids: () => load(),
        has: id => load().includes(id),
        add(id) { if (!id) return; const ids=load(); if(!ids.includes(id)){ids.push(id);save(ids);} },
        remove(id) { save(load().filter(x => x !== id)); },
        toggle(id) { if(this.has(id)){this.remove(id);return false;} this.add(id);return true; },
        videos(source) { const ids=new Set(load()); return (Array.isArray(source)?source:[]).filter(x=>ids.has(x.id)); }
    };
})();
