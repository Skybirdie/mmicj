const vm=require('vm'),fs=require('fs');
const root='/home/claude/proj/js/';
let failures=0;const check=(n,c,x="")=>{console.log((c?"PASS":"FAIL")+"  "+n+(x?"  ["+x+"]":""));if(!c)failures++;};

const items=n=>Array.from({length:n},(_,i)=>({id:"id"+i,type:i%3===0?"video":i%3===1?"book":"slideshow",title:"Title "+i,subtitle:"s",thumbnail:"https://x.test/t"+i+".jpg",media:"https://x.test/m"+i+(i%3===1?".pdf":i%3===0?".mp4":".jpg"),audio:"",author:"a",category:"c",date:"202609020901",dateAdd:"202609020901"}));

function makeEnv({search="",fetchImpl,storage={}}){
  const calls=[];
  const store={...storage};
  const win={location:{search,href:"https://x.test/"+search,origin:"https://x.test"},addEventListener(){},dispatchEvent(){return true;}};
  const ctx={window:win,console:{...console,info(){},warn(){},error(){}},
    document:{getElementById:()=>null,baseURI:"https://x.test/"},
    localStorage:{getItem:k=>k in store?store[k]:null,setItem:(k,v)=>{store[k]=v;},removeItem:k=>{delete store[k]}},
    fetch:async(url,opts)=>{calls.push(String(url));return fetchImpl(String(url),opts);},
    CustomEvent:function(n,o){this.type=n;this.detail=o&&o.detail;},
    SkyReader:{setLoading(){},setStatus(){},settings:{},library:[],filteredLibrary:[]},
    URLSearchParams,URL,atob:s=>Buffer.from(s,'base64').toString('binary'),btoa:s=>Buffer.from(s,'binary').toString('base64'),
    TextDecoder,TextEncoder,AbortController,setTimeout,clearTimeout,Date,JSON,Promise,Uint8Array,Array,Object,String,Number,Math,Error,RegExp,Map,Set,Boolean,parseInt,parseFloat,isNaN,encodeURIComponent,decodeURIComponent,
    Response,Blob:global.Blob,DecompressionStream:global.DecompressionStream};
  ctx.self=ctx; ctx.globalThis=ctx; win.window=win;
  vm.createContext(ctx);
  // window properties must be visible as globals (browser semantics)
  const run=f=>vm.runInContext(fs.readFileSync(root+f,'utf8')+"\n;Object.assign(window,{ContentContract:typeof ContentContract!=='undefined'?ContentContract:window.ContentContract});",ctx,{filename:f});
  // expose window as global object
  vm.runInContext("var window=this.window; ",ctx);
  ctx.window=Object.assign(win,{});
  for(const k of Object.keys(win)) ctx[k]=win[k];
  run('contentContract.js'); ctx.ContentContract=win.ContentContract||ctx.window.ContentContract;
  run('glideContract.js'); ctx.GlideContract=win.GlideContract||ctx.window.GlideContract;
  run('manifest.js'); ctx.Manifest=win.Manifest||ctx.window.Manifest;
  return {ctx,calls,store,win};
}

const jsonResp=(obj,status=200)=>new Response(JSON.stringify(obj),{status,headers:{"Content-Type":"application/json"}});
const snapshotBody={version:"1.0",content:items(5)};

(async()=>{
  // (a) plain base URL, snapshot available
  let e=makeEnv({fetchImpl:async u=>u.includes("__sky_catalog")?jsonResp(snapshotBody):jsonResp({version:"1",content:[]})});
  let m=await e.win.Manifest.load();
  check("base URL: catalog snapshot used",e.win.Manifest.sourceLabel()==="catalog snapshot" && m.content.length===5,e.calls.join(","));
  check("base URL: content.json NOT requested when snapshot works",!e.calls.some(u=>u.includes("content.json")));
  check("snapshot items normalized (book/video/slideshow)",e.win.Manifest.books().length>0||m.content.some(i=>i.type==="book"),JSON.stringify(m.content.map(i=>i.type)));
  check("last good copy saved to localStorage",!!e.store["skymedia-catalog-snapshot-v1"]);

  // (b) snapshot 404 but cached copy exists
  const cachedStore={"skymedia-catalog-snapshot-v1":JSON.stringify({savedAt:Date.now()-1e7,data:snapshotBody})};
  e=makeEnv({storage:cachedStore,fetchImpl:async u=>u.includes("__sky_catalog")?jsonResp({error:"x"},404):jsonResp({version:"1",content:[]})});
  m=await e.win.Manifest.load();
  check("snapshot 404 + cached copy -> cached copy used",m.content.length===5 && e.win.Manifest.sourceLabel()==="catalog snapshot");

  // (c) snapshot fails, no cache -> content.json
  e=makeEnv({fetchImpl:async u=>u.includes("__sky_catalog")?jsonResp({error:"x"},404):jsonResp({version:"1.0",content:items(2)})});
  m=await e.win.Manifest.load();
  check("no snapshot, no cache -> falls back to content.json",e.win.Manifest.sourceLabel()==="content.json" && m.content.length===2,e.calls.join(","));

  // (f) hanging snapshot request -> timeout then fallback
  e=makeEnv({fetchImpl:(u,o)=>u.includes("__sky_catalog")?new Promise((_,rej)=>{o&&o.signal&&o.signal.addEventListener('abort',()=>rej(new Error("aborted")));}):Promise.resolve(jsonResp({version:"1.0",content:items(2)}))});
  e.win.Manifest.snapshot.timeoutMs=60;
  const t0=Date.now(); m=await e.win.Manifest.load();
  check("hung snapshot request times out and falls back",e.win.Manifest.sourceLabel()==="content.json" && Date.now()-t0<2000,(Date.now()-t0)+"ms");

  // (d) valid Glide contract -> snapshot never requested
  const glide=encodeURIComponent(JSON.stringify({version:"1.0",content:items(3)}));
  e=makeEnv({search:"?contract="+glide,fetchImpl:async()=>{throw new Error("network must not be used")}});
  m=await e.win.Manifest.load();
  check("valid Glide contract: used as before, ZERO fetches",e.win.Manifest.sourceLabel()==="Glide contract" && m.content.length===3 && e.calls.length===0,e.calls.join(","));

  // (e) unusable Glide contract -> snapshot
  e=makeEnv({search:"?contractz=sr2.garbage",fetchImpl:async u=>u.includes("__sky_catalog")?jsonResp(snapshotBody):jsonResp({version:"1",content:[]})});
  m=await e.win.Manifest.load();
  check("unusable Glide contract -> falls back to snapshot (not a dead screen)",e.win.Manifest.sourceLabel()==="catalog snapshot" && m.content.length===5,e.win.Manifest.sourceLabel());

  // (g) injected share contract (SkyMediaContract) behaves like Glide: no snapshot fetch
  e=makeEnv({fetchImpl:async()=>{throw new Error("network must not be used")}});
  e.win.SkyMediaContract={version:"1.0",content:items(1)}; e.ctx.SkyMediaContract=e.win.SkyMediaContract;
  m=await e.win.Manifest.load();
  check("share page (injected contract): no snapshot fetch",e.calls.length===0 && m.content.length===1,e.win.Manifest.sourceLabel()+" "+e.calls.join(","));

  console.log(failures?("\n"+failures+" FAILURE(S)"):"\nall passed");process.exit(failures?1:0);
})().catch(err=>{console.error("HARNESS ERROR",err);process.exit(2);});
