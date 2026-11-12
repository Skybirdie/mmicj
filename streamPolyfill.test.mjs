/* node streamPolyfill.test.mjs
   Covers the iPhone "undefined is not a function (near '...t of e...')" page-text failure:
   1) js/streamPolyfill.js gives ReadableStream async iteration to a browser without it, and leaves one that has it alone
   2) Renderer.pageText's readTextContent() reads page text without needing async iteration */
import fs from 'node:fs';
import vm from 'node:vm';

let failed=0;
const ok=(c,m)=>{console.log((c?'ok   ':'FAIL ')+m);if(!c)failed++;};

/* a ReadableStream like Safari's: reader works, no async iteration */
function makeSafariContext(){
  const NativeRS=ReadableStream;
  class SafariRS{
    constructor(src){this._s=new NativeRS(src);}
    getReader(){return this._s.getReader();}
  }
  const win={ReadableStream:SafariRS,Symbol,Promise,Object,Array,console};
  win.window=win;vm.createContext(win);return win;
}
const chunks=n=>new ReadableStream({start(c){for(let i=1;i<=n;i++)c.enqueue({items:[i]});c.close();}});
const SRC=fs.readFileSync('js/streamPolyfill.js','utf8');

/* ---------- 1) the polyfill ---------- */
{
  const w=makeSafariContext();
  ok(!(vm.runInContext('Symbol.asyncIterator in ReadableStream.prototype',w)),'test browser starts without ReadableStream async iteration');
  vm.runInContext(SRC,w);
  ok(vm.runInContext('typeof ReadableStream.prototype[Symbol.asyncIterator]',w)==='function','the polyfill adds [Symbol.asyncIterator]');
  ok(vm.runInContext('typeof ReadableStream.prototype.values',w)==='function','the polyfill adds values()');
  ok(JSON.stringify(w.mmicjPolyfilled)==='["ReadableStream async iteration"]','it records that it patched this browser');
  ok(vm.runInContext('Object.keys(ReadableStream.prototype).length',w)===0,'the added methods are not enumerable');

  /* the exact loop pdf.js 6 runs, on the "Safari" stream */
  w.src=chunks(3);
  w.RSclass=w.ReadableStream;
  const Safari=w.ReadableStream;
  const s=new Safari({start(c){c.enqueue({items:['a']});c.enqueue({items:['b','c']});c.close();}});
  w.s=s;
  const got=await vm.runInContext('(async()=>{const out=[];for await(const v of s){out.push(...v.items);}return out;})()',w);
  ok(JSON.stringify(got)==='["a","b","c"]','for await over a stream reads every chunk in order');

  /* breaking out early cancels the stream and frees the lock */
  const s2=new Safari({start(c){c.enqueue(1);c.enqueue(2);c.enqueue(3);},cancel(){w.cancelled=true;}});
  w.s2=s2;
  await vm.runInContext('(async()=>{for await(const v of s2){break;}})()',w);
  ok(w.cancelled===true,'leaving the loop early cancels the stream');
  ok(s2._s.locked===false,'and releases the reader lock');

  /* an error in the stream reaches the loop */
  const s3=new Safari({start(c){c.enqueue(1);c.error(new Error('bad stream'));}});
  w.s3=s3;
  const msg=await vm.runInContext('(async()=>{try{for await(const v of s3){}return "no error"}catch(e){return e.message}})()',w);
  ok(msg==='bad stream','a stream error is thrown into the loop');

  /* loading it twice is harmless */
  vm.runInContext(SRC,w);
  ok(w.mmicjPolyfilled.length===1,'running it a second time changes nothing');
}

/* a browser that already has it is left alone */
{
  const win={ReadableStream,Symbol,Promise,Object,Array,console};win.window=win;vm.createContext(win);
  const before=ReadableStream.prototype[Symbol.asyncIterator];
  vm.runInContext(SRC,win);
  ok(ReadableStream.prototype[Symbol.asyncIterator]===before,'native async iteration is not replaced');
  ok(win.mmicjPolyfilled===undefined,'and nothing is reported as patched');
}

/* no ReadableStream at all must not throw */
{
  const win={Symbol,Promise,Object,Array,console};win.window=win;vm.createContext(win);
  let threw=false;try{vm.runInContext(SRC,win);}catch(e){threw=true;}
  ok(!threw,'a browser with no ReadableStream at all is left alone without an error');
}

/* ---------- 2) readTextContent in js/renderer.js ---------- */
{
  const R=fs.readFileSync('js/renderer.js','utf8');
  const m=R.match(/async function readTextContent\(page\)\{[\s\S]*?\n\}\r?\n/);
  ok(!!m,'readTextContent exists in js/renderer.js');
  const readTextContent=new Function(m[0]+'\nreturn readTextContent;')();
  const noAsyncIter=(chunkList)=>{ /* a "Safari" stream: getReader only */
    const s=new ReadableStream({start(c){chunkList.forEach(x=>c.enqueue(x));c.close();}});
    return {getReader:()=>s.getReader()};
  };

  const page={
    streamTextContent:()=>noAsyncIter([{items:[{str:'Hello '}],styles:{}},{items:[{str:'world'},{str:'.',hasEOL:true}],styles:{}}]),
    getTextContent:async()=>{throw new TypeError("undefined is not a function (near '...t of e...')");}
  };
  const c=await readTextContent(page);
  ok(c.items.map(i=>i.str).join('')==='Hello world.','page text is read through getReader(), never touching getTextContent');
  ok(c.items[2].hasEOL===true,'items keep their fields (hasEOL)');

  /* stream path breaks, getTextContent works */
  const page2={streamTextContent(){throw new Error('stream broke');},getTextContent:async()=>({items:[{str:'second way'}]})};
  ok((await readTextContent(page2)).items[0].str==='second way','if the stream way fails, getTextContent is tried');

  /* both fail: the first error is the one reported */
  const page3={streamTextContent(){throw new Error('first error');},getTextContent:async()=>{throw new Error('second error');}};
  let e3='';try{await readTextContent(page3);}catch(e){e3=e.message;}
  ok(e3==='first error','if both fail, the first error is reported');

  /* an engine without streamTextContent */
  const page4={getTextContent:async()=>({items:[{str:'old engine'}]})};
  ok((await readTextContent(page4)).items[0].str==='old engine','an engine without streamTextContent uses getTextContent');

  /* empty page */
  const page5={streamTextContent:()=>noAsyncIter([{items:[],styles:{}}])};
  ok((await readTextContent(page5)).items.length===0,'a page with no text gives no items (not an error)');

  /* lock is released so the page can be asked again */
  let lockedAfter=null;
  const s=new ReadableStream({start(c){c.enqueue({items:[{str:'x'}]});c.close();}});
  await readTextContent({streamTextContent:()=>s});
  ok(s.locked===false,'the stream reader is released afterwards');
}

/* ---------- 3) index.html loads it before pdf.js ---------- */
{
  const H=fs.readFileSync('index.html','utf8');
  const a=H.indexOf('js/streamPolyfill.js'),b=H.indexOf('<script type="module">');
  ok(a>0&&b>0&&a<b,'index.html loads streamPolyfill.js before the pdf.js module');
}

console.log(failed?`\n${failed} FAILED`:'\nall ok');
process.exit(failed?1:0);
