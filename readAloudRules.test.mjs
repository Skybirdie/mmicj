/* Tests for js/readAloudRules.js (how text is SPOKEN) and its use by js/readAloud.js.
   Run:  node readAloudRules.test.mjs                                                  */
import fs from 'fs';
import vm from 'vm';

const read=f=>fs.readFileSync(new URL(f,import.meta.url).pathname,'utf8');
const RULES=read('./js/readAloudRules.js'),SRC=read('./js/readAloud.js');
let fails=0;
const ok=(c,m)=>{if(!c){console.log('FAIL',m);fails++}else console.log('ok  ',m)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const until=async(f,ms=5000)=>{const t0=Date.now();while(Date.now()-t0<ms){if(f())return true;await sleep(15)}return f()};

/* ---------- a page of items the way Renderer.pageText returns them ---------- */
const item=(s,x,y,o={})=>({s,x,y,w:o.w??s.length*5.5,h:o.h??12,e:o.e??true});
const lines=(texts,o={})=>({height:o.height??800,items:texts.map((t,i)=>item(t,o.x??50,(o.top??700)-i*(o.step??15),{w:o.w??Math.max(t.length*5.5,1)}))});

function load(withRules=true){
  const store={};
  const w={document:{readyState:'complete',getElementById:()=>null,addEventListener(){},createElement(){return{}}},
    localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=String(v)}},addEventListener(){},setTimeout,clearTimeout,Promise,console};
  w.window=w;vm.createContext(w);
  if(withRules)vm.runInContext(RULES,w);
  vm.runInContext(SRC,w);
  return w;
}

