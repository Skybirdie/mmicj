# Catalog snapshot (KV) - how it works and how to roll it out

## What it is

The Worker keeps ONE extra KV record, `catalog:snapshot:v1`, holding the whole cleaned
catalog (`{ version, content: [...] }`, same item shape the share records use).
It is written by the existing Glide publish (`/__sky_catalog_publish`) and served at
`/__sky_catalog`. When the app is opened on the plain base URL (no `?contractz=`), it loads
that snapshot instead of `content.json`.

`?contractz=` / `?contract=` / injected share contracts behave exactly as before and never
request the snapshot.

## Load order in the app (`js/manifest.js`)

1. Glide contract, if one is present and usable (zero extra requests).
2. `/__sky_catalog` (browser-cached for 5 minutes; last good copy kept in localStorage).
3. `content.json`.

## KV usage per event (free plan: 100k reads, 1k writes per day)

| Event | KV reads | KV writes |
|---|---|---|
| Publish, catalog unchanged | 1 | 0 |
| Publish, catalog changed (k items changed) | 1 + one per item + 1 verify | k + 1 prev copy + 1 snapshot + the existing status record |
| Publish refused (shrink guard / no valid items) | 1 | 0 |
| App open on base URL | 0-1 (isolate memory, 60 s) | 0 |
| App open via Glide `?contractz=` | 0 | 0 |

Every base-URL app open is one Worker request (100k/day on the free plan). Static files
(index.html, js, css, images, pdf/) remain free and unlimited because `run_worker_first`
is `false`. Do not add a file named `__sky_catalog` to the repo - it would shadow the route.

## Protections

- **Unchanged catalog**: hash matches -> nothing is read per item and nothing is written.
- **Shrink guard**: once the snapshot has 6+ items, a publish keeping under 50% of them is
  refused (HTTP 409, nothing written). Intended reductions: set the Glide `p3` value to
  `publish-force` for that publish, then set it back to `publish`.
- **No valid items**: refused (HTTP 422), nothing written.
- **Rollback copy**: the previous snapshot is kept at `catalog:snapshot:v1:prev`.
- **Order**: items are written first, the snapshot last, then verified with an uncached read.
- **Outage behaviour**: if KV cannot be read, a warm Worker serves its last copy; the app
  falls back to its localStorage copy, then `content.json`.

## First-time rollout

1. Deploy the Worker and the app files.
2. Trigger one publish from Glide (change any contracted value in an item, or set `p3` to
   `publish-force` once). The first publish creates the snapshot; until then `/__sky_catalog`
   answers 404 and the base URL falls back to `content.json`.
3. Open `https://<worker>/__sky_catalog` - you should see the catalog JSON.
4. Open the base URL in a private window and confirm the library appears.
5. Point the Glide embed of the fallback group of users at the base URL.

## Moving the publish token out of the code (optional, 4 steps)

1. `npx wrangler secret put CATALOG_PUBLISH_TOKEN`
2. Add a `p4` column to the Glide generator holding the same value.
3. Confirm publishing still works.
4. Set the plain variable `CATALOG_DISABLE_LEGACY_TOKEN` (any value) so the built-in token
   stops working, and later remove `CATALOG_TEST_TOKEN` from `worker.js` and the generator.

## Not covered

If the Glide contract today carries `frontPage.categories` or `background`, they are not in
the snapshot (the generator only sends items); the app then uses its built-in defaults.
The Worker already accepts `frontPage: { categories: [...] }` and `background` in the publish
body if you want to send them later.
