/* Tests for js/birthdayParty.js (the pure parts: names, timing, gif deck).
   Run:  node birthdayParty.test.mjs                                      */
import fs from 'fs';
import vm from 'vm';

const SRC = fs.readFileSync(new URL('./js/birthdayParty.js', import.meta.url).pathname, 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { console.log('FAIL', m); fails++; } else console.log('ok  ', m); };

const w = { document:{readyState:'complete', getElementById:()=>null, addEventListener(){}},
            location:{search:''}, URLSearchParams, setTimeout, clearTimeout, setInterval, clearInterval,
            fetch:()=>Promise.resolve({ok:false}), Date, Math, Set, console };
w.window = w; vm.createContext(w); vm.runInContext(SRC, w);
const C = w.BirthdayParty._core;

/* names */
const names = C.cleanNames(['  Ann  ', 'ann', '', null, 'Marcus  Lee', 'Zoe', undefined, 'mia']);
ok(JSON.stringify(names) === JSON.stringify(['Ann', 'Marcus Lee', 'Zoe', 'mia']), 'cleanNames trims, collapses spaces, drops blanks and case-duplicates');
ok(JSON.stringify(C.alphabetical(['Zoe', 'mia', 'Aaron', 'Marcus'])) === JSON.stringify(['Aaron', 'Marcus', 'mia', 'Zoe']), 'alphabetical ignores letter case');
ok(C.cleanNames('not a list').length === 0, 'cleanNames survives a non-list');

/* shuffle */
const src = ['a', 'b', 'c', 'd', 'e', 'f'];
const sh = C.shuffled(src);
ok(sh.length === 6 && [...sh].sort().join() === src.join(), 'shuffled keeps every name exactly once');
ok(src.join() === 'a,b,c,d,e,f', 'shuffled does not change the original list');

/* timing */
const P = n => C.plan(n);
ok(P(1).perName === 10000 && P(1).total === 10000, '1 name: shown for 10 s');
ok(P(2).perName === 5000 && P(2).total === 10000, '2 names: 5 s each = 10 s');
ok(P(3).total >= 10000 && P(3).perName >= 3000, '3 names: at least 10 s');
ok(P(4).perName === 3000 && P(4).total === 12000, '4 names: 3 s each');
ok(P(7).perName === 3000 && P(7).total === 21000, '7 names: 3 s each');
let minOk = true; for (let n = 1; n <= 60; n++) if (P(n).total < 10000 || P(n).perName < 3000) minOk = false;
ok(minOk, 'never shorter than 10 s, never less than 3 s per name (1-60 names)');

/* gif deck */
const files = ['x.gif', 'y.gif', 'z.gif'];
const deck = C.gifDeck(files);
let seq = []; for (let i = 0; i < 30; i++) seq.push(deck.next());
let deckOk = true;
for (let i = 0; i < 30; i += 3) if ([...seq.slice(i, i + 3)].sort().join() !== files.join()) deckOk = false;
ok(deckOk, 'deck deals every gif once before any repeats');
let noRepeat = true; for (let i = 1; i < seq.length; i++) if (seq[i] === seq[i - 1]) noRepeat = false;
ok(noRepeat, 'same gif never shows twice in a row, even across reshuffles');
ok(C.gifDeck([]).next() === null, 'empty gif list gives null (gradient fallback)');
const one = C.gifDeck(['only.gif']); ok(one.next() === 'only.gif' && one.next() === 'only.gif', 'single gif just repeats');

/* manifest */
ok(JSON.stringify(C.manifestFiles(['a.gif', '../x.gif', 'sub/b.gif', ' c.gif ', 5, ''])) === JSON.stringify(['a.gif', 'c.gif']), 'manifest keeps plain file names only');
ok(C.manifestFiles({}).length === 0, 'manifest survives bad JSON');

