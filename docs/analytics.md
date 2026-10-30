# Admin-only usage counts (analytics) - app side

What it counts, how to switch it off, and what it costs on the Cloudflare free plan.

## What is counted

| Event | Meaning | Counted where |
|---|---|---|
| `session` | the app was opened | browser |
| `section_view` | a section was shown (front, reader, video, slideshow) | browser (the existing `app:switched` event) |
| `item_open` | a book, video or slideshow was opened | browser (`VideoViewer.openVideo`, `SlideshowViewer.open`, `SRNavigation.openMagazine`) |
| `share_tap` | a share button was pressed | browser (`ShareManager.share`, front-page share button) |
| `share_tile` | a tile was chosen in a share panel (WhatsApp, Copy link ...) | browser |
| `share_done` | the phone's own share sheet reported success | browser (`navigator.share`) |
| `share_open` | a share link was opened (people and, separately, link-preview robots) | **server** (worker.js, `/s/<section>/<id>`) |

Not collected: names, IP addresses, search text, titles, link text. Each browser keeps one random id so "visitors" can be counted. Do Not Track and Global Privacy Control switch it off for that visitor. Only the admin portal can read the numbers (it needs the `ADMIN_TOKEN`); the app has no screen that shows them.

Not counted: moving next/previous inside the Video viewer, page turns, time spent. The same item opened twice within 30 seconds counts once.

## How it works (so a request is never made per click)

Each click adds 1 to a counter in memory. The counters are saved in the browser and sent as ONE small summary:
when the page is hidden or closed, and at most every 5 minutes while the app stays open.
A device never sends more than 20 times a day. A failed send keeps the counters and tries again later.
The Worker turns each summary line into one Analytics Engine data point.

## THE OFF SWITCHES (any one is enough)

1. **Fastest, no redeploy:** Cloudflare dashboard -> Workers -> `mmicj` -> Settings -> Variables -> set `ANALYTICS_ENABLED` to `false` (or delete it). The Worker stops writing at once, and every app that reports pauses itself for 6 hours.
   It is also **off by default**: until you add `ANALYTICS_ENABLED = true`, deploying these files changes nothing.
2. `js/analytics.js` -> `const ENABLED = false;` then deploy. The file does nothing and wraps nothing.
3. Remove the `<script src="js/analytics.js...">` line from `index.html`.
4. Portal only: `config.js` -> `analytics: { enabled: false }` hides the Usage block and stops portal requests.

To keep **your own phone/computer** out of the numbers, open the app once with `?an=off` on the end of the address (`?an=on` counts it again).

## What it costs (Workers Free plan)

Free limits that matter (Cloudflare docs, checked 29 Oct 2026): Workers 100,000 requests per day for the whole account; Analytics Engine 100,000 data points and 10,000 read queries per day. Cloudflare says Analytics Engine billing is not active yet.

No KV is used, no R2, no Cloudflare Images.

**Assumptions** (I have no real traffic figures; change them in your head if your visits look different):
- a visit sends about **1.4** summaries (1 when it closes, plus 1 per 5 minutes if it stays open)
- a visit writes about **6** data points (1 visit + about 2 section views + 1-2 items + occasional share lines)
- today the app already costs about **2** Worker requests per visit (base page, catalog snapshot, share links)
- share-link opens add 1 data point each and **no** extra request

| Visits per day | Extra Worker requests | Data points | Worker requests, all-in (about 3.4 per visit) |
|---:|---:|---:|---:|
| 100 | +140 (0.1%) | 600 (1%) | 340 (0.3%) |
| 500 | +700 (0.7%) | 3,000 (3%) | 1,700 (1.7%) |
| 1,000 | +1,400 (1.4%) | 6,000 (6%) | 3,400 (3.4%) |
| 2,500 | +3,500 (3.5%) | 15,000 (15%) | 8,500 (8.5%) |
| 5,000 | +7,000 (7.0%) | 30,000 (30%) | 17,000 (17%) |
| 10,000 | +14,000 (14%) | 60,000 (60%) | 34,000 (34%) |
| 16,000 | +22,400 (22%) | 96,000 (96%) | 54,400 (54%) |

Percentages are of the daily free limits. **The data-point limit is reached first, at roughly 16,000 visits a day.** Relative to what the Worker handles today, analytics adds about 70% more Worker requests per visit (1.4 on top of about 2), but against the free ceiling it is small until you are well into the thousands of visits a day.

Portal side: opening the Dashboard costs 1 Worker request and 1 R2 read. It runs 4 SQL queries and 1 R2 write only when the saved answer is a day old, or when the portal page was just reloaded and the Dashboard opened (never more than once a minute; 4 admins reloading 20 times each is about 320 queries, against 10,000). Three tiny files are stored in the private bucket (`analytics/summary-*.json`).

CPU: the collect route parses at most 8 KB and writes at most 60 points, which should sit far inside the free 10 ms per request (estimated, not measured on Cloudflare).

## If something goes wrong

- Apps keep working whatever happens here: every analytics call is wrapped, and the Worker route swallows its own errors.
- If you see Worker requests climbing faster than expected: set `ANALYTICS_ENABLED=false`; then raise `MIN_SEND_GAP_MS` (e.g. 15 minutes) or lower `MAX_SENDS_PER_DAY` in `js/analytics.js` before turning it back on.
- The collect route is public (a public page cannot hold a secret), so anyone who finds it could post junk and skew the numbers. It cannot read anything and it cannot change the app. Treat the figures as good indications, not audited counts. If it is ever abused, the first switch above stops it immediately.
- Cloudflare keeps Analytics Engine data for 3 months.

## Files

- `js/analytics.js` (new) and one `<script>` line in `index.html`
- `worker.js`: `/__sky_collect`, `share_open` counting (marked "ANALYTICS")
- `wrangler.jsonc`: the `ANALYTICS_AE` binding (dataset `mmicj_events`). `run_worker_first` already contains `/__sky_*`, so no routing change is needed.
- `worker-analytics.test.mjs`: run it like your other worker tests (`node worker-analytics.test.mjs` with `worker.js` copied to `worker.mjs`)
