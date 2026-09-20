"use strict";

/*
=========================================================
 Sky Slide Show Transition Registry

 All slide changes go through this registry. New transitions
 can later be added without changing the viewer's navigation
 or playback logic.
=========================================================
*/
window.SlideshowTransitions=(function(){
    const registry={};
    let active="fade";
    function register(name,transition){if(name&&typeof transition==="function")registry[name]=transition;}
    function set(name){if(registry[name])active=name;return active;}
    function current(){return active;}
    function names(){return Object.keys(registry);}
    function run(context){
        const fn=registry[active]||registry.fade;
        return fn(context);
    }
    register("fade",({stage,oldSlide,newSlide,done})=>{
        if(!newSlide){done&&done();return;}
        newSlide.style.opacity="0"; newSlide.classList.add("is-transitioning-in");
        if(oldSlide) oldSlide.classList.add("is-transitioning-out");
        requestAnimationFrame(()=>{
            if(oldSlide) oldSlide.style.opacity="0";
            newSlide.style.opacity="1";
        });
        window.setTimeout(()=>{
            if(oldSlide){oldSlide.remove();}
            newSlide.classList.remove("is-transitioning-in");
            newSlide.style.opacity="1";
            done&&done();
        },430);
    });
    return {register,set,current,names,run};
})();
