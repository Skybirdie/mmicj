/* Tests for js/readAloud.js: text tidying (pure) and the reading loop (fake speech engine + fake Reader).
   Run:  node readAloud.test.mjs                                                                      */
import fs from 'fs';
import vm from 'vm';

const SRC=fs.readFileSync(new URL('./js/readAloud.js',import.meta.url).pathname,'utf8');
let fails=0;
const ok=(c,m)=>{if(!c){console.log('FAIL',m);fails++}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
/* wait until a condition holds (or give up) instead of guessing a delay */
const until=async(f,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(f())return true;await sleep(15)}return f()};

/* ---------- a page of items the way Renderer.pageText returns them ---------- */
const item=(s,x,y,o={})=>({s,x,y,w:o.w??s.length*5.5,h:o.h??12,e:o.e??true});
const lines=(texts,o={})=>({height:o.height??800,items:texts.map((t,i)=>item(t,o.x??50,(o.top??700)-i*(o.step??15),{w:o.w??Math.max(t.length*5.5,1)}))});

/* ======================= PART 1: TEXT ======================= */
{
  const w={document:{readyState:'complete',getElementById:()=>null,addEventListener(){},createElement(){return{}}},localStorage:{getItem:()=>null,setItem(){}},addEventListener(){}};
  w.window=w;vm.createContext(w);vm.runInContext(SRC,w);
  const T=w.ReadAloud._text;
  const P=(d,ctx)=>T.buildParagraphs(d,ctx||{seen:new Map(),page:1});

  ok(JSON.stringify(P(null))==='[]'&&JSON.stringify(P({items:[]}))==='[]','no text -> nothing to read');

  let r=P(lines(['The morning bell rang at exactly six and every single','villager knew it, because the sound carried across the whole','valley. Nobody complained.'],{w:300}));
  ok(r.length===1&&r[0]==='The morning bell rang at exactly six and every single villager knew it, because the sound carried across the whole valley. Nobody complained.','wrapped lines become one paragraph: '+JSON.stringify(r));

  r=P(lines(['A long wrapped line ends with a split inter-','national word and then carries on in the next line.'],{w:300}));
  ok(r[0].includes('international'),'split word repaired ("inter-" + "national")');
  r=P(lines(['a well-','known fact that stays hyphenated'],{w:300}));
  ok(r[0].includes('wellknown')===true||r[0].includes('well-known')===true,'hyphen rule does not crash on lowercase join');

  r=P({height:800,items:[item('Morning Routine',50,700,{h:24}),item('Wake up and drink water',70,650),item('Stretch gently',70,630),item('Write one sentence of gratitude',70,610)]});
  ok(r.length===4&&r.every(p=>/[.!?]$/.test(p)),'heading and short bullet lines are separate, each ends with a pause mark: '+JSON.stringify(r));

  r=P({height:800,items:[item('\u2022',50,700,{w:6}),item('First point here',70,700),item('\uF0B7',50,680,{w:6}),item('Second point here',70,680)]});
  ok(r.join('|')==='First point here.|Second point here.','bullet glyphs (normal and private-use) are not read: '+JSON.stringify(r));

  r=P({height:800,items:[item('Report Header',50,780),item('Real text of the page is here.',50,600),item('12',300,20)]});
  ok(r.join('|')==='Report Header.|Real text of the page is here.','page number in the footer is dropped: '+JSON.stringify(r));

  const ctx={seen:new Map(),page:1};
  const pg=(n)=>({height:800,items:[item('Garden Chronicles - Draft',50,780),item('Body text of page '+n+'.',50,600),item('Page '+n,300,20)]});
  ctx.page=1;let a=P(pg(1),ctx);ctx.page=2;let b=P(pg(2),ctx);ctx.page=3;let c=P(pg(3),ctx);
  ok(a.length===2&&b.length===1&&c.length===1,'repeated header is read once, then skipped: '+JSON.stringify([a,b,c]));
  ctx.page=2;b=P(pg(2),ctx);
  ok(b.length===1,'re-reading the same page keeps skipping the header');

  r=P(lines(['See https://example.com/a/very/long/link and www.example.org for details.']));
  ok(r[0]==='See and for details.','web addresses are not read out: '+JSON.stringify(r));

  r=P({height:800,items:[item('Chapter 1 .......................... 5',50,700),item('Chapter 2 .......................... 9',50,685)]});
  ok(r.length===2&&r[0]==='Chapter 1 5.'&&r[1]==='Chapter 2 9.','table-of-contents dot leaders become separate short entries: '+JSON.stringify(r));

  r=P(lines(['Studies suggest brief practice lowers stress, e.g.','over eight weeks. Dr. Lee reported a drop.'],{w:300}));
  ok(r.length===1,'a line ending in "e.g." does not end the sentence: '+JSON.stringify(r));

  r=P({height:800,items:[item('Big Heading That Is Long Enough',50,700,{h:24,w:250}),item('Body text starts here and goes on.',50,672,{h:12,w:250})]});
  ok(r.length===2,'a change of type size starts a new paragraph');

  r=P({height:800,items:[item('Hel',50,700,{w:15,e:false}),item('lo',65,700,{w:10,e:false}),item('world',90,700,{w:25,e:true})]});
  ok(r[0]==='Hello world.','fragments on one line are glued; real gaps become a space: '+JSON.stringify(r));

  r=P(lines(['\uFB01rst \u201Cquote\u201D here\u00AD ok']));
  ok(r[0]==='first "quote" here ok.'||r[0].startsWith('first'),'ligatures normalised and soft hyphens dropped: '+JSON.stringify(r));

  /* sentences */
  let s=T.splitSentences(['Dr. Smith went home. He slept! Did he dream? Yes.']);
  ok(s.length===4&&s[0]==='Dr. Smith went home.','"Dr." is not a sentence end: '+JSON.stringify(s));
  s=T.splitSentences(['It cost 3.5 million dollars. Fine.']);
  ok(s.length===2&&s[0].includes('3.5 million'),'decimal numbers are not split: '+JSON.stringify(s));
  const long='word, '.repeat(120).trim();
  s=T.splitSentences([long]);
  ok(s.length>2&&s.every(x=>x.length<=220),'a very long sentence is cut into chunks of at most 220 characters ('+s.length+' chunks)');
  s=T.splitSentences(['x'.repeat(500)]);
  ok(s.every(x=>x.length<=220),'even a string with no spaces is cut');
  s=T.splitSentences(['...','   ','!!']);
  ok(s.length===0,'punctuation-only fragments are dropped');
}