/* ======================= PART 1: THE RULES ======================= */
{
  const w=load();
  const S=(t,end)=>w.ReadAloudRules.spoken(t,{end:!!end});

  /* names and acronyms */
  const MJ='em em eye see jay';      /* how MMICJ is written for the voice: its letters, never "m mic j" */
  ok(S('Welcome to MMICJ today.')==='Welcome to '+MJ+' today.','MMICJ -> letters: '+S('Welcome to MMICJ today.'));
  ok(S('MMicj')===MJ,'MMicj (the way it is usually written) -> letters: '+S('MMicj'));
  ok(S('mmicj and Mmicj and MmIcJ and MMICJ')===[MJ,'and',MJ,'and',MJ,'and',MJ].join(' '),'any capitals of mmicj: '+S('mmicj and Mmicj and MmIcJ and MMICJ'));
  ok(S("MMICJ's library")==="em em eye see jay's library",'MMICJ possessive');
  ok(S('Visit mmicj.com today')==='Visit '+MJ+'.com today','inside an address: '+S('Visit mmicj.com today'));
  ok(S('the mmicj-admin portal')==='the '+MJ+' admin portal','joined with a hyphen: '+S('the mmicj-admin portal'));
  ok(S('MMICJs library')===MJ+' s library','glued to a plural s: '+S('MMICJs library'));
  ok(S('MM icj and MM\u00ADicj')===MJ+' and '+MJ,'a space or soft hyphen between its letters: '+S('MM icj and MM\u00ADicj'));
  ok(S('(MMICJ)')==='('+MJ+')','in brackets');
  ok(!/mmicj/i.test(S('x MMicj y mmicj. MMICJ, mMiCj;')),'no written form of mmicj survives');
  ok(S('Sister Liburd and Liburd\'s book')==="Sister Lie bird and Lie bird's book",'Liburd: '+S('Sister Liburd and Liburd\'s book'));
  ok(S('Naphatali spoke.')==='Nah fah tah lee spoke.','Naphatali');
  ok(S('Naphatalis')==='Naphatalis','a longer word that merely contains a name is left alone');
  ok(S('Liburdson')==='Liburdson','prefix of a longer word is left alone');

  /* abbreviations */
  ok(S('Fruit, e.g. apples, are sweet.')==='Fruit, for example apples, are sweet.','e.g. -> for example: '+S('Fruit, e.g. apples, are sweet.'));
  ok(S('E.g. apples.')==='For example apples.','capital E.g. -> For example');
  ok(S('That is, i.e. the end.')==='That is, that is the end.','i.e. -> that is');
  ok(S('Apples, pears, etc.',true)==='Apples, pears, et cetera.','etc. at the end keeps its full stop: '+S('Apples, pears, etc.',true));
  ok(S('Apples, etc. The next')==='Apples, et cetera. The next','etc. before a capital keeps its full stop: '+S('Apples, etc. The next'));
  ok(S('Dr. Lee and Mrs. Jones met Prof. Smith.')==='Doctor Lee and Missus Jones met Professor Smith.','titles: '+S('Dr. Lee and Mrs. Jones met Prof. Smith.'));
  ok(S('Red vs. blue')==='Red versus blue','vs.');
  ok(S('See p. 12 and pp. 3-4.')==='See page 12 and pages 3 to 4.','p. / pp.: '+S('See p. 12 and pp. 3-4.'));
  ok(S('Made in the U.S.A. and the U.K. today.')==='Made in the U S A and the U K today.','dotted capitals are spelled: '+S('Made in the U.S.A. and the U.K. today.'));
  ok(S('Back in the U.S.',true)==='Back in the U S.','dotted capitals at the end keep one full stop: '+S('Back in the U.S.',true));
  ok(S('At 5 p.m. we leave.')==='At 5 P M we leave.','p.m.: '+S('At 5 p.m. we leave.'));
  ok(S('Wake up at six.')==='Wake up at six.','plain text is untouched');
  ok(S("Don't worry, it's fine.")==="Don't worry, it's fine.",'contractions are untouched');

  /* colons, semicolons and dashes never spoken, they only separate */
  ok(S('Name: John')==='Name, John','colon -> pause: '+S('Name: John'));
  ok(S('Rules; be kind; be brave.')==='Rules, be kind, be brave.','semicolons: '+S('Rules; be kind; be brave.'));
  ok(S('Peace — true peace – is rare.')==='Peace, true peace, is rare.','dashes (long, short): '+S('Peace — true peace – is rare.'));
  ok(S('Peace--true peace')==='Peace, true peace','double hyphen');
  ok(S('Peace - true peace')==='Peace, true peace','spaced hyphen');
  ok(S('A well-known fact')==='A well known fact','hyphen inside a word is silent: '+S('A well-known fact'));
  ok(S('At 10:30 on John 3:16 and 3:1 odds')==='At 10 30 on John 3 16 and 3 1 odds','times and verses: the colon is never said: '+S('At 10:30 on John 3:16 and 3:1 odds'));
  ok(S('John 3:16-18 says')==='John 3 16 to 18 says','verse range: '+S('John 3:16-18 says'));
  ok(S('The war of 1914-1918 and 5-10 items')==='The war of 1914 to 1918 and 5 to 10 items','number ranges with a hyphen: '+S('The war of 1914-1918 and 5-10 items'));
  ok(S('COVID-19 and e-mail and well\u2010known')==='COVID 19 and e mail and well known','hyphens between letters and digits: '+S('COVID-19 and e-mail and well\u2010known'));
  ok(S('A\u2012B')==='A, B'&&S('C\u2015D')==='C, D'&&S('E\u2E3AF')==='E, F','other dash characters: '+S('A\u2012B')+' | '+S('C\u2015D')+' | '+S('E\u2E3AF'));
  ok(S('Note:Hello')==='Note, Hello'&&S('x;y')==='x, y'&&S('a\uFF1Ab\uFF1Bc')==='a, b, c','colon and semicolon in every form, with or without spaces: '+S('Note:Hello')+' | '+S('x;y')+' | '+S('a\uFF1Ab\uFF1Bc'));
  ok(S('Rate -5 degrees')==='Rate -5 degrees','a minus sign in front of a digit stays');
  ok(S('Pages 5–10 only')==='Pages 5 to 10 only','a range of numbers: '+S('Pages 5–10 only'));
  ok(S('Ingredients:',true)==='Ingredients.','a title ending in a colon ends with a full stop');
  ok(S('Ingredients:')==='Ingredients,','a colon ending a cut piece is a comma');
  ok(S('Note: ; — odd')==='Note, odd','stacked separators collapse: '+S('Note: ; — odd'));
  ok(S('Hello. — Next')==='Hello. Next','a dash after a full stop is dropped');
  ok(S('Title —',true)==='Title.','a dash at the end of a paragraph');
  ok(!/[:;—–]/.test(S('a: b; c — d – e')),'none of : ; — – is left in the spoken text');
  ok(!/[:;\u2012-\u2015\u2010\u2011-]/.test(S('a: b; c — d – e - f -g h- i--j k‐l 1:2 3-4 x:y;z')),'no colon, semicolon or hyphen/dash of any kind survives: '+S('a: b; c — d – e - f -g h- i--j k‐l 1:2 3-4 x:y;z'));

  /* lists */
  ok(S('apples, pears and oranges')==='apples, pears, and oranges','list comma added: '+S('apples, pears and oranges'));
  ok(S('I bought apples, pears or oranges today.')==='I bought apples, pears, or oranges today.','list with or');
  ok(S('Peter, James, John and Andrew came.')==='Peter, James, John, and Andrew came.','long list');
  ok(S('apples, pears, and oranges')==='apples, pears, and oranges','existing serial comma is not doubled');
  ok(S('apples and oranges')==='apples and oranges','two items: no comma');
  ok(S('However, he and she left.')==='However, he and she left.','an introductory word is not a list: '+S('However, he and she left.'));
  ok(S('In the beginning, God and man walked.')==='In the beginning, God and man walked.','an introductory phrase is not a list');

  /* numbers at the start of a sentence */
  ok(S('16 For God so loved the world')==='16. For God so loved the world','pause after a leading number: '+S('16 For God so loved the world'));
  ok(S('1) First point')==='1. First point','1) -> 1.');
  ok(S('(2) Second point')==='2. Second point','(2) -> 2.');
  ok(S('1 Peter 3 is long')==='1 Peter 3 is long','1 Peter is a book, not a verse number');
  ok(S('2 Kings says')==='2 Kings says','2 Kings');
  ok(S('5 November 2026 was Thursday')==='5 November 2026 was Thursday','a date is left alone');
  ok(S('2024 was a good year')==='2024 was a good year','a number of 4 digits followed by a lower-case word is left alone');
  ok(S('16 and he said')==='16. and he said','a verse that continues in lower case also gets the pause: '+S('16 and he said'));
  ok(S('3:16 For God so loved')==='3 16. For God so loved','chapter:verse at the start: '+S('3:16 For God so loved'));
  ok(S('10 a.m. we leave')==='10 A M we leave','a time is not a verse number: '+S('10 a.m. we leave'));
  ok(S('70 AD was the year')==='70 AD was the year','an era is not a verse number');
  const PN=t=>JSON.stringify(w.ReadAloudRules.spokenParts(t,{end:true}));
  const GN=w.ReadAloudRules.gaps.number;
  ok(GN>w.ReadAloudRules.gaps.paragraph,'the pause after a number ('+GN+' ms) is longer than the paragraph gap ('+w.ReadAloudRules.gaps.paragraph+' ms)');
  ok(PN('16 For God so loved the world.')===JSON.stringify([{text:'16',gap:GN},{text:'For God so loved the world.',gap:0}]),'a verse number is its own piece followed by a gap: '+PN('16 For God so loved the world.'));
  ok(PN('3:16-18 For God')===JSON.stringify([{text:'3 16 to 18',gap:GN},{text:'For God',gap:0}]),'a verse reference: '+PN('3:16-18 For God'));
  ok(PN('1 Peter 3 is long')===JSON.stringify([{text:'1 Peter 3 is long',gap:0}]),'numbered book: one piece, no gap');
  ok(PN('It was good.')===JSON.stringify([{text:'It was good.',gap:0}]),'an ordinary sentence: one piece, no gap');
  w.ReadAloudRules.gaps.number=0;
  ok(PN('16 For God')===JSON.stringify([{text:'16. For God',gap:0}]),'gap switched off: one piece as before');
  w.ReadAloudRules.gaps.number=GN;
  const EN=t=>w.ReadAloudRules.enforce(t);
  ok(EN('Hi MMicj: a; b — c - d')==='Hi em em eye see jay, a, b, c, d','enforce(): the last pass spells MMICJ and removes : ; and dashes: '+EN('Hi MMicj: a; b — c - d'));
  ok(EN(EN('Hi MMicj: a; b — c - d'))===EN('Hi MMicj: a; b — c - d'),'enforce() can safely run twice');
  /* whatever the input, nothing that is spoken contains a colon, semicolon, dash or a written mmicj */
  const junk=['a',' ','MMicj','mmicj','MMICJ',':',';','-','--','—','–','1','2',':16','3:','. ',', ','x','( )','"'];
  let bad=null;
  for(let n=0;n<4000&&!bad;n++){
    let t='';for(let k=0;k<12;k++)t+=junk[(Math.random()*junk.length)|0];
    for(const o of [{end:true},{end:false}]){
      const out=w.ReadAloudRules.spokenParts(t,o).map(x=>x.text).join(' | ');
      if(/[:;\u2010-\u2015]|mmicj|(^|[^\d])-(?!\d)/i.test(out)){bad={t,out};break;}
    }
  }
  ok(!bad,'4000 random strings: nothing spoken has : ; a dash or a written mmicj'+(bad?' - '+JSON.stringify(bad):''));
  ok(S('3.5 million people')==='3.5 million people','a decimal is left alone');

  /* superscripts: the mark becomes a full stop */
  ok(S('God⁣ said')==='God. said'||S('God 1⁣ said')==='God 1. said','superscript mark -> full stop: '+S('God 1⁣ said'));
  ok(S('1⁣In the beginning')==='1. In the beginning','a leading superscript number: '+S('1⁣In the beginning'));
  ok(S('It ended.⁣')==='It ended.','a mark after a full stop is not doubled: '+S('It ended.⁣'));

  /* broken input never throws */
  ok(S('')===''&&S(null)==='','empty input');
}

