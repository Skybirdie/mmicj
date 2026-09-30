import worker from "./worker.mjs";

function makeKV(){
  const store=new Map(); const ops={get:0,put:0,gwm:0,list:0,del:0}; const log=[];
  return { store, ops, log,
    async get(key){ops.get++;const e=store.get(key);return e?e.value:null;},
    async getWithMetadata(key){ops.gwm++;const e=store.get(key);return e?{value:e.value,metadata:e.metadata??null}:{value:null,metadata:null};},
    async put(key,value,opts){ops.put++;log.push(key);store.set(key,{value,metadata:opts?.metadata});},
    reset(){for(const k of Object.keys(ops))ops[k]=0;log.length=0;}
  };
}
const kv=makeKV();
const env={MEDIA_KV:kv,ASSETS:{fetch:async()=>new Response("asset")}};
const ctx={waitUntil(){}};
const BASE="https://example.workers.dev";
const TOKEN="SMCAT-TEST-9f7b2d4c-20260918";

const mkItems=n=>Array.from({length:n},(_,i)=>({id:"id"+i,type:i%3===0?"video":i%3===1?"book":"slideshow",title:"Title "+i,subtitle:"s",thumbnail:"https://x.test/t"+i+".jpg",media:"https://x.test/m"+i+(i%3===1?".pdf":i%3===0?".mp4":".jpg"),audio:"",author:"a",category:"c",date:"202609020901",dateAdd:"202609020901"}));
const publish=(items,extra={},token=TOKEN)=>worker.fetch(new Request(BASE+"/__sky_catalog_publish",{method:"POST",headers:{"Content-Type":"application/json","X-Sky-Catalog-Test-Token":token},body:JSON.stringify({test:true,preview:false,source:"t",contract:items,...extra})}),env,ctx);
const get=(h={},method="GET")=>worker.fetch(new Request(BASE+"/__sky_catalog",{method,headers:h}),env,ctx);

let failures=0;
const check=(name,cond,extra="")=>{console.log((cond?"PASS":"FAIL")+"  "+name+(extra?"  ["+extra+"]":""));if(!cond)failures++;};

// 8. no snapshot yet
let r=await get(); check("GET before any publish -> 404",r.status===404 && r.headers.get("Cache-Control")==="no-store");

// 7. unauthorized
r=await publish(mkItems(8),{},"wrong"); check("wrong token -> 401",r.status===401);

// 1. preview writes nothing
kv.reset(); r=await worker.fetch(new Request(BASE+"/__sky_catalog_publish",{method:"POST",headers:{"Content-Type":"application/json","X-Sky-Catalog-Test-Token":TOKEN},body:JSON.stringify({preview:true,contract:mkItems(8)})}),env,ctx);
check("preview -> 0 writes",r.status===200 && kv.ops.put===0);

// 2. first publish
kv.reset(); r=await publish(mkItems(8)); let j=await r.json();
check("first publish ok, snapshot created",r.status===200 && j.snapshot?.action==="created" && j.storedCount===8,JSON.stringify({put:kv.ops.put,storedCount:j.storedCount}));
check("writes = 8 items + 1 snapshot + existing status record (no prev yet)",kv.ops.put===10 && kv.log.filter(k=>k==="catalog:snapshot:v1").length===1 && !kv.log.includes("catalog:snapshot:v1:prev"));

r=await get(); const text=await r.text(); const snap=JSON.parse(text); const etag=r.headers.get("ETag");
check("GET returns 200 with 8 items + ETag + max-age",r.status===200 && snap.content.length===8 && !!etag && /max-age=300/.test(r.headers.get("Cache-Control")));
check("snapshot items are in the C3.1 cleaned shape",snap.version==="1.0" && snap.content[0].media && snap.content[0].id==="id0");
r=await get({"If-None-Match":etag}); check("If-None-Match -> 304 no body",r.status===304 && (await r.text())==="");
r=await get({},"HEAD"); check("HEAD -> 200 no body",r.status===200 && (await r.text())==="");

// memo: second GET must not read KV
kv.reset(); await get(); await get(); check("warm GETs do 0 KV reads (isolate memory)",kv.ops.gwm===0 && kv.ops.get===0);

// 3. identical publish -> 1 read, 0 writes
kv.reset(); r=await publish(mkItems(8)); j=await r.json();
check("identical publish -> unchanged",j.snapshot?.action==="unchanged" && kv.ops.put===0,JSON.stringify(kv.ops));
check("identical publish -> exactly 1 KV read, no per-item reads",kv.ops.gwm===1 && kv.ops.get===0);

// 4. one change
const changed=mkItems(8); changed[2].title="Changed title";
kv.reset(); r=await publish(changed); j=await r.json();
check("changed item -> updated",j.snapshot?.action==="updated" && j.storedCount===1,JSON.stringify({stored:j.storedCount}));
check("writes = 1 item + 1 prev + 1 snapshot + existing status record",kv.ops.put===4,JSON.stringify(kv.log));
r=await get(); const s2=await r.json(); check("same isolate serves the new snapshot immediately",s2.content[2].title==="Changed title");
check("previous snapshot kept as rollback copy",JSON.parse(kv.store.get("catalog:snapshot:v1:prev").value).content[2].title==="Title 2");

// 5. shrink guard
kv.reset(); r=await publish(mkItems(3)); j=await r.json();
check("shrink 8 -> 3 refused with 409 and ZERO writes",r.status===409 && kv.ops.put===0,JSON.stringify(j).slice(0,120));
kv.reset(); r=await publish(mkItems(3),{force:true}); j=await r.json();
check("shrink with force:true is accepted",r.status===200 && j.snapshot?.count===3);
r=await get(); check("snapshot now has 3 items",(await r.json()).content.length===3);

// 6. nothing valid
kv.reset(); r=await publish([{foo:1},{id:"",type:"book"}]); 
check("all-invalid publish -> 422, zero writes",r.status===422 && kv.ops.put===0);

// small catalogs are not guarded (previous count 3 < 6)
kv.reset(); r=await publish(mkItems(1)); check("small catalog can shrink without force",r.status===200);

// 10. secret token
env.CATALOG_PUBLISH_TOKEN="new-secret-token";
r=await publish(mkItems(4),{},"new-secret-token"); check("secret token accepted",r.status===200);
r=await publish(mkItems(4),{},TOKEN); check("legacy token still accepted while migrating",r.status===200);
env.CATALOG_DISABLE_LEGACY_TOKEN="1";
r=await publish(mkItems(4),{},TOKEN); check("legacy token rejected once disabled",r.status===401);
r=await publish(mkItems(4),{},"new-secret-token"); check("secret still accepted after disabling legacy",r.status===200);

// KV read failure on GET -> stale memo served
r=await get(); // warm the memo
const realNow=Date.now; Date.now=()=>realNow()+120000; // memo now expired
env.MEDIA_KV={...kv,getWithMetadata:async()=>{throw new Error("boom")}};
r=await get(); check("KV failure with expired memo serves the stale snapshot (200)",r.status===200 && (await r.json()).content.length>0);
Date.now=realNow;

console.log(failures?("\n"+failures+" FAILURE(S)"):"\nall passed");
process.exit(failures?1:0);
