/* Share Mode carries the Listen (read aloud) button.   Run: node share-listen.test.mjs
   Source-level checks: ShareViewer is a large DOM-bound file, so these guard the wiring that is easy to break:
   the button is kept in the Share Mode toolbar as the SAME element, and the CSS keeps the Settings on/off choice working. */
import fs from 'fs';
const rd=f=>fs.readFileSync(new URL(f,import.meta.url).pathname,'utf8');
const SV=rd('./js/shareViewer.js'), CSS=rd('./css/share.css'), RA=rd('./js/readAloud.js'), HTML=rd('./index.html');
let fails=0;const ok=(c,m)=>{if(!c){console.log('FAIL',m);fails++}else console.log('ok  ',m)};

/* ---- the toolbar rebuilt by Share Mode ---- */
const m=SV.match(/toolbar\.replaceChildren\(([\s\S]*?)\);/);
ok(!!m,'Share Mode rebuilds the book toolbar with replaceChildren');
const args=m?m[1].replace(/\s+/g,''):'';
ok(args.indexOf('listen')!==-1&&args.indexOf('listen')<args.indexOf('mute'),'Listen is put in the toolbar, first (left of Mute): '+args);
ok(/\.\.\.\(listen\?\[listen\]:\[\]\)/.test(args),'it is only added when the button exists');
ok(/getElementById\(\s*"listenButton"\s*\)/.test(SV),'it is found by id');
ok(!/replaceButton\(\s*"listenButton"\s*\)/.test(SV),'it is NOT replaced by a copy (a copy would lose read aloud\'s click handler)');

/* ---- read aloud keeps working in Share Mode ---- */
ok(/document\.addEventListener\("click"[\s\S]{0,200}closest\("#muteButton"\)/.test(RA),'Mute is handled through the document, so it survives Share Mode copying the Mute button');
ok(!/getElementById\("muteButton"\)/.test(RA),'read aloud does not hold on to the original Mute button');
ok(/skyreader:closed/.test(RA)&&/skyreader:bookOpened/.test(RA),'it still stops when the book closes or another opens');

/* ---- CSS ---- */
ok(/body\.sky-share-mode\.sky-share-book #toolbar #listenButton\[hidden\][\s\S]{0,40}\{\s*display:\s*none !important;/.test(CSS),'a hidden Listen button stays hidden (beats the toolbar\'s display:flex !important)');
ok(/#toolbar #listenButton\.is-listening\s*\{[^}]*background:\s*#0f7a4a !important/.test(CSS),'the "listening" look exists in Share Mode');
ok(/#toolbar #listenButton\[data-state="loading"\] svg\s*\{\s*animation:\s*srListenPulse/.test(CSS),'the loading pulse exists in Share Mode');
const reader=rd('./css/reader.css');
ok(/@keyframes srListenPulse/.test(reader),'the pulse keyframes are defined (css/reader.css)');

/* ---- the page loads everything ---- */
ok(/<button id="listenButton"/.test(HTML)&&/js\/readAloud\.js/.test(HTML),'index.html has the button and loads read aloud (Share Mode runs on this page)');

console.log(fails?fails+' FAILED':'all passed');process.exit(fails?1:0);