/* ======================= PART 2: SUPERSCRIPTS AND SYMBOLS IN THE PAGE TEXT ======================= */
{
  const w=load();
  const T=w.ReadAloud._text;
  const P=d=>T.buildParagraphs(d,{seen:new Map(),page:1});
  const SPEAK=paras=>T.splitSentences(paras).map((c,i,a)=>w.ReadAloudRules.spoken(c));
  const say=d=>SPEAK(P(d)).join(' | ');

  /* Unicode superscripts */
  let r=say(lines(['God¹ said it was good.']));
  ok(r==='God 1. said it was good.','unicode superscript 1: '+r);
  r=say(lines(['¹In the beginning God made the heavens.']));
  ok(r==='1. In the beginning God made the heavens.','leading superscript verse number: '+r);
  r=say(lines(['Psalm 23² is short.']));
  ok(r.includes('23 2.'),'superscript after a number stays separate from it: '+r);
  r=say(lines(['The room is 12 m² in size.']));
  ok(r==='The room is 12 m squared in size.','an exponent is "squared", not a footnote: '+r);
  r=say(lines(['The 1ˢᵗ and 2ⁿᵈ of May.']));
  ok(r==='The 1st and 2nd of May.','ordinals written with superscript letters are plain: '+r);

  /* superscripts drawn as small, raised text items */
  r=say({height:800,items:[item('The promise stands',50,700,{w:95,e:false}),item('3',146,704,{w:4,h:7,e:false}),item('for everyone here.',152,700,{w:100}),
                           item('More ordinary body text sits on this line.',50,685,{w:230}),item('And a third ordinary line of body text.',50,670,{w:230})]});
  ok(r.startsWith('The promise stands 3. for everyone here.'),'raised small item = superscript: '+r);
  r=say({height:800,items:[item('On the 1',50,700,{w:40,e:false}),item('st',91,704,{w:8,h:7,e:false}),item(' of May we met.',100,700,{w:70}),
                           item('Another ordinary line of text goes here.',50,685,{w:230}),item('And one more ordinary line goes here.',50,670,{w:230})]});
  ok(r.startsWith('On the 1st of May we met.'),'a raised "st" after 1 is an ordinal, not a footnote: '+r);

  /* ornamental symbols */
  r=say(lines(['Peace ★ and joy.']));
  ok(r==='Peace. | and joy.'||r==='Peace. and joy.'||/^Peace\.\s*\|?\s*and joy\.$/.test(r),'a star in the middle = full stop: '+r);
  r=P({height:800,items:[item('✦ First point here',50,700),item('✦ Second point here',50,685),item('✦ Third point here',50,670)]});
  ok(r.join('|')==='First point here.|Second point here.|Third point here.','symbols at the start of lines = bullets: '+JSON.stringify(r));
  r=P({height:800,items:[item('Some closing words of the first part.',50,700),item('❖ ❖ ❖',50,670),item('The second part begins here.',50,640)]});
  ok(r.join('|')==='Some closing words of the first part.|The second part begins here.','a line of ornaments separates, and is never read: '+JSON.stringify(r));
  r=say(lines(['Love is patient ❤ love is kind.']));
  ok(!/heart|dingbat|black/i.test(r)&&r.includes('Love is patient'),'emoji / dingbats are never described: '+r);
  r=say(lines(['It was 25° and 30℃ outside.']));
  ok(r.includes('25°')&&r.includes('30°C'),'degrees are kept: '+r);
  r=say(lines(['2 + 2 = 4 and 50% of $5 × 3 ≤ 20.']));
  ok(r.includes('+')&&r.includes('=')&&r.includes('%')&&r.includes('$')&&r.includes('×')&&r.includes('≤'),'mathematical signs and currency are left to the voice: '+r);
  r=say(lines(['Word* and word† end.']));
  ok(!/[*†]/.test(r),'asterisk and dagger are not read: '+r);

  /* paragraph spacing: grouped lines with a visible gap are separate */
  r=P({height:800,items:[
    item('The first line of a block of text that runs wide',50,700,{w:300}),item('and wraps onto a second line of the same block',50,686,{w:300}),
    item('and a third line closes that paragraph here',50,672,{w:300}),
    item('Another Block Begins With a Capital And Runs',50,644,{w:300}),item('on to another line of this second block',50,630,{w:300})]});
  ok(r.length===2,'a visible gap between lines starts a new paragraph: '+JSON.stringify(r));
  r=P(lines(['The morning bell rang at exactly six and every single','villager knew it, because the sound carried across the whole','valley. Nobody complained.'],{w:300}));
  ok(r.length===1,'evenly spaced wrapped lines are still one paragraph');
}

