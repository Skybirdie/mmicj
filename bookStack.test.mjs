import fs from 'fs';
import vm from 'vm';
const store={};
const win={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)},location:{search:''},dispatchEvent(){},CustomEvent:class{}};
win.window=win; win.CustomEvent=class{constructor(n,o){this.type=n;this.detail=o&&o.detail}};
vm.createContext(win);
vm.runInContext(fs.readFileSync(new URL('./js/bookStack.js',import.meta.url).pathname,'utf8'),win);
const B=win.BookStack; let fails=0;
const ok=(c,m)=>{if(!c){console.log('FAIL',m);fails++}else console.log('ok  ',m)};
ok(B.isEnabled()===false,'default off');
B.setEnabled(true); ok(B.isEnabled()===true,'enable persists');
B.setEnabled(false); ok(B.isEnabled()===false,'disable persists');
const t=(pc,s,l=100,r=100)=>B.computeThickness(pc,s,l,r);
let r=t(100,0); ok(r.left===0&&r.right>0,'cover: left none, right present '+JSON.stringify(r));
r=t(100,50); ok(r.left>0&&r.right===0,'even-length closing spread: right none '+JSON.stringify(r));
r=t(101,50); ok(r.right===0&&r.left>0,'odd-length last spread '+JSON.stringify(r));
r=t(100,25); ok(r.left>0&&r.right>0&&Math.abs(r.left-r.right)<1.2,'mid-book roughly balanced '+JSON.stringify(r));
r=t(2,0); ok(r.left===0&&r.right===0,'tiny book none');
r=t(500,10); ok(r.left+r.right<=19.51,'cap total '+JSON.stringify(r));
r=t(100,25,0,0); ok(r.left===0&&r.right===0,'no room -> none');
r=t(100,25,4,100); ok(r.left<=2,'room clamp '+JSON.stringify(r));
let prev=-1,mono=true; for(let s=0;s<=50;s++){const x=t(100,s); if(x.left<prev-1e-9) mono=false; prev=x.left;} ok(mono,'left grows monotonically');

// ---- single-page (mobile) geometry ----
const ts=(pc,i,l=8,r=8)=>B.computeThicknessSingle(pc,i,l,r);
r=ts(40,0); ok(r.left===0&&r.right>0,'single: first page has no left stack '+JSON.stringify(r));
r=ts(40,39); ok(r.right===0&&r.left>0,'single: last page has no right stack '+JSON.stringify(r));
r=ts(40,20); ok(r.left>0&&r.right>0&&Math.abs(r.left-r.right)<0.6,'single: mid-book both sides '+JSON.stringify(r));
r=ts(40,20,0,0); ok(r.left===0&&r.right===0,'single: no gutter -> none');
r=ts(40,20,3,3); ok(r.left<=2.0001&&r.right<=2.0001,'single: gutter clamp '+JSON.stringify(r));
r=ts(2,0); ok(r.left===0&&r.right===0,'single: tiny book none');
r=ts(500,250,100,100); ok(r.left+r.right<=14.01+1.5,'single: cap total '+JSON.stringify(r));
let pv=-1,mon2=true; for(let i=0;i<40;i++){const x=ts(40,i); if(x.left<pv-1e-9) mon2=false; pv=x.left;} ok(mon2,'single: left grows monotonically');

// ---- leaf counts ----
ok(B.leafCount(0,2.6)===0,'leaves: none when thickness 0');
ok(B.leafCount(1.5,2.6)===1,'leaves: at least 1 when any thickness');
ok(B.leafCount(3.8,2.6)===2,'leaves: short-book cover (3.8px) shows 2');
ok(B.leafCount(8,2.6)===3,'leaves: 8px -> 3');
ok(B.leafCount(500,2.6)===10,'leaves: capped at 10');
ok(B.leafCount(6,1.7)>B.leafCount(6,2.6),'leaves: finer pitch gives more leaves');
// update() with no DOM must not throw
B.setEnabled(true); B.update({host:null}); B.update({}); ok(true,'update tolerates bad input');
console.log(fails?'FAILED':'ALL PASSED'); process.exit(fails?1:0)
