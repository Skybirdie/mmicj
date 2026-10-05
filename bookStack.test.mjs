import fs from 'fs';
import vm from 'vm';
const store={};
const win={localStorage:{getItem:k=>store[k]??null,setItem:(k,v)=>store[k]=String(v)},location:{search:''},dispatchEvent(){},CustomEvent:class{}};
win.window=win; win.CustomEvent=class{constructor(n,o){this.type=n;this.detail=o&&o.detail}};
vm.createContext(win);
vm.runInContext(fs.readFileSync(new URL('./js/bookStack.js',import.meta.url).pathname,'utf8'),win);
const B=win.BookStack; let fails=0;
const ok=(c,m)=>{if(!c){console.log('FAIL',m);fails++}else console.log('ok  ',m)};
ok(B.isEnabled()===true,'default on (DEFAULT_ENABLED=true)');
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

// ---- side counts (cover = outermost page of each stack) ----
const sc=(pc,i,single)=>B.sideCounts(pc,i,single);
r=sc(60,0,false); ok(r.left===0&&r.right===59,'counts: cover spread '+JSON.stringify(r));
r=sc(60,1,false); ok(r.left===1&&r.right===57,'counts: spread 1 left is only the cover '+JSON.stringify(r));
r=sc(60,30,false); ok(r.left===59&&r.right===0,'counts: last spread of even book '+JSON.stringify(r));
r=sc(61,30,false); ok(r.left===59&&r.right===0,'counts: last spread of odd book '+JSON.stringify(r));
r=sc(40,0,true); ok(r.left===0&&r.right===39,'counts single: first page '+JSON.stringify(r));
r=sc(40,39,true); ok(r.left===39&&r.right===0,'counts single: last page '+JSON.stringify(r));
r=sc(2,0,false); ok(r.left===0&&r.right===0,'counts: tiny book none');

// ---- leaf geometry (coarse taper) and cover start ----
{
  const g0=B.leafGeometry(0,2.0,'right'); ok(g0.length===0,'geometry: no leaves');
  const gr=B.leafGeometry(6,2.0,'right'), gl=B.leafGeometry(6,2.0,'left');
  ok(gr.length===6&&gl.length===6,'geometry: one entry per leaf');
  ok(gr[0].topIn===0&&gr[0].botIn===0,'geometry: first leaf touches the page (inset 0)');
  ok(gr.every(l=>l.topOut>=l.topIn&&l.botOut>=l.botIn),'geometry: every leaf tapers inward, never outward');
  let nondec=true; for(let k=1;k<gr.length;k++){ if(gr[k].topIn<gr[k-1].topIn-1e-9||gr[k].botIn<gr[k-1].botIn-1e-9) nondec=false; }
  ok(nondec,'geometry: stack gets shorter outward overall');
  const stepsTop=gr.map(l=>+(l.topOut-l.topIn).toFixed(3));
  ok(new Set(stepsTop).size>3,'geometry: leaf tapers vary (coarse) '+stepsTop.join(','));
  ok(gr.some((l,k)=>k>0&&Math.abs(l.topIn-gr[k-1].topOut)>0.05),'geometry: tiny notches between leaves');
  ok(JSON.stringify(gr)!==JSON.stringify(gl),'geometry: left and right are not mirror copies');
  const o=B.outerInset(6,2.0,'right'); const last=gr[5];
  ok(o.top===last.topOut&&o.bottom===last.botOut,'outerInset: cover starts at furthest leaf outer edge');
  const o0=B.outerInset(0,2.0,'left'); ok(o0.top===0&&o0.bottom===0,'outerInset: no leaves -> flush with page');
  const avg=gr[5].topOut/6/(2.0*0.75); ok(avg>0.85&&avg<1.25,'geometry: average taper stays near LEAF_INSET_RATIO ('+avg.toFixed(2)+')');
}

// ---- cover asymmetry ----
{
  const l=B.coverInsets(5,2.0,'left'), lo=B.outerInset(5,2.0,'left');
  const r=B.coverInsets(5,2.0,'right'), ro=B.outerInset(5,2.0,'right');
  ok(l.top===lo.top && l.bottom>lo.bottom,'cover asymmetry: left cover is trimmed at the bottom only '+JSON.stringify(l));
  ok(r.bottom===ro.bottom && r.top>ro.top,'cover asymmetry: right cover is trimmed at the top only '+JSON.stringify(r));
  ok(l.bottom-lo.bottom<6 && r.top-ro.top<6,'cover asymmetry: trims stay tiny');
  const z=B.coverInsets(0,2.0,'left'); ok(z.top===0&&z.bottom>0,'cover asymmetry: also applies with no leaves');
}

// ---- live diagnostics / tuning ----
{
  const i0=B.info(); ok(typeof i0.version==='string'&&i0.coverLeftBottomTrim>=0,'info: reports version and values '+JSON.stringify(i0));
  const before=B.coverInsets(4,2.0,'left').bottom;
  B.tune({coverLeftBottomTrim:9}); const after=B.coverInsets(4,2.0,'left').bottom;
  ok(Math.abs((after-before)-(9-i0.coverLeftBottomTrim))<1e-9,'tune: changing the trim changes coverInsets by exactly the difference');
  B.tune({coverRightTopTrim:7}); ok(Math.abs(B.coverInsets(4,2.0,'right').top-B.outerInset(4,2.0,'right').top-7)<1e-9,'tune: right-top trim applies');
  B.tune({coverLeftBottomTrim:-5,coverRightTopTrim:'x'}); ok(B.info().coverLeftBottomTrim===9&&B.info().coverRightTopTrim===7,'tune: ignores invalid values');
  B.tune({coverLeftBottomTrim:i0.coverLeftBottomTrim,coverRightTopTrim:i0.coverRightTopTrim});
}
{
  const w=B.coverSlantPx(3.8); ok(w>0&&w<3.8,'slant: positive and narrower than the cover ('+w.toFixed(2)+'px)');
  ok(B.coverSlantPx(0)===0,'slant: zero cover gives zero slant');
  ok(B.coverSlantPx(100)<=60.0001,'slant: capped at 60% of the cover thickness');
  const l=B.coverShape(3.8,'left'), r=B.coverShape(3.8,'right');
  ok(/100% 100%,[\d.]+px 100%\)$/.test(l),'slant: left cover narrows at the bottom (outer-left corner pulled in)');
  ok(/calc\(100% - [\d.]+px\) 0,100% 100%/.test(r),'slant: right cover narrows at the top (outer-right corner pulled in)');
  B.tune({coverSlantRatio:0}); ok(B.coverSlantPx(3.8)===0,'tune: ratio 0 removes the slant');
  B.tune({coverSlantRatio:.35});
}
// update() with no DOM must not throw
B.setEnabled(true); B.update({host:null}); B.update({}); ok(true,'update tolerates bad input');
console.log(fails?'FAILED':'ALL PASSED'); process.exit(fails?1:0)