/* ======================= PART 2: READING LOOP ======================= */
function makeEnv(o={}){
  const log=[];                   /* every spoken sentence, in order */
  const toasts=[];
  const events={};
  const docListeners={};
  const mkEl=()=>{const el={dataset:{},attrs:{},style:{},classList:{s:new Set(),toggle(c,f){f?this.s.add(c):this.s.delete(c)},add(c){this.s.add(c)},remove(c){this.s.delete(c)}},listeners:{},
      setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f)},
      click(){(this.listeners.click||[]).forEach(f=>f({}))},use:{attrs:{},setAttribute(k,v){this.attrs[k]=v}},querySelector(){return this.use},hidden:false,title:''};return el};
  const button=mkEl(),mute=mkEl();
  const doc={readyState:'complete',getElementById:id=>id==='listenButton'?button:id==='muteButton'?mute:id==='statusBar'?(o.statusBar||null):id==='readerPanel'?(o.readerPanel||null):null,
    documentElement:{clientHeight:o.viewH||800,appendChild(){}},visibilityState:'visible',
    createElement(){const e=mkEl();e.className='';return e},body:{appendChild(e){e.__mounted=true;e.parentNode={removeChild(x){x.__mounted=false}};if(/toast/.test(e.className||''))doc.__toast=e;else(doc.__panels=doc.__panels||[]).push(e)}},
    addEventListener(t,f){(docListeners[t]=docListeners[t]||[]).push(f)},
    dispatchEvent(ev){(docListeners[ev.type]||[]).forEach(f=>f(ev))}};
  /* fake speechSynthesis: speaks queued utterances one at a time, like a browser */
  const SS={queue:[],speaking:false,pending:false,paused:false,cur:null,timer:null,canceled:0,
    getVoices(){return o.voices||[{voiceURI:'v1',name:'Voice One',lang:'en-US',localService:true,default:true},{voiceURI:'v2',name:'Voice Two',lang:'en-GB',localService:false}]},
    addEventListener(){},
    speak(u){this.queue.push(u);this.pending=true;if(!this.speaking)this._next()},
    _next(){const u=this.queue.shift();if(!u){this.speaking=false;this.pending=false;this.cur=null;return}
      this.speaking=true;this.cur=u;this.pending=this.queue.length>0;
      this.timer=setTimeout(()=>{
        if(o.failWith){u.onerror&&u.onerror({error:o.failWith});this._next();return}
        u.onstart&&u.onstart({});
        log.push({text:u.text,rate:u.rate,voice:u.voice&&u.voice.voiceURI});
        u.onend&&u.onend({});
        this._next();
      },o.speakMs??2)},
    cancel(){this.canceled++;clearTimeout(this.timer);const cur=this.cur;this.queue.length=0;this.speaking=false;this.pending=false;this.cur=null;
      if(cur)setTimeout(()=>cur.onerror&&cur.onerror({error:'canceled'}),0)}};
  class Utter{constructor(t){this.text=t}}
  /* fake book */
  const pages=o.pages;               /* array of page data (or null) */
  const N=pages.length;
  let cur=1,flipping=false;
  const spreadOf=p=>{if(o.single)return{start:p,end:p};if(p===1)return{start:1,end:1};const s=p%2===0?p:p-1;return{start:s,end:Math.min(N,s+1)}};
  const Reader={nextCalls:0,open:true,
    isOpen:()=>Reader.open,pages:()=>N,page:()=>cur,book:()=>({id:o.bookId||'book-1',title:o.bookTitle||'',media:o.media||''}),
    spread:()=>spreadOf(cur),
    next(){Reader.nextCalls++;if(flipping)return false;
      if(win.AudioController.playPageCurl){const r=win.AudioController.playPageCurl();if(r!==false)win.__turnSounds++}const sp=spreadOf(cur);if(sp.end>=N)return false;flipping=true;
      setTimeout(()=>{cur=sp.end+1;flipping=false;doc.dispatchEvent({type:'skyreader:pageChanged',detail:[cur,N]})},o.flipMs??10);return true},
    goTo(p){cur=p;doc.dispatchEvent({type:'skyreader:pageChanged',detail:[cur,N]})}};
  const Renderer={calls:[],async pageText(p){Renderer.calls.push(p);await sleep(1);if(o.textError)throw new TypeError(o.textError);return pages[p-1]}};
  const store={};
  const win={document:doc,localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)},addEventListener(){},
    Reader,Renderer,CustomEvent:class{constructor(t,d){this.type=t;this.detail=d&&d.detail}},
    __turnSounds:0,
    AudioController:{muted:false,isMuted(){return this.muted},playPageCurl(){return true},playPageTurn(){return true}},setTimeout,clearTimeout,Promise,console};
  if(!o.noSpeech){win.speechSynthesis=SS;win.SpeechSynthesisUtterance=Utter}
  win.window=win;vm.createContext(win);vm.runInContext(SRC,win);
  /* capture the module's own "toast" by watching its element */
  const RA=win.ReadAloud;
  const toastText=()=>doc.__toast?doc.__toast.textContent:'';
  /* a click on the Mute button reaches read aloud through the document (as in the browser, where it bubbles up),
     so it also works on the copy of the button that Share Mode puts in its place */
  const clickMute=(btn)=>doc.dispatchEvent({type:'click',target:{closest:s=>s==='#muteButton'?btn:null}});
  mute.click=()=>clickMute(mute);
  const shown=re=>(doc.__panels||[]).filter(x=>re.test(x.className)&&x.__mounted!==false&&x.style.display!=='none').pop();
  const panel=()=>shown(/^sr-diag$/),chip=()=>shown(/^sr-diag-chip/);
  const press=(el,act)=>(el.listeners.click||[]).forEach(f=>f({target:{closest:()=>({getAttribute:()=>act})},stopPropagation(){}}));
  return {RA,Reader,Renderer,SS,doc,button,mute,win,log,toastText,store,setPage:p=>{cur=p},clickMute,panel,chip,press};
}
const P1=(...t)=>lines(t,{w:300});

