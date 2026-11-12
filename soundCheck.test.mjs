/* Settings -> "Test sounds" (js/soundCheck.js).   Run: node soundCheck.test.mjs
   1. wiring: the button sits under Sound volume, the script is loaded, versions bumped, constants match the app
   2. the real js/audio.js (info, playChecked) and the real js/soundCheck.js run against a small fake browser */
import fs from 'fs';
import vm from 'vm';
const P=f=>decodeURIComponent(new URL(f,import.meta.url).pathname);
const rd=f=>fs.readFileSync(P(f),'utf8');
const AUDIO=rd('./js/audio.js'),SC=rd('./js/soundCheck.js'),SET=rd('./js/settingsPanel.js'),INDEX=rd('./index.html'),SLIDE=rd('./js/slideshowViewer.js'),CSS=rd('./css/style.css');
let fails=0;const ok=(c,m)=>{if(!c){console.log('FAIL',m);fails++}else console.log('ok  ',m)};

/* ---------- wiring ---------- */
const vi=SET.indexOf('id="srSettingVolume"'),bi=SET.indexOf('id="srSoundCheckButton"'),li=SET.indexOf('id="srListenRows"');
ok(vi>0&&bi>vi&&bi<li,'the Test sounds button is right below the Sound volume row (inside .sr-settings-body)');
ok(/id="srSoundCheckBox" hidden/.test(SET),'the result box is hidden until a test runs');
ok(/SoundCheck\.run\(root\.querySelector\("#srSoundCheckBox"\)\)/.test(SET),'the button runs the check into that box');
ok(/b\.disabled=true[\s\S]{0,200}finally\{b\.disabled=false/.test(SET),'the button cannot be tapped twice while a test runs');
ok(/#srSoundCheckButton"\)\.style\.display=window\.SoundCheck/.test(SET),'no button if the check script did not load');
ok(/\.sr-settings-action\.sr-soundcheck-button\{margin-top:12px/.test(CSS)&&CSS.indexOf('.sr-settings-action.sr-soundcheck-button')>CSS.indexOf('.sr-settings-action{'),'its spacing rule comes after the general button rule (so it wins)');
ok(/js\/audio\.js\?v=2\.1\.1"><\/script>\s*<script src="js\/soundCheck\.js\?v=1\.0\.2"/.test(INDEX),'index.html loads soundCheck.js right after audio.js (audio.js version bumped)');
ok(/js\/settingsPanel\.js\?v=1\.0\.8/.test(INDEX)&&/css\/style\.css\?v=1\.0\.9/.test(INDEX),'settingsPanel.js and style.css versions bumped (browsers fetch the new copies)');
ok(/audio\.version="1\.2\.0"/.test(AUDIO),'audio.js version bumped');
const eff=(SLIDE.match(/const EFFECT_URL = "([^"]+)"/)||[])[1],fb=(SLIDE.match(/const EFFECT_FALLBACK_URL = "([^"]+)"/)||[])[1],mm=(SLIDE.match(/const MUSIC_MANIFEST_URL = "([^"]+)"/)||[])[1];
ok(SC.indexOf('effect:"'+eff+'"')>=0&&SC.indexOf('fallback:"'+fb+'"')>=0&&SC.indexOf('musicManifest:"'+mm+'"')>=0,'the slideshow effect, fallback and music list match js/slideshowViewer.js ('+eff+', '+fb+', '+mm+')');
ok(/musicDir:"assets\/slideshowMusic\/"/.test(SC),'tracks are looked up where the slideshow looks');
const regs=[...AUDIO.matchAll(/audio\.register\("([^"]+)","([^"]+)"/g)].map(m=>m[1]);
ok(regs.length>=9&&[...AUDIO.matchAll(/audio\.register\("[^"]+","([^"]+)"/g)].every(m=>fs.existsSync(P('./'+m[1]))),'every sound registered in audio.js exists on disk ('+regs.length+')');
const man=JSON.parse(rd('./'+mm));
ok(man.every(f=>fs.existsSync(P('./assets/slideshowMusic/'+f)))&&fs.existsSync(P('./'+eff))&&fs.existsSync(P('./'+fb)),'the slideshow files and every music track exist');
ok(!/analytics|sendBeacon|XMLHttpRequest|workers\.dev|\/api\//.test(SC)&&(SC.match(/fetch\(/g)||[]).length===1,'no analytics or Worker calls: its only request is the static music list');
ok(!/StorageManager|localStorage/.test(SC),'it stores nothing');

/* ---------- a fake browser ---------- */
function makeEnv(o){
  o=o||{};
  const created=[];
  class FA{
    constructor(src){this._l={};this._src=src||'';this.muted=false;this.currentTime=0;this.readyState=0;this.duration=NaN;this.error=null;this._vol=1;this.paused=true;created.push(this);}
    set volume(v){this._vol=o.noVolume?1:v}get volume(){return this._vol}
    set src(v){this._src=v}get src(){return this._src}
    addEventListener(t,f,op){(this._l[t]=this._l[t]||[]).push([f,op&&op.once])}
    _fire(t){const a=(this._l[t]||[]).slice();this._l[t]=(this._l[t]||[]).filter(x=>!x[1]);a.forEach(x=>x[0]())}
    canPlayType(){return 'maybe'}removeAttribute(){}pause(){this.paused=true}
    load(){this.readyState=4;this.duration=1.4;setTimeout(()=>this._fire('canplay'),1);}
    _missing(){return (o.missing||[]).some(m=>this._src.indexOf(m)>=0)}
    play(){
      const url=this._src;
      if(this._missing()){this.error={code:4};setTimeout(()=>this._fire('error'),1);return Promise.reject({name:'NotSupportedError'});}
      if(o.blockAll||(o.blockFresh&&!this._pool)||(o.blockUnmuted&&!this.muted)){return Promise.reject({name:'NotAllowedError'});}
      this.paused=false;this.duration=1.4;
      setTimeout(()=>{this.currentTime=0.2;this._fire('timeupdate');},2);
      return Promise.resolve();
    }
  }
  const ctx={console,setTimeout,clearTimeout,Math,Date,JSON,Promise,Object,Array,String,Number,isFinite,Map,performance:{now:()=>Date.now()},
    Audio:FA,navigator:{userAgent:o.ua||'TestPhone/1.0',language:'en-US',onLine:true,maxTouchPoints:0,clipboard:o.noClipboard?undefined:{writeText:async t=>{ctx.__copied.push(t)}}},
    document:{visibilityState:'visible',head:{appendChild(){}},documentElement:{appendChild(){}},getElementById:()=>null,createElement:()=>({style:{},select(){},setAttribute(){}}),body:{appendChild(){},removeChild(){}},execCommand:()=>!o.noClipboard},
    fetch:async()=>o.noMusic?{ok:false,status:404}:{ok:true,json:async()=>man},__copied:[]};
  ctx.window=ctx;ctx.isSecureContext=true;ctx.addEventListener=()=>{};ctx.matchMedia=()=>({matches:false});ctx.AudioContext=function(){this.state='running';this.close=()=>{}};
  vm.createContext(ctx);
  new vm.Script(AUDIO,{filename:'audio.js'}).runInContext(ctx);
  /* pool players are "unlocked by the app": mark them so blockFresh only blocks brand-new players */
  created.forEach(a=>{a._pool=true});
  if(o.muted)ctx.AudioController.mute();
  if(o.volume!=null)ctx.AudioController.setVolume(o.volume);
  if(o.noPlayChecked){delete ctx.AudioController.playChecked;}
  new vm.Script(SC,{filename:'soundCheck.js'}).runInContext(ctx);
  const box={hidden:true,innerHTML:'',_l:{},__scWired:false,addEventListener(t,f){(this._l[t]=this._l[t]||[]).push(f)},querySelector(){return null},scrollIntoView(){}};
  const press=a=>(box._l.click||[]).forEach(f=>f({target:{closest:()=>({getAttribute:()=>a})}}));
  return {ctx,box,press,SoundCheck:ctx.SoundCheck,AC:ctx.AudioController,created};
}
const text=h=>h.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
async function runIt(o){const e=makeEnv(o);const t0=Date.now();await e.SoundCheck.run(e.box);e.ms=Date.now()-t0;return e;}

/* ---------- audio.js additions ---------- */
{
  const e=makeEnv();
  const info=e.AC.info();
  ok(info.length===regs.length&&info.every(i=>i.url&&'ready' in i&&'failed' in i),'AudioController.info() lists every sound with its file and load state');
  ok(typeof e.AC.playChecked==='function','AudioController.playChecked exists');
  const r=await e.AC.playChecked('bookSelect');ok(r.ok===true,'playChecked reports a play that worked');
  ok((await e.AC.playChecked('nope')).err==='not registered','playChecked on an unknown name says so');
  e.AC.mute();ok((await e.AC.playChecked('bookSelect')).err==='muted','playChecked while muted says muted (and does not play)');
  ok(e.AC.play('bookSelect')===false,'play() while muted still just returns false (behaviour unchanged)');
  const b=makeEnv({blockUnmuted:true});
  ok((await b.AC.playChecked('bookSelect')).err==='NotAllowedError','a browser refusal is reported by name');
  ok(b.AC.play('bookSelect')===true,'play() still returns true and swallows the refusal (behaviour unchanged)');
}

/* ---------- a healthy device ---------- */
{
  const e=await runIt();
  const t=text(e.box.innerHTML);
  ok(e.box.hidden===false,'the result box is shown');
  ok(/Did you hear any sounds just now\?/.test(t),'at the end it asks one question: did you hear any sounds just now');
  ok(/No errors found/.test(t),'no errors: "No errors found. Please tell us whether you heard the sounds."');
  ok(/11 of 11 play silently/.test(t),'all 11 files (9 app sounds + slide effect + fallback) are played silently ('+(t.match(/\d+ of \d+ play silently/)||[''])[0]+')');
  ok(/5 of 5 tracks play/.test(t),'all 5 music tracks are checked');
  ok(/the app played it/.test(t)&&/3 of 3 played/.test(t)&&/started without a tap/.test(t),'page turn, quick turns and slideshow effect all reported');
  ok(e.ms<9000,'it finishes by itself in a few seconds ('+e.ms+' ms)');
  e.press('yes');
  ok(/OK: every sound loads and plays, and you heard them/.test(text(e.box.innerHTML)),'answering Yes gives the OK verdict');
  e.press('copy');await new Promise(r=>setTimeout(r,10));
  const rep=e.ctx.__copied[0]||'';
  ok(/^MMICJ sound check/.test(rep)&&/Heard the sounds: yes/.test(rep),'Copy report: title and "heard: yes"');
  ok(/pageTurn5 \(assets\/audio\/pageturn5\.mp3\): ok 1\.4 s, \d+ ms; app preload ok/.test(rep),'the report gives each file: result, length, time and the app\'s preload');
  ok(/slideEffect \(assets\/audio\/slide\.mp3\): ok/.test(rep)&&/slideFallback/.test(rep),'the report includes the slideshow effect files');
  ok(/Device: TestPhone\/1\.0/.test(rep)&&/autoplay policy/.test(rep)&&/iOS audio session/.test(rep)&&/App sound code: v1\.2\.0; sounds muted: false; app sound volume: 35% \(please check device or external speaker volumes separately\)/.test(rep),'the report gives the device, autoplay policy, audio session, app version, mute and volume');
  ok(/Slideshow music: 5 tracks listed/.test(rep),'the report lists the music');
  ok(!/Problems:/.test(rep),'no Problems section');
  ok(e.SoundCheck.report()===rep||/Heard the sounds: yes/.test(e.SoundCheck.report()),'SoundCheck.report() returns the latest report');
}
/* the reader did not hear it (iPhone) */
{
  const e=await runIt({ua:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',noVolume:true});
  e.press('no');
  const t=text(e.box.innerHTML);
  ok(/PROBLEM: The reader did not hear the sounds/.test(t),'answering No is the verdict');
  ok(/ring \/ silent switch/.test(t),'on an iPhone it points at the ring / silent switch');
  ok(/ignores the app(?:&#39;|')s sound volume/.test(t),'and notes that the device ignores page volume');
  e.press('copy');await new Promise(r=>setTimeout(r,10));
  ok(/Heard the sounds: NO/.test(e.ctx.__copied[0])&&/Hints:/.test(e.ctx.__copied[0]),'the report says NO and carries the hint');
}
/* app sounds switched off in Settings */
{
  const e=await runIt({muted:true});const t=text(e.box.innerHTML);
  ok(/PROBLEM: Device: sounds are switched off in Settings/.test(t),'muted: the verdict says sounds are switched off');
  ok(/Turn on &quot;Page-turn sound&quot;|Turn on "Page-turn sound"/.test(e.box.innerHTML),'and tells the reader which setting');
  ok(!e.created.some(a=>/pageturn/.test(a._src)&&!a.muted&&a._played),'nothing audible was played from the app while muted');
}
/* volume at 0 */
{
  const e=await runIt({volume:0});
  ok(/sound volume is at 0/.test(text(e.box.innerHTML)),'volume at 0 is called out');
}
/* a missing file */
{
  const e=await runIt({missing:['pageturn3.mp3']});const t=text(e.box.innerHTML);
  ok(/PROBLEM/.test(t)&&/pageTurn3 \(file missing or not supported\)/.test(t),'a missing file is named with the reason');
  e.press('copy');await new Promise(r=>setTimeout(r,10));
  ok(/pageTurn3 \(assets\/audio\/pageturn3\.mp3\): BAD - file missing or not supported/.test(e.ctx.__copied[0]),'and is in the report');
}
/* the browser blocks the app's sound / the slideshow's sound */
{
  const e=await runIt({blockUnmuted:true});const t=text(e.box.innerHTML);
  ok(/refused: blocked by the browser \(NotAllowedError\)/.test(t),'a refused page turn is reported with the browser\'s reason');
  ok(/Slideshow effect/.test(t)&&/blocked by the browser/.test(t),'a blocked slideshow effect is reported');
  e.press('copy');await new Promise(r=>setTimeout(r,10));
  ok(/started with no tap: REFUSED - blocked by the browser/.test(e.ctx.__copied[0])&&/Hints:[\s\S]*a patch candidate/.test(e.ctx.__copied[0]),'the report says the slideshow sound was refused and suggests the patch');
}
/* no tracks list, no clipboard */
{
  const e=await runIt({noMusic:true,noClipboard:true});
  ok(/track list could not be read \(HTTP 404\)/.test(text(e.box.innerHTML)),'a missing music list is reported');
  e.press('copy');await new Promise(r=>setTimeout(r,20));
  ok(/sc-textbox/.test(e.box.innerHTML),'with no clipboard the report is shown in a box to copy by hand');
}
/* old audio.js without the new functions */
{
  const e=await runIt({noPlayChecked:true});
  ok(/too old for this check/.test(text(e.box.innerHTML)),'an old audio.js is reported, not a crash');
}
/* running twice at once */
{
  const e=makeEnv();const a=e.SoundCheck.run(e.box);const b=e.SoundCheck.run(e.box);
  ok(e.SoundCheck.isRunning(),'it reports that it is running');
  await Promise.all([a,b]);ok(!e.SoundCheck.isRunning(),'and finishes');
}
console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
