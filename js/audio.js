"use strict";

window.AudioController=(function(){
    const audio={};
    const sounds=new Map();
    let masterVolume=0.35;
    let muted=false;
    let unlocked=false;
    const listeners=new Map();

    class AudioPool{
        constructor(url,size=3,volumeScale=1){
            this.url=url;
            this.size=size;
            this.volumeScale=Math.max(0,Math.min(1,Number(volumeScale)||0));
            this.index=0;
            this.players=[];
            this.failed=false;
            this.ready=false;
            this.readyPromise=this.build();
        }
        build(){
            if(!this.url){ this.failed=true; return Promise.resolve(false); }
            let remaining=this.size;
            let settled=false;
            return new Promise(resolve=>{
                const finish=(ok)=>{
                    if(settled)return;
                    settled=true;
                    this.ready=!!ok;
                    if(!ok)this.failed=true;
                    resolve(!!ok);
                };
                for(let i=0;i<this.size;i++){
                    const p=new Audio();
                    p.preload="auto";
                    p.src=this.url;
                    p.volume=masterVolume*this.volumeScale;
                    p.addEventListener("canplaythrough",()=>finish(true),{once:true});
                    p.addEventListener("canplay",()=>finish(true),{once:true});
                    p.addEventListener("loadeddata",()=>finish(true),{once:true});
                    p.addEventListener("error",()=>{ remaining--; if(remaining<=0)finish(false); },{once:true});
                    this.players.push(p);
                    try{p.load();}catch(e){remaining--; if(remaining<=0)finish(false);}
                }
                // Never block app startup forever if a browser keeps the preload pending.
                setTimeout(()=>finish(this.players.some(p=>p.readyState>=2)),4000);
            });
        }
        next(){ const p=this.players[this.index]; this.index=(this.index+1)%Math.max(1,this.players.length); return p; }
        preload(){ this.players.forEach(p=>{try{p.load();}catch(e){}}); return this.readyPromise; }
        play(){
            if(muted || this.failed || !this.players.length)return false;
            const p=this.next();
            try{
                p.pause();
                p.currentTime=0;
                p.volume=masterVolume*this.volumeScale;
                const result=p.play();
                if(result&&typeof result.catch==='function')result.catch(()=>{});
                return true;
            }catch(e){return false;}
        }
        stop(){this.players.forEach(p=>{try{p.pause();p.currentTime=0;}catch(e){}});}
        setVolume(v){this.players.forEach(p=>p.volume=v*this.volumeScale);}
    }

    function emit(event,data){const list=listeners.get(event);if(list)list.forEach(fn=>{try{fn(data);}catch(e){}});}
    audio.register=function(name,url,poolSize=3,volumeScale=1){if(!name||!url)return false;sounds.set(name,new AudioPool(url,poolSize,volumeScale));return true;};
    audio.play=function(name){const pool=sounds.get(name);return pool?pool.play():false;};
    audio.preload=function(){return Promise.allSettled(Array.from(sounds.values(),pool=>pool.preload()));};
    audio.ready=function(name){const pool=sounds.get(name);return pool?pool.readyPromise:Promise.resolve(false);};
    audio.has=function(name){return sounds.has(name);};
    audio.available=audio.has;
    audio.list=function(){return Array.from(sounds.keys());};
    audio.stop=function(name){const pool=sounds.get(name);if(pool)pool.stop();};
    audio.stopAll=function(){sounds.forEach(pool=>pool.stop());};
    audio.pauseAll=function(){sounds.forEach(pool=>pool.players.forEach(p=>p.pause()));};
    audio.resumeAll=function(){};
    audio.setVolume=function(v){masterVolume=Math.max(0,Math.min(1,v));sounds.forEach(pool=>pool.setVolume(masterVolume));};
    audio.volume=function(){return masterVolume;};
    audio.mute=function(){muted=true;audio.stopAll();};
    audio.unmute=function(){muted=false;};
    audio.toggleMute=function(){muted=!muted;if(muted)audio.stopAll();return muted;};
    audio.isMuted=function(){return muted;};
    audio.on=function(event,fn){if(!listeners.has(event))listeners.set(event,[]);listeners.get(event).push(fn);};
    audio.off=function(event,fn){const a=listeners.get(event);if(!a)return;const i=a.indexOf(fn);if(i>=0)a.splice(i,1);};
    audio.emit=emit;

    // Strict production mapping: one action, one sound, no fallback substitution.
    const SELECT_VOLUME_SCALE=0.5;
    audio.register("bookSelect","assets/audio/select.mp3",3,SELECT_VOLUME_SCALE);
    audio.register("pageCurl","assets/audio/pagecurl.mp3",3,1);
    // Page-turn variation: three short preloaded pools. Two players per clip
    // preserve overlap for rapid flipping without creating Audio objects per turn.
    const PAGE_TURN_SOUNDS=["pageTurn1","pageTurn2","pageTurn3"];
    let lastPageTurnSound=-1;
    audio.register("pageTurn1","assets/audio/pageturn.mp3",2,1);
    audio.register("pageTurn2","assets/audio/pageturn2.mp3",2,1);
    audio.register("pageTurn3","assets/audio/pageturn3.mp3",2,1);
    audio.register("bookClose","assets/audio/close.mp3",2,1);
    audio.register("libraryOpen","assets/audio/open.mp3",2,1);

    audio.playSelect=function(){return audio.play("bookSelect");};
    audio.playPageCurl=function(){ return audio.play("pageCurl"); };
    audio.playPageTurn=function(){
        // Randomize the clip while avoiding an immediate repeat when 3 clips exist.
        let index=Math.floor(Math.random()*PAGE_TURN_SOUNDS.length);
        if(PAGE_TURN_SOUNDS.length>1 && index===lastPageTurnSound){
            index=(index+1+Math.floor(Math.random()*(PAGE_TURN_SOUNDS.length-1)))%PAGE_TURN_SOUNDS.length;
        }
        lastPageTurnSound=index;
        return audio.play(PAGE_TURN_SOUNDS[index]);
    };
    audio.playBookClose=function(){return audio.play("bookClose");};
    audio.playOpen=function(){return audio.play("libraryOpen");};
    audio.pageTurn=function(direction,mode="desktop"){audio.playPageTurn(mode);emit("pageTurn",{direction,mode,time:performance.now()});};
    audio.readerOpened=function(book){emit("readerOpened",book);};
    audio.readerClosed=function(){emit("readerClosed");};
    audio.pageChanged=function(page){emit("pageChanged",page);};
    audio.initialize=function(){audio.preload();};
    audio.version="1.1.1";

    function unlock(){
        if(unlocked)return;
        unlocked=true;
        // The same first trusted interaction that unlocks browser audio also reasserts preload.
        audio.preload();
    }
    ["pointerdown","touchstart","keydown"].forEach(type=>window.addEventListener(type,unlock,{once:true,passive:true}));
    audio.initialize();
    return audio;
})();