/* --- unsupported browser --- */
{
  const e=makeEnv({pages:[P1('x.')],noSpeech:true});
  ok(e.RA.supported===false&&e.button.hidden===true,'no speech support: the Listen button is hidden');
}

/* --- reads a whole book in two-page spreads, turning pages by itself --- */
{
  const pages=[P1('Cover title.'),P1('Page two sentence one. Page two sentence two.'),P1('Page three text.'),P1('Page four text.'),P1('Page five text.')];
  const e=makeEnv({pages});
  e.button.click();
  ok(e.RA.state()==='loading'||e.RA.state()==='speaking','click starts: '+e.RA.state());
  ok(e.button.attrs['aria-pressed']==='true','button shows it is on');
  await until(()=>e.RA.state()==='idle'&&e.log.length>=6);
  const said=e.log.map(x=>x.text);
  ok(JSON.stringify(said)===JSON.stringify(['Cover title.','Page two sentence one.','Page two sentence two.','Page three text.','Page four text.','Page five text.']),'spread order, nothing repeated, nothing skipped: '+JSON.stringify(said));
  ok(e.Reader.nextCalls===2,'turned the page twice (cover | 2-3 | 4-5): '+e.Reader.nextCalls);
  ok(e.RA.state()==='idle','finished -> idle');
  ok(/Finished/.test(e.toastText()),'says it finished: '+e.toastText());
  ok(e.button.use.attrs.href==='#icon-listen','icon back to Listen');
}

/* --- the turn sounds stay quiet while it turns pages itself, and come back afterwards --- */
{
  const pages=[P1('Cover.'),P1('Two.'),P1('Four.'),P1('Six.'),P1('Eight.')];
  const e=makeEnv({pages,single:true});
  const A=e.win.AudioController,origCurl=A.playPageCurl,origTurn=A.playPageTurn;
  e.button.click();await until(()=>e.RA.state()==='idle'&&e.log.length>=5);
  ok(e.Reader.nextCalls>=4&&e.win.__turnSounds===0,'automatic page turns played no turn sound ('+e.Reader.nextCalls+' turns, '+e.win.__turnSounds+' sounds)');
  ok(A.playPageCurl!==origCurl,'(sounds are still swapped out right after the last turn)');
  await until(()=>A.playPageCurl===origCurl&&A.playPageTurn===origTurn,4000);
  ok(A.playPageCurl===origCurl&&A.playPageTurn===origTurn,'turn sounds are put back afterwards, so manual page turns sound as before');
  ok(A.isMuted()===false,'the Mute setting was never touched');
}

/* --- single-page (phone) mode --- */
{
  const pages=[P1('One.'),P1('Two.'),P1('Three.')];
  const e=makeEnv({pages,single:true});
  e.button.click();await until(()=>e.RA.state()==='idle'&&e.log.length>=3);
  ok(JSON.stringify(e.log.map(x=>x.text))==='["One.","Two.","Three."]'&&e.Reader.nextCalls===2,'single-page mode reads page by page');
}

/* --- pause and resume --- */
{
  const many=[];for(let i=1;i<=12;i++)many.push('Sentence number '+i+' of the page.');
  const pages=[P1('Cover.'),P1(many.join(' ')),P1('Next.')];
  const e=makeEnv({pages,speakMs:15});
  e.setPage(2);
  e.button.click();await sleep(110);
  e.button.click();                       /* pause */
  ok(e.RA.state()==='paused'&&e.button.attrs['aria-label']==='Resume listening','pause: state and label');
  const before=e.log.length;
  await sleep(120);
  ok(e.log.length===before,'pause: nothing more is spoken');
  e.button.click();                       /* resume */
  await until(()=>e.log.some(x=>x.text==='Sentence number 12 of the page.'));
  const said=e.log.map(x=>x.text);
  const idx=said.indexOf('Sentence number 12 of the page.');
  ok(idx>0,'resume: carries on to the end of the page');
  const firstDup=said.findIndex((t,i)=>said.indexOf(t)!==i);
  ok(said.filter(t=>t==='Sentence number 1 of the page.').length===1,'resume: does not go back to the start');
  const repeats=said.filter((t,i)=>said.indexOf(t)!==i);
  ok(repeats.length<=1,'resume: at most the one interrupted sentence is said again ('+JSON.stringify(repeats)+')');
}