/* ======================= PART 3: THE LOOP - GAPS AND RULES IN USE ======================= */
function makeEnv(o){
  const log=[],stamps=[];
  let cur=1,flipping=false;
  const N=o.pages.length,store={};
  const docListeners={};
  const els=[];
  const mkEl=()=>els[els.push({dataset:{},attrs:{},style:{},classList:{toggle(){},add(){},remove(){}},listeners:{},setAttribute(){},getAttribute(){},
    addEventListener(t,f){(this.listeners[t]=this.listeners[t]||[]).push(f)},querySelector(){return{setAttribute(){}}},title:''})-1];
  const button=mkEl();
  const doc={readyState:'complete',getElementById:id=>id==='listenButton'?button:null,visibilityState:'visible',createElement(){return mkEl()},body:{appendChild(){}},
    addEventListener(t,f){(docListeners[t]=docListeners[t]||[]).push(f)},dispatchEvent(ev){(docListeners[ev.type]||[]).forEach(f=>f(ev))}};
  const SS={queue:[],speaking:false,pending:false,paused:false,cur:null,timer:null,calls:0,
    getVoices(){return o.voices||[]},addEventListener(){},
    speak(u){this.queue.push(u);this.pending=true;if(!this.speaking)this._next()},
    _next(){const u=this.queue.shift();if(!u){this.speaking=false;this.pending=false;this.cur=null;return}
      this.speaking=true;this.cur=u;this.timer=setTimeout(()=>{
        this.calls++;
        const err=o.failWith&&o.failWith(u,this.calls);
        if(err){u.onerror&&u.onerror({error:err});this._next();return}
        log.push(u.text);stamps.push(Date.now());u.onend&&u.onend({});this._next()},2)},
    cancel(){clearTimeout(this.timer);const c=this.cur;this.queue.length=0;this.speaking=false;this.pending=false;this.cur=null;if(c)setTimeout(()=>c.onerror&&c.onerror({error:'canceled'}),0)}};
  class Utter{constructor(t){this.text=t}}
  const Reader={isOpen:()=>true,pages:()=>N,page:()=>cur,book:()=>({id:'b'}),
    spread:()=>({start:cur,end:cur}),
    next(){if(flipping)return false;flipping=true;setTimeout(()=>{cur++;flipping=false;doc.dispatchEvent({type:'skyreader:pageChanged'})},5);return true}};
  const Renderer={async pageText(p){await sleep(1);return o.pages[p-1]}};
  const win={document:doc,localStorage:{getItem:k=>store[k]??null,setItem(k,v){store[k]=String(v)}},addEventListener(){},
    Reader,Renderer,speechSynthesis:SS,SpeechSynthesisUtterance:Utter,setTimeout,clearTimeout,Promise,console,
    AudioController:{isMuted:()=>false,playPageCurl:()=>true,playPageTurn:()=>true}};
  win.window=win;vm.createContext(win);
  if(o.rules!==false)vm.runInContext(RULES,win);
  if(o.gap!==undefined&&win.ReadAloudRules)win.ReadAloudRules.gaps.paragraph=o.gap;
  if(o.numberGap!==undefined&&win.ReadAloudRules)win.ReadAloudRules.gaps.number=o.numberGap;
  if(o.breakRules&&win.ReadAloudRules){const boom=()=>{throw new Error('rule failed')};win.ReadAloudRules.spokenParts=boom;win.ReadAloudRules.spoken=boom;win.ReadAloudRules.enforce=boom;}
  vm.runInContext(o.src||SRC,win);
  return {RA:win.ReadAloud,log,stamps,win,button,SS,els};
}

