/* Client-side analytics test:  node analytics-client.test.mjs   (run in the app folder; needs js/analytics.js, index.html, js/*.js)
   Runs js/analytics.js against a small fake browser and checks what gets counted. */
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";

const SRC = fs.readFileSync("js/analytics.js", "utf8");
let failures = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!cond) failures++; };

/* ---- a fake page: elements know their id, classes and parent; closest() understands "#id", ".class" and "a, b" ---- */
function el(id, classes = [], parent = null) {
  const e = { id, classList: { contains: c => classes.includes(c) }, parent, dataset: {} };
  const matches = sel => sel.split(",").map(x => x.trim()).some(t => t[0] === "#" ? e.id === t.slice(1) : t[0] === "." ? classes.includes(t.slice(1)) : false);
  e.closest = sel => { for (let n = e; n; n = n.parent) if (n.__m(sel)) return n; return null; };
  e.__m = matches;
  return e;
}

function boot() {
  const store = {}, L = {}, clock = { t: Date.parse("2026-10-30T10:00:00Z") }, sent = [];
  class FakeDate extends Date { constructor(...a) { a.length ? super(...a) : super(clock.t); } static now() { return clock.t; } }
  const win = {
    localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
    location: { search: "" }, addEventListener: (t, f) => { (L[t] = L[t] || []).push(f); },
    setTimeout: () => 1, setInterval: () => 1, matchMedia: () => ({ matches: false }), crypto: globalThis.crypto
  };
  win.self = win; win.top = win; win.window = win;
  const doc = { visibilityState: "visible", addEventListener: (t, f) => { (L["doc:" + t] = L["doc:" + t] || []).push(f); } };
  const nav = { webdriver: false, sendBeacon: (u, b) => { sent.push(b); return true; } };
  const ctx = { window: win, document: doc, navigator: nav, console, Date: FakeDate, JSON, Object, Array, String, Number, Math, URLSearchParams, Uint8Array, Blob, crypto: globalThis.crypto,
    fetch: () => Promise.resolve({ ok: true, json: () => Promise.resolve({ on: true }) }) };
  /* the app's public objects, as they are on window in the real app */
  win.VideoViewer = { openVideo: async () => {} };
  win.SlideshowViewer = { open: async () => {} };
  /* like the real app: SRNavigation.openMagazine() ends up in Reader.open() */
  win.Reader = { open: async () => {} };
  win.SRNavigation = { openMagazine: async function (b, p) { return win.Reader.open(b, p); } };
  win.ShareManager = { share() {}, isShareMode: () => false };
  ctx.ShareManager = win.ShareManager;
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const A = win.MMAnalytics;
  const pending = () => Object.fromEntries(Object.entries(A.pending()).map(([k, v]) => [k.split("\u0001").join("|"), v]));
  const fire = (type, ev) => (L[type] || []).forEach(f => f(ev));
  const tap = (target, extra = {}) => fire("doc:click", { target, ...extra });   /* the app listens on document */
  const switchTo = id => fire("app:switched", { detail: { id } });
  return { win, A, pending, tap, switchTo, clock };
}

/* ---- 1. the three item-open paths, and the one that used to be missed ---- */
{
  const { win, pending } = boot();
  await win.VideoViewer.openVideo({ id: "v1" });
  await win.SlideshowViewer.open({ id: "s1" });
  await win.SRNavigation.openMagazine({ id: "b1" }, 1);      /* library tap: reaches openMagazine AND Reader.open */
  await win.Reader.open({ id: "b2" });                       /* Share Mode: Reader.open only */
  const p = pending();
  check("video open counted", p["item_open|video|v1|"] === 1);
  check("slideshow open counted", p["item_open|slideshow|s1|"] === 1);
  check("book opened from the library is counted ONCE (two wrappers, one count)", p["item_open|reader|b1|"] === 1, JSON.stringify(p));
  check("book opened by Share Mode (Reader.open only) is now counted", p["item_open|reader|b2|"] === 1);
}

