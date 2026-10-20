/*
 * Address-bar sync tests.   node browserAddress.test.mjs
 * Runs js/browserAddress.js against a small stand-in for the browser.
 */
import fs from "node:fs";
import vm from "node:vm";

const src = fs.readFileSync(new URL("./js/browserAddress.js", import.meta.url), "utf8");
let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!ok) failures++; };

function make({ url = "https://x.test/", embedded = false, active = "front", shareClass = false } = {}) {
  const loc = new URL(url);
  const calls = { replace: [], push: 0 };
  const listeners = {};
  const docListeners = {};
  const timers = [];
  const win = {
    location: { get href() { return loc.href; }, get pathname() { return loc.pathname; }, get search() { return loc.search; }, get hash() { return loc.hash; } },
    history: { state: { keep: 1 }, replaceState(st, t, u) { calls.replace.push(u); calls.states = (calls.states || []).concat([st]); const nu = new URL(u, loc.href); loc.pathname = nu.pathname; loc.search = nu.search; loc.hash = nu.hash; }, pushState() { calls.push++; } },
    addEventListener(n, f) { (listeners[n] = listeners[n] || []).push(f); },
    setInterval(f) { timers.push(f); return timers.length; },
    clearInterval() {},
    URL, URLSearchParams
  };
  win.self = win; win.top = embedded ? {} : win;
  const doc = {
    hidden: false, readyState: "complete",
    documentElement: { dataset: { activeApp: active } },
    body: { classList: { contains: c => shareClass && c === "sky-share-mode" } },
    addEventListener(n, f) { (docListeners[n] = docListeners[n] || []).push(f); }
  };
  const ctx = { window: win, document: doc, URL, URLSearchParams, console };
  Object.assign(win, { document: doc });
  vm.createContext(ctx);
  // make bare globals (Reader, VideoViewer ...) resolve through window
  vm.runInContext("var __g = this;", ctx);
  const api = {
    calls, loc, doc, win, ctx, timers,
    set(name, value) { win[name] = value; ctx[name] = value; },
    run() { vm.runInContext(src, ctx); },
    tick() { timers.forEach(f => f()); },
    fire(n) { (listeners[n] || []).forEach(f => f()); }
  };
  return api;
}

// section only
{
  const t = make({ active: "video" });
  t.set("VideoViewer", { getCurrentVideo: () => null });
  t.run();
  check("section with nothing open -> ?view=video", t.loc.search === "?view=video", t.loc.search);
  check("uses replaceState, never pushState", t.calls.push === 0 && t.calls.replace.length === 1);
  check("history.state passed through unchanged", t.calls.states && t.calls.states.every(x => x && x.keep === 1));
}

// open item in each section
{
  const t = make({ active: "video" });
  let cur = { id: "vid-1" };
  t.set("VideoViewer", { getCurrentVideo: () => cur });
  t.run();
  check("video item -> view=video&item=video/vid-1", t.loc.search === "?view=video&item=video%2Fvid-1", t.loc.search);
  cur = null; t.tick();
  check("closing the item drops &item", t.loc.search === "?view=video", t.loc.search);
  const before = t.calls.replace.length; t.tick(); t.tick();
  check("no write when nothing changed", t.calls.replace.length === before);
}
{
  const t = make({ active: "reader" });
  t.set("Reader", { isOpen: () => true, book: () => ({ id: "book-9" }) });
  t.run();
  check("reader item", t.loc.search === "?view=reader&item=reader%2Fbook-9", t.loc.search);
}
{
  const t = make({ active: "slideshow" });
  t.set("SlideshowViewer", { getCurrent: () => ({ id: "s1" }) });
  t.run();
  check("slideshow item", t.loc.search === "?view=slideshow&item=slideshow%2Fs1", t.loc.search);
}
{
  const t = make({ active: "front" });
  t.set("FrontMediaRenderer", { getCurrent: () => ({ id: "v7", section: "video", thumbnail: "x" }) });
  t.run();
  check("front page uses the item shown there, with that item's own section", t.loc.search === "?view=front&item=video%2Fv7", t.loc.search);
}
{
  const t = make({ active: "front" });
  t.set("FrontMediaRenderer", { getCurrent: () => null });
  t.run();
  check("front page with no item -> ?view=front", t.loc.search === "?view=front", t.loc.search);
}

// switching sections
{
  const t = make({ active: "video" });
  t.set("VideoViewer", { getCurrentVideo: () => ({ id: "a" }) });
  t.set("Reader", { isOpen: () => false, book: () => null });
  t.run();
  t.doc.documentElement.dataset.activeApp = "reader"; t.fire("app:switched");
  check("app:switched updates immediately", t.loc.search === "?view=reader", t.loc.search);
}

// other params and hash kept
{
  const t = make({ url: "https://x.test/?pagestack=1#top", active: "reader" });
  t.set("Reader", { isOpen: () => false });
  t.run();
  check("unrelated query params and hash are kept", t.loc.search === "?pagestack=1&view=reader" && t.loc.hash === "#top", t.loc.search + t.loc.hash);
}

// places it must stay out of
for (const [name, opts] of [
  ["inside an iframe (Glide)", { embedded: true }],
  ["share link path /s/...", { url: "https://x.test/s/video/abc" }],
  ["legacy ?contractz= link", { url: "https://x.test/?contractz=zzz" }],
  ["legacy ?k= link", { url: "https://x.test/?k=ABC" }],
  ["share mode body class", { shareClass: true }],
  ["not the base path", { url: "https://x.test/index.html" }],
  ["app not started yet (no active section)", { active: "" }]
]) {
  const t = make(opts); t.set("Reader", { isOpen: () => false }); t.run(); t.tick();
  check("untouched: " + name, t.calls.replace.length === 0 && (!opts.embedded || t.timers.length === 0));
}

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);
