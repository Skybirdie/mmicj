/* Share Mode must never close a book by paging past the last page.
   Run in the app folder:  node navigation-share-close.test.cjs  */
const vm=require("vm"),fs=require("fs");
function run(file, shareMode, page, pages, twoPage){
  const L={}, closes=[], nexts=[]; let share=shareMode;
  const viewer={contains:()=>true,addEventListener:(t,f,o)=>{(L["viewer:"+t]=L["viewer:"+t]||[]).push(f)},removeEventListener(){}};
  const els={viewerArea:viewer};
  const doc={body:{classList:{contains:c=>c==="sky-share-mode"&&share}},
    getElementById:id=>els[id]||null, addEventListener:(t,f)=>{(L["doc:"+t]=L["doc:"+t]||[]).push(f)}, removeEventListener(){}, querySelector:()=>null, querySelectorAll:()=>[]};
  const win={innerWidth:1200,addEventListener(){},removeEventListener(){},dispatchEvent(){},history:{}};
  const stub=new Proxy({}, {get:(t,k)=>k==="then"?undefined:(()=>stub)});
  const ctx={window:win,document:doc,console:{log(){},warn(){},error(){}},setTimeout:(f,ms)=>setImmediate(f),clearTimeout(){},Date,Math,Number,Promise,Event:class{},CustomEvent:class{},
    Reader:{page:()=>page,pages:()=>pages,isOpen:()=>true,close:o=>{closes.push(o)},next:async()=>{nexts.push(1)},prev:async()=>{}, goToPage:async()=>{}},
    AudioController:{readerClosed(){}},Sky180FlipEngine:{isTwoPageDocument:()=>twoPage,isSinglePage:()=>false,busy:()=>false},
    SkyReader:{toggleLibrary(){},library:[]},UI:new Proxy({},{get:()=>()=>{}}),StorageManager:{save(){}},Renderer:{},Library:{},
    sessionStorage:{getItem:()=>null,setItem(){}},localStorage:{getItem:()=>null,setItem(){}},navigator:{},location:{search:""},history:{pushState(){},replaceState(){}}};
  ctx.navigation={}; ctx.window=Object.assign(win,ctx); ctx.self=ctx.window;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(file,"utf8"),ctx);
  const nav=ctx.window.SRNavigation;
  nav.initialize(); nav.attach();
  return {nav,L,closes,nexts,wheel:(dy)=>(L["viewer:wheel"]||[]).forEach(f=>f({deltaY:dy,ctrlKey:false,target:{}})),key:(k)=>(L["doc:keydown"]||[]).forEach(f=>f({key:k,code:k,preventDefault(){},target:{}}))};
}
(async()=>{
  let bad=0; const check=(n,c)=>{console.log((c?"PASS":"FAIL")+"  "+n); if(!c) bad++;};
  const go=async(share,page,pages,two,key)=>{const t=run("js/navigation.js",share,page,pages,two); key?t.key("ArrowRight"):t.wheel(100); for(let i=0;i<8;i++) await new Promise(r=>setImmediate(r)); return t;};
  let t;
  t=await go(false,10,10,false);      check("normal reader: wheel forward on the last page still closes the book",t.closes.length===1);
  t=await go(true,10,10,false);       check("Share Mode: wheel forward on the last page does NOT close the book",t.closes.length===0);
  t=await go(true,10,10,false,true);  check("Share Mode: ArrowRight on the last page does NOT close the book",t.closes.length===0);
  t=await go(true,2,2,true);          check("Share Mode: wheel forward on a 2-page document does NOT close the book",t.closes.length===0);
  t=await go(true,4,10,false);        check("Share Mode: wheel forward mid-book still turns the page",t.nexts.length===1&&t.closes.length===0);
  console.log(bad?"\n"+bad+" FAILED":"\nall passed"); process.exit(bad?1:0);
})();