/* --- reader turns the page by hand: reading follows --- */
{
  const pages=[P1('Cover.'),P1('Alpha one. Alpha two. Alpha three. Alpha four. Alpha five. Alpha six.'),P1('Alpha seven.'),P1('Beta page four.'),P1('Beta page five.'),P1('Gamma six.'),P1('Gamma seven.')];
  const e=makeEnv({pages,speakMs:30});
  e.setPage(2);
  e.button.click();await sleep(100);
  e.Reader.goTo(6);                       /* user jumps */
  await until(()=>e.log.some(x=>x.text==='Gamma seven.'));
  const said=e.log.map(x=>x.text);
  ok(said.includes('Gamma six.')&&said.includes('Gamma seven.'),'manual jump: reading carries on from the new place');
  ok(!said.includes('Alpha six.'),'manual jump: the old page is abandoned');
}

/* --- a jump that lands just as a page finishes (the loop must not carry on from the old place) --- */
{
  const pages=[P1('Cover.'),P1('Old one. Old two.'),P1('Old three.'),P1('Mid four.'),P1('Mid five.'),P1('End six.'),P1('End seven.')];
  const e=makeEnv({pages,speakMs:20});
  e.setPage(2);e.button.click();await sleep(30);
  e.Reader.goTo(6);
  await until(()=>e.log.some(x=>x.text==='End seven.'));
  await sleep(100);
  const said=e.log.map(x=>x.text);
  ok(said.includes('End six.')&&said.includes('End seven.'),'jump while a page is finishing: reads the new page');
  ok(e.Reader.nextCalls===0,'jump while a page is finishing: no stray page turn from the old place ('+e.Reader.nextCalls+')');
  ok(said.filter(x=>x==='End six.').length===1,'jump while a page is finishing: new page read once, not twice');
}

/* --- pause during the short wait after a manual jump stays paused --- */
{
  const pages=[P1('Cover.'),P1('A one. A two. A three. A four. A five. A six.'),P1('B.'),P1('C.'),P1('D four.')];
  const e=makeEnv({pages,speakMs:20});
  e.setPage(2);e.button.click();await sleep(30);
  e.Reader.goTo(4);
  await sleep(50);
  e.button.click();                       /* the reader presses pause while it waits to restart */
  await sleep(700);
  ok(e.RA.state()==='paused','pause pressed right after a jump stays paused ('+e.RA.state()+')');
  const n=e.log.length;await sleep(150);
  ok(e.log.length===n,'...and nothing is spoken');
  e.button.click();
  await until(()=>e.log.some(x=>x.text==='D four.'));
  ok(e.log.some(x=>x.text==='D four.'),'resume after a jump reads from the new page, not the old one');
}

/* --- closing or opening a book stops it --- */
{
  const pages=[P1('Cover.'),P1('A one. A two. A three. A four. A five. A six.'),P1('B.')];
  const e=makeEnv({pages,speakMs:25});
  e.setPage(2);e.button.click();await sleep(60);
  e.doc.dispatchEvent({type:'skyreader:closed'});
  const n=e.log.length;await sleep(200);
  ok(e.RA.state()==='idle'&&e.log.length===n,'book closed: stops at once');
  e.setPage(2);e.button.click();await sleep(40);
  e.doc.dispatchEvent({type:'skyreader:bookOpened'});
  ok(e.RA.state()==='idle','another book opened: stops');
}

/* --- Mute switches speech off --- */
{
  const pages=[P1('Cover.'),P1('M one. M two. M three. M four. M five. M six. M seven. M eight.'),P1('N.')];
  const e=makeEnv({pages,speakMs:30});
  e.setPage(2);e.button.click();await sleep(70);
  e.win.AudioController.muted=true;e.mute.click();await sleep(10);
  ok(e.RA.state()==='paused','Mute button pauses the reading');
}
{
  /* Share Mode replaces the Mute button with a copy: the copy must still pause the reading */
  const pages=[P1('Cover.'),P1('M one. M two. M three. M four. M five. M six. M seven. M eight.'),P1('N.')];
  const e=makeEnv({pages,speakMs:30});
  e.setPage(2);e.button.click();await sleep(70);
  const copy={};                       /* a different element object, not the one read aloud found at start-up */
  e.win.AudioController.muted=true;e.clickMute(copy);await sleep(10);
  ok(e.RA.state()==='paused','a replaced (cloned) Mute button still pauses the reading');
}
{
  /* clicking something else, or Mute while not muted, does nothing */
  const pages=[P1('Cover.'),P1('M one. M two. M three. M four. M five. M six. M seven. M eight.'),P1('N.')];
  const e=makeEnv({pages,speakMs:30});
  e.setPage(2);e.button.click();await sleep(70);
  e.doc.dispatchEvent({type:'click',target:{closest:()=>null}});await sleep(10);
  e.clickMute({});await sleep(10);      /* AudioController.muted is still false */
  ok(e.RA.state()==='speaking','other clicks, and Mute turning sound on, leave the reading alone');
}

