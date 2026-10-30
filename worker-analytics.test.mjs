import worker from "./worker.mjs";

/* Analytics Engine mock: records every data point */
const points=[];
const AE={ writeDataPoint(p){ points.push(p); } };
const kv={ async get(){return null;}, async getWithMetadata(){return {value:null,metadata:null};}, async put(){} };
const HTML="<html><head></head><body>app</body></html>";
const ctx={waitUntil(){}};
const BASE="https://example.workers.dev";
const mkEnv=(extra={})=>({MEDIA_KV:kv,ASSETS:{fetch:async()=>new Response(HTML,{headers:{"content-type":"text/html"}})},...extra});
const call=(path,env,init)=>worker.fetch(new Request(BASE+path,init),env,ctx);
const post=(env,body,raw)=>call("/__sky_collect",env,{method:"POST",body:raw??JSON.stringify(body),headers:{"content-type":"text/plain;charset=UTF-8"}});

let failures=0;
const check=(name,cond,extra="")=>{console.log((cond?"PASS":"FAIL")+"  "+name+(extra?"  ["+extra+"]":""));if(!cond)failures++;};

const good={v:1,a:"abc123DEF456",p:"embed",e:[
  ["session","","",""  ,1],
  ["section_view","video","","",3],
  ["item_open","reader","book-001","",2],
  ["share_tile","video","video-002","whatsapp",1]
]};

/* ---------- the switch ---------- */
let r=await post(mkEnv({ANALYTICS_AE:AE}),good);
let j=await r.json();
check("switch missing -> OFF: answers {on:false}",r.status===200&&j.on===false);
check("switch missing -> nothing written",points.length===0);

for(const v of ["false","off","0","no",""]){
  r=await post(mkEnv({ANALYTICS_AE:AE,ANALYTICS_ENABLED:v}),good); j=await r.json();
  check("ANALYTICS_ENABLED="+JSON.stringify(v)+" -> off, nothing written",j.on===false&&points.length===0);
}
r=await post(mkEnv({ANALYTICS_ENABLED:"true"}),good); j=await r.json();
check("switch on but binding missing -> off (apps pause), no crash",r.status===200&&j.on===false);

/* ---------- collecting ---------- */
for(const v of ["true","TRUE","on","1","yes"]){
  points.length=0;
  r=await post(mkEnv({ANALYTICS_AE:AE,ANALYTICS_ENABLED:v}),good); j=await r.json();
  check("ANALYTICS_ENABLED="+v+" -> on, 4 data points",r.status===200&&j.on===true&&j.stored===4&&points.length===4);
}
points.length=0;
r=await post(mkEnv({ANALYTICS_AE:AE,ANALYTICS_ENABLED:"true"}),good);
const p=points[2];
check("data point layout: index = event",p.indexes.length===1&&p.indexes[0]==="item_open");
check("blobs = event, section, id, detail, surface, country, visitor",JSON.stringify(p.blobs)===JSON.stringify(["item_open","reader","book-001","","embed","","abc123DEF456"]),JSON.stringify(p.blobs));
check("double1 = the count",p.doubles[0]===2);
check("tile keeps its platform as detail",points[3].blobs[3]==="whatsapp");
check("every point has exactly 7 blobs and 1 double",points.every(x=>x.blobs.length===7&&x.doubles.length===1));

/* ---------- feature taps (feature_use) ---------- */
points.length=0;
r=await post(mkEnv({ANALYTICS_AE:AE,ANALYTICS_ENABLED:"true"}),{v:1,a:"abc123DEF456",p:"pwa",e:[
  ["feature_use","video","","video_search",4],
  ["feature_use","reader","","reader_next",37],
  ["feature_use","reader","","Bad Name!/<x>",1]
]});
j=await r.json();
check("feature_use is accepted: 3 data points",r.status===200&&j.stored===3&&points.length===3);
check("feature_use layout: event, section, no id, feature name as detail, surface",JSON.stringify(points[0].blobs)===JSON.stringify(["feature_use","video","","video_search","pwa","","abc123DEF456"]),JSON.stringify(points[0].blobs));
check("feature_use count goes in double1",points[1].doubles[0]===37);
check("feature name is cleaned, never rejected or injected",/^[a-z0-9_-]*$/.test(points[2].blobs[3]),points[2].blobs[3]);

