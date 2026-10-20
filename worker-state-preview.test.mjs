/*
 * State-link preview tests (browser address bar links).
 *   cp worker.js worker.mjs && node worker-state-preview.test.mjs
 */
import worker from "./worker.mjs";

globalThis.HTMLRewriter = class {
  on(sel, h) { this.h = h; return this; }
  transform(res) {
    const h = this.h;
    const body = res.text().then(t => t.replace(/<head[^>]*>/i, m => {
      let add = ""; h.element({ append(x) { add += x; } }); return m + add;
    }));
    return { body: new ReadableStream({ async start(c) { c.enqueue(new TextEncoder().encode(await body)); c.close(); } }) };
  }
};

const INDEX = "<!DOCTYPE html><html><head><title>MMicj</title></head><body>app</body></html>";
const BASE = "https://example.workers.dev";
const ctx = { waitUntil() {} };

function makeEnv(snapshot) {
  const store = new Map();
  if (snapshot) store.set("catalog:snapshot:v1", { value: JSON.stringify(snapshot), metadata: null });
  const ops = { gwm: 0, get: 0 };
  return {
    ops,
    MEDIA_KV: {
      async getWithMetadata(k) { ops.gwm++; const e = store.get(k); return e ? { value: e.value, metadata: e.metadata } : { value: null, metadata: null }; },
      async get(k) { ops.get++; const e = store.get(k); return e ? e.value : null; }
    },
    ASSETS: { fetch: async req => {
      const p = new URL(req.url).pathname;
      return (p === "/index.html" || p === "/")
        ? new Response(INDEX, { headers: { "content-type": "text/html", "etag": '"abc"' } })
        : new Response("asset:" + p);
    } }
  };
}

let n = 0;
async function fresh() { n++; return (await import("./worker.mjs?s=" + n)).default; }

const item = (id, type, cat, date, thumb = "https://img.test/" + id + ".jpg", title = "Title of " + id) =>
  ({ id, type, title, subtitle: "", thumbnail: thumb, media: "https://m.test/" + id, audio: "", author: "", category: cat, date });

const snapshot = { version: "1.0", content: [
  item("book-1", "book", "Book Club", "202601010900"),
  item("vid-1", "video", "Feed My Sheep", "202609020800"),
  item("slide-newest", "slideshow", "BYOB", "202609150700"),
  item("vid-nothumb", "video", "Meditation", "202609010000", ""),
  item("vid-relthumb", "video", "Meditation", "202609010100", "assets/x.png"),
  item("draft-vid", "video", "Sayings", "", "https://img.test/draft.jpg", "Draft video")
] };

let failures = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "PASS" : "FAIL") + "  " + name + (extra ? "  [" + extra + "]" : "")); if (!ok) failures++; };
const get = (w, env, path) => w.fetch(new Request(BASE + path), env, ctx);
const LOGO = BASE + "/assets/base-logo.jpg";

// ---- item state link ---------------------------------------------------
{
  const w = await fresh(); const env = makeEnv(snapshot);
  const r = await get(w, env, "/?view=video&item=video%2Fvid-1");
  const html = await r.text();
  check("state link -> 200, original page kept", r.status === 200 && html.includes("<title>MMicj</title>") && html.includes("app"));
  check("image is that item's own composed thumbnail (not the centerpiece)",
    html.includes("section=video&amp;id=vid-1&amp;base=1") && !html.includes("slide-newest"));
  check("og:title is the item's title", html.includes('og:title" content="Title of vid-1"'));
  check("og:url is the state link", html.includes('og:url" content="https://example.workers.dev/?view=video&amp;item=video%2Fvid-1"'));
  check("card dims 1200x630", html.includes('og:image:width" content="1200"') && html.includes('og:image:height" content="630"'));
  check("cache-control revalidates", r.headers.get("cache-control").includes("must-revalidate"));
}