/* ---- 2. feature taps ---- */
{
  const { tap, switchTo, pending, clock } = boot();
  switchTo("reader");
  const next = el("nextButton");
  tap(next);
  check("tap on #nextButton -> feature_use reader_next in section reader", pending()["feature_use|reader||reader_next"] === 1, JSON.stringify(pending()));

  const favInner = el("", [], el("", ["favoriteButton"]));      /* a tap on the icon INSIDE the button */
  tap(favInner);
  check("tap on a child of .favoriteButton counts the button", pending()["feature_use|reader||book_favourite"] === 1);

  switchTo("video");
  tap(el("videoSearchBox"));
  check("section follows the app: video_search counted under video", pending()["feature_use|video||video_search"] === 1);

  const row = el("", ["sr-bookmark-row"]);
  tap(el("", ["sr-bookmark-delete"], row));
  const p = pending();
  check("specific line wins: delete inside a bookmark row counts bookmark_delete only", p["feature_use|video||bookmark_delete"] === 1 && !p["feature_use|video||bookmark_open"]);

  tap(el("somethingElse"));
  check("an unlisted element counts nothing", Object.keys(pending()).filter(k => k.startsWith("feature_use")).length === 4);

  tap(el("nextButton"), { isTrusted: false });
  check("a click the app's own code fires (isTrusted false) is not counted", pending()["feature_use|video||reader_next"] === undefined && pending()["feature_use|reader||reader_next"] === 1);

  clock.t += 1000;   /* a new moment, clear of the first tap */
  tap(el("nextButton")); tap(el("nextButton"));
  check("two taps at the same instant count once", pending()["feature_use|video||reader_next"] === 1);
  clock.t += 1000; tap(el("nextButton"));
  check("a later tap counts again", pending()["feature_use|video||reader_next"] === 2);
}

/* ---- 3. nothing that worked before changed ---- */
{
  const { tap, win, pending, switchTo } = boot();
  switchTo("slideshow");
  win.ShareManager.share("videos", { id: "v9" });
  const tile = el("", ["itemShareTile"]); tile.dataset.platform = "whatsapp";
  tap(tile);
  tap(el("frontShareButton"));
  const p = pending();
  check("share tap still counted", p["share_tap|video|v9|"] === 1);
  check("share tile still counted with its platform", p["share_tile|video|v9|whatsapp"] === 1);
  check("front page share button still counted", p["share_tap|front||"] === 1);
  check("section_view still counted", p["section_view|slideshow||"] === 1);
  check("session still counted", p["session|||"] === 1);
}

/* ---- 4. the FEATURES list cannot go stale unnoticed ---- */
{
  const block = SRC.slice(SRC.indexOf("const FEATURES = ["), SRC.indexOf("];", SRC.indexOf("const FEATURES = [")));
  const rows = [...block.matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)].map(m => ({ name: m[1], sel: m[2] }));
  check("FEATURES list parsed", rows.length > 30, rows.length + " lines");
  check("every feature name is 1-24 chars of a-z 0-9 _ -", rows.every(r => /^[a-z0-9_-]{1,24}$/.test(r.name)), rows.filter(r => !/^[a-z0-9_-]{1,24}$/.test(r.name)).map(r => r.name).join(","));
  check("feature names are unique", new Set(rows.map(r => r.name)).size === rows.length);
  const toks = rows.flatMap(r => r.sel.split(",").map(x => x.trim()));
  check("no control is listed twice (the second line could never fire)", new Set(toks).size === toks.length, toks.filter((x, i) => toks.indexOf(x) !== i).join(" "));
  const files = ["index.html", ...fs.readdirSync("js").filter(f => f.endsWith(".js") && f !== "analytics.js").map(f => path.join("js", f))];
  const text = files.map(f => fs.readFileSync(f, "utf8")).join("\n");
  const missing = [];
  rows.forEach(r => r.sel.split(",").map(x => x.trim()).forEach(tok => { const n = tok.slice(1); if (!new RegExp("[\"'#. ]" + n.replace(/[-]/g, "\\-") + "\\b").test(text)) missing.push(r.name + ":" + tok); }));
  check("every selector in FEATURES exists somewhere in the app's own files", missing.length === 0, missing.join(" "));
}

console.log(failures ? "\n" + failures + " FAILED" : "\nall passed");
process.exit(failures ? 1 : 0);
