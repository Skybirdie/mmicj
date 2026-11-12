"use strict";

/*=======================================================
  SOUND CHECK - one button in Settings ("Test sounds")

  Tapping it runs everything by itself (about 8 seconds) and builds a report the
  reader can copy and send, like the speech check does for read aloud:
    1. Device     browser, mute, volume, autoplay policy, audio session
    2. Files      EVERY app sound and the slideshow effect, played silently: proves the file
                  is there, decodes and plays, and that the app's own preload worked
    3. Music      the slideshow music list and each track (silent, only the first moments)
    4. Audible    a page turn through the app's own sound code, three quick turns
                  (overlap), and the slideshow effect started without a tap
                  (that is how the slideshow plays it, and some phones refuse it)
    5. The reader answers one question: "Did you hear the sounds?"
  Nothing is sent anywhere; the only request beyond the sound files is the small
  slideshow music list, which the slideshow itself also reads. Static files only.

  Where each sound is used, and the slideshow files, are listed in docs/sound-test.md.
  If a sound is added in js/audio.js it is picked up automatically (AudioController.info()).
  The slideshow constants below must match js/slideshowViewer.js (soundCheck.test.mjs checks).
=======================================================*/

window.SoundCheck=(function(){
    const api={};
    const SLIDE={
        effect:"assets/audio/slide.mp3",
        fallback:"assets/audio/pageturn.mp3",
        musicManifest:"assets/slideshowMusic/manifest.json",
        musicDir:"assets/slideshowMusic/"
    };
    const NOTE="please check device or external speaker volumes separately";
    const STAGES=[
        ["device","Device"],
        ["files","Sound files"],
        ["music","Slideshow music"],
        ["turn","Page turn (audible)"],
        ["flips","Quick page turns"],
        ["slide","Slideshow effect"]
    ];

    let S=null,box=null,running=false,lastReport="";
    const AC=()=>window.AudioController;
    const esc=s=>String(s==null?"":s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
    const sleep=ms=>new Promise(r=>setTimeout(r,ms));
    const now=()=>(window.performance&&performance.now)?performance.now():Date.now();
    const errName=e=>e&&e.name&&e.name!=="Error"?e.name:(e&&e.message?e.message:String(e||"error"));
    function mediaErr(a){const c=a&&a.error?a.error.code:0;return ({1:"aborted",2:"network error",3:"could not decode",4:"file missing or not supported"})[c]||"error";}
    function refused(e){return errName(e)==="NotAllowedError"?"blocked by the browser (NotAllowedError)":errName(e);}

    /*---------- device ----------*/
    function collectEnv(){
        const nav=navigator,e={};
        e.time=new Date().toISOString();
        e.ua=String(nav.userAgent||"unknown");
        e.lang=String(nav.language||"unknown");
        e.secure=typeof window.isSecureContext==="boolean"?window.isSecureContext:"unknown";
        e.online=typeof nav.onLine==="boolean"?nav.onLine:"unknown";
        try{e.standalone=!!(nav.standalone||(window.matchMedia&&window.matchMedia("(display-mode: standalone)").matches));}catch(x){e.standalone="unknown";}
        e.apple=/iPhone|iPad|iPod/.test(e.ua)||(/Macintosh/.test(e.ua)&&(nav.maxTouchPoints||0)>1);
        try{e.mp3=new Audio().canPlayType("audio/mpeg")||"no";}catch(x){e.mp3="unknown";}
        try{const a=new Audio();a.volume=0.5;e.volumeSettable=(a.volume===0.5);}catch(x){e.volumeSettable="unknown";}
        try{const C=window.AudioContext||window.webkitAudioContext;if(C){const c=new C();e.context=c.state;try{c.close();}catch(x){}}else e.context="not supported";}catch(x){e.context="error: "+errName(x);}
        try{e.autoplay=nav.getAutoplayPolicy?nav.getAutoplayPolicy("mediaelement"):"not reported";}catch(x){e.autoplay="not reported";}
        try{e.audioSession=nav.audioSession?String(nav.audioSession.type):"not reported";}catch(x){e.audioSession="not reported";}
        try{e.visible=document.visibilityState||"unknown";}catch(x){e.visible="unknown";}
        const a=AC();
        e.appCode=a?("v"+(a.version||"?")):"NOT LOADED";
        e.muted=a&&a.isMuted?!!a.isMuted():"unknown";
        e.volume=a&&a.volume?Math.round(a.volume()*100):"unknown";
        return e;
    }

    /*---------- a file, played silently ----------*/
    function silentProbe(url,timeoutMs){
        return new Promise(resolve=>{
            let done=false;const t0=now();
            const a=new Audio();
            const fin=r=>{
                if(done)return;done=true;clearTimeout(tm);
                try{a.pause();a.removeAttribute("src");a.load();}catch(x){}
                r.ms=Math.round(now()-t0);resolve(r);
            };
            const tm=setTimeout(()=>fin({ok:false,err:"timed out after "+Math.round((timeoutMs||8000)/1000)+" s"}),timeoutMs||8000);
            const dur=()=>isFinite(a.duration)?+a.duration.toFixed(2):null;
            a.muted=true;a.preload="auto";
            a.addEventListener("error",()=>fin({ok:false,err:mediaErr(a)}));
            a.addEventListener("timeupdate",()=>{if(a.currentTime>0.05)fin({ok:true,duration:dur()});});
            a.addEventListener("ended",()=>fin({ok:true,duration:dur()}));
            try{
                a.src=url;
                const p=a.play();
                if(p&&p.catch)p.catch(e=>{
                    if(errName(e)==="NotAllowedError"){
                        /* this device does not allow even silent play without a tap: at least prove the file decodes */
                        if(a.readyState>=1)fin({ok:true,duration:dur(),note:"decodes (silent play not allowed here)"});
                        else a.addEventListener("loadedmetadata",()=>fin({ok:true,duration:dur(),note:"decodes (silent play not allowed here)"}),{once:true});
                    }else fin({ok:false,err:a.error?mediaErr(a):(errName(e)==="NotSupportedError"?"file missing or not supported":errName(e))});
                });
            }catch(x){fin({ok:false,err:errName(x)});}
        });
    }

    /* the slideshow's own way of playing its effect: a fresh player, full volume, falls back to pageturn.mp3 */
    function playSlide(){
        return new Promise(resolve=>{
            const t0=now();
            const a=new Audio(SLIDE.effect);a.volume=1;
            let p;try{p=a.play();}catch(x){p=null;}
            if(p&&p.then){
                p.then(()=>resolve({ok:true,ms:Math.round(now()-t0)}),e=>{
                    const why=refused(e);
                    const b=new Audio(SLIDE.fallback);b.volume=1;
                    b.play().then(()=>resolve({ok:false,err:why,fallbackOk:true}),e2=>resolve({ok:false,err:why,fallbackOk:false,fallbackErr:refused(e2)}));
                });
            }else resolve({ok:true,ms:Math.round(now()-t0)});
        });
    }

    /*---------- stages ----------*/
    function setStage(key,st,text){S.stage[key]={st:st,text:text};render();}

    async function stageDevice(){
        const e=S.env,bad=[];
        if(!AC())bad.push("the app's sound code did not load");
        else{
            if(e.muted===true)bad.push("sounds are switched off in Settings (Page-turn sound)");
            if(e.volume===0)bad.push("sound volume is at 0");
        }
        const line=(e.ua.length>60?e.ua.slice(0,60)+"...":e.ua);
        /* the browser can only see the app's own volume setting, never the device's or an external speaker's */
        const vol=e.volumeSettable===false?"This device ignores the app's sound volume ("+NOTE+")":"App sound volume "+e.volume+"% ("+NOTE+")";
        setStage("device",bad.length?"bad":"ok",bad.length?bad.join("; "):"Sound on. "+vol+". "+line);
    }

    async function stageFiles(){
        const a=AC();
        if(!a||!a.info){S.files=[];setStage("files","bad",a?"js/audio.js is too old for this check":"the app's sound code did not load");return;}
        const info=a.info();
        const items=info.map(i=>({name:i.name,url:i.url,pool:{ready:i.ready,failed:i.failed}}))
            .concat([{name:"slideEffect",url:SLIDE.effect,slide:true},{name:"slideFallback",url:SLIDE.fallback,slide:true}]);
        setStage("files","wait","Testing "+items.length+" files...");
        await Promise.all(items.map(async it=>{it.probe=await silentProbe(it.url,8000);}));
        /* read the app's own preload state again now: it may have finished while the files were being tested */
        const after=a.info();
        items.forEach(it=>{const m=after.find(x=>x.name===it.name);if(m&&!it.slide)it.pool={ready:m.ready,failed:m.failed};});
        S.files=items;
        const bad=items.filter(i=>!i.probe.ok),poolBad=items.filter(i=>i.pool&&i.pool.failed);
        const parts=[];
        parts.push((items.length-bad.length)+" of "+items.length+" play silently");
        if(poolBad.length)parts.push("the app's own preload failed: "+poolBad.map(i=>i.name).join(", "));
        if(bad.length)parts.push("file problem: "+bad.map(i=>i.name+" ("+i.probe.err+")").join(", "));
        setStage("files",bad.length||poolBad.length?"bad":"ok",parts.join("; "));
    }

    async function stageMusic(){
        setStage("music","wait","Reading the track list...");
        let list=null;
        try{
            const res=await fetch(SLIDE.musicManifest,{cache:"no-store"});
            if(!res.ok)throw new Error("HTTP "+res.status);
            const j=await res.json();
            if(!Array.isArray(j)||!j.length)throw new Error("the list is empty");
            list=j.map(x=>typeof x==="string"?x:(x&&x.file)).filter(Boolean);
        }catch(e){S.music={err:errName(e),tracks:[]};setStage("music","bad","the track list could not be read ("+errName(e)+"): the slideshow's Music mode would have no tracks");return;}
        const tracks=list.map(f=>({file:f}));
        setStage("music","wait","Testing "+tracks.length+" tracks...");
        await Promise.all(tracks.map(async t=>{t.probe=await silentProbe(SLIDE.musicDir+t.file,12000);}));
        S.music={tracks:tracks};
        const bad=tracks.filter(t=>!t.probe.ok);
        setStage("music",bad.length?"bad":"ok",(tracks.length-bad.length)+" of "+tracks.length+" tracks play"+(bad.length?"; problem: "+bad.map(t=>t.file+" ("+t.probe.err+")").join(", "):""));
    }

    async function stageAudible(){
        const a=AC();
        const muted=!a||(a.isMuted&&a.isMuted());
        if(muted||!a.playChecked){
            const why=!a?"the app's sound code did not load":muted?"skipped: app sounds are switched off":"js/audio.js is too old for this check";
            setStage("turn","bad",why);setStage("flips","bad",why);
        }else{
            setStage("turn","wait","Playing a page turn...");
            const t0=now();
            const r=await a.playChecked("pageTurn1");
            S.turn=r;S.turn.ms=Math.round(now()-t0);
            setStage("turn",r.ok?"ok":"bad",r.ok?"the app played it ("+S.turn.ms+" ms)":"refused: "+(r.err==="NotAllowedError"?"blocked by the browser (NotAllowedError)":r.err));
            await sleep(1100);
            setStage("flips","wait","Three quick turns...");
            const seq=["pageTurn2","pageTurn3","pageTurn2"],res=[];
            for(let i=0;i<seq.length;i++){res.push(await a.playChecked(seq[i]));await sleep(140);}
            const good=res.filter(x=>x.ok).length;
            S.flips={ok:good,of:seq.length,errs:res.filter(x=>!x.ok).map(x=>x.err)};
            setStage("flips",good===seq.length?"ok":"bad",good+" of "+seq.length+" played"+(good<seq.length?" ("+S.flips.errs.join(", ")+")":""));
            await sleep(1300);
        }
        setStage("slide","wait","Playing the slideshow effect...");
        await sleep(muted?200:900);                       /* later, with no tap in progress, like a slideshow that moves on by itself */
        const s=await playSlide();
        S.slide=s;
        if(s.ok)setStage("slide","ok","started without a tap ("+s.ms+" ms)");
        else setStage("slide","bad",s.err+(s.fallbackOk?"; the fallback (pageturn.mp3) did play":s.fallbackErr?"; the fallback also failed ("+s.fallbackErr+")":""));
    }

    /*---------- verdict and report ----------*/
    function problems(){
        const out=[],e=S.env;
        Object.keys(S.stage).forEach(k=>{if(S.stage[k].st==="bad"){const d=STAGES.find(x=>x[0]===k);out.push(d[1]+": "+S.stage[k].text);}});
        if(S.heard===false)out.push("The reader did not hear the sounds.");
        return out;
    }
    function hints(){
        const out=[],e=S.env,st=S.stage;
        const noErrors=Object.keys(st).every(k=>st[k].st!=="bad");
        if(e.muted===true)out.push("Turn on \"Page-turn sound\" in Settings.");
        if(S.heard===false&&noErrors)out.push("Everything played without an error but was not heard: check the device volume"+(e.apple?", the ring / silent switch":"")+", Bluetooth or headphone output (the sound may be going to a connected speaker that is off, out of range or turned down), and whether another app is holding the audio.");
        else if(S.heard===false&&e.apple)out.push("On an iPhone the ring / silent switch also silences these sounds.");
        if(st.slide&&st.slide.st==="bad"&&S.slide&&S.slide.err&&/NotAllowed|blocked/.test(S.slide.err))out.push("The browser blocks a sound that no tap started, so a slideshow that moves on by itself will be silent here (a patch candidate: start the slideshow sound from the Play tap).");
        return out;
    }
    function verdict(){
        if(!S||S.phase!=="done")return {st:"wait",text:"Testing..."};
        const p=problems();
        if(p.length){return {st:"bad",text:"PROBLEM: "+p[0]+(p.length>1?" (+"+(p.length-1)+" more, see the report)":"")};}
        if(S.heard===true)return {st:"ok",text:"OK: every sound loads and plays, and you heard them."};
        return {st:"ok",text:"No errors found. Please tell us whether you heard the sounds."};
    }
    function reportText(){
        const e=S.env,L=[];
        const V=verdict();
        L.push("MMICJ sound check");
        L.push("Time: "+e.time);
        L.push("Result: "+V.text);
        L.push("Heard the sounds: "+(S.heard===true?"yes":S.heard===false?"NO":"not answered"));
        L.push("");
        L.push("Device: "+e.ua);
        L.push("Language: "+e.lang+"; secure page: "+e.secure+"; installed app: "+e.standalone+"; online: "+e.online+"; page visible: "+e.visible);
        L.push("MP3 support: "+e.mp3+"; page can set volume: "+e.volumeSettable+"; audio context: "+e.context+"; autoplay policy: "+e.autoplay+"; iOS audio session: "+e.audioSession);
        L.push("App sound code: "+e.appCode+"; sounds muted: "+e.muted+"; app sound volume: "+e.volume+"% ("+NOTE+")");
        L.push("");
        L.push("Files, played silently (and the app's own preload):");
        if(!S.files||!S.files.length)L.push(" - not tested");
        (S.files||[]).forEach(i=>{
            L.push(" - "+i.name+" ("+i.url+"): "+(i.probe.ok?"ok"+(i.probe.duration!=null?" "+i.probe.duration+" s":"")+", "+i.probe.ms+" ms"+(i.probe.note?" - "+i.probe.note:""):"BAD - "+i.probe.err)+
                (i.pool?"; app preload "+(i.pool.failed?"FAILED":i.pool.ready?"ok":"still loading"):""));
        });
        L.push("");
        L.push("Audible test:");
        L.push(" - page turn through the app: "+(S.turn?(S.turn.ok?"ok ("+S.turn.ms+" ms)":"REFUSED - "+S.turn.err):"not run"));
        L.push(" - three quick turns: "+(S.flips?S.flips.ok+" of "+S.flips.of+" played"+(S.flips.errs.length?" ("+S.flips.errs.join(", ")+")":""):"not run"));
        L.push(" - slideshow effect, started with no tap: "+(S.slide?(S.slide.ok?"ok ("+S.slide.ms+" ms)":"REFUSED - "+S.slide.err+(S.slide.fallbackOk?" (fallback played)":S.slide.fallbackErr?" (fallback also failed: "+S.slide.fallbackErr+")":"")):"not run"));
        L.push("");
        L.push("Slideshow music: "+(S.music&&S.music.err?"track list failed ("+S.music.err+")":(S.music?S.music.tracks.length+" tracks listed":"not tested")));
        ((S.music&&S.music.tracks)||[]).forEach(t=>L.push(" - "+t.file+": "+(t.probe.ok?"ok"+(t.probe.duration!=null?" "+Math.round(t.probe.duration)+" s":"")+", "+t.probe.ms+" ms":"BAD - "+t.probe.err)));
        const p=problems();
        if(p.length){L.push("");L.push("Problems:");p.forEach(x=>L.push(" - "+x));}
        const h=hints();
        if(h.length){L.push("");L.push("Hints:");h.forEach(x=>L.push(" - "+x));}
        return L.join("\n");
    }
    api.report=function(){return S&&S.phase==="done"?reportText():lastReport;};

    /*---------- the panel inside Settings ----------*/
    function style(){
        try{
            if(document.getElementById("sc-style"))return;
            const st=document.createElement("style");st.id="sc-style";
            st.textContent=
".sc-box{margin:12px 0 4px;padding:12px;border:1px solid var(--line,#d5d9e0);border-radius:12px;background:var(--panel2,#f4f6f9);color:var(--text,#1a1a1a);font-size:13px;line-height:1.4}"+
/* progress status: a small gap above it, below the Test sounds button */
".sc-verdict{padding:8px 10px;border-radius:10px;margin:8px 0 0;font-weight:600}"+
".sc-verdict.ok{background:#e3f6ea;color:#0b5d33}.sc-verdict.bad{background:#fde8e6;color:#8a1c12}.sc-verdict.wait{background:#eef1f5;color:#333}"+
/* "See details" / "See less": plain, tiny, no border, no colour of its own, just a chevron */
".sc-toggle{display:flex;align-items:center;justify-content:center;gap:4px;width:fit-content;margin:6px auto 0;padding:4px 8px;border:0;border-radius:6px;background:none;color:inherit;font:inherit;font-size:11.5px;line-height:1.2;cursor:pointer;-webkit-tap-highlight-color:transparent}"+
".sc-toggle:focus-visible{outline:1px dotted currentColor;outline-offset:1px}"+
".sc-arrow{flex:none;transition:transform .18s ease}"+
".sc-toggle[aria-expanded=true] .sc-arrow{transform:rotate(180deg)}"+
".sc-details{margin:8px 0 0}"+
/* the details: smaller text, room between the written sections */
".sc-row{display:flex;gap:10px;margin:0 0 14px;font-size:11.5px;line-height:1.45}"+
".sc-st{flex:none;width:58px;text-align:center;border-radius:8px;font-size:10px;font-weight:700;padding:3px 4px;height:max-content;color:#fff}"+
".sc-st.ok{background:#0f7a4a}.sc-st.bad{background:#c0392b}.sc-st.wait{background:#8a95a1}"+
".sc-row div{min-width:0;word-break:break-word}"+
".sc-t,.sc-d{display:block}.sc-d{margin-top:3px}"+
/* the question, one row of three buttons, then the note */
".sc-ask{margin:12px 0 6px;font-size:11.5px;text-align:center;text-wrap:balance;color:var(--muted,#555)}"+
".sc-btns{display:flex;flex-wrap:nowrap;gap:6px}"+
".sc-btns button{flex:1 1 0;min-width:0;padding:9px 4px;border:0;border-radius:10px;font:inherit;font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer;background:#eceff3;color:#1a1a1a}"+
".sc-btns button.yes{background:#0f7a4a;color:#fff}.sc-btns button.no{background:#c0392b;color:#fff}.sc-btns button.copy{background:#1a1a1a;color:#fff}"+
".sc-btns button[aria-pressed=false]{opacity:.55}"+
".sc-btns button:focus-visible{outline:2px solid currentColor;outline-offset:2px}"+
".sc-note{margin-top:6px;font-size:11.5px;text-align:center;text-wrap:balance;color:var(--muted,#555)}"+
".sc-hint{margin-top:10px;font-size:11.5px;color:var(--text,#333)}"+
".sc-textbox{width:100%;height:130px;margin-top:8px;font:12px/1.3 monospace}";
            (document.head||document.documentElement).appendChild(st);
        }catch(e){}
    }
    const ARROW='<svg class="sc-arrow" viewBox="0 0 12 12" width="10" height="10" aria-hidden="true" focusable="false"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    function render(){
        if(!box||!S)return;
        /* the panel is rebuilt on every update: remember which of our buttons had focus and give it back */
        let keep=null;
        try{const f=document.activeElement;if(f&&box.contains&&box.contains(f))keep=f.getAttribute("data-sc");}catch(e){}
        const V=verdict(),open=!!S.detailsOpen;
        /* 1. progress / result (the Test sounds button sits directly above) */
        let h='<div class="sc-verdict '+V.st+'">'+esc(V.text)+'</div>';
        /* 2. details, collapsed until the reader asks */
        h+='<button type="button" class="sc-toggle" data-sc="toggle" aria-expanded="'+open+'" aria-controls="scDetails"><span>'+(open?"See less":"See details")+'</span>'+ARROW+'</button>';
        h+='<div class="sc-details" id="scDetails"'+(open?'':' hidden')+'>';
        STAGES.forEach(d=>{
            const s=S.stage[d[0]]||{st:"wait",text:"waiting"};
            h+='<div class="sc-row"><span class="sc-st '+s.st+'">'+(s.st==="ok"?"OK":s.st==="bad"?"PROBLEM":"...")+'</span><div><b class="sc-t">'+esc(d[1])+'</b><span class="sc-d">'+esc(s.text)+'</span></div></div>';
        });
        if(S.phase==="done"&&S.heard!=null){
            h+='<div class="sc-row"><span class="sc-st '+(S.heard?"ok":"bad")+'">'+(S.heard?"OK":"PROBLEM")+'</span><div><b class="sc-t">You heard them</b><span class="sc-d">'+(S.heard?"Yes":"No, or not all of them")+'</span></div></div>';
        }
        h+='</div>';
        /* 3. when finished: the question, Yes / No / Copy report in one row, then the note */
        if(S.phase==="done"){
            const pr=v=>S.heard==null?"":' aria-pressed="'+(S.heard===v)+'"';
            h+='<div class="sc-ask">Did you hear any sounds just now?</div>';
            h+='<div class="sc-btns"><button type="button" class="yes" data-sc="yes"'+pr(true)+'>Yes</button><button type="button" class="no" data-sc="no"'+pr(false)+'>No</button><button type="button" class="copy" data-sc="copy">'+(S.copied?"Copied":"Copy report")+'</button></div>';
            h+='<div class="sc-note">If something went wrong, tap <b>Copy report</b> and send it to us.</div>';
            const hs=hints();
            if(hs.length)h+='<div class="sc-hint">'+hs.map(esc).join("<br>")+'</div>';
            if(S.showBox)h+='<textarea class="sc-textbox" readonly id="scTextBox"></textarea>';
        }
        box.innerHTML=h;
        if(keep){try{const n=box.querySelector('[data-sc="'+keep+'"]');if(n)n.focus({preventScroll:true});}catch(e){}}
        if(S.showBox){const t=box.querySelector("#scTextBox");if(t){t.value=reportText();try{t.focus();t.select();}catch(e){}}}
    }
    async function copyReport(){
        const text=reportText();let ok=false;
        try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(text);ok=true;}}catch(e){}
        if(!ok){
            try{const ta=document.createElement("textarea");ta.value=text;ta.style.cssText="position:fixed;opacity:0";document.body.appendChild(ta);ta.select();ok=!!(document.execCommand&&document.execCommand("copy"));document.body.removeChild(ta);}catch(e){ok=false;}
        }
        S.copied=ok;S.showBox=!ok;render();
        if(ok)setTimeout(()=>{if(S){S.copied=false;render();}},2000);
    }
    function wire(el){
        if(el.__scWired)return;el.__scWired=true;
        el.addEventListener("click",ev=>{
            const t=ev.target&&ev.target.closest?ev.target.closest("[data-sc]"):null;
            if(!t||!S)return;
            const a=t.getAttribute("data-sc");
            if(a==="toggle"){S.detailsOpen=!S.detailsOpen;render();}
            else if(a==="yes"){S.heard=true;render();}
            else if(a==="no"){S.heard=false;render();}
            else if(a==="copy")copyReport();
        });
    }

    /*---------- run ----------*/
    api.run=async function(el){
        if(running||!el)return;
        running=true;box=el;style();wire(el);
        S={env:collectEnv(),stage:{},files:null,music:null,turn:null,flips:null,slide:null,heard:null,copied:false,showBox:false,detailsOpen:false,phase:"running"};
        el.hidden=false;render();
        try{
            await stageDevice();
            await stageFiles();
            await stageMusic();
            await stageAudible();
        }catch(e){
            S.stage.device={st:"bad",text:"the check itself stopped: "+errName(e)};
        }
        S.phase="done";
        lastReport=reportText();
        running=false;
        render();
        try{el.scrollIntoView({block:"nearest",behavior:"smooth"});}catch(e){}
    };
    api.isRunning=()=>running;
    api.version="1.0.2";
    return api;
})();
