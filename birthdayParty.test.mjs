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

/* nothing happens without a front page */
ok(w.BirthdayParty.setCelebrants(['Ann']) === false && !w.BirthdayParty.isRunning(), 'no page / no names: nothing starts');

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
