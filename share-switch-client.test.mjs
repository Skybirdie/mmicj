/*
 * Share Mode switch tests (browser side).   node share-switch-client.test.mjs
 *   - ShareManager.buildUrl follows window.__SKY_SHARE_MODE_ENABLED
 *   - the arrival script at the top of index.html hands item links to the
 *     Share Viewer only when it should
 */
import fs from "node:fs";
import vm from "node:vm";

let failures = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!cond) failures++; };

/* ---------- ShareManager.buildUrl ---------- */
const smSrc = fs.readFileSync(new URL("./js/shareManager.js", import.meta.url), "utf8");
async function buildUrl(flag, section, id) {
  const win = { location: { origin: "https://mmicj.com", search: "", pathname: "/", href: "https://mmicj.com/" },
    addEventListener() {}, document: { addEventListener() {}, querySelector() { return null; } }, navigator: {} };
  win.window = win;
  if (flag !== undefined) win.__SKY_SHARE_MODE_ENABLED = flag;
  const ctx = vm.createContext({ window: win, document: win.document, navigator: win.navigator, console, URL, URLSearchParams,
    encodeURIComponent, setTimeout, clearTimeout, location: win.location });
  vm.runInContext(smSrc, ctx);
  return win.ShareManager.buildUrl(section, id, {});
}
check("ON  -> /s/ link (video)", await buildUrl(true, "video", "vid-1") === "https://mmicj.com/s/video/vid-1");
check("ON  -> /s/ link (book becomes reader)", await buildUrl(true, "book", "b 7") === "https://mmicj.com/s/reader/b%207");
check("absent flag defaults to ON (the app's long-standing behaviour)", await buildUrl(undefined, "slideshow", "s1") === "https://mmicj.com/s/slideshow/s1");
check("OFF -> main-app link (video)", await buildUrl(false, "video", "vid-1") === "https://mmicj.com/?view=video&item=video%2Fvid-1");
check("OFF -> main-app link (book -> reader, id encoded)", await buildUrl(false, "book", "b 7") === "https://mmicj.com/?view=reader&item=reader%2Fb+7");

/* ---------- arrival script (extracted from index.html) ---------- */
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const m = /<script>\n\/\*\n \* Share Mode switch, arrival side.*?<\/script>/s.exec(html);
check("arrival script is present in index.html", !!m);
const code = m ? m[0].replace(/^<script>|<\/script>$/g, "") : "";
check("it is the first script in <head>", html.indexOf("<script") === html.indexOf(m[0]));

function arrive({ flag = true, path = "/", search = "", type = "navigate", framed = false, noPerf = false }) {
  let replaced = null;
  const win = {};
  win.window = win; win.self = win; win.top = framed ? {} : win;
  if (flag !== "absent") win.__SKY_SHARE_MODE_ENABLED = flag;
  win.location = { pathname: path, search, replace(u) { replaced = u; } };
  win.performance = noPerf ? undefined : { getEntriesByType: () => [{ type }] };
  const ctx = vm.createContext({ window: win, location: win.location, performance: win.performance, URLSearchParams, encodeURIComponent, String });
  vm.runInContext(code, ctx);
  return replaced;
}
const Q = "?view=video&item=video%2Fvid-1";
check("ON + fresh arrival with an item -> /s/video/vid-1", arrive({ search: Q }) === "/s/video/vid-1");
check("book/books/reader all map to reader", ["book", "books", "reader"].every(k => arrive({ search: "?item=" + k + "%2Fb1" }) === "/s/reader/b1"));
check("id with spaces and & is encoded", arrive({ search: "?view=video&item=video%2Fa+b%26c" }) === "/s/video/a%20b%26c");
check("id containing a slash keeps it (encoded)", arrive({ search: "?item=video%2Fa%2Fb" }) === "/s/video/a%2Fb");
check("reload -> stays in the main app", arrive({ search: Q, type: "reload" }) === null);
check("back/forward -> stays in the main app", arrive({ search: Q, type: "back_forward" }) === null);
check("OFF -> never redirects", arrive({ search: Q, flag: false }) === null);
check("flag missing -> never redirects (no bouncing if the page lost it)", arrive({ search: Q, flag: "absent" }) === null);
check("inside another page (Glide embed) -> no redirect", arrive({ search: Q, framed: true }) === null);
check("no item (plain section link) -> no redirect", arrive({ search: "?view=video" }) === null);
check("no query at all -> no redirect", arrive({ search: "" }) === null);
check("unknown section -> no redirect", arrive({ search: "?item=podcast%2Fp1" }) === null);
check("item without an id -> no redirect", arrive({ search: "?item=video%2F" }) === null && arrive({ search: "?item=video" }) === null);
check("overlong id -> no redirect", arrive({ search: "?item=video%2F" + "x".repeat(513) }) === null);
check("not at the root path (/s/ pages) -> no redirect", arrive({ path: "/s/video/vid-1", search: Q }) === null);
check("Glide/contract links -> no redirect", ["&k=ABC", "&contract=1", "&contractz=1"].every(x => arrive({ search: Q + x }) === null));
check("no Navigation Timing support -> no redirect", arrive({ search: Q, noPerf: true }) === null);

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);
