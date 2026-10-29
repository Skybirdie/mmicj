/*
 * Share Mode switch tests (Worker side).
 *   cp worker.js worker.mjs && node worker-share-switch.test.mjs
 */
import worker from "./worker.mjs";

/* Minimal HTMLRewriter: supports the head element's prepend() and append(). */
globalThis.HTMLRewriter = class {
  on(sel, h) { this.h = h; return this; }
  transform(res) {
    const h = this.h;
    const body = res.text().then(t => t.replace(/<head[^>]*>/i, m => {
      let pre = "", post = "";
      h.element({ prepend(x) { pre += x; }, append(x) { post += x; } });
      return m + pre + post;
    }));
    return { body: new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await body)); c.close(); } }) };
  }
};

/* No network: R2.body is the R2 published catalog. */
const R2 = { body: { content: [] }, calls: 0 };
globalThis.fetch = async (url) => {
  if (String(url) === "https://media.mmicj.com/catalog/published.json") { R2.calls++; return new Response(JSON.stringify(R2.body)); }
  return new Response("not found", { status: 404 });
};

const INDEX = "<!DOCTYPE html><html><head><title>MMicj</title></head><body>app</body></html>";
const BASE = "https://example.workers.dev";
const ctx = { waitUntil() {} };
const store = new Map(); const seen = [];
function makeEnv(extra = {}) {
  return {
    MEDIA_KV: {
      async getWithMetadata(k) { seen.push(k); const v = store.get(k); return v ? { value: v, metadata: null } : { value: null, metadata: null }; },
      async get(k) { seen.push(k); return store.get(k) ?? null; }
    },
    ASSETS: { fetch: async req => {
      const p = new URL(req.url).pathname;
      return (p === "/index.html" || p === "/") ? new Response(INDEX, { headers: { "content-type": "text/html" } }) : new Response("asset:" + p);
    } },
    ...extra
  };
}
let n = 0;
const fresh = async () => (await import("./worker.mjs?s=" + (++n))).default;
const get = (w, env, path, headers = { accept: "text/html" }) => w.fetch(new Request(BASE + path, { headers }), env, ctx);

let failures = 0;
const check = (name, cond, extra = "") => { console.log((cond ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!cond) failures++; };

const r2item = (id, type, date) => ({ id, type, title: "R2 title of " + id, subtitle: "", thumbnail: "https://media.mmicj.com/thumbs/" + id + ".jpg", media: "https://media.mmicj.com/media/" + id, audio: "", author: "", category: "Meditation", date });

/* ---- the base page tells the browser which way the switch is set ---- */
{
  const w = await fresh();
  let html = await (await get(w, makeEnv(), "/")).text();
  check("default: base page says Share Mode is ON", html.includes("window.__SKY_SHARE_MODE_ENABLED = true;"));
  check("the flag is the first thing in <head>", /<head[^>]*><script>window\.__SKY_SHARE_MODE_ENABLED/.test(html));
  html = await (await get(w, makeEnv({ SHARE_MODE_ENABLED: "false" }), "/")).text();
  check("variable false: base page says Share Mode is OFF", html.includes("window.__SKY_SHARE_MODE_ENABLED = false;"));
  html = await (await get(w, makeEnv(), "/?view=video&item=video%2Fx")).text();
  check("state links carry the flag too", html.includes("window.__SKY_SHARE_MODE_ENABLED = true;"));
}

/* ---- variable spellings ---- */
for (const [v, expect] of [["false", false], ["FALSE", false], ["0", false], ["off", false], ["no", false], [" false ", false],
                           ["true", true], ["1", true], ["on", true], ["", true], ["garbage", true]]) {
  const w = await fresh();
  const html = await (await get(w, makeEnv({ SHARE_MODE_ENABLED: v }), "/")).text();
  check("SHARE_MODE_ENABLED=" + JSON.stringify(v) + " -> " + expect, html.includes("__SKY_SHARE_MODE_ENABLED = " + expect + ";"));
}

/* ---- switch ON: /s/ links ---- */
{
  const w = await fresh();
  // 1. item in the KV catalog -> Share Viewer page with the one-item contract
  let env = makeEnv();
  seen.length = 0;
  await get(w, env, "/s/video/kv-vid");                       // discover the catalog key the Worker reads
  const catalogKey = seen.find(k => k.startsWith("catalog:v1:"));
  store.set(catalogKey, JSON.stringify({ item: r2item("kv-vid", "video", "202601010900") }));
  // (the Worker remembers KV misses per isolate, so ask a fresh one)
  let res = await get(await fresh(), env, "/s/video/kv-vid");
  let html = await res.text();
  check("ON + item in KV: 200 Share Viewer page", res.status === 200 && html.includes("window.__SKY_SHARE_MODE = true;"));
  check("ON + item in KV: one-item contract is injected", html.includes("window.SkyMediaContract = {"));
  check("ON + item in KV: page carries the flag", html.includes("window.__SKY_SHARE_MODE_ENABLED = true;"));
  store.clear();

  // 2. item only in R2 -> Share Viewer page, target only, with its own preview tags
  R2.body = { content: [ r2item("r2-vid", "video", "202601010900") ] };
  const w2 = await fresh(); env = makeEnv();
  res = await get(w2, env, "/s/video/r2-vid");
  html = await res.text();
  check("ON + item only in R2: 200 Share Viewer page", res.status === 200 && html.includes("window.__SKY_SHARE_MODE = true;"));
  check("ON + item only in R2: carries the share target", html.includes('window.__SKY_SHARE_TARGET = {"section":"video","id":"r2-vid"}'));
  check("ON + item only in R2: NO one-item contract (app loads its own data)", !html.includes("SkyMediaContract"));
  check("ON + item only in R2: preview tags use the item's title", html.includes("R2 title of r2-vid"));
  check("ON + item only in R2: page carries the flag", html.includes("window.__SKY_SHARE_MODE_ENABLED = true;"));

  // 3. unknown / unreleased -> friendly 404 (never a redirect: no bouncing)
  R2.body = { content: [ r2item("future-vid", "video", "209912312359") ] };
  const w3 = await fresh(); env = makeEnv();
  for (const id of ["ghost", "future-vid"]) {
    res = await get(w3, env, "/s/video/" + id);
    check("ON + " + id + " (unknown / not released): 404 'unavailable', not a redirect", res.status === 404 && !res.headers.get("location"));
  }
}

/* ---- switch OFF: /s/ links go to the main app, no KV reads ---- */
{
  const w = await fresh();
  const env = makeEnv({ SHARE_MODE_ENABLED: "false" });
  seen.length = 0; R2.calls = 0;
  let res = await get(w, env, "/s/video/r2-vid");
  check("OFF: /s/video/<id> -> 302 to the main app link", res.status === 302 && res.headers.get("location") === BASE + "/?view=video&item=video%2Fr2-vid", "location=" + res.headers.get("location"));
  res = await get(w, env, "/s/book/My%20Book");
  check("OFF: ids with spaces survive the redirect", res.headers.get("location") === BASE + "/?view=reader&item=reader%2FMy+Book", "location=" + res.headers.get("location"));
  check("OFF: no KV read and no R2 read for the redirect", seen.length === 0 && R2.calls === 0, "kv=" + seen.length + " r2=" + R2.calls);
  // an item that IS in KV still redirects while the switch is off
  store.set("catalog:v1:anything", "{}");
  res = await get(w, env, "/s/video/kv-vid");
  check("OFF: even an item with a KV record redirects", res.status === 302);
}

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);