/* birthdays today */
const M = [{name:'A',birthday:'1990-11-13'},{name:'B',birthday:'11-13'},{name:'C',birthday:'1990-11-14'},{name:'D'},{name:'E',birthday:'garbage'},null];
ok(C.birthdaysToday(M, new Date(2026,10,13)).join() === 'A,B', 'birthdaysToday matches month-day, with or without a year, and skips bad rows');
const L = [{name:'Leap',birthday:'2000-02-29'}];
ok(C.birthdaysToday(L, new Date(2027,1,28)).join() === 'Leap', '29 Feb birthday is celebrated on 28 Feb in a non-leap year');
ok(C.birthdaysToday(L, new Date(2027,2,1)).length === 0, '...and not on 1 March');
ok(C.birthdaysToday(L, new Date(2028,1,28)).length === 0 && C.birthdaysToday(L, new Date(2028,1,29)).join() === 'Leap', 'in a leap year it is celebrated on the 29th only');
ok(C.birthdaysToday('nope').length === 0, 'birthdaysToday survives a non-list');

/* layout choice - numbers measured on the real front page */
const box = (vw, vh, s, waveH, shareLeft, shareAbove) => ({
    vw, vh, waveTop: vh - waveH, topWaveBottom: waveH, shareLeft, shareAbove,
    center: {left: (vw - s) / 2, right: (vw + s) / 2, top: (vh - s) / 2, bottom: (vh + s) / 2}
});
const mode = g => C.chooseMode(g).mode;
ok(mode(box(1440, 900, 675, 90, 1320, false)) === 'side', 'desktop 1440x900 -> beside the centerpiece');
ok(mode(box(1280, 720, 540, 72, 1160, false)) === 'side', 'laptop 1280x720 -> beside the centerpiece');
ok(mode(box(1024, 768, 576, 76.8, 904, false)) === 'side', 'landscape tablet 1024x768 -> beside the centerpiece');
ok(mode(box(844, 390, 292.5, 39, 724, false)) === 'side', 'landscape phone 844x390 -> beside the centerpiece');
const ph = C.chooseMode(box(390, 844, 327.6, 126.6, 311, true));
ok(ph.mode === 'below' && ph.right === 87, 'phone 390x844 -> below the centerpiece, stops 8px left of the share button');
ok(mode(box(820, 1180, 672, 118, 700, false)) === 'below', 'portrait tablet 820x1180 -> below the centerpiece');
ok(mode(box(320, 568, 268.8, 85.2, 244, true)) === 'button', 'short phone 320x568 (strip too thin) -> button');
ok(mode(box(390, 600, 327.6, 90, 311, true)) === 'button', 'short phone 390x600 -> button');
ok(mode(box(800, 900, 656, 90, 680, false)) === 'button', 'near-square window 800x900 -> button');
ok(mode(box(667, 375, 281, 56.3, 574, true)) === 'button', 'small landscape phone 667x375 -> button');
const side = C.chooseMode(box(1440, 900, 675, 90, 1320, false));
ok(side.bottom === 96 && side.right === Math.round(1440 - (382.5 - 18)), 'side row: 6px above the doors, 18px left of the centerpiece');
/* the row never overlaps the centerpiece */
let noOverlap = true;
for (let w = 300; w <= 1920; w += 37) for (let h = 400; h <= 1300; h += 41) {
    const narrow = w <= 700, s = Math.min(h * .75, w * (narrow ? .84 : .82)), wh = h * (narrow ? .15 : .10);
    const g = box(w, h, s, wh, narrow ? w - Math.max(5, w * .05) - 60 : w - Math.max(60, w * .05) - 60, narrow && true);
    const r = C.chooseMode(g);
    if (r.mode === 'side' && (w - r.right) > g.center.left) noOverlap = false;
    if (r.mode === 'below') { const rowTop = g.vh - r.bottom - C.rowHeightFor(w - r.right - 10); if (rowTop < g.center.bottom) noOverlap = false; }
}
ok(noOverlap, 'no screen size from 300x400 to 1920x1300 puts the row over the centerpiece');

