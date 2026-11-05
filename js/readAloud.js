"use strict";

/* =========================================================
   readAloud.js - "Listen" for books (Reader).

   Reads the open book aloud with the device's own voices
   (the browser's speechSynthesis). Nothing is sent anywhere:
   no server, no API, no Cloudflare request, no cost.

   How it works
   - The text of a page comes from pdf.js (Renderer.pageText),
     from the PDF the Reader already has open. Only the page(s)
     being read are asked for, never the whole book, so no extra
     bytes are fetched beyond what reading itself needs.
   - The text is tidied (lines joined, split words repaired, bullet
     marks and repeated headers/footers/page numbers dropped), cut
     into sentences, and spoken one sentence at a time. Short chunks
     avoid a Chrome bug that silences long speech, and let pause /
     resume work on every browser.
   - It reads what is on screen (one page on a phone, two on a
     desktop spread), turns the page by itself, and carries on.
     If the reader turns the page by hand, it follows.
   - Pause = stop speaking and remember the sentence; resume picks
     up from the start of that sentence.

   Limits (by design)
   - A page with no text layer (a scan or a picture) is skipped; three
     empty spreads in a row stop the reading with a note.
   - Voices and quality are whatever the device offers. iPhones stop
     speaking when the screen locks; the button then shows "paused".

   How things are SAID (names, acronyms, "e.g.", colons / semicolons / dashes,
   list commas, the silence after a paragraph) lives in js/readAloudRules.js.
   That file is optional: without it the text is spoken as tidied here. Whatever happens
   (rules file missing, a rule failing) enforce() below still spells MMICJ and removes colons,
   semicolons and dashes from the very last text handed to the voice.

   Page turns it makes itself are silent (the turn sound would talk over the voice).

   Reader hooks used: Reader.isOpen / page / pages / spread / next,
   Renderer.pageText, and the "skyreader:pageChanged | bookOpened |
   closed" DOM events that Reader.emit now also dispatches.
========================================================= */

