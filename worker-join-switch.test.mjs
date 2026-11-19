/*
 * Join / Testify switch tests (Worker side).
 *   cp worker.js worker.mjs && node worker-join-switch.test.mjs
 */
import worker from "./worker.mjs";

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
globalThis.fetch = async () => new Response("not found", { status: 404 });

const INDEX = "<!DOCTYPE html><html><head><title>MMicj</title></head><body>app</body></html>";
const BASE = "https://example.workers.dev";
const ctx = { waitUntil() {} };
function makeEnv(extra = {}) {
  return {
    MEDIA_KV: { async getWithMetadata() { return { value: null, metadata: null }; }, async get() { return null; } },
    ASSETS: { fetch: async req => {
      const p = new URL(req.url).pathname;
      return (p === "/index.html" || p === "/") ? new Response(INDEX, { headers: { "content-type": "text/html" } }) : new Response("asset:" + p);
    } },
    ...extra
  };
}
let n = 0;
const fresh = async () => (await import("./worker.mjs?j=" + (++n))).default;
const get = (w, env, path) => w.fetch(new Request(BASE + path, { headers: { accept: "text/html" } }), env, ctx);
let failures = 0;
const check = (name, cond) => { console.log((cond ? "PASS" : "FAIL") + "  " + name); if (!cond) failures++; };

{
  const w = await fresh();
  let html = await (await get(w, makeEnv(), "/")).text();
  check("variables not set: the page says Join is ON", html.includes("window.__MMICJ_JOIN_ENABLED = true;"));
  check("variables not set: the page says Testify is ON", html.includes("window.__MMICJ_TESTIFY_ENABLED = true;"));
  check("the Share Mode flag is still the first thing in <head>", /<head[^>]*><script>window\.__SKY_SHARE_MODE_ENABLED/.test(html));
  html = await (await get(w, makeEnv({ JOIN_BUTTON_ENABLED: "false" }), "/")).text();
  check("JOIN_BUTTON_ENABLED false: Join is OFF", html.includes("window.__MMICJ_JOIN_ENABLED = false;"));
  check("JOIN_BUTTON_ENABLED false: Testify stays ON", html.includes("window.__MMICJ_TESTIFY_ENABLED = true;"));
  html = await (await get(w, makeEnv({ TESTIFY_BUTTON_ENABLED: "false" }), "/")).text();
  check("TESTIFY_BUTTON_ENABLED false: Testify is OFF and Join stays ON", html.includes("window.__MMICJ_TESTIFY_ENABLED = false;") && html.includes("window.__MMICJ_JOIN_ENABLED = true;"));
  html = await (await get(w, makeEnv({ JOIN_BUTTON_ENABLED: "off", TESTIFY_BUTTON_ENABLED: "off" }), "/")).text();
  check("both variables off: both OFF", html.includes("window.__MMICJ_JOIN_ENABLED = false;") && html.includes("window.__MMICJ_TESTIFY_ENABLED = false;"));
  html = await (await get(w, makeEnv({ JOIN_BUTTON_ENABLED: "false" }), "/")).text();
  check("the OFF page still has the Share Mode flag", html.includes("window.__SKY_SHARE_MODE_ENABLED = "));
  html = await (await get(w, makeEnv({ JOIN_BUTTON_ENABLED: "false" }), "/?view=video&item=video%2Fx")).text();
  check("state links carry the switches too", html.includes("window.__MMICJ_JOIN_ENABLED = false;") && html.includes("window.__MMICJ_TESTIFY_ENABLED = true;"));
}

for (const [v, expect] of [["false", false], ["FALSE", false], ["0", false], ["off", false], ["no", false], [" Off ", false],
                           ["true", true], ["1", true], ["on", true], ["", true], ["garbage", true], ["disabled", true]]) {
  const w = await fresh();
  const html = await (await get(w, makeEnv({ JOIN_BUTTON_ENABLED: v }), "/")).text();
  check("JOIN_BUTTON_ENABLED=" + JSON.stringify(v) + " -> " + (expect ? "ON" : "OFF"), html.includes("__MMICJ_JOIN_ENABLED = " + expect + ";"));
  const h2 = await (await get(w, makeEnv({ TESTIFY_BUTTON_ENABLED: v }), "/")).text();
  check("TESTIFY_BUTTON_ENABLED=" + JSON.stringify(v) + " -> " + (expect ? "ON" : "OFF"), h2.includes("__MMICJ_TESTIFY_ENABLED = " + expect + ";"));
}

console.log(failures ? "\n" + failures + " FAILED" : "\nall ok");
process.exit(failures ? 1 : 0);