/* popup placement */
const pop = g => C.choosePopup(g).placement;
ok(pop(box(1440, 900, 675, 90)) === 'side', 'wide desktop: popup opens beside the centerpiece');
ok(pop(box(1280, 720, 540, 72)) === 'side', 'laptop: popup opens beside the centerpiece');
ok(pop(box(1024, 768, 576, 76.8)) === 'center', 'narrow side space: popup centered');
ok(pop(box(390, 844, 327.6, 126.6)) === 'center', 'phone: popup centered');
const pw = C.choosePopup(box(1440, 900, 675, 90));
ok(pw.width <= 400 && pw.left + pw.width + 18 <= 382.5 + 1, 'side popup stays clear of the centerpiece');

/* ---- welcome / birthday / anniversary from members ---- */
const NOW = new Date(2026, 10, 13);                       /* 13 Nov 2026 */
const mem = [
  {name:'New Today',   birthday:'1990-01-01', added:'2026-11-13'},
  {name:'New 6d',      birthday:'1990-01-01', added:'2026-11-07'},
  {name:'Old 7d',      birthday:'1990-01-01', added:'2026-11-06'},
  {name:'Future',      birthday:'1990-01-01', added:'2026-11-20'},
  {name:'One Year',    birthday:'1990-01-01', added:'2025-11-13'},
  {name:'Five Years',  birthday:'1990-01-01', added:'2021-11-13'},
  {name:'Ten Years',   birthday:'1990-01-01', added:'2016-11-13'},
  {name:'Not Today',   birthday:'11-14',      added:'2020-11-14'},
  {name:'Born Today',  birthday:'1985-11-13', added:'2020-03-03'},
  {name:'No Dates'}, {name:'Bad', birthday:'x', added:'13/11/2020'}, null, {birthday:'11-13', added:'2020-11-13'}
];
const cel = C.celebrationsFromMembers(mem, NOW);
ok(cel.welcome.map(e => e.name).join() === 'New Today,New 6d', 'welcome: added today or in the previous 6 days (7 days), not 7+ days ago, not future');
ok(cel.birthday.join() === 'Born Today', 'birthday: month/day is today');
ok(cel.anniversary.map(e => e.name + ':' + e.years).join() === 'One Year:1,Five Years:5,Ten Years:10', 'anniversary: add-date month/day is today, years counted, joined-today is not an anniversary');
ok(C.celebrationsFromMembers('nope', NOW).welcome.length === 0, 'celebrationsFromMembers survives a non-list');
ok(C.celebrationsFromMembers([{name:'L', added:'2020-02-29'}], new Date(2027, 1, 28)).anniversary[0].years === 7, '29 Feb add date is an anniversary on 28 Feb in a non-leap year');
ok(C.celebrationsFromMembers([{name:'Y', added:'2025-12-31'}], new Date(2026, 0, 2)).welcome.length === 1, 'welcome window crosses a year end');

/* entries */
ok(JSON.stringify(C.cleanEntries([{name:' Ann ', years:3}, {name:'ann', years:4}, {name:'Bo', years:0}, {name:'Cy'}, 'Di', {name:'Ed', years:'5'}], 'anniversary')) === JSON.stringify([{name:'Ann', years:3}, {name:'Bo'}, {name:'Cy'}, {name:'Di'}, {name:'Ed', years:5}]), 'anniversary years are optional (kept only when >= 1 whole year); duplicates dropped');
ok(JSON.stringify(C.cleanEntries(['Ann', {name:'Bo'}, ''], 'welcome')) === JSON.stringify([{name:'Ann'}, {name:'Bo'}]), 'welcome entries accept names or {name}');