/* ---------- validation ---------- */
const env=mkEnv({ANALYTICS_AE:AE,ANALYTICS_ENABLED:"true"});
points.length=0;
r=await post(env,{v:1,a:"x",p:"hacker",e:[
  ["drop_database","reader","a","",1],            /* unknown event */
  ["item_open","reader","a b/c<script>","",1],     /* id is cleaned, not rejected */
  ["item_open","nowhere","ok","",1],               /* unknown section -> blank */
  ["item_open","reader","big","",999999],          /* clamped */
  ["item_open","reader","zero","",0],              /* dropped */
  ["item_open","reader","neg","",-4],              /* dropped */
  ["item_open","reader","nan","",null],            /* dropped */
  "garbage",
  ["item_open"]
]});
j=await r.json();
check("unknown events / bad counts / malformed rows are dropped",j.stored===3&&points.length===3,"stored="+j.stored);
check("id is cleaned to safe characters",points[0].blobs[2]==="a_b_c_script_",points[0].blobs[2]);
check("unknown section becomes blank",points[1].blobs[1]==="");
check("unknown surface becomes 'browser'",points[0].blobs[4]==="browser");
check("count is clamped to 1000",points[2].doubles[0]===1000);

points.length=0;
const many={v:1,a:"x",p:"pwa",e:Array.from({length:200},(_,i)=>["item_open","reader","id"+i,"",1])};
r=await post(env,many); j=await r.json();
check("at most 60 lines are stored from one request",j.stored===60&&points.length===60);

r=await post(env,null,"{not json"); check("bad JSON -> 400, nothing written",r.status===400);
r=await post(env,null,JSON.stringify({v:2,e:[]})); check("wrong version -> 400",r.status===400);
r=await post(env,null,"x".repeat(9000)); check("oversize body -> 413",r.status===413);
r=await call("/__sky_collect",env,{method:"GET"}); check("GET -> 405",r.status===405);
points.length=0;
const badAE={writeDataPoint(){throw new Error("boom");}};
r=await post(mkEnv({ANALYTICS_AE:badAE,ANALYTICS_ENABLED:"true"}),good); j=await r.json();
check("Analytics Engine throwing does not break the request",r.status===200&&j.stored===0);

/* ---------- share links (server-side counting) ---------- */
const plain=await call("/s/book/some-book-id",mkEnv(),{headers:{"user-agent":"Mozilla/5.0 (iPhone)"}});
points.length=0;
const on=mkEnv({ANALYTICS_AE:AE,ANALYTICS_ENABLED:"true"});
const withAn=await call("/s/book/some-book-id",on,{headers:{"user-agent":"Mozilla/5.0 (iPhone)"}});
check("share link: response is identical with analytics on (status)",withAn.status===plain.status,plain.status+" vs "+withAn.status);
check("share link: one share_open data point",points.length===1&&points[0].indexes[0]==="share_open");
check("share link: section normalised, id kept, detail = visitor, surface = link",
  JSON.stringify(points[0].blobs.slice(0,5))===JSON.stringify(["share_open","reader","some-book-id","visitor","link"]),JSON.stringify(points[0].blobs));
points.length=0;
await call("/s/video/v-1",on,{headers:{"user-agent":"WhatsApp/2.23 A"}});
check("link-preview robot is recorded as 'preview'",points.length===1&&points[0].blobs[3]==="preview"&&points[0].blobs[1]==="video");
points.length=0;
await call("/s/video/v-1",on,{method:"HEAD",headers:{"user-agent":"Mozilla/5.0"}});
check("HEAD request is recorded as 'preview'",points.length===1&&points[0].blobs[3]==="preview");
points.length=0;
await call("/s/video/v-1",mkEnv({ANALYTICS_AE:AE}),{headers:{"user-agent":"Mozilla/5.0"}});
check("share link: switch off -> nothing written",points.length===0);
const thrown=await call("/s/book/some-book-id",mkEnv({ANALYTICS_AE:badAE,ANALYTICS_ENABLED:"true"}),{headers:{"user-agent":"Mozilla/5.0"}});
check("share link: Analytics Engine throwing does not change the response",thrown.status===plain.status);
points.length=0;
await call("/s/book/some-book-id/extra/parts",on,{headers:{"user-agent":"Mozilla/5.0"}});
check("sub-paths under /s/ are not counted as opens",points.length===0);

console.log(failures?failures+" FAILED":"all passed");
process.exit(failures?1:0);
