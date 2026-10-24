import worker from "./worker.mjs";

/* Friendly error pages, maintenance switch and the error wrapper */
function makeKV(){
  const store=new Map();
  return { store,
    async get(k){const e=store.get(k);return e?e.value:null;},
    async getWithMetadata(k){const e=store.get(k);return e?{value:e.value,metadata:e.metadata??null}:{value:null,metadata:null};},
    async put(k,v,o){store.set(k,{value:v,metadata:o?.metadata});} };
}
const kv=makeKV();
const HTML="<html><head></head><body>app</body></html>";
const ctx={waitUntil(){}};
const BASE="https://example.workers.dev";
const mkEnv=(extra={})=>({MEDIA_KV:kv,ASSETS:{fetch:async()=>new Response(HTML,{headers:{"content-type":"text/html"}})},...extra});
const call=(path,env=mkEnv(),init)=>worker.fetch(new Request(BASE+path,init),env,ctx);
const PAGE={headers:{accept:"text/html,application/xhtml+xml"}};

let failures=0;
const check=(name,cond,extra="")=>{console.log((cond?"PASS":"FAIL")+"  "+name+(extra?"  ["+extra+"]":""));if(!cond)failures++;};
let r,t;

/* ---- share link that no longer exists ---- */
r=await call("/s/book/ghost-1",mkEnv(),PAGE); t=await r.text();
check("missing share link, page load -> 404 with the picture page",r.status===404 && t.includes("/assets/errors/unavailable.webp") && t.includes("Link no longer available"),"status="+r.status);
check("friendly page is never cached",/no-store/.test(r.headers.get("cache-control")||"") && /text\/html/.test(r.headers.get("content-type")||""));
check("friendly page has a way home",t.includes('href="/"'));
r=await call("/s/book/ghost-1"); t=await r.text();
check("same address without Accept: html -> the same plain text as before",r.status===404 && t==="MMicjMedia shared item was not found." && /text\/plain/.test(r.headers.get("content-type")||""));
r=await call("/s/book/ghost-1",mkEnv(),{headers:{accept:"text/html","sec-fetch-dest":"script"}}); t=await r.text();
check("a script/image request is never given a page",r.status===404 && !t.includes("<html"));
r=await call("/s/book/ghost-1",mkEnv(),{headers:{accept:"text/html,application/xhtml+xml","sec-fetch-dest":"empty","sec-fetch-mode":"same-origin"}}); t=await r.text();
check("a page load forwarded by the service worker (Sec-Fetch-Dest: empty) still gets the picture page",r.status===404 && t.includes("unavailable.webp"));
r=await call("/s/book/ghost-1",mkEnv(),{headers:{accept:"text/html","sec-fetch-dest":"document","sec-fetch-mode":"navigate"}}); t=await r.text();
check("an ordinary page load (Sec-Fetch-Dest: document) gets the picture page",r.status===404 && t.includes("unavailable.webp"));
r=await call("/s/book/ghost-1",mkEnv(),{headers:{accept:"*/*","sec-fetch-dest":"empty"}}); t=await r.text();
check("fetch() with Accept: */* is never given a page",r.status===404 && t==="MMicjMedia shared item was not found.");

/* ---- maintenance switch ---- */
r=await call("/",mkEnv({MAINTENANCE:"1"}),PAGE); t=await r.text();
check("MAINTENANCE=1: base address -> 503 maintenance page",r.status===503 && t.includes("/assets/errors/maintenance.webp") && t.includes("Try again"));
check("503 carries Retry-After",r.headers.get("retry-after")==="600");
r=await call("/s/book/anything",mkEnv({MAINTENANCE:"true"}),PAGE);
check("MAINTENANCE=true: share link -> 503",r.status===503);
r=await call("/",mkEnv({MAINTENANCE:"1"})); t=await r.text();
check("MAINTENANCE on, not a page load -> short plain 503",r.status===503 && !t.includes("<html") && t.includes("maintenance"));
for(const off of ["0","false","off",""]){
  r=await call("/",mkEnv({MAINTENANCE:off}),PAGE);
  check("MAINTENANCE="+JSON.stringify(off)+" -> site works normally",r.status===200);
}
r=await call("/",mkEnv(),PAGE); check("variable absent -> site works normally",r.status===200);
r=await call("/__sky_og_image?section=nonsense&id=abc",mkEnv({MAINTENANCE:"1",IMAGES:{}}));
check("maintenance leaves the OG image endpoint alone",r.status===400,"status="+r.status);

/* ---- the error wrapper ---- */
const boom=mkEnv({ASSETS:{fetch:async()=>{throw new Error("assets exploded");}}});
const origErr=console.error; console.error=()=>{};
r=await call("/sw.js",boom,PAGE); t=await r.text();
check("Worker throws, page load -> friendly 500 page",r.status===500 && t.includes("/assets/errors/error.webp") && t.includes("Try again"),"status="+r.status);
r=await call("/sw.js",boom); t=await r.text();
check("Worker throws, not a page load -> short plain 500",r.status===500 && !t.includes("<html") && t.includes("something went wrong"));
console.error=origErr;

console.log(failures?("\n"+failures+" FAILED"):"\nALL PASSED");
process.exit(failures?1:0);