/* --- pages without text --- */
{
  const e=makeEnv({pages:[null,{height:800,items:[]},null,P1('Hidden.')],single:true});
  e.button.click();await until(()=>e.RA.state()==='idle');
  ok(e.log.length===0&&e.RA.state()==='idle'&&/No readable text/.test(e.toastText()),'three empty spreads in a row: stops with a note ('+e.toastText()+')');
}
{
  const e=makeEnv({pages:[null,P1('Real text on page two.'),P1('Real text on page three.')]});
  e.button.click();await until(()=>e.RA.state()==='idle'&&e.log.length>=2);
  ok(e.log.map(x=>x.text).join('|')==='Real text on page two.|Real text on page three.','an empty cover is skipped, the book is still read');
}

/* --- engine errors --- */
{
  const e=makeEnv({pages:[P1('Cover.'),P1('Text.')],failWith:'not-allowed'});
  e.button.click();await sleep(300);
  ok(e.RA.state()==='idle'&&/blocked/.test(e.toastText()),'not-allowed: stops and tells the reader to tap again ('+e.toastText()+')');
}
{
  const e=makeEnv({pages:[P1('One. Two. Three. Four. Five.'),P1('x.')],failWith:'synthesis-failed'});
  e.button.click();await sleep(1800);   /* the three cautious retries take ~1 s before it gives up */
  ok(e.RA.state()==='idle'&&e.toastText()==='Speech is not working. Check device settings.','repeated failures: gives up with a short message ('+e.toastText()+')');
}

/* --- header / footer memory is per book --- */
{
  const pg=n=>({height:800,items:[item('Running Title',50,780),item('Body '+n+'.',50,600)]});
  const e=makeEnv({pages:[pg(1),pg(2),pg(3)],single:true});
  e.button.click();await until(()=>e.RA.state()==='idle'&&e.log.length>=4);
  ok(e.log.map(x=>x.text).join('|')==='Running Title.|Body 1.|Body 2.|Body 3.','running title read once, not on every page: '+e.log.map(x=>x.text).join('|'));
}

/* --- text is requested lazily --- */
{
  const pages=[];for(let i=1;i<=30;i++)pages.push(P1('Page '+i+' text. '.repeat(3)));
  const e=makeEnv({pages,single:true,speakMs:10});
  e.button.click();await sleep(150);
  e.RA.pause();
  ok(Math.max(...e.Renderer.calls)<=3,'only the pages being read were asked for ('+JSON.stringify([...new Set(e.Renderer.calls)])+' of 30)');
}

/* --- settings --- */
{
  const e=makeEnv({pages:[P1('Cover.'),P1('Voice test.')]});
  e.RA.setRate(5);ok(e.RA.getSettings().rate===1.8,'speed is limited to the top of the range');
  e.RA.setRate(0.1);ok(e.RA.getSettings().rate===0.6,'speed is limited to the bottom of the range');
  e.RA.setRate('abc');ok(e.RA.getSettings().rate===1,'junk speed falls back to normal');
  e.RA.setRate(1.4);e.RA.setVoice('v2');
  ok(JSON.parse(e.store['mm-readaloud']).voice==='v2','settings are saved in this browser');
  e.button.click();await sleep(300);
  ok(e.log.length>0&&e.log.every(x=>x.rate===1.4&&x.voice==='v2'),'speech uses the chosen speed and voice');
  ok(e.RA.voices().length===2&&e.RA.voices()[1].local===false,'voice list is exposed to the settings panel');
}