// ---- front page showing another section's item -------------------------
{
  const w = await fresh(); const env = makeEnv(snapshot);
  const html = await (await get(w, env, "/?view=front&item=slideshow/slide-newest")).text();
  check("front view with a slideshow item uses that item", html.includes("section=slideshow&amp;id=slide-newest&amp;base=1")
    && html.includes("view=front&amp;item=slideshow%2Fslide-newest"));
}

// ---- fallbacks to base-logo.jpg ---------------------------------------
{
  const w = await fresh(); const env = makeEnv(snapshot);
  let html = await (await get(w, env, "/?view=reader")).text();
  check("section only -> base logo, base title, section in og:url",
    html.includes('og:image" content="' + LOGO + '"') && html.includes('og:title" content="Meditation Mornings in Christ Jesus"')
    && html.includes('og:url" content="https://example.workers.dev/?view=reader"') && html.includes('og:image:width" content="1500"'));

  html = await (await get(w, env, "/?view=video&item=video/vid-nothumb")).text();
  check("item without a thumbnail -> base logo (title stays the item's)",
    html.includes('og:image" content="' + LOGO + '"') && html.includes('og:title" content="Title of vid-nothumb"'));

  html = await (await get(w, env, "/?view=video&item=video/vid-relthumb")).text();
  check("item with a non-absolute thumbnail -> base logo", html.includes('og:image" content="' + LOGO + '"'));

  html = await (await get(w, env, "/?view=video&item=video/no-such-item")).text();
  check("unknown item -> base logo, view only, id not echoed",
    html.includes('og:image" content="' + LOGO + '"') && html.includes("/?view=video\"") && !html.includes("no-such-item"));

  html = await (await get(w, env, "/?view=reader&item=reader/vid-1")).text();
  check("id in the wrong section -> not matched", html.includes('og:image" content="' + LOGO + '"') && !html.includes("vid-1"));

  html = await (await get(w, env, "/?view=video&item=video/draft-vid")).text();
  check("undated/draft item the person has open still gets its own card", html.includes("section=video&amp;id=draft-vid&amp;base=1"));
}

// ---- hostile / odd input ----------------------------------------------
{
  const w = await fresh(); const env = makeEnv(snapshot);
  let html = await (await get(w, env, "/?view=video&item=" + encodeURIComponent('video/"><script>alert(1)</script>'))).text();
  check("hostile item value is not reflected", !html.includes("<script>alert") && !html.includes("alert(1)"));
  html = await (await get(w, env, "/?view=%3Cb%3E&item=zzz")).text();
  check("garbage view/item -> normal centerpiece card, nothing reflected", !html.includes("<b>") && html.includes("section=slideshow&amp;id=slide-newest&amp;base=1"));
}

// ---- unchanged behaviour ----------------------------------------------
{
  const w = await fresh(); const env = makeEnv(snapshot);
  const html = await (await get(w, env, "/")).text();
  check("bare base URL still shows the centerpiece card",
    html.includes("section=slideshow&amp;id=slide-newest&amp;base=1") && html.includes('og:url" content="https://example.workers.dev/"'));
  const t = await (await get(w, env, "/?contractz=abc&view=video")).text();
  check("contract link gets no preview tags", !t.includes("og:image"));
}

// ---- no extra KV cost ---------------------------------------------------
{
  const w = await fresh(); const env = makeEnv(snapshot);
  for (const p of ["/?view=video&item=video/vid-1", "/?view=front", "/?view=reader", "/?view=slideshow&item=slideshow/slide-newest", "/"]) await get(w, env, p);
  check("five requests share one snapshot read", env.ops.gwm === 1 && env.ops.get === 0, "snapshot reads=" + env.ops.gwm + " plain gets=" + env.ops.get);
}

// ---- no snapshot yet ----------------------------------------------------
{
  const w = await fresh(); const env = makeEnv(null);
  const r = await get(w, env, "/?view=video&item=video/vid-1");
  const html = await r.text();
  check("no snapshot -> 200 with base logo", r.status === 200 && html.includes('og:image" content="' + LOGO + '"'));
}

console.log(failures ? "\n" + failures + " FAILED" : "\nALL PASSED");
process.exit(failures ? 1 : 0);