{
  /* rules are applied to what is spoken */
  const e=makeEnv({gap:0,pages:[lines(['Welcome to MMICJ: Naphatali Liburd, e.g. Dr. Lee — and friends.'],{w:400})]});
  e.RA.start();
  await until(()=>e.log.length>=1&&e.RA.state()==='idle');
  ok(e.log.join('|')==='Welcome to em em eye see jay, Nah fah tah lee Lie bird, for example Doctor Lee, and friends.','the loop speaks the rule-adjusted text: '+e.log.join('|'));
}
{
  /* a real silence after a paragraph / title, none between sentences of one paragraph */
  const GAP=300;
  const page={height:800,items:[item('A Quiet Title',50,700,{h:24,w:150}),
      item('First sentence here. Second sentence follows it.',50,660,{w:300}),
      item('A separate line',50,600,{w:100}),item('Another separate line',50,585,{w:100})]};
  const e=makeEnv({gap:GAP,pages:[page]});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=5,8000);
  ok(e.log.length===5,'all pieces spoken: '+JSON.stringify(e.log));
  const d=e.stamps.slice(1).map((t,i)=>t-e.stamps[i]);
  ok(d[0]>=GAP-30,'gap after the title ('+d[0]+' ms)');
  ok(d[1]<GAP-100,'no extra gap between two sentences of one paragraph ('+d[1]+' ms)');
  ok(d[2]>=GAP-30,'gap after the paragraph ('+d[2]+' ms)');
  ok(d[3]>=GAP-30,'gap after a line that stands alone ('+d[3]+' ms)');
}
{
  /* pausing during the silence: nothing more is spoken, resume continues with the next piece */
  const page=lines(['One title','Two title','Three title','Four title'],{step:30,w:100});
  const e=makeEnv({gap:400,pages:[page]});
  e.RA.start();
  await until(()=>e.log.length>=1);
  e.RA.pause();
  const n=e.log.length;
  await sleep(700);
  ok(e.log.length===n,'nothing is spoken while paused, even after the silence runs out');
  e.RA.resume();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=4,8000);
  ok(e.log.join('|')===['One title.','Two title.','Three title.','Four title.'].join('|'),'resume carries on with the next piece, nothing repeated or lost: '+e.log.join('|'));
}
{
  /* without the rules file everything still works, superscripts are still full stops */
  const e=makeEnv({rules:false,pages:[lines(['God¹ said it: be kind.'],{w:300})]});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=1);
  ok(e.log.join('|')==='God 1. said it, be kind.','no rules file: superscript is a full stop and the colon is still not spoken: '+e.log.join('|'));
}
{
  /* the safety net: no rules file, MMICJ is still spelled and nothing is left for the voice to pronounce */
  const e=makeEnv({rules:false,pages:[lines(['Welcome to MMicj: peace; love \u2014 joy, and well-known mmicj.com.'],{w:500})]});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=1);
  ok(e.log.join('|')==='Welcome to em em eye see jay, peace, love, joy, and well known em em eye see jay.com.','no rules file: '+e.log.join('|'));
}
{
  /* the safety net: a rule that fails does not let raw text through */
  const e=makeEnv({breakRules:true,pages:[lines(['Hear MMicj: peace; love \u2014 joy.'],{w:400})]});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=1);
  ok(e.log.join('|')==='Hear em em eye see jay, peace, love, joy.','a failing rules file: '+e.log.join('|'));
  ok(e.RA._enforce('MMICJ: x')==='em em eye see jay, x','enforce() works on its own');
}
{
  /* a number that starts a sentence is spoken on its own, then a real silence */
  const GAP=350;
  const e=makeEnv({gap:0,numberGap:GAP,pages:[lines(['16 For God so loved the world, that he gave his only Son.'],{w:500})]});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=2,8000);
  ok(e.log.join('|')==='16|For God so loved the world, that he gave his only Son.','the verse number is its own spoken piece: '+e.log.join('|'));
  const d=e.stamps[1]-e.stamps[0];
  ok(d>=GAP-30,'a longer silence follows the number ('+d+' ms)');
}
{
  /* the Listen button: hidden until switched on in Settings (SHOW_BUTTON_BY_DEFAULT) */
  const e=makeEnv({pages:[lines(['One title'],{w:100})]});
  ok(e.RA.isButtonVisible()===false&&e.button.hidden===true&&e.button.style.display==='none','the button starts hidden');
  e.RA.setButtonVisible(true);
  ok(e.RA.isButtonVisible()===true&&e.button.hidden===false&&e.button.style.display==='','ticking the setting shows it');
  ok(JSON.parse(e.win.localStorage.getItem('mm-readaloud')).showButton===true,'the choice is remembered in this browser');
  e.RA.start();
  await until(()=>e.RA.state()!=='idle');
  e.RA.setButtonVisible(false);
  ok(e.button.hidden===true&&e.RA.state()==='idle','unticking hides it and stops any reading');
  ok(/const SHOW_BUTTON_BY_DEFAULT=false;/.test(SRC),'the initial state is one constant: SHOW_BUTTON_BY_DEFAULT');
  const v=makeEnv({src:SRC.replace('const SHOW_BUTTON_BY_DEFAULT=false;','const SHOW_BUTTON_BY_DEFAULT=true;'),pages:[lines(['One title'],{w:100})]});
  ok(v.RA.isButtonVisible()===true&&v.button.hidden===false,'changing the constant to true makes the button visible by default');
  v.RA.setButtonVisible(false);
  ok(v.RA.isButtonVisible()===false,'a reader can still switch it off');
}
{
  /* a voice the phone rejects: the first piece is retried with the device's default voice, in order, nothing lost */
  const voice={voiceURI:'bad',name:'Bad',lang:'xx-XX',localService:true,default:false};
  const e=makeEnv({voices:[voice],pages:[lines(['One title','Two title','Three title','Four title'],{step:30,w:100})],
    failWith:(u)=>u.voice?'synthesis-failed':null});
  e.RA.setVoice('bad');
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=4,8000);
  ok(e.log.join('|')==='One title.|Two title.|Three title.|Four title.','retried with the default voice, order kept: '+e.log.join('|'));
  ok(!e.els.some(x=>/not working/.test(x.textContent||'')),'no error message when the fallback worked');
}
{
  /* an engine that fails every time and reports no voices: a short notice, no error code on screen */
  const e=makeEnv({pages:[lines(['One title','Two title','Three title','Four title','Five title'],{step:30,w:100})],failWith:()=>'synthesis-failed'});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.els.some(x=>/not working/.test(x.textContent||'')),8000);
  const msg=(e.els.find(x=>/not working/.test(x.textContent||''))||{}).textContent;
  ok(msg==='Speech is not working. Check device settings.','short message, no voices: '+msg);
}
{
  /* an engine that fails every time but has voices: the same short notice */
  const v=[{voiceURI:'a',name:'A',lang:'en-US',localService:true,default:true},{voiceURI:'b',name:'B',lang:'fr-FR',localService:true,default:false}];
  const e=makeEnv({voices:v,pages:[lines(['One title','Two title','Three title','Four title','Five title'],{step:30,w:100})],failWith:()=>'synthesis-failed'});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.els.some(x=>/not working/.test(x.textContent||'')),10000);
  const msg=(e.els.find(x=>/not working/.test(x.textContent||''))||{}).textContent;
  ok(msg==='Speech is not working. Check device settings.','short message, with voices: '+msg);
}
{
  /* an engine that refuses "no voice" but works with an explicit voice: level 2 finds it, order kept */
  const v=[{voiceURI:'fr',name:'F',lang:'fr-FR',localService:true,default:false},{voiceURI:'en',name:'E',lang:'en-US',localService:true,default:false}];
  const e=makeEnv({voices:v,pages:[lines(['One title','Two title','Three title'],{step:30,w:100})],failWith:(u)=>u.voice?null:'synthesis-failed'});
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=3,10000);
  ok(e.log.join('|')==='One title.|Two title.|Three title.','explicit voice found after the default failed: '+e.log.join('|'));
  ok(!e.els.some(x=>/not working/.test(x.textContent||'')),'no error message when level 2 worked');
}
{
  /* an engine that only works one piece at a time at normal speed: level 3 */
  const v=[{voiceURI:'en',name:'E',lang:'en-US',localService:true,default:true}];
  let busy=0;
  const e=makeEnv({voices:v,pages:[lines(['One title','Two title','Three title'],{step:30,w:100})],
    failWith:(u,n)=>{ if(u.rate!==1)return 'synthesis-failed'; return null; }});
  e.RA.setRate(1.5);
  e.RA.start();
  await until(()=>e.RA.state()==='idle'&&e.log.length>=3,10000);
  ok(e.log.join('|')==='One title.|Two title.|Three title.','level 3 (normal speed) works: '+e.log.join('|'));
}
{
  /* the gap is shorter at a faster speed */
  const page=lines(['One title','Two title'],{step:30,w:100});
  const slow=makeEnv({gap:400,pages:[page]});slow.RA.setRate(1);slow.RA.start();
  await until(()=>slow.RA.state()==='idle'&&slow.log.length>=2,5000);
  const fast=makeEnv({gap:400,pages:[page]});fast.RA.setRate(1.6);fast.RA.start();
  await until(()=>fast.RA.state()==='idle'&&fast.log.length>=2,5000);
  const ds=slow.stamps[1]-slow.stamps[0],df=fast.stamps[1]-fast.stamps[0];
  ok(df<ds-60,'gap shrinks at a higher speed ('+ds+' ms vs '+df+' ms)');
}

console.log(fails?`\n${fails} FAILED`:'\nall ok');
process.exit(fails?1:0);