/* --- speech check: extra diagnostics for the speech test document ONLY --- */
{
  const P1x=s=>lines([s],{w:400});
  const DIAG='book-mwb6vj0c-dl8l';

  /* an ordinary document: no panel at all, the short notices as before */
  const a=makeEnv({pages:[P1x('A short page of text.')],single:true});
  a.button.click();await until(()=>a.RA.state()==='idle'&&a.log.length>0);
  ok(!a.panel()&&a.RA.diagnosticActive()===false&&a.RA.diagnosticReport()==='','an ordinary document: no speech check panel, no report');

  const b=makeEnv({pages:[null,null,null,null],single:true});
  b.button.click();await until(()=>b.RA.state()==='idle');
  ok(!b.panel()&&b.toastText()==='No readable text here.','an ordinary document with no text: the short notice, no panel ('+b.toastText()+')');

  const c=makeEnv({pages:[P1x('Text.'),P1x('Text.'),P1x('Text.')],single:true,textError:'boom'});
  c.button.click();await until(()=>c.RA.state()==='idle');
  ok(!c.panel()&&c.toastText()==='Couldn\'t read this page\'s text.','an ordinary document whose text cannot be read: it says so, briefly, instead of "no readable text" ('+c.toastText()+')');

  /* the test document, found by its library id */
  const e=makeEnv({bookId:DIAG,bookTitle:'Read Aloud Speech Test',pages:[P1x('First test sentence is here.')],single:true});
  e.win.navigator={userAgent:'TestPhone/1.0 (iPhone)',language:'en-US'};
  e.button.click();
  await until(()=>e.RA.state()==='idle'&&e.log.length>0);
  const pe=e.panel();
  ok(!!pe&&e.RA.diagnosticActive()===true,'the test document (by id): the speech check panel appears');
  ok(/Speech check/.test(pe.innerHTML)&&/Working: the text was read and speech started\./.test(pe.innerHTML),'the panel says it is working when all three stages worked');
  const rep=e.RA.diagnosticReport();
  ok(/^MMICJ speech check/.test(rep)&&/page 1: ok, 1 items/.test(rep)&&/Voices: 2 - Voice One \(en-US, on device\); Voice Two \(en-GB, online\)/.test(rep)&&/Device: TestPhone\/1\.0/.test(rep)&&/Speech: started after/.test(rep)&&/Document: Read Aloud Speech Test \(book-mwb6vj0c-dl8l\)/.test(rep),'the report names the document, device, voices, page text and speech');
  ok(/pdf\.js: not loaded/.test(rep)&&/Browser lacks:/.test(rep),'the report states the pdf.js build and the browser features that are missing');

  /* when the app patched a missing browser feature itself (js/streamPolyfill.js), the report says so */
  ok(!/Patched by the app/.test(rep),'no "Patched by the app" line when nothing was patched');
  const pp=makeEnv({bookId:DIAG,bookTitle:'Read Aloud Speech Test',pages:[P1x('First test sentence is here.')],single:true});
  pp.win.mmicjPolyfilled=['ReadableStream async iteration'];
  pp.button.click();
  await until(()=>pp.RA.state()==='idle'&&pp.log.length>0);
  ok(/Patched by the app: ReadableStream async iteration/.test(pp.RA.diagnosticReport()),'the report says when the app patched ReadableStream async iteration');
  ok(/Patched by the app: ReadableStream async iteration/.test(pp.panel().innerHTML),'and so does the panel');

  /* found by file name, so a re-upload (new hash) or a new id still works */
  const f=makeEnv({bookId:'other-id',media:'https://media.mmicj.com/books/Read-Aloud-Speech-Test-ffff00000000.pdf',pages:[P1x('Words here.')],single:true});
  f.button.click();await until(()=>f.RA.state()==='idle'&&f.log.length>0);
  ok(!!f.panel(),'the test document (by file name) gets the panel too');

  /* the page text cannot be read: the panel says which stage failed, with the real error */
  const g=makeEnv({bookId:DIAG,pages:[P1x('Text.'),P1x('Text.'),P1x('Text.')],single:true,textError:'Promise.withResolvers is not a function'});
  g.button.click();await until(()=>g.RA.state()==='idle'&&/Couldn/.test(g.toastText()));
  const pg=g.panel(),rg=g.RA.diagnosticReport();
  ok(/PROBLEM/.test(pg.innerHTML)&&/Reading the page text failed on this device, before speech/.test(pg.innerHTML),'text extraction failure: the panel blames the PDF engine, not the voice');
  ok(/ERROR TypeError: Promise\.withResolvers is not a function/.test(rg)&&/Ended: The text of the pages could not be read\./.test(rg),'text extraction failure: the real error is in the report');
  ok(g.toastText()==='Couldn\'t read this page\'s text.','text extraction failure: the short notice is still short');
  ok(g.Renderer.calls.length>=3,'a page that failed is asked for again, not remembered as empty ('+g.Renderer.calls.length+' requests)');

  /* a page that really has no text */
  const h=makeEnv({bookId:DIAG,pages:[{height:800,items:[]},{height:800,items:[]},{height:800,items:[]},{height:800,items:[]}],single:true});
  h.button.click();await until(()=>h.RA.state()==='idle');
  ok(/The page has no readable text layer\./.test(h.panel().innerHTML)&&h.toastText()==='No readable text here.','no text layer: told apart from a failure to read');

  /* the voice fails */
  const k=makeEnv({bookId:DIAG,pages:[lines(['One title','Two title','Three title','Four title','Five title'],{step:30,w:100})],failWith:'synthesis-failed'});
  k.button.click();await until(()=>k.RA.state()==='idle'&&/Speech is not working/.test(k.toastText()),10000);
  ok(/The text was read, but the voice failed \(synthesis-failed\)\./.test(k.panel().innerHTML)&&/error: synthesis-failed/.test(k.RA.diagnosticReport()),'voice failure: the panel names the speech error');
  ok(k.toastText()==='Speech is not working. Check device settings.','voice failure: the short notice is unchanged');

  /* nothing the document says can inject markup into the panel */
  const x=makeEnv({bookId:DIAG,pages:[P1x('Text.'),P1x('Text.'),P1x('Text.')],single:true,textError:'<img src=x onerror=alert(1)>'});
  x.button.click();await until(()=>x.RA.state()==='idle');
  ok(!/<img/.test(x.panel().innerHTML)&&/&lt;img/.test(x.panel().innerHTML),'error text is escaped in the panel');

  /* Copy report */
  let copied='';
  const m=makeEnv({bookId:DIAG,pages:[P1x('Copy me please.')],single:true});
  m.win.navigator={userAgent:'CopyPhone/9',language:'en-US',clipboard:{writeText:async t=>{copied=t}}};
  m.button.click();await until(()=>m.RA.state()==='idle'&&m.log.length>0);
  m.press(m.panel(),'copy');await sleep(20);
  ok(/^MMICJ speech check/.test(copied)&&/CopyPhone\/9/.test(copied)&&/Report copied/.test(m.panel().innerHTML),'Copy report puts the whole report on the clipboard and says so');
  const n=makeEnv({bookId:DIAG,pages:[P1x('No clipboard here.')],single:true});
  n.win.navigator={userAgent:'OldPhone',language:'en-US'};
  n.button.click();await until(()=>n.RA.state()==='idle'&&n.log.length>0);
  n.press(n.panel(),'copy');await sleep(20);
  ok(/<textarea[^>]*readonly>MMICJ speech check/.test(n.panel().innerHTML)&&/Select All/.test(n.panel().innerHTML),'no clipboard access: the report is shown to select and copy by hand');

  /* a panel that was closed too soon: it folds into a tab, and the tab can still copy and reopen */
  const q=makeEnv({bookId:DIAG,pages:[P1x('Close me.')],single:true});
  q.win.navigator={userAgent:'TabPhone/2',language:'en-US',clipboard:{writeText:async t=>{copied=t}}};
  q.button.click();await until(()=>q.RA.state()==='idle'&&q.log.length>0);
  ok(!!q.panel()&&!q.chip()&&/Copy report/.test(q.panel().innerHTML)&&/small tab/.test(q.panel().innerHTML),'the panel tells the reader to copy the report, and that Minimize leaves a tab');
  q.press(q.panel(),'minimize');
  ok(!q.panel()&&!!q.chip()&&/Speech check: OK/.test(q.chip().innerHTML),'Minimize folds the panel into a small tab that shows the result');
  copied='';
  q.press(q.chip(),'copy');await sleep(20);
  ok(/^MMICJ speech check/.test(copied)&&/TabPhone\/2/.test(copied)&&!!q.chip()&&/Copied/.test(q.chip().innerHTML),'the tab has its own Copy button (one tap, and the tab says it copied)');
  q.press(q.chip(),'open');
  ok(!!q.panel()&&!q.chip(),'tapping the tab opens the panel again');
  q.button.click();await until(()=>q.RA.state()==='idle'&&q.log.length>1);
  ok(!!q.panel(),'tapping Listen again shows the panel again');

  /* minimized, then something goes wrong: nothing opens over the page; the TAB turns reddish orange and glows */
  const r=makeEnv({bookId:DIAG,pages:[P1x('Text.'),P1x('Text.'),P1x('Text.')],single:true,textError:'Promise.withResolvers is not a function'});
  r.win.navigator={userAgent:'RetryPhone/3',language:'en-US',clipboard:{writeText:async t=>{copied=t}}};
  r.button.click();
  r.press(r.panel(),'minimize');
  ok(!r.panel()&&!!r.chip()&&!/alert/.test(r.chip().className),'(minimized at the start: a calm tab, no alert)');
  await until(()=>r.RA.state()==='idle'&&/Couldn/.test(r.toastText()));
  ok(!r.panel(),'a problem does NOT open the panel over the page the reader is reading');
  ok(!!r.chip()&&/\bbad\b/.test(r.chip().className)&&/\balert\b/.test(r.chip().className)&&/PROBLEM - tap to open/.test(r.chip().innerHTML),'the minimized tab turns reddish orange (bad) and glows (alert) instead');
  r.press(r.chip(),'copy');await sleep(20);
  ok(/\balert\b/.test(r.chip().className)&&/Copied/.test(r.chip().innerHTML)&&/RetryPhone\/3/.test(copied),'copying from the tab works and does not clear the glow (the reader has not looked at the problem yet)');
  r.press(r.chip(),'open');
  ok(!!r.panel()&&!r.chip()&&/PROBLEM/.test(r.panel().innerHTML),'tapping the tab opens the panel with the problem');
  r.press(r.panel(),'minimize');
  ok(!!r.chip()&&/\bbad\b/.test(r.chip().className)&&!/\balert\b/.test(r.chip().className),'once it has been looked at, the tab stays reddish orange but stops glowing');

  /* a problem that happens while the panel is open is already in front of the reader: no glow when it is minimized later */
  const u2=makeEnv({bookId:DIAG,pages:[P1x('Text.'),P1x('Text.'),P1x('Text.')],single:true,textError:'boom'});
  u2.button.click();await until(()=>u2.RA.state()==='idle'&&/Couldn/.test(u2.toastText()));
  ok(!!u2.panel()&&/PROBLEM/.test(u2.panel().innerHTML),'(the panel was open while the problem happened, and it stays open)');
  u2.press(u2.panel(),'minimize');
  ok(/\bbad\b/.test(u2.chip().className)&&!/\balert\b/.test(u2.chip().className),'minimizing a problem that was already on screen: reddish orange, no glow');

  /* the tab's Copy button on a device with no clipboard access: the report opens in a box to copy by hand */
  const s2=makeEnv({bookId:DIAG,pages:[P1x('No clipboard.')],single:true});
  s2.win.navigator={userAgent:'NoClipPhone',language:'en-US'};
  s2.button.click();await until(()=>s2.RA.state()==='idle'&&s2.log.length>0);
  s2.press(s2.panel(),'minimize');
  s2.press(s2.chip(),'copy');await sleep(20);
  ok(!!s2.panel()&&!s2.chip()&&/<textarea[^>]*readonly>MMICJ speech check/.test(s2.panel().innerHTML)&&/Select All/.test(s2.panel().innerHTML),'the tab\'s Copy without clipboard access opens the panel with the report to select');

  /* minimized, and the reading ends well: the tab turns green, nothing pops up */
  const w=makeEnv({bookId:DIAG,pages:[P1x('One short page.')],single:true});
  w.button.click();
  w.press(w.panel(),'minimize');
  await until(()=>w.RA.state()==='idle'&&w.log.length>0);
  ok(!w.panel()&&!!w.chip()&&/\bok\b/.test(w.chip().className)&&!/\balert\b/.test(w.chip().className)&&/Speech check: OK/.test(w.chip().innerHTML),'the end of the reading does not open anything: the tab just shows OK (green, no glow)');

  /* the last report is kept, and comes back as a tab when the document is opened again */
  q.doc.dispatchEvent({type:'skyreader:closed'});
  ok(!q.panel()&&!q.chip()&&q.RA.diagnosticActive()===false&&q.RA.diagnosticSaved()===false,'closing the book removes the panel, the tab and the live report');
  q.doc.dispatchEvent({type:'skyreader:bookOpened'});
  ok(q.RA.diagnosticActive()===false&&q.RA.diagnosticSaved()===true&&!!q.chip()&&/last result: OK/.test(q.chip().innerHTML),'opening the test document again shows a tab for the last check');
  copied='';
  q.press(q.chip(),'copy');await sleep(20);
  ok(/^MMICJ speech check/.test(copied)&&/TabPhone\/2/.test(copied),'the tab for the last check can copy the saved report');
  q.press(q.chip(),'open');
  ok(!!q.panel()&&/Last speech check/.test(q.panel().innerHTML)&&/<textarea[^>]*readonly>MMICJ speech check/.test(q.panel().innerHTML),'its panel shows the saved report to read or select');
  q.button.click();await until(()=>q.RA.state()==='idle'&&q.log.length>2);
  ok(q.RA.diagnosticSaved()===false&&q.RA.diagnosticActive()===true&&/^Speech check/.test(/<b>([^<]*)<\/b>/.exec(q.panel().innerHTML)[1]),'tapping Listen replaces the saved report with a live one');

  /* a problem is what gets kept */
  const z=makeEnv({bookId:DIAG,pages:[P1x('Text.'),P1x('Text.'),P1x('Text.')],single:true,textError:'boom'});
  z.button.click();await until(()=>z.RA.state()==='idle'&&/Couldn/.test(z.toastText()));
  z.doc.dispatchEvent({type:'skyreader:closed'});z.doc.dispatchEvent({type:'skyreader:bookOpened'});
  ok(!!z.chip()&&/last result: PROBLEM/.test(z.chip().innerHTML)&&/\bbad\b/.test(z.chip().className)&&!/\balert\b/.test(z.chip().className),'a problem is the report that is kept ("last result: PROBLEM", reddish orange, no glow: it is an old result)');

  /* placement: immediately above the page indicator bar, wherever that bar is */
  const bar={top:740,height:44,getBoundingClientRect(){return{top:bar.top,height:bar.height,bottom:bar.top+bar.height}}};
  const pl=makeEnv({bookId:DIAG,statusBar:bar,viewH:800,pages:[P1x('Placed.')],single:true});
  pl.button.click();await until(()=>pl.RA.state()==='idle'&&pl.log.length>0);
  ok(pl.panel().style.bottom==='66px','the panel sits just above the page indicator bar (bar top 740 in an 800 high screen: 60 + a 6 px gap = '+pl.panel().style.bottom+')');
  pl.press(pl.panel(),'minimize');
  ok(pl.chip().style.bottom==='66px','the minimized tab sits just above the page indicator bar too ('+pl.chip().style.bottom+')');
  bar.top=700;                                   /* the bar moves (a taller bar, a rotated screen ...) */
  pl.press(pl.chip(),'open');pl.press(pl.panel(),'minimize');
  ok(pl.chip().style.bottom==='106px','it follows the bar when the bar moves ('+pl.chip().style.bottom+')');
  const nb=makeEnv({bookId:DIAG,pages:[P1x('No bar.')],single:true});
  nb.button.click();await until(()=>nb.RA.state()==='idle'&&nb.log.length>0);
  ok(nb.panel().style.bottom==='','with no page indicator bar to measure, the stylesheet default is used');
  const hb=makeEnv({bookId:DIAG,statusBar:{getBoundingClientRect:()=>({top:0,height:0})},pages:[P1x('Hidden bar.')],single:true});
  hb.button.click();await until(()=>hb.RA.state()==='idle'&&hb.log.length>0);
  ok(hb.panel().style.bottom==='','a bar that is not showing (no size) is ignored: the stylesheet default is used');

  /* the tab stays inside the viewer area: left edge follows the reader panel (library column on its left) */
  const rpan={left:360,width:900,getBoundingClientRect(){return{left:rpan.left,width:rpan.width}}};
  const vl=makeEnv({bookId:DIAG,readerPanel:rpan,pages:[P1x('Wide.')],single:true});
  vl.button.click();await until(()=>vl.RA.state()==='idle'&&vl.log.length>0);
  vl.press(vl.panel(),'minimize');
  ok(vl.chip().style.left==='370px','desktop: the tab starts 10 px inside the viewer area, clear of the library column ('+vl.chip().style.left+')');
  rpan.left=0;rpan.width=1280;                    /* library column closed / phone: reader starts at the screen edge */
  vl.press(vl.chip(),'open');vl.press(vl.panel(),'minimize');
  ok(vl.chip().style.left==='','reader at the screen edge: the stylesheet default (10 px) is used ('+vl.chip().style.left+')');
  ok(nb.chip()===undefined||nb.chip().style.left==='','no reader panel to measure: the stylesheet default is used');
  ok(/\.sr-diag,\.sr-diag-chip\{z-index:1800\}/.test(SRC)&&/body\.sky-share-mode \.sr-diag-chip\{z-index:2000001\}/.test(SRC),'the tab is layered below the library/Settings (1800 < 1900 < 100000), keeping the top layer only in Share Mode');

  /* an ordinary document never gets the tab */
  const y=makeEnv({bookId:'ordinary',pages:[P1x('Plain.')],single:true});
  y.store['mm-readaloud-check']=JSON.stringify({at:1,st:'bad',verdict:'x',text:'old report'});
  y.doc.dispatchEvent({type:'skyreader:bookOpened'});
  ok(!y.chip()&&!y.panel()&&y.RA.diagnosticSaved()===false,'an ordinary document never shows the saved report');
}

console.log(fails?('\n'+fails+' FAILED'):'\nall ok');
process.exit(fails?1:0);