window.ReadAloud=(function(){

const api={};

const KEY="mm-readaloud";

/* Is the Listen (headphones) button shown to a reader who has not touched the setting?
   TESTING PHASE: false = hidden until "Show Listen (read aloud) button" is ticked in Settings.
   WHEN TESTING IS FINISHED: change this one word to true and the button is visible for everybody
   (a reader who explicitly switched it off or on keeps their own choice). */
const SHOW_BUTTON_BY_DEFAULT=false;
const MAX_CHUNK=220;
const RATE_MIN=0.6,RATE_MAX=1.8;

const SS=(typeof window!=="undefined" && "speechSynthesis" in window && typeof window.SpeechSynthesisUtterance==="function")
    ? window.speechSynthesis : null;
const Utter=SS ? window.SpeechSynthesisUtterance : null;

api.supported=!!SS;

/*-------------------------------------------------------
  Settings (this browser only)
-------------------------------------------------------*/

const clampRate=v=>{
    v=Number(v);
    if(!isFinite(v)||v<=0)return 1;
    return Math.max(RATE_MIN,Math.min(RATE_MAX,v));
};

function loadSettings(){
    try{
        const o=JSON.parse(localStorage.getItem(KEY)||"{}");
        return {rate:clampRate(o.rate||1),voice:typeof o.voice==="string"?o.voice:"",showButton:typeof o.showButton==="boolean"?o.showButton:null};
    }catch(e){
        return {rate:1,voice:"",showButton:null};
    }
}

let settings=loadSettings();

function saveSettings(){
    try{localStorage.setItem(KEY,JSON.stringify(settings));}catch(e){}
}

api.getSettings=()=>({rate:settings.rate,voice:settings.voice});

/* button visibility: null in settings = the reader never chose, so SHOW_BUTTON_BY_DEFAULT decides */
api.isButtonVisible=()=>settings.showButton===null?SHOW_BUTTON_BY_DEFAULT:!!settings.showButton;
api.setButtonVisible=function(v){
    settings.showButton=!!v;
    saveSettings();
    applyVisibility();
    if(!settings.showButton)api.stop();      /* hiding the button also stops any reading in progress */
    return api.isButtonVisible();
};
api.setRate=function(v){settings.rate=clampRate(v);saveSettings();return settings.rate;};
api.setVoice=function(uri){settings.voice=String(uri||"");saveSettings();};
api.rateRange=()=>({min:RATE_MIN,max:RATE_MAX});

/*-------------------------------------------------------
  Voices
-------------------------------------------------------*/

const voiceListeners=[];

api.voices=function(){
    if(!SS)return [];
    let list=[];
    try{list=SS.getVoices()||[];}catch(e){}
    return list.map(v=>({uri:v.voiceURI,name:v.name,lang:v.lang,local:!!v.localService,isDefault:!!v.default}));
};

api.onVoices=function(fn){
    if(typeof fn==="function")voiceListeners.push(fn);
};

if(SS){
    const notifyVoices=()=>voiceListeners.forEach(fn=>{try{fn();}catch(e){}});
    if(typeof SS.addEventListener==="function")SS.addEventListener("voiceschanged",notifyVoices);
    else SS.onvoiceschanged=notifyVoices;
}

function chosenVoice(){
    if(!SS||!settings.voice)return null;
    try{
        return (SS.getVoices()||[]).find(v=>v.voiceURI===settings.voice)||null;
    }catch(e){
        return null;
    }
}

/*=======================================================
  TEXT: pdf.js items -> tidy sentences   (pure functions)
=======================================================*/

const BULLET_START=/^[\u2022\u2023\u25E6\u2043\u2219\u25AA\u25AB\u25CF\u25CB\u25A0\u25A1\u27A2\u27A4\u2713\u2714\u25BA\u25B6\u00B7\u2023]\s*/;
const DASH_BULLET=/^[-\u2013\u2014]\s+/;
const PRIVATE_USE=/[\uE000-\uF8FF]/g;
const INVISIBLE=/[\u0000-\u0008\u000B-\u001F\u007F\u00AD\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\uFEFF]/g;
const SUP="\u2063";    /* invisible mark left after a superscript: "say a full stop here" (readAloudRules.js turns it into one) */
const TERMINAL=/(?:[.!?\u2026:;]["')\]\u201D\u2019]*|\u2063)$/;
/* superscript digits, signs and letters (footnote marks, verse numbers): normalising would flatten them into "God1" */
const SUPER_CHARS=/[\u00B2\u00B3\u00B9\u2070\u2071\u2074-\u207F\u02B0-\u02B8\u02E0-\u02E4\u1D2C-\u1D6A\u1D78\u1D9B-\u1DBF]+/g;
/* ornamental symbols (stars, diamonds, dingbats, emoji, arrows-in-circles, dagger, asterisk, pipe ...).
   NOT mathematical signs (+ - = < > % etc. are a different Unicode class), not currency, not the degree sign. */
const ORN_CHAR="(?:(?![\\u00B0\\u2103\\u2109\\u2116])[\\p{So}\\u2020\\u2021\\u2022\\u2023\\u2043\\u2219\\u00B7*|\\u00A6\\uFE0F\\u20E3\\u200D\\u{1F3FB}-\\u{1F3FF}])";
const ORN_RUN=new RegExp("(?:\\s*"+ORN_CHAR+")+\\s*","gu");
const PAGE_NUMBER=/^(page\s*)?\d{1,4}(\s*(\/|of)\s*\d{1,4})?$|^[-\u2013\u2014]\s*\d{1,4}\s*[-\u2013\u2014]$/i;
const ABBREV=new Set(["mr","mrs","ms","dr","prof","sr","jr","st","vs","etc","e.g","i.e","no","fig","inc","ltd","co","approx","dept","est","vol","ch","pp","cf"]);

/* "e.g." / "Dr." at the end of a line does not end the sentence */
function endsWithAbbrev(t){
    const w=(String(t).match(/([A-Za-z.]+)\.$/)||[])[1];
    return !!w&&ABBREV.has(w.toLowerCase());
}

/* "God¹ said" -> "God 1<SUP> said";  "m²" -> "m squared";  "1ˢᵗ" -> "1st" */
function supMark(s){
    return s.replace(SUPER_CHARS,(m,off,str)=>{
        const plain=m.normalize("NFKC");
        if(/^(st|nd|rd|th)$/i.test(plain))return plain;
        if(m==="²"||m==="³"){
            const before=str.slice(0,off);
            if(/(^|[^\p{L}])\p{L}{1,2}$/u.test(before)||/[)\]]$/.test(before))return m==="²"?" squared":" cubed";
        }
        return " "+plain+SUP;
    });
}

function tidy(str){
    return supMark(String(str||""))
        .normalize("NFKC")
        .replace(INVISIBLE," ")
        .replace(/\s+/g," ")
        .trim();
}

/* small, raised pieces of text next to normal-sized text (footnote numbers, verse numbers drawn as
   superscripts in the PDF, not as special characters): returns the set of their positions in items */
function findSuperscripts(items){
    const found=new Set();
    const hs=items.map(i=>i.h||0).filter(h=>h>0).sort((a,b)=>a-b);
    if(hs.length<3)return found;
    const body=hs[hs.length>>1];
    items.forEach((it,i)=>{
        const s=typeof it.s==="string"?it.s.trim():"";
        if(!s||s.length>4||!(it.h>0)||it.h>0.78*body)return;
        if(/^(st|nd|rd|th)$/i.test(s))return;           /* 1st, 2nd, 3rd, 4th */
        const near=[items[i-1],items[i+1]].find(o=>o&&(o.h||0)>=0.9*body&&Math.abs(o.y-it.y)<=0.8*body);
        if(near&&it.y-near.y>=0.15*body)found.add(i);
    });
    return found;
}

/* "Hello  world" -> items joined into visual lines */
function toLines(items){
    const lines=[];
    let cur=null;
    const push=()=>{if(cur&&cur.t.trim())lines.push(cur);cur=null;};
    const sups=findSuperscripts(items);

    for(let n=0;n<items.length;n++){
        const it=items[n];
        let s=typeof it.s==="string"?it.s:"";
        if(sups.has(n))s=" "+s.trim()+SUP;
        const h=it.h||0;
        if(cur){
            const sameBaseline=Math.abs(it.y-cur.y)<=0.6*Math.max(h,cur.h,1);
            const jumpedBack=it.x<cur.x1-3*Math.max(h,cur.h,10);
            if(!sameBaseline||jumpedBack)push();
        }
        if(!cur)cur={t:"",x0:it.x,x1:it.x,y:it.y,h:h,raw:""};
        if(cur.t&&!/\s$/.test(cur.t)&&!/^\s/.test(s)){
            const gap=it.x-cur.x1;
            if(gap>0.18*(h||cur.h||10))cur.t+=" ";
        }
        cur.t+=s;
        cur.raw+=s;
        cur.x1=Math.max(cur.x1,it.x+(it.w||0));
        cur.h=Math.max(cur.h,h);
        if(it.e)push();
    }
    push();
    return lines;
}

const headerKey=t=>t.toLowerCase().replace(/\d+/g,"#").replace(/\s+/g," ").trim();

/*
 * data: {height, items:[{s,x,y,w,h,e}]}  (y is measured from the bottom of the page)
 * ctx : {page, seen:Map(key -> [pages])}   remembers header/footer lines of the open book
 * returns an array of paragraph strings (each ends with punctuation so the voice pauses)
 */
function buildParagraphs(data,ctx){
    if(!data||!Array.isArray(data.items)||!data.items.length)return [];

    const pageH=data.height||0;
    const raw=toLines(data.items);
    if(!raw.length)return [];

    /* clean each line, notice bullet marks */
    const lines=[];
    let pendingBullet=false;
    for(const l of raw){
        const hadPrivate=PRIVATE_USE.test(l.raw);
        PRIVATE_USE.lastIndex=0;
        const leader=/(\.\s*){4,}/.test(l.t);     /* table-of-contents style "Chapter 1 ........ 5" */
        let bullet=pendingBullet;
        pendingBullet=false;

        /* ornamental symbols are never described: at the start of a line they act as a bullet (a new item),
           anywhere else as a full stop */
        let ornStart=false,hadOrn=false;
        const src=l.t.replace(PRIVATE_USE," ").replace(/(\.\s*){4,}/g," ").replace(ORN_RUN,(m,off,str)=>{
            hadOrn=true;
            if(!str.slice(0,off).trim()){ornStart=true;return "";}
            if(!str.slice(off+m.length).trim())return "";
            return /[.!?\u2026:;,]\s*$/.test(str.slice(0,off))?" ":". ";
        });
        let t=tidy(src);
        if(ornStart)bullet=true;
        if(BULLET_START.test(t)){bullet=true;t=t.replace(BULLET_START,"");}
        else if(DASH_BULLET.test(t)){bullet=true;t=t.replace(DASH_BULLET,"");}
        if(!t){
            /* a bullet or ornament drawn as its own glyph: the next line is a new item */
            if(hadPrivate||hadOrn||/[\u2022\u25CF\u25AA\u25A0\u27A2]/.test(l.t))pendingBullet=true;
            continue;
        }
        if(/^(\(?\d{1,2}[.)]|[a-z][.)])\s/i.test(t))bullet=true;
        lines.push({t:t,x0:l.x0,x1:l.x1,y:l.y,h:l.h,bullet:bullet,leader:leader});
    }
    if(!lines.length)return [];

    /* drop page numbers and headers/footers that repeat from page to page */
    const keep=[];
    for(const l of lines){
        const inTop=pageH>0&&l.y>pageH*0.92;
        const inBottom=pageH>0&&l.y<pageH*0.08;
        if(inTop||inBottom){
            if(PAGE_NUMBER.test(l.t))continue;
            if(ctx&&ctx.seen){
                const k=headerKey(l.t);
                const pages=ctx.seen.get(k)||[];
                const elsewhere=pages.some(p=>p!==ctx.page);
                if(!pages.includes(ctx.page)){pages.push(ctx.page);if(pages.length>6)pages.shift();ctx.seen.set(k,pages);}
                if(elsewhere)continue;
            }
        }
        keep.push(l);
    }
    if(!keep.length)return [];

    /* reference width of each line: the widest line in the same column */
    const minX=Math.min(...keep.map(l=>l.x0));
    const maxX=Math.max(...keep.map(l=>l.x1));
    const pageW=Math.max(1,maxX-minX);
    const colMax=l=>{
        let m=0;
        for(const o of keep){
            if(Math.abs(o.x0-l.x0)<=0.1*pageW)m=Math.max(m,o.x1-o.x0);
        }
        return m||1;
    };
    const isFull=l=>(l.x1-l.x0)>=0.8*colMax(l);   /* a wrapped line runs to within about one word of the margin */

    /* the usual distance between two lines of the same paragraph on this page (median) */
    const pitches=[];
    for(let i=1;i<keep.length;i++){
        const a=keep[i-1],b=keep[i],dy=a.y-b.y;
        if(dy>0&&dy<=2.2*Math.max(a.h,b.h,8)&&Math.abs(a.h-b.h)<=0.15*Math.max(a.h,b.h)&&Math.abs(a.x0-b.x0)<=0.1*pageW)pitches.push(dy);
    }
    pitches.sort((p,q)=>p-q);
    const pitch=pitches.length>=3?pitches[pitches.length>>1]:0;

    const continues=(prev,l)=>{
        if(l.bullet||prev.leader)return false;
        const dy=prev.y-l.y;
        const lineH=Math.max(prev.h,l.h,8);
        if(dy<=0||dy>2.2*lineH)return false;          /* new block, new column, or a big gap */
        if(Math.abs(prev.h-l.h)>0.15*Math.max(prev.h,l.h))return false;   /* a heading, caption or other type size */
        if(pitch&&dy>1.4*pitch&&!/^[a-z]/.test(l.t))return false;   /* a visible gap between lines: a new paragraph, not a wrapped line */
        if(TERMINAL.test(prev.t)&&!endsWithAbbrev(prev.t)&&!/^[a-z]/.test(l.t))return false;   /* the sentence ended */
        if(!isFull(prev))return /^[a-z]/.test(l.t);   /* short line: only join mid-sentence */
        return true;                                  /* a wrapped line */
    };

    const paras=[];
    let acc="",prev=null;
    const flush=()=>{
        if(!acc)return;
        if(!TERMINAL.test(acc)&&!/[,]$/.test(acc))acc+=".";
        paras.push(acc);
        acc="";
    };
    for(const l of keep){
        if(acc&&prev&&continues(prev,l)){
            if(/[A-Za-z\u00C0-\u024F]-$/.test(acc)&&/^[a-z\u00DF-\u024F]/.test(l.t))acc=acc.slice(0,-1)+l.t;
            else acc+=" "+l.t;
        }else{
            flush();
            acc=l.t;
        }
        prev=l;
    }
    flush();

    return paras
        .map(p=>p
            .replace(/https?:\/\/\S+|www\.\S+/gi," ")
            .replace(/(\.\s*){4,}/g," ")
            .replace(/[_=~*#|]{3,}/g," ")
            .replace(/\s+/g," ")
            .trim())
        .filter(p=>/[\p{L}\p{N}]/u.test(p));
}

function splitLong(s,max){
    const out=[];
    while(s.length>max){
        const win=s.slice(0,max);
        let cut=Math.max(win.lastIndexOf(", "),win.lastIndexOf("; "),win.lastIndexOf(": "),win.lastIndexOf(" \u2014 "));
        if(cut<max*0.4)cut=win.lastIndexOf(" ");
        if(cut<=0)cut=max-1;
        out.push(s.slice(0,cut+1).trim());
        s=s.slice(cut+1).trim();
    }
    if(s)out.push(s);
    return out;
}

/* paragraphs -> sentence-sized chunks */
function splitSentences(paras,max){
    max=max||MAX_CHUNK;
    const out=[];
    for(const para of paras){
        const parts=[];
        const re=/[.!?\u2026]+["')\]\u201D\u2019]*(?=\s|$)/g;
        let last=0,m;
        while((m=re.exec(para))){
            const end=m.index+m[0].length;
            parts.push(para.slice(last,end));
            last=end;
        }
        if(last<para.length)parts.push(para.slice(last));

        /* glue "Dr." / "e.g." style pieces to what follows */
        const glued=[];
        for(const p of parts){
            const t=p.trim();
            if(!t)continue;
            const prev=glued[glued.length-1];
            if(prev){
                const w=(prev.match(/([A-Za-z.]+)\.$/)||[])[1];
                if(w&&ABBREV.has(w.toLowerCase())){glued[glued.length-1]=prev+" "+t;continue;}
            }
            glued.push(t);
        }
        for(const g of glued){
            if(!/[\p{L}\p{N}]/u.test(g))continue;
            if(g.length<=max)out.push(g);
            else out.push(...splitLong(g,max));
        }
    }
    return out;
}

api._text={tidy,toLines,buildParagraphs,splitSentences,splitLong,endsWithAbbrev};

/*=======================================================
  SPEECH + READING LOOP
=======================================================*/

let state="idle";            /* idle | loading | speaking | paused */
let session=0;               /* bumped to invalidate every callback of an older run */
let cursor=0;                /* index of the chunk being spoken (or next to speak) */
let resumeInfo=null;         /* {start, chunks, index} while paused */
let autoUntil=0;             /* page changes before this time were made by us */
let restartTimer=0;
const live=[];               /* keeps utterances referenced (Safari drops unreferenced ones) */
let ctx={book:null,seen:new Map(),page:0};
const textCache=new Map();

const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function bookId(){
    try{
        const b=window.Reader&&Reader.book&&Reader.book();
        return b?String(b.id||b.url||b.title||"book"):null;
    }catch(e){return null;}
}

function resetBookMemory(){
    textCache.clear();
    ctx={book:bookId(),seen:new Map(),page:0};
}

async function chunksForPage(p){
    if(textCache.has(p))return textCache.get(p);
    if(!window.Renderer||typeof Renderer.pageText!=="function")return [];
    let data=null;
    try{data=await Renderer.pageText(p);}catch(e){data=null;}
    ctx.page=p;
    const chunks=[];
    const R=window.ReadAloudRules;      /* optional: js/readAloudRules.js (how things are said) */
    const gap=R&&R.gaps&&R.gaps.paragraph>0?R.gaps.paragraph:0;
    for(const para of buildParagraphs(data,ctx)){
        const parts=splitSentences([para]);
        let lastOfParagraph=-1;
        parts.forEach((raw,i)=>{
            const plain=raw.replace(/\s*\u2063\s*/g,". ").trim();    /* without the rules file a superscript is still a full stop */
            const end=i===parts.length-1;
            let pieces;
            try{
                if(R&&typeof R.spokenParts==="function")pieces=R.spokenParts(raw,{end:end});
                else if(R&&typeof R.spoken==="function")pieces=[{text:R.spoken(raw,{end:end}),gap:0}];
                else pieces=[{text:plain,gap:0}];
            }catch(e){pieces=[{text:plain,gap:0}];}
            /* a number that starts a sentence (a verse number) arrives as its own piece with its own silent gap */
            for(const pc of pieces){
                const say=enforce(pc&&pc.text||"");
                if(!/[\p{L}\p{N}]/u.test(say))continue;
                chunks.push({text:say,page:p,gap:pc.gap>0?pc.gap:0});
                lastOfParagraph=chunks.length-1;
            }
        });
        /* a real silence after every paragraph, title or line that stands alone */
        if(lastOfParagraph>=0)chunks[lastOfParagraph].gap=gap;
    }
    textCache.set(p,chunks);
    if(textCache.size>14)textCache.delete(textCache.keys().next().value);
    return chunks;
}

/* The last word before the voice. Runs on every piece that is spoken, so the rules hold even when
   js/readAloudRules.js is missing or one of its rules fails: MMICJ is always spelled letter by letter,
   and no colon, semicolon or dash is ever left in the text for the voice to pronounce. */
function basicEnforce(t){
    return String(t==null?"":t)
        .replace(/m[\s\u00AD\u200B-\u200D\u2060\uFEFF]?m[\s\u00AD\u200B-\u200D\u2060\uFEFF]?i[\s\u00AD\u200B-\u200D\u2060\uFEFF]?c[\s\u00AD\u200B-\u200D\u2060\uFEFF]?j/gi," em em eye see jay ")
        .replace(/\s*[:;\uFF1A\uFF1B\u037E]\s*/g,", ")
        .replace(/\s*(?:--+|[\u2012-\u2015])\s*/g,", ")
        .replace(/\s+[-\u2010\u2011]+\s+/g,", ")
        .replace(/[-\u2010\u2011]+(?!\d)/g," ")
        .replace(/(\s*,){2,}/g,",").replace(/\s+([,.!?])/g,"$1").replace(/\s+/g," ").trim();
}

function enforce(text){
    const R=window.ReadAloudRules;
    let t=String(text==null?"":text);
    if(R&&typeof R.enforce==="function"){
        try{t=R.enforce(t);}catch(e){}
    }
    return basicEnforce(t);
}
api._enforce=enforce;

function makeUtterance(text){
    const u=new Utter(enforce(text));
    u.rate=settings.rate;
    const v=chosenVoice();
    if(v){u.voice=v;u.lang=v.lang;}
    return u;
}

let errorRun=0;

function speakList(list,from,token){
    return new Promise(resolve=>{
        let next=from,ended=from-1;
        let holdAt=-1;                 /* a piece followed by a silent gap: nothing after it is queued until the gap is over */
        const total=list.length;
        cursor=from;
        const done=()=>{if(token===session)resolve(true);};
        const enqueue=()=>{
            while(token===session&&next<total&&next-ended<=2&&holdAt<0){
                const i=next++;
                const u=makeUtterance(list[i].text);
                const gapMs=list[i].gap>0&&i<total-1?Math.round(list[i].gap/settings.rate):0;
                if(gapMs>0)holdAt=i;
                const finish=()=>{
                    if(token!==session)return;
                    ended=i;cursor=i+1;
                    if(ended>=total-1)done();
                    else if(holdAt===i){
                        setTimeout(()=>{if(token!==session)return;holdAt=-1;enqueue();},gapMs);
                    }
                    else enqueue();
                };
                u.onend=()=>{errorRun=0;finish();};
                u.onerror=ev=>{
                    if(token!==session)return;
                    const code=ev&&ev.error;
                    if(code==="canceled"||code==="interrupted")return;
                    errorRun++;
                    if(code==="not-allowed"||errorRun>=3){
                        session++;
                        setState("idle");
                        toast(code==="not-allowed"
                            ? "This browser blocked speech. Tap Listen again."
                            : "Speech is not working on this device.");
                        resolve(false);
                        return;
                    }
                    finish();
                };
                live.push(u);
                if(live.length>6)live.shift();
                try{SS.speak(u);}catch(e){finish();}
            }
        };
        enqueue();
    });
}

function spreadPages(){
    const sp=Reader.spread();
    const pages=[];
    for(let p=sp.start;p<=sp.end;p++)pages.push(p);
    return {start:sp.start,end:sp.end,pages};
}

async function waitForTurn(before,token){
    const t0=Date.now();
    while(token===session&&Date.now()-t0<3500){
        await sleep(120);
        if(Reader.spread().start!==before){await sleep(350);return true;}
    }
    return Reader.spread().start!==before;
}

/* Page turns that Listen makes by itself are silent: the turn sound would play over the voice,
   and every one is a sound-file request. Only the two turn sounds are swapped out, briefly and
   only here; the Mute setting is not touched. */
let silenced=false;
function silenceTurnSounds(ms){
    const A=window.AudioController;
    if(!A||silenced||typeof A.playPageCurl!=="function"||typeof A.playPageTurn!=="function")return;
    silenced=true;
    const curl=A.playPageCurl,turn=A.playPageTurn;
    const noCurl=()=>false,noTurn=()=>false;
    A.playPageCurl=noCurl;
    A.playPageTurn=noTurn;
    setTimeout(()=>{
        if(A.playPageCurl===noCurl)A.playPageCurl=curl;
        if(A.playPageTurn===noTurn)A.playPageTurn=turn;
        silenced=false;
    },ms);
}

async function turnPage(before,token){
    autoUntil=Infinity;
    silenceTurnSounds(2200);
    try{
        for(let tries=0;tries<12&&token===session;tries++){
            if(Reader.spread().end>=Reader.pages())return false;
            const r=Reader.next();
            if(r!==false)return await waitForTurn(before,token);
            await sleep(250);              /* the flip engine was busy: try again */
        }
        return false;
    }finally{
        autoUntil=Date.now()+800;
    }
}

async function run(token,resume){
    let emptyStreak=0;
    let first=resume||null;

    while(token===session){
        if(!window.Reader||!Reader.isOpen()){finish(token);return;}

        const sp=spreadPages();
        let chunks,from=0;

        if(first&&first.start===sp.start){
            chunks=first.chunks;from=first.index;
        }else{
            chunks=[];
            for(const p of sp.pages){
                const c=await chunksForPage(p);
                if(token!==session)return;
                chunks.push(...c);
            }
        }
        first=null;
        resumeInfo={start:sp.start,chunks:chunks,index:from};

        if(!chunks.length){
            emptyStreak++;
            if(emptyStreak>=3){
                finish(token,"No readable text on these pages.");
                return;
            }
        }else{
            emptyStreak=0;
            setState("speaking");
            const ok=await speakList(chunks,from,token);
            if(token!==session||!ok)return;
        }

        if(sp.end>=Reader.pages()){finish(token,"Finished reading.");return;}

        setState("loading");
        const moved=await turnPage(sp.start,token);
        if(token!==session)return;
        if(!moved){finish(token);return;}
    }
}

function finish(token,message){
    if(token!==session)return;
    session++;
    resumeInfo=null;
    setState("idle");
    if(message)toast(message);
}

function cancelSpeech(){
    if(!SS)return;
    try{if(SS.speaking||SS.pending||SS.paused)SS.cancel();}catch(e){}
}

function begin(resume){
    if(!SS||!window.Reader||!Reader.isOpen())return;
    clearTimeout(restartTimer);
    session++;
    const token=session;
    cancelSpeech();
    errorRun=0;
    setState("loading");
    /* some browsers drop a speak() issued in the same tick as cancel() */
    setTimeout(()=>{if(token===session)run(token,resume);},SS.speaking?120:0);
}

api.start=function(){begin(null);};

api.pause=function(){
    if(state!=="speaking"&&state!=="loading")return;
    session++;
    if(resumeInfo)resumeInfo.index=Math.min(cursor,resumeInfo.chunks.length);
    cancelSpeech();
    setState("paused");
};

api.resume=function(){
    if(state!=="paused")return;
    const info=resumeInfo;
    if(info&&window.Reader&&Reader.isOpen()&&Reader.spread().start===info.start&&info.index<info.chunks.length)begin(info);
    else begin(null);
};

api.stop=function(){
    session++;
    resumeInfo=null;
    clearTimeout(restartTimer);
    cancelSpeech();
    setState("idle");
};

api.toggle=function(){
    if(!SS)return;
    if(state==="speaking"||state==="loading")api.pause();
    else if(state==="paused")api.resume();
    else api.start();
};

api.state=()=>state;

/* a few words in the chosen voice and speed, used by the settings panel */
api.preview=function(){
    if(!SS||state==="speaking"||state==="loading")return;
    cancelSpeech();
    const u=makeUtterance("This is how I will read to you.");
    live.push(u);
    if(live.length>6)live.shift();
    setTimeout(()=>{try{SS.speak(u);}catch(e){}},SS.speaking?120:0);
};

/*-------------------------------------------------------
  Button, state and notices
-------------------------------------------------------*/

let button=null;
let toastEl=null,toastTimer=0;

function toast(text){
    if(!toastEl){
        toastEl=document.createElement("div");
        toastEl.className="sr-listen-toast";
        toastEl.setAttribute("role","status");
        toastEl.setAttribute("aria-live","polite");
        document.body.appendChild(toastEl);
    }
    toastEl.textContent=text;
    toastEl.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer=setTimeout(()=>toastEl&&toastEl.classList.remove("on"),3200);
}

const LABELS={
    idle:"Listen to this book",
    loading:"Pause listening",
    speaking:"Pause listening",
    paused:"Resume listening"
};

function setState(s){
    state=s;
    renderButton();
}

function renderButton(){
    if(!button)return;
    const active=state==="speaking"||state==="loading";
    button.dataset.state=state;
    button.setAttribute("aria-pressed",active?"true":"false");
    button.title=LABELS[state];
    button.setAttribute("aria-label",LABELS[state]);
    button.classList.toggle("is-listening",active);
    const use=button.querySelector("use");
    if(use)use.setAttribute("href",active?"#icon-pause":"#icon-listen");
}

/*-------------------------------------------------------
  Events from the Reader
-------------------------------------------------------*/

function onPageChanged(){
    if(state==="paused"){resumeInfo=null;return;}
    if(state!=="speaking"&&state!=="loading")return;
    if(Date.now()<autoUntil)return;                 /* we turned it ourselves */
    /* the reader moved: stop the old page at once (so the running loop can not carry on
       from the old place), then start again from the new page once flipping settles */
    session++;
    cancelSpeech();
    setState("loading");
    clearTimeout(restartTimer);
    restartTimer=setTimeout(()=>{
        if(state==="loading")begin(null);
    },450);
}

function onBookChange(){
    api.stop();
    resetBookMemory();
}

/* the headphones button is shown only when the reader switched it on in Settings
   (or, once testing is over, when SHOW_BUTTON_BY_DEFAULT is true) and the browser can speak */
function applyVisibility(){
    if(!button)return;
    const show=!!SS&&api.isButtonVisible();
    button.hidden=!show;
    button.style.display=show?"":"none";
}

api.init=function(){
    button=document.getElementById("listenButton");
    if(!button)return;
    applyVisibility();
    if(!SS)return;
    renderButton();
    button.addEventListener("click",()=>api.toggle());

    document.addEventListener("skyreader:pageChanged",onPageChanged);
    document.addEventListener("skyreader:bookOpened",onBookChange);
    document.addEventListener("skyreader:closed",onBookChange);

    /* the Mute button silences everything: stop talking when it is switched on */
    const mute=document.getElementById("muteButton");
    if(mute)mute.addEventListener("click",()=>setTimeout(()=>{
        if(window.AudioController&&AudioController.isMuted&&AudioController.isMuted()&&(state==="speaking"||state==="loading"))api.pause();
    },0));

    /* phones stop speech when the screen locks: show "paused" instead of pretending */
    document.addEventListener("visibilitychange",()=>{
        if(document.visibilityState!=="visible")return;
        if(state==="speaking"&&!SS.speaking&&!SS.pending)api.pause();
    });
    window.addEventListener("pagehide",()=>cancelSpeech());
};

if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",api.init);
else api.init();

return api;

})();