/* anniversary wording */
ok(C.milestoneText(1) === null && C.milestoneText(4) === null && C.milestoneText(7) === null, 'non-milestone years have no special text');
ok(C.milestoneText(5) === 'Half a decade!' && C.milestoneText(10) === 'A whole decade!', '5 and 10 years have special text');
ok(C.milestoneText(15) === '15 years strong!' && C.milestoneText(30) === '30 years strong!', 'other multiples of 5 get the generic milestone text');
ok(C.yearsLabel(1) === '1 year' && C.yearsLabel(3) === '3 years', 'years label is singular/plural');
ok(C.entryTitle('anniversary', {years:10}) === '10-YEAR ANNIVERSARY' && C.entryTitle('anniversary', {years:3}) === 'HAPPY ANNIVERSARY', 'milestones change the title');
ok(C.entryTitle('birthday', {}) === 'HAPPY BIRTHDAY' && C.entryTitle('welcome', {}) === 'WELCOME', 'titles for birthday and welcome');
const beats = C.makeBeats('anniversary', [{name:'Ann', years:3}, {name:'Bo', years:10}]);
ok(beats.length === 3 && beats[0].main === 'Ann' && beats[0].extra === '', 'regular anniversary: one beat, name only (no years)');
ok(C.makeBeats('anniversary', [{name:'Cy'}]).length === 1, 'an anniversary with no years is just a name');
ok(beats[1].main === 'Bo' && beats[1].extra === '' && beats[2].main === '\u2605 A whole decade!' && beats[2].entry.name === 'Bo', 'milestone: two beats, the name then its special text');
ok(C.makeBeats('birthday', [{name:'A'}, {name:'B'}]).length === 2 && C.makeBeats('welcome', [{name:'A'}])[0].extra === '', 'birthday / welcome: one beat per name, no extra');
ok(C.plan(C.makeBeats('anniversary', [{name:'Bo', years:10}]).length).total === 10000, 'a lone milestone (2 beats) still lasts at least 10 s');

/* demo dates (relative to today) */
const dm = C.resolveDemoMembers([{name:'a', birthday:'today', added:'today-2d'}, {name:'b', added:'today-5y'}, {name:'c', added:'2020-01-01'}], NOW);
ok(dm[0].birthday === '1990-11-13' && dm[0].added === '2026-11-11' && dm[1].added === '2021-11-13' && dm[2].added === '2020-01-01', 'demo date tokens resolve relative to today');
ok(C.ORDER.join() === 'welcome,birthday,anniversary' && C.GAP_MS === 3000, 'order is welcome > birthday > anniversary with a 3 s gap');


/* the live file: Trinidad's day, and only today's file is accepted */
ok(C.trinidadToday(new Date('2026-11-14T04:05:00Z')) === '2026-11-14' && C.trinidadToday(new Date('2026-11-14T03:59:00Z')) === '2026-11-13', "Trinidad's date is the UTC clock minus four hours");
ok(C.trinidadToday(new Date('2027-01-01T03:00:00Z')) === '2026-12-31', "Trinidad's date rolls back across a year end");
const good = {v:1, date:'2026-11-14', welcome:[{name:'Ann'}], birthday:['Joy'], anniversary:[{name:'Bo'}, {name:'Cy', years:5}]};
const acc = C.acceptTodayFile(good, '2026-11-14');
ok(acc && acc.birthday[0] === 'Joy' && acc.welcome.length === 1 && acc.anniversary.length === 2, "today's file is accepted");
ok(C.acceptTodayFile(good, '2026-11-15') === null && C.acceptTodayFile(good, '2026-11-13') === null, "yesterday's or tomorrow's file is ignored");
ok(C.acceptTodayFile(null, 'x') === null && C.acceptTodayFile([], 'x') === null && C.acceptTodayFile('oops', 'x') === null && C.acceptTodayFile({}, '2026-11-14') === null, 'junk is ignored');
const sparse = C.acceptTodayFile({date:'2026-11-14', birthday:['Joy']}, '2026-11-14');
ok(sparse && sparse.welcome.length === 0 && sparse.anniversary.length === 0, 'missing lists count as empty');
ok(C.cleanEntries(acc.anniversary, 'anniversary').map(e => e.name + ':' + (e.years || '')).join() === 'Bo:,Cy:5', 'the file\'s anniversaries (with and without years) go through the app unchanged');

/* nothing happens without a front page */
ok(w.BirthdayParty.setCelebrants(['Ann']) === false && !w.BirthdayParty.isRunning(), 'no page / no names: nothing starts');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
