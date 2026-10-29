"use strict";

/*
=========================================================
 MMicjMedia Worker

 FINAL SHORT SHARE LINK ARCHITECTURE

 Public share URL:

     /s/<section>/<id>

 The selected item is retrieved from the catalog or
 direct-share KV record.

 The browser address bar NEVER receives the long contract.
=========================================================
*/

const CONTRACT_PREFIX = "sr2.";
const KEY_LENGTH = 16;

const SKYMEDIA_BASE_URL =
  "https://mmicj.meditation-mornings-icj.workers.dev";

/* =========================================================
   Open Graph / Social Preview
========================================================= */

const OG_SITE_NAME =
  "Meditation Mornings";

const OG_DEFAULT_THUMBNAIL =
  "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/pub/lu8ys9mg3bqa2jgeWIFB.webp";

const OG_LOGO =
  "https://storage.googleapis.com/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/pub/Qysgcds56u8OmAi76mCC.webp";

const OG_IMAGE_PATH =
  "/__sky_og_image";

/* =========================================================
   BASE URL PREVIEW  ( https://<this worker>/ )

   The base URL's link card uses the thumbnail of the item that
   is currently the Front Page centerpiece (see resolveDoors() in
   js/frontPage.js), badged with the logo exactly like the
   per-item /s/<section>/<id> cards.

   When there is no usable centerpiece item (no snapshot yet,
   nothing visible, no absolute thumbnail, or the thumbnail cannot
   be loaded) the card uses assets/base-logo.jpg instead.

   That applies to the bare base URL only. A state link
   (/?view=<section>&item=<section>/<id>, kept in the browser's
   address bar by js/browserAddress.js) gets the open item's own
   card instead; see BASE_STATE_VIEWS below.
========================================================= */

const BASE_LOGO_PATH =
  "/assets/base-logo.jpg";

/*
 * The plain base address (the front page: #frontShareButton, and the
 * browser's own share while the front page is showing) is previewed with
 * the square poster, assets/mmicj-poster.png.
 *
 * Section and item links (/?view=...&item=...) are unaffected: they keep
 * the open item's own card, else assets/base-logo.jpg.
 *
 * To use the logo for the front page instead, point
 * FRONT_PREVIEW_IMAGE_PATH at BASE_LOGO_PATH (and the size at
 * BASE_LOGO_SIZE). The poster file must be deployed with the app
 * (assets/mmicj-poster.png); worker-state-preview.test.mjs checks it
 * exists.
 */
const FRONT_PREVIEW_IMAGE_PATH =
  "/assets/mmicj-poster.png";

/* Pixel size of the poster (square); only used for the
   og:image:width / og:image:height hints. */
const FRONT_PREVIEW_IMAGE_SIZE =
  720;

/* false  the poster above (current choice; also costs no KV read)
   true   the Front Page centerpiece's thumbnail, with the poster only as
          its fallback (the original behaviour) */
const FRONT_PREVIEW_USES_CENTERPIECE =
  false;

/* Pixel size of assets/base-logo.jpg (it is square). Only used for
   the og:image:width / og:image:height hints. */
const BASE_LOGO_SIZE =
  1500;

const BASE_PREVIEW_TITLE =
  "Meditation Mornings in Christ Jesus";

/* Item release dates (YYYYMMDDHHmm) are compared against "now" in
   this time zone, because the browser compares them against the
   viewer's local clock. Change it if releases are scheduled in
   another zone. */
const BASE_PREVIEW_TIMEZONE =
  "America/Port_of_Spain";

/* Same seven-category fallback as DEFAULT_CATEGORIES in
   js/frontPage.js. A frontPage.categories list of exactly seven
   values inside the catalog snapshot overrides it, as in the app. */
const BASE_PREVIEW_CATEGORIES = [
  "Book Club",
  "Affirmations",
  "Feed My Sheep",
  "BYOB",
  "Sayings",
  "Meditation",
  "Testimonies"
];

/* The chosen centerpiece is remembered per isolate for this long,
   so a burst of visits / crawlers costs no extra KV reads. */
const BASE_PREVIEW_MEMORY_TTL_MS =
  60000;

/* =========================================================
   COMPOSED OG IMAGE STORE (KV)

   The Images binding bills every compose, and workers.dev has no
   edge cache for Worker-made responses, so each finished preview
   image is kept in KV and served from there afterwards.

   The key is derived from the thumbnail URL (plus the logo and a
   format version), so a changed thumbnail finds no stored copy and
   is composed again, while an unchanged one costs a KV read only.
   Applies to item links and the base link alike.

   - Bump OG_CACHE_VERSION to force every preview to be rebuilt
     (e.g. after changing the logo badge position or size).
   - Copies expire after OG_CACHE_TTL_SECONDS, which also clears
     out the copies of thumbnails that were replaced.
   - A thumbnail replaced IN PLACE (same URL, new picture) is not
     noticed until that expiry or a version bump.
========================================================= */

const OG_CACHE_PREFIX =
  "og:v1:";

const OG_CACHE_VERSION =
  "1";

const OG_CACHE_TTL_SECONDS =
  60 * 60 * 24 * 30;

const OG_CACHE_CONTROL =
  "public, max-age=86400, stale-while-revalidate=604800";

/* =========================================================
   PDF RANGE PROXY

   Book PDFs are hosted on the Glide GCS bucket — a different
   origin from this app. GCS supports HTTP range requests fine,
   but a cross-origin fetch from the BROWSER can't see the
   Accept-Ranges / Content-Length response headers needed to
   confirm that support, unless the bucket's CORS policy
   explicitly exposes them (it doesn't, and it isn't ours to
   change). PDF.js reacts to that missing visibility by quietly
   downloading the entire file instead of streaming it — fine
   for a normal PDF, a multi-minute stall for one bloated by
   embedded video/audio.

   This route re-fetches the source PDF from the Worker instead
   (server-to-server, not subject to browser CORS), forwarding
   the incoming Range header both ways, and returns it to the
   browser same-origin — where none of the header-visibility
   restrictions above apply. PDF.js gets its 206 responses back
   and streams the book normally again.
========================================================= */

const PDF_PROXY_PATH =
  "/__sky_pdf_proxy";

/* Only ever proxy to hosts we expect book PDFs to live on. This
   is not an open relay for arbitrary URLs. */
const PDF_PROXY_ALLOWED_HOSTS =
  new Set([
    "storage.googleapis.com"
  ]);

/* Narrower than the host check: only this Glide app's own uploads may
   be proxied, so the route cannot be used as a relay for anybody
   else's files on storage.googleapis.com (that would spend THIS
   Worker's request quota). To change it without a redeploy, set the
   plain variable PDF_PROXY_ALLOWED_PREFIXES to a comma-separated list
   of path prefixes, each starting with "/". The check runs on the
   parsed URL, so "../" and "%2e%2e" tricks are already normalised. */
const PDF_PROXY_DEFAULT_PATH_PREFIXES = [
  "/glide-prod.appspot.com/uploads-v2/mKxnsa8ky8uPGbBKpTyv/"
];

function pdfProxyPathAllowed(
  env,
  pathname
) {
  const configured =
    String(
      env?.PDF_PROXY_ALLOWED_PREFIXES || ""
    )
      .split(",")
      .map(value => value.trim())
      .filter(value => value.startsWith("/"));

  const prefixes =
    configured.length
      ? configured
      : PDF_PROXY_DEFAULT_PATH_PREFIXES;

  return prefixes.some(
    prefix =>
      pathname.startsWith(prefix)
  );
}

/* Bumped once, deliberately: an earlier version of this proxy could
   cache a WRONG partial response under a given PDF's URL (see the
   comment in handlePdfProxy). Changing this forces every PDF to be
   fetched fresh under a new cache key instead of potentially being
   served whatever that earlier bug already wrote into Cloudflare's
   cache for the same URL. */
const PDF_PROXY_CACHE_VERSION =
  "2"; /* No longer used: the proxy streams straight through now. */

const SHARE_PATH_PREFIX =
  "/s/";

const SHARE_RECORD_PREFIX =
  "share:v1:";

const CATALOG_RECORD_PREFIX =
  "catalog:v1:";

/* ---------------------------------------------------------
   CATALOG SNAPSHOT

   One KV record holding the complete, cleaned catalog, so the
   app can load it from the base URL without a Glide contract.

   Written by the catalog publish (below) ONLY when the catalog
   actually changed, and served at CATALOG_SNAPSHOT_PATH.
--------------------------------------------------------- */

const CATALOG_SNAPSHOT_PATH =
  "/__sky_catalog";

const CATALOG_SNAPSHOT_KEY =
  "catalog:snapshot:v1";

const CATALOG_SNAPSHOT_PREV_KEY =
  "catalog:snapshot:v1:prev";

/* Bump to force one re-write of the snapshot after a format change. */
const CATALOG_SNAPSHOT_FORMAT =
  "1";

/* Refuse a publish that keeps fewer than this share of the
   previous item count (unless the publish sends force:true). */
const CATALOG_SNAPSHOT_MIN_RETAIN_RATIO =
  0.5;

/* The shrink guard only applies once the previous snapshot had at
   least this many items, so small catalogs can be edited freely. */
const CATALOG_SNAPSHOT_GUARD_MIN_PREVIOUS =
  6;

/* Browsers may reuse the snapshot for this long without asking. */
const CATALOG_SNAPSHOT_CLIENT_MAX_AGE =
  300;

/* Per-isolate memory copy, so warm isolates do not read KV on
   every request. (The Cache API is not available on workers.dev.) */
const CATALOG_SNAPSHOT_MEMORY_TTL_MS =
  60000;

const KV_CACHE_TTL =
  300;

/* =========================================================
   KV READ HELPER
========================================================= */

function kvGet(
  env,
  key
) {
  return env.MEDIA_KV.get(
    key,
    {
      cacheTtl:
        KV_CACHE_TTL
    }
  );
}

/* =========================================================
   KV MISS GUARD + LIMITED LOGGING

   Link-preview crawlers and bots request /s/<section>/<id> URLs
   that do not exist. Each one used to cost two KV reads (catalog
   record, then the legacy share record) and one log event, and
   KV bills a read even when the answer is "not found".

   kvGetGuarded() remembers a miss inside this isolate for a
   minute, so asking for the same missing key again costs nothing.
   A publish clears the memory, so a newly published item is never
   hidden by an old miss.

   logLimited() writes the same log line at most once per ten
   minutes per isolate, which keeps expected misses (and a KV
   outage) from turning into one Observability event per request.
========================================================= */

const KV_MISS_TTL_MS =
  60000;

const KV_MISS_MAX_ENTRIES =
  500;

const kvMissMemo =
  new Map();

async function kvGetGuarded(
  env,
  key
) {
  const now =
    Date.now();

  const missedAt =
    kvMissMemo.get(
      key
    );

  if (
    missedAt !== undefined &&
    now - missedAt <
      KV_MISS_TTL_MS
  ) {
    return null;
  }

  const value =
    await kvGet(
      env,
      key
    );

  if (!value) {
    if (
      kvMissMemo.size >=
      KV_MISS_MAX_ENTRIES
    ) {
      kvMissMemo.clear();
    }

    kvMissMemo.set(
      key,
      now
    );
  } else if (
    missedAt !== undefined
  ) {
    kvMissMemo.delete(
      key
    );
  }

  return value;
}

const LOG_LIMIT_WINDOW_MS =
  600000;

const logLastAt =
  new Map();

function logLimited(
  level,
  label,
  ...args
) {
  const now =
    Date.now();

  const last =
    logLastAt.get(
      label
    );

  if (
    last !== undefined &&
    now - last <
      LOG_LIMIT_WINDOW_MS
  ) {
    return;
  }

  if (
    logLastAt.size >= 50
  ) {
    logLastAt.clear();
  }

  logLastAt.set(
    label,
    now
  );

  console[level](
    ...args
  );
}

/* =========================================================
   SHARE TARGET PLAUSIBILITY

   The app has exactly three sections. Anything else, or an id
   containing control characters, cannot be a real shared item,
   so it is refused before any KV read.
========================================================= */

const KNOWN_SHARE_SECTIONS =
  new Set([
    "reader",
    "video",
    "slideshow"
  ]);

function isPlausibleShareTarget(
  section,
  id
) {
  return (
    KNOWN_SHARE_SECTIONS.has(
      section
    ) &&
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 512 &&
    !/[\u0000-\u001f\u007f]/.test(
      id
    )
  );
}

/* =========================================================
   TEMPORARY CATALOG PUBLISH TEST
========================================================= */

const CATALOG_TEST_TOKEN =
  "SMCAT-TEST-9f7b2d4c-20260918";

const CATALOG_TEST_STATUS_KEY =
  "catalog:test:last";

/* =========================================================
   FNV-1A
========================================================= */

function fnv1a32(
  value,
  seed
) {
  let hash =
    (0x811c9dc5 ^ seed) >>> 0;

  for (
    let i = 0;
    i < value.length;
    i++
  ) {
    hash ^=
      value.charCodeAt(i);

    hash =
      Math.imul(
        hash,
        0x01000193
      ) >>> 0;
  }

  return hash >>> 0;
}

function hex8(
  value
) {
  return value
    .toString(16)
    .padStart(8, "0")
    .toUpperCase();
}

function makeKey(
  payload
) {
  const hash1 =
    fnv1a32(
      payload,
      0
    );

  const hash2 =
    fnv1a32(
      payload,
      0x9E3779B9
    );

  return (
    hex8(hash1) +
    hex8(hash2)
  );
}

/* =========================================================
   DIRECT SHARE RECORDS
========================================================= */

function makeShareRecordKey(
  section,
  id
) {
  const normalizedSection =
    normalizeSection(section);

  const normalizedId =
    String(id || "").trim();

  return (
    SHARE_RECORD_PREFIX +
    makeKey(
      normalizedSection +
      "\0" +
      normalizedId
    )
  );
}

function makeCatalogRecordKey(
  section,
  id
) {
  const normalizedSection =
    normalizeSection(section);

  const normalizedId =
    String(id || "").trim();

  /*
   * IMPORTANT:
   * Keep the literal "\\0" here.
   *
   * Existing catalog records were written using this
   * exact key construction.
   */
  return (
    CATALOG_RECORD_PREFIX +
    makeKey(
      normalizedSection +
      "\\0" +
      normalizedId
    )
  );
}

/* =========================================================
   MEDIA NORMALIZATION
========================================================= */

function normalizeMediaValue(
  media,
  type
) {
  if (
    Array.isArray(media)
  ) {
    return media
      .map(
        value =>
          String(
            value ?? ""
          ).trim()
      )
      .filter(Boolean);
  }

  const value =
    String(
      media ?? ""
    ).trim();

  if (!value) {
    return "";
  }

  if (
    type === "slideshow" &&
    value.startsWith("[") &&
    value.endsWith("]")
  ) {
    try {
      const decoded =
        JSON.parse(value);

      if (
        Array.isArray(decoded)
      ) {
        return decoded
          .map(
            item =>
              String(
                item ?? ""
              ).trim()
          )
          .filter(Boolean);
      }
    } catch (_) {
      /* Continue below. */
    }
  }

  if (
    type === "slideshow" &&
    value.includes(",")
  ) {
    return value
      .split(",")
      .map(
        url =>
          url.trim()
      )
      .filter(Boolean);
  }

  return value;
}

/* =========================================================
   SHARE ITEM NORMALIZATION
========================================================= */

function normalizeShareItem(
  item
) {
  if (
    !item ||
    typeof item !== "object"
  ) {
    return null;
  }

  const type =
    String(
      item.type ?? ""
    )
      .trim()
      .toLowerCase();

  const media =
    normalizeMediaValue(
      item.media,
      type
    );

  const result = {
    id:
      String(
        item.id ?? ""
      ).trim(),

    type,

    title:
      String(
        item.title ?? ""
      ).trim(),

    subtitle:
      String(
        item.subtitle ?? ""
      ).trim(),

    thumbnail:
      String(
        item.thumbnail ?? ""
      ).trim(),

    media,

    audio:
      String(
        item.audio ?? ""
      ).trim(),

    author:
      String(
        item.author ?? ""
      ).trim(),

    category:
      String(
        item.category ?? ""
      ).trim(),

    date:
      String(
        item.date ??
        item.dateAdd ??
        ""
      ).trim()
  };

  if (
    item.dateAdd !== undefined &&
    item.dateAdd !== null
  ) {
    const dateAdd =
      String(
        item.dateAdd
      ).trim();

    if (dateAdd) {
      result.dateAdd =
        dateAdd;
    }
  }

  if (
    !result.id ||
    !result.type
  ) {
    return null;
  }

  return result;
}

function buildShareManifest(
  item
) {
  return {
    version:
      "1.0",

    content:
      [item],

    frontPage: {
      categories: []
    }
  };
}

function getDirectShareTarget(
  url
) {
  const prefix =
    SHARE_PATH_PREFIX;

  if (
    !url.pathname.startsWith(
      prefix
    )
  ) {
    return null;
  }

  const parts =
    url.pathname
      .slice(prefix.length)
      .split("/")
      .filter(Boolean);

  if (
    parts.length !== 2
  ) {
    return null;
  }

  let section = "";
  let id = "";

  try {
    section =
      decodeURIComponent(
        parts[0]
      );

    id =
      decodeURIComponent(
        parts[1]
      );
  } catch (_) {
    return null;
  }

  section =
    normalizeSection(
      section
    );

  id =
    String(
      id || ""
    ).trim();

  if (
    !section ||
    !id ||
    section.length > 40 ||
    !isPlausibleShareTarget(
      section,
      id
    )
  ) {
    return null;
  }

  return {
    section,
    id
  };
}

/* =========================================================
   DIRECT SHARE READ
========================================================= */

async function getDirectShareRecord(
  env,
  target
) {
  /*
   * Optional switch (plain variable, off by default): once no
   * legacy share:v1 links are in use any more, setting
   * DISABLE_LEGACY_SHARE_RECORDS to any value skips this second
   * KV read for every item that is not in the catalog.
   */
  if (
    env?.DISABLE_LEGACY_SHARE_RECORDS
  ) {
    return null;
  }

  const key =
    makeShareRecordKey(
      target.section,
      target.id
    );

  let raw;

  try {
    raw =
      await kvGetGuarded(
        env,
        key
      );
  } catch (error) {
    logLimited(
      "error",
      "direct-share-kv-read",
      "MMicjMedia direct-share KV read failed:",
      error
    );

    throw new Error(
      "MMicjMedia KV read failed: " +
      (
        error instanceof Error
          ? error.message
          : String(error)
      )
    );
  }

  if (!raw) {
    return null;
  }

  try {
    const record =
      JSON.parse(raw);

    if (
      !record ||
      !record.item
    ) {
      return null;
    }

    const item =
      normalizeShareItem(
        record.item
      );

    if (!item) {
      return null;
    }

    if (
      item.id !== target.id ||
      sectionFromItem(item) !==
        target.section
    ) {
      return null;
    }

    return {
      key,

      item,

      manifest:
        buildShareManifest(
          item
        )
    };
  } catch (error) {
    console.error(
      "MMicjMedia direct-share record decode failed:",
      error
    );

    return null;
  }
}

/* =========================================================
   CATALOG SHARE RECORD
========================================================= */

async function getCatalogShareRecord(
  env,
  target
) {
  const key =
    makeCatalogRecordKey(
      target.section,
      target.id
    );

  let raw;

  try {
    raw =
      await kvGetGuarded(
        env,
        key
      );
  } catch (error) {
    logLimited(
      "error",
      "catalog-kv-read",
      "MMicjMedia catalog KV read failed:",
      error
    );

    throw new Error(
      "MMicjMedia catalog KV read failed: " +
      (
        error instanceof Error
          ? error.message
          : String(error)
      )
    );
  }

  if (!raw) {
    logLimited(
      "warn",
      "catalog-item-miss",
      "MMicjMedia catalog item not found:",
      key
    );

    return null;
  }

  try {
    const record =
      JSON.parse(raw);

    if (
      !record ||
      !record.item
    ) {
      return null;
    }

    const item =
      normalizeShareItem(
        record.item
      );

    if (!item) {
      return null;
    }

    const actualSection =
      sectionFromItem(
        item
      );

    if (
      item.id !== target.id ||
      actualSection !== target.section
    ) {
      console.error(
        "MMicjMedia catalog identity mismatch:",
        {
          requestedSection:
            target.section,

          requestedId:
            target.id,

          actualSection,

          actualId:
            item.id
        }
      );

      return null;
    }

    return {
      key,

      item,

      manifest:
        buildShareManifest(
          item
        )
    };
  } catch (error) {
    console.error(
      "MMicjMedia catalog record decode failed:",
      error
    );

    return null;
  }
}

/* =========================================================
   VALIDATION
========================================================= */

function isValidKey(
  key
) {
  return (
    typeof key ===
      "string" &&

    key.length ===
      KEY_LENGTH &&

    /^[A-Fa-f0-9]{16}$/.test(
      key
    )
  );
}

function isValidPayload(
  payload
) {
  if (!payload) {
    return false;
  }

  if (
    !payload.startsWith(
      CONTRACT_PREFIX
    )
  ) {
    return false;
  }

  const encoded =
    payload.slice(
      CONTRACT_PREFIX.length
    );

  if (!encoded) {
    return false;
  }

  return /^[A-Za-z0-9_-]+$/.test(
    encoded
  );
}

/* =========================================================
   RESPONSE HELPERS
========================================================= */

function htmlHeaders() {
  return {
    "content-type":
      "text/html; charset=UTF-8",

    "cache-control":
      "no-store, no-cache, must-revalidate",

    "pragma":
      "no-cache"
  };
}

function textHeaders() {
  return {
    "content-type":
      "text/plain; charset=UTF-8",

    "cache-control":
      "no-store, no-cache, must-revalidate",

    "pragma":
      "no-cache"
  };
}

/* =========================================================
   ASSET REQUEST
========================================================= */

function makeCleanAssetRequest(
  request
) {
  const assetUrl =
    new URL(
      "/index.html",
      request.url
    );

  return new Request(
    assetUrl.toString(),
    {
      method:
        "GET",

      headers:
        request.headers
    }
  );
}

/* =========================================================
   C2.2 BASE64URL DECODER
========================================================= */

function base64UrlDecode(
  value
) {
  try {
    let base64 =
      value
        .replace(
          /-/g,
          "+"
        )
        .replace(
          /_/g,
          "/"
        );

    while (
      base64.length % 4
    ) {
      base64 += "=";
    }

    const binary =
      atob(
        base64
      );

    const bytes =
      new Uint8Array(
        binary.length
      );

    for (
      let i = 0;
      i < binary.length;
      i++
    ) {
      bytes[i] =
        binary.charCodeAt(i);
    }

    return bytes;
  } catch (_) {
    return null;
  }
}

/* =========================================================
   C2.2 DECOMPRESSOR
========================================================= */

function decompressBytes(
  bytes
) {
  if (
    !bytes ||
    bytes.length < 2
  ) {
    throw new Error(
      "C2.2 payload is too short."
    );
  }

  const version =
    bytes[0];

  if (
    version !== 2
  ) {
    throw new Error(
      "Unsupported C2.2 codec version: " +
      version
    );
  }

  const windowSize =
    4095;

  const maxLen =
    18;

  const minLen =
    3;

  const output =
    [];

  let pos =
    1;

  while (
    pos < bytes.length
  ) {
    const flags =
      bytes[pos++];

    for (
      let bit = 0;
      bit < 8 &&
      pos < bytes.length;
      bit++
    ) {
      const isMatch =
        (
          flags &
          (1 << bit)
        ) !== 0;

      if (!isMatch) {
        output.push(
          bytes[pos++]
        );

        continue;
      }

      if (
        pos + 1 >=
        bytes.length
      ) {
        throw new Error(
          "Incomplete C2.2 match token."
        );
      }

      const high =
        bytes[pos++];

      const low =
        bytes[pos++];

      const packed =
        (high << 8) |
        low;

      const length =
        (packed & 0x0F) +
        minLen;

      const offset =
        (packed >>> 4) +
        1;

      if (
        length < minLen ||
        length > maxLen
      ) {
        throw new Error(
          "Invalid C2.2 match length."
        );
      }

      if (
        offset < 1 ||
        offset > windowSize ||
        offset > output.length
      ) {
        throw new Error(
          "Invalid C2.2 match offset."
        );
      }

      for (
        let i = 0;
        i < length;
        i++
      ) {
        const sourceIndex =
          output.length -
          offset;

        output.push(
          output[sourceIndex]
        );
      }
    }
  }

  return new Uint8Array(
    output
  );
}

/* =========================================================
   DECODE SR2
========================================================= */

function decodeContractPayload(
  payload
) {
  if (
    !isValidPayload(
      payload
    )
  ) {
    throw new Error(
      "Invalid sr2 payload."
    );
  }

  const encoded =
    payload.slice(
      CONTRACT_PREFIX.length
    );

  const compressed =
    base64UrlDecode(
      encoded
    );

  if (!compressed) {
    throw new Error(
      "Unable to Base64URL-decode sr2 payload."
    );
  }

  const utf8 =
    decompressBytes(
      compressed
    );

  const json =
    new TextDecoder()
      .decode(
        utf8
      );

  return JSON.parse(
    json
  );
}

/* =========================================================
   CONTRACT NORMALIZATION
========================================================= */

function normalizeContractArray(
  contract
) {
  if (
    Array.isArray(
      contract
    )
  ) {
    return contract;
  }

  if (
    contract &&
    typeof contract ===
      "object"
  ) {
    return [
      contract
    ];
  }

  return [];
}

/* =========================================================
   ITEM SELECTION
========================================================= */

function getSharedItem(
  contract,
  url
) {
  const items =
    normalizeContractArray(
      contract
    );

  if (!items.length) {
    return null;
  }

  const requestedId =
    String(
      url.searchParams.get(
        "id"
      ) || ""
    ).trim();

  if (requestedId) {
    const match =
      items.find(
        item =>
          String(
            item?.id ?? ""
          ).trim() ===
          requestedId
      );

    if (match) {
      return match;
    }
  }

  return items[0];
}

/* =========================================================
   TYPE → SHARE SECTION
========================================================= */

function normalizeSection(
  section
) {
  const value =
    String(
      section || ""
    )
      .trim()
      .toLowerCase();

  if (
    value === "book" ||
    value === "books" ||
    value === "reader" ||
    value === "pdf" ||
    value === "pdfs"
  ) {
    return "reader";
  }

  if (
    value === "video" ||
    value === "videos"
  ) {
    return "video";
  }

  if (
    value === "slideshow" ||
    value === "slideshows" ||
    value === "slide" ||
    value === "slides"
  ) {
    return "slideshow";
  }

  return value;
}

function sectionFromItem(
  item
) {
  const type =
    String(
      item?.type || ""
    )
      .trim()
      .toLowerCase();

  if (
    type === "book"
  ) {
    return "reader";
  }

  if (
    type === "video"
  ) {
    return "video";
  }

  if (
    type === "slideshow"
  ) {
    return "slideshow";
  }

  return normalizeSection(
    type
  );
}

/* =========================================================
   GLIDE CLEANUP
========================================================= */

/*
 * This is the cleanup method proven in the GlideContract
 * adapter.
 *
 * Glide may provide a media value like:
 *
 * [https://example.com/image.jpg](https://example.com/image.jpg)
 *
 * We want:
 *
 * https://example.com/image.jpg
 *
 * The destination URL in the Markdown expression is
 * preferred, exactly as in the proven adapter.
 */
/*
 * =========================================================
 * GLIDE URL CLEANUP — STAGE 1A
 * =========================================================
 *
 * This follows the proven GlideContract adapter behavior,
 * with one additional normalization step for Glide values
 * that arrive wrapped in Markdown code fences.
 *
 * Examples accepted:
 *
 *   https://example.com/image.jpg
 *
 *   [https://example.com/image.jpg](https://example.com/image.jpg)
 *
 *   ```[https://example.com/image.jpg](https://example.com/image.jpg)```
 *
 *   "https://example.com/image.jpg"
 *
 *   ```https://example.com/image.jpg```
 *
 * The returned value is ONLY the destination URL.
 * =========================================================
 */

function cleanString(value) {
  return value === null || value === undefined
    ? ""
    : String(value).trim();
}


function unwrapMarkdown(value) {
  let text = cleanString(value);

  if (!text) return "";

  const markdownMatch = text.match(/^\[([^\]]+)\]\(([^)]+)\)$/);

  if (markdownMatch) {
    return cleanString(markdownMatch[2] || markdownMatch[1]);
  }

  if (
    text.length >= 2 &&
    text.startsWith('"') &&
    text.endsWith('"')
  ) {
    text = text.slice(1, -1);
  }

  return text.trim();
}


function splitMediaValue(value) {
  if (value === null || value === undefined) {
    return [];
  }

  // Real array
  if (Array.isArray(value)) {
    return value
      .flatMap(part => splitMediaValue(part))
      .filter(Boolean);
  }

  let text = cleanString(value);

  if (!text) return [];

  // JSON array stored as text
  if (text.startsWith("[") && text.endsWith("]")) {
    try {
      const parsed = JSON.parse(text);

      if (Array.isArray(parsed)) {
        return parsed
          .flatMap(part => splitMediaValue(part))
          .filter(Boolean);
      }
    } catch {
      // Not JSON; continue normally.
    }
  }

  // Glide Markdown URL list
  const markdownParts = text
    .split(/\s*,\s*(?=\[)/g)
    .map(part => unwrapMarkdown(part))
    .filter(Boolean);

  if (markdownParts.length > 1) {
    return markdownParts;
  }

  // Single value containing a Markdown URL
  if (markdownParts.length === 1) {
    return markdownParts;
  }

  // Plain comma-separated values
  if (text.includes(",")) {
    return text
      .split(",")
      .map(part => unwrapMarkdown(part))
      .filter(Boolean);
  }

  return [unwrapMarkdown(text)].filter(Boolean);
}


function cleanMediaUrl(value) {
  const values = splitMediaValue(value);

  if (!values.length) return "";

  return values[0];
}


function cleanCatalogMediaValue(value, type) {
  const values = splitMediaValue(value);

  if (!values.length) {
    return "";
  }

  const normalizedType = normalizeSection(type);

  // Slideshows can contain multiple images.
  if (normalizedType === "slideshow") {
    return values.length === 1
      ? values[0]
      : values;
  }

  // Reader/video items use one media value.
  return values[0];
}
/*
 * Normalize catalog input using the proven Glide cleanup
 * before it reaches normalizeShareItem().
 */
function normalizeCatalogPublishItem(rawItem) {
  if (!rawItem || typeof rawItem !== "object") {
    return null;
  }

  const type = normalizeSection(
    rawItem.type ||
    rawItem.section ||
    ""
  );

  if (!type) {
    return null;
  }

  const thumbnailValues = splitMediaValue(rawItem.thumbnail);
  const mediaValues = splitMediaValue(rawItem.media);
  const audioValues = splitMediaValue(rawItem.audio);

  const cleanedItem = {
    id: cleanString(rawItem.id),
    type,
    title: cleanString(rawItem.title),
    subtitle: cleanString(rawItem.subtitle),

    thumbnail: thumbnailValues.length
      ? thumbnailValues[0]
      : "",

    media:
      type === "slideshow"
        ? (
            mediaValues.length === 1
              ? mediaValues[0]
              : mediaValues
          )
        : (
            mediaValues.length
              ? mediaValues[0]
              : ""
          ),

    audio: audioValues.length
      ? audioValues[0]
      : "",

    author: cleanString(rawItem.author),
    category: cleanString(rawItem.category),
    date: cleanString(rawItem.date)
  };

  if (rawItem.dateAdd !== undefined) {
    cleanedItem.dateAdd = cleanString(rawItem.dateAdd);
  }

  if (!cleanedItem.id) {
    return null;
  }

  return cleanedItem;
}
/* =========================================================
   STAGE 1 CATALOG PREVIEW
========================================================= */

/*
 * Stage 1 deliberately performs ZERO KV writes.
 *
 * It receives the Catalog Source snapshot, applies the
 * exact Worker cleanup, and returns the cleaned result so
 * we can verify the transformation before allowing
 * publishing.
 */
/* =========================================================
   CATALOG RECORD COMPARISON
========================================================= */

/*
 * publishedAt is deliberately excluded from comparison.
 * It changes on every publish request and therefore must not
 * make an otherwise identical catalog item look changed.
 *
 * The comparison includes the stable record identity and the
 * fully cleaned catalog item. This makes publishing idempotent:
 * repeated publish requests do NOT rewrite unchanged items.
 */
function catalogRecordComparable(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  return {
    version: String(record.version ?? ""),
    section: normalizeSection(record.section || ""),
    id: String(record.id ?? "").trim(),
    item: record.item || null
  };
}

function catalogRecordsEqual(existingRecord, incomingRecord) {
  const existingComparable =
    catalogRecordComparable(existingRecord);

  const incomingComparable =
    catalogRecordComparable(incomingRecord);

  if (!existingComparable || !incomingComparable) {
    return false;
  }

  return JSON.stringify(existingComparable) ===
    JSON.stringify(incomingComparable);
}

async function getCatalogRecordForPublish(env, key) {
  /*
   * IMPORTANT: do NOT use kvGet() here.
   *
   * kvGet() intentionally uses a cacheTtl for normal share reads.
   * Publishing needs a fresh comparison so a recent change is not
   * hidden behind a cached catalog record.
   */
  return env.MEDIA_KV.get(key);
}

/* =========================================================
   STAGE 1 CATALOG PREVIEW
========================================================= */

function buildCatalogPreview(
  contract
) {
  const cleanedItems =
    [];

  let skippedCount =
    0;

  for (
    const rawItem of
    contract
  ) {
    const item =
      normalizeCatalogPublishItem(
        rawItem
      );

    if (!item) {
      skippedCount++;
      continue;
    }

    const section =
      sectionFromItem(
        item
      );

    if (!section) {
      skippedCount++;
      continue;
    }

    cleanedItems.push(
      item
    );
  }

  return {
    preview:
      true,

    kvWrites:
      0,

    contractItemCount:
      contract.length,

    cleanedItemCount:
      cleanedItems.length,

    skippedCount,

    contract:
      cleanedItems
  };
}

/* =========================================================
   HTML ESCAPING
========================================================= */

function escapeHtml(
  value
) {
  return String(
    value ?? ""
  )
    .replace(
      /&/g,
      "&amp;"
    )
    .replace(
      /</g,
      "&lt;"
    )
    .replace(
      />/g,
      "&gt;"
    )
    .replace(
      /"/g,
      "&quot;"
    )
    .replace(
      /'/g,
      "&#39;"
    );
}

/* =========================================================
   OPEN GRAPH
========================================================= */

function buildOgTags(
  request,
  item,
  imageQuery
) {
  const url =
    new URL(
      request.url
    );

  const imageUrl =
    new URL(
      OG_IMAGE_PATH,
      url.origin
    );

  if (
    imageQuery &&
    imageQuery.key
  ) {
    imageUrl.searchParams.set(
      "k",
      imageQuery.key
    );
  } else if (
    imageQuery &&
    imageQuery.target
  ) {
    imageUrl.searchParams.set(
      "section",
      imageQuery.target.section
    );

    imageUrl.searchParams.set(
      "id",
      imageQuery.target.id
    );
  }

  const title =
    String(
      item?.title ||
      OG_SITE_NAME
    ).trim();

  return (
    `<meta property="og:title" content="${escapeHtml(title)}">` +
    `<meta property="og:site_name" content="${escapeHtml(OG_SITE_NAME)}">` +
    `<meta property="og:url" content="${escapeHtml(url.toString())}">` +
    `<meta property="og:image" content="${escapeHtml(imageUrl.toString())}">` +
    `<meta property="og:image:width" content="1200">` +
    `<meta property="og:image:height" content="630">`
  );
}

/* =========================================================
   BOOTSTRAP
========================================================= */

function injectContractBootstrap(
  html,
  manifest,
  request,
  target,
  imageQuery = null
) {
  const item =
    manifest?.content?.[0] ||
    imageQuery?.previewItem ||
    null;

  const section =
    sectionFromItem(
      item
    );

  const id =
    String(
      item?.id || ""
    ).trim();

  /* No manifest = target-only share: the app loads its normal data
     and resolves the item itself, so no contract is injected. */
  const contractLine =
    manifest
      ? "window.SkyMediaContract = " +
        JSON.stringify(
          manifest
        ) +
        ";"
      : "";

  const switchLine =
    typeof imageQuery?.shareModeEnabled ===
    "boolean"
      ? "window.__SKY_SHARE_MODE_ENABLED = " +
        (
          imageQuery.shareModeEnabled
            ? "true"
            : "false"
        ) +
        ";"
      : "";

  const script = `
<script>
(function () {
  "use strict";

  ${contractLine}

  ${switchLine}

  window.__SKY_SHARE_MODE = true;

  window.__SKY_SHARE_TARGET = ${JSON.stringify({
    section:
      target?.section ||
      section,

    id:
      target?.id ||
      id
  })};

  window.__SKY_SHARE_KEY = ${JSON.stringify(
    imageQuery?.key || ""
  )};

})();
</script>
`;

  const ogTags =
    buildOgTags(
      request,
      item,
      imageQuery
    );

  const marker =
    "</head>";

  const index =
    html.indexOf(
      marker
    );

  if (
    index < 0
  ) {
    return html;
  }

  const baseTag =
    '<base href="/">';

  const headMatch =
    /<head[^>]*>/i.exec(
      html
    );

  let withBase =
    html;

  if (
    headMatch &&
    !/<base\s/i.test(
      html
    )
  ) {
    const insertAt =
      headMatch.index +
      headMatch[0].length;

    withBase =
      html.slice(
        0,
        insertAt
      ) +
      baseTag +
      html.slice(
        insertAt
      );
  }

  const headEnd =
    withBase.indexOf(
      marker
    );

  if (
    headEnd < 0
  ) {
    return withBase;
  }

  return (
    withBase.slice(
      0,
      headEnd
    ) +
    ogTags +
    script +
    withBase.slice(
      headEnd
    )
  );
}

/* =========================================================
   SERVE INDEX.HTML
========================================================= */

async function getIndexHtml(
  env,
  request
) {
  const assetResponse =
    await env.ASSETS.fetch(
      makeCleanAssetRequest(
        request
      )
    );

  if (
    !assetResponse.ok
  ) {
    return assetResponse;
  }

  const contentType =
    assetResponse.headers.get(
      "content-type"
    ) || "";

  if (
    !contentType
      .toLowerCase()
      .includes(
        "text/html"
      )
  ) {
    return assetResponse;
  }

  return assetResponse.text();
}

async function serveWithContract(
  request,
  env,
  payload,
  key = ""
) {
  const html =
    await getIndexHtml(
      env,
      request
    );

  if (
    typeof html !==
    "string"
  ) {
    return html;
  }

  let manifest;

  try {
    const contract =
      decodeContractPayload(
        payload
      );

    const item =
      getSharedItem(
        contract,
        new URL(
          request.url
        )
      );

    const normalized =
      normalizeShareItem(
        item
      );

    if (!normalized) {
      throw new Error(
        "Shared contract contains no valid item."
      );
    }

    manifest =
      buildShareManifest(
        normalized
      );
  } catch (error) {
    console.error(
      "MMicjMedia publication decode failed:",
      error
    );

    return new Response(
      "MMicjMedia publication data is invalid.",
      {
        status:
          500,

        headers:
          textHeaders()
      }
    );
  }

  return new Response(
    injectContractBootstrap(
      html,
      manifest,
      request,
      {
        section:
          sectionFromItem(
            manifest.content[0]
          ),

        id:
          manifest.content[0].id
      },
      {
        key,

        shareModeEnabled:
          isShareModeEnabled(
            env
          )
      }
    ),
    {
      status:
        200,

      headers:
        htmlHeaders()
    }
  );
}

/* =========================================================
   SERVE DIRECT SHARE
========================================================= */

/* /s/<section>/<id>  ->  /?view=<section>&item=<section>/<id>
   (the format js/browserAddress.js writes and js/appSwitcher.js opens).
   Used when the Share Mode switch is off. */
function redirectToAppItem(
  request,
  target
) {
  const destination =
    new URL(
      "/",
      request.url
    );

  destination.searchParams.set(
    "view",
    target.section
  );

  destination.searchParams.set(
    "item",
    target.section +
      "/" +
      target.id
  );

  return new Response(
    null,
    {
      status:
        302,

      headers: {
        Location:
          destination.toString(),

        "Cache-Control":
          "no-store"
      }
    }
  );
}

async function serveDirectShare(
  request,
  env,
  target
) {
  const record =
    await getDirectShareRecord(
      env,
      target
    );

  /*
   * No KV record. An item that exists only in the R2 published catalog
   * is still shareable: the page is served with just the share target
   * (no one-item contract), and Share Mode resolves the item from the
   * normal app data, exactly like a direct-ID share. Anything unknown
   * (or not released yet) gets the "unavailable" page.
   */
  const publishedItem =
    record
      ? null
      : await getPublishedCatalogItem(
          target
        );

  if (
    !record &&
    !publishedItem
  ) {
    return friendlyResponse("unavailable", request, "MMicjMedia shared item was not found.");
  }

  const html =
    await getIndexHtml(
      env,
      request
    );

  if (
    typeof html !==
    "string"
  ) {
    return html;
  }

  const modified =
    injectContractBootstrap(
      html,
      record
        ? record.manifest
        : null,
      request,
      target,
      {
        target,

        previewItem:
          publishedItem,

        shareModeEnabled:
          isShareModeEnabled(
            env
          )
      }
    );

  return new Response(
    modified,
    {
      status:
        200,

      headers:
        htmlHeaders()
    }
  );
}

/* =========================================================
   SERVE CATALOG SHARE
========================================================= */

async function serveCatalogShare(
  request,
  env,
  target
) {
  const record =
    await getCatalogShareRecord(
      env,
      target
    );

  if (!record) {
    return null;
  }

  const html =
    await getIndexHtml(
      env,
      request
    );

  if (
    typeof html !==
    "string"
  ) {
    return html;
  }

  const modified =
    injectContractBootstrap(
      html,
      record.manifest,
      request,
      target,
      {
        target,

        shareModeEnabled:
          isShareModeEnabled(
            env
          )
      }
    );

  return new Response(
    modified,
    {
      status:
        200,

      headers:
        htmlHeaders()
    }
  );
}

/* =========================================================
   OG IMAGE
========================================================= */

async function ogCacheKey(
  thumbnailUrl
) {
  return (
    OG_CACHE_PREFIX +
    (
      await sha256Hex(
        OG_CACHE_VERSION +
        "\n" +
        thumbnailUrl +
        "\n" +
        OG_LOGO
      )
    ).slice(
      0,
      40
    )
  );
}

/* A previously composed image, as a Response, or null. Never throws. */
async function readStoredOgImage(
  env,
  cacheKey
) {
  try {
    const bytes =
      await env.MEDIA_KV.get(
        cacheKey,
        {
          type:
            "arrayBuffer",

          /* The key changes whenever the picture should, so the
             stored bytes never go stale. */
          cacheTtl:
            3600
        }
      );

    if (
      !bytes ||
      !bytes.byteLength
    ) {
      return null;
    }

    return new Response(
      bytes,
      {
        status:
          200,

        headers: {
          "Content-Type":
            "image/webp",

          "Cache-Control":
            OG_CACHE_CONTROL
        }
      }
    );
  } catch (error) {
    logLimited(
      "warn",
      "og-store-read",
      "MMicjMedia stored OG image read failed; composing instead:",
      error
    );

    return null;
  }
}

/* Saves a composed image. Never throws, never delays the response
   when waitUntil is available. */
function storeOgImage(
  env,
  ctx,
  cacheKey,
  bytes
) {
  const write =
    env.MEDIA_KV.put(
      cacheKey,
      bytes,
      {
        expirationTtl:
          OG_CACHE_TTL_SECONDS
      }
    ).catch(
      error =>
        logLimited(
          "warn",
          "og-store-write",
          "MMicjMedia OG image could not be stored:",
          error
        )
    );

  if (
    ctx &&
    typeof ctx.waitUntil ===
      "function"
  ) {
    ctx.waitUntil(
      write
    );

    return undefined;
  }

  return write;
}

async function serveOgImage(
  request,
  env,
  ctx
) {
  if (!env.IMAGES) {
    return new Response(
      "MMicjMedia Images binding is not configured.",
      {
        status:
          500,

        headers:
          textHeaders()
      }
    );
  }

  const url =
    new URL(
      request.url
    );

  const key =
    String(
      url.searchParams.get(
        "k"
      ) || ""
    )
      .trim()
      .toUpperCase();

  let item =
    null;

  if (
    isValidKey(
      key
    )
  ) {
    let payload =
      null;

    try {
      payload =
        await kvGet(
          env,
          key
        );
    } catch (error) {
      console.error(
        "MMicjMedia OG KV read failed:",
        error
      );

      return new Response(
        "MMicjMedia KV read failed: " +
        (
          error instanceof Error
            ? error.message
            : String(error)
        ),
        {
          status:
            500,

          headers:
            textHeaders()
        }
      );
    }

    if (
      !payload ||
      !isValidPayload(
        payload
      )
    ) {
      return new Response(
        "MMicjMedia publication not found.",
        {
          status:
            404,

          headers:
            textHeaders()
        }
      );
    }

    try {
      const contract =
        decodeContractPayload(
          payload
        );

      item =
        normalizeShareItem(
          getSharedItem(
            contract,
            url
          )
        );
    } catch (error) {
      console.error(
        "MMicjMedia OG legacy contract decode failed:",
        error
      );

      return new Response(
        "MMicjMedia publication data could not be decoded.",
        {
          status:
            500,

          headers:
            textHeaders()
        }
      );
    }
  } else {
    const target = {
      section:
        normalizeSection(
          url.searchParams.get(
            "section"
          )
        ),

      id:
        String(
          url.searchParams.get(
            "id"
          ) || ""
        ).trim()
    };

    if (
      !isPlausibleShareTarget(
        target.section,
        target.id
      )
    ) {
      return new Response(
        "Invalid MMicjMedia OG target.",
        {
          status:
            400,

          headers:
            textHeaders()
        }
      );
    }

    let record =
      await getCatalogShareRecord(
        env,
        target
      );

    if (!record) {
      record =
        await getDirectShareRecord(
          env,
          target
        );
    }

    /* Not in KV: an item that exists only in the R2 published
       catalog still gets its own card image. */
    const publishedItem =
      record
        ? null
        : await getPublishedCatalogItem(
            target
          );

    if (
      !record &&
      !publishedItem
    ) {
      return new Response(
        "MMicjMedia shared item was not found.",
        {
          status:
            404,

          headers:
            textHeaders()
        }
      );
    }

    item =
      record
        ? record.item
        : publishedItem;
  }

  if (!item) {
    return new Response(
      "MMicjMedia shared item is invalid.",
      {
        status:
          500,

        headers:
          textHeaders()
      }
    );
  }

  let thumbnailUrl =
    cleanMediaUrl(
      item?.thumbnail
    );

  if (!thumbnailUrl) {
    thumbnailUrl =
      OG_DEFAULT_THUMBNAIL;
  }

  const cacheKey =
    await ogCacheKey(
      thumbnailUrl
    );

  const stored =
    await readStoredOgImage(
      env,
      cacheKey
    );

  if (stored) {
    return stored;
  }

  const OG_SOURCE_FETCH = {
    cf: {
      cacheTtl:
        86400,

      cacheEverything:
        true
    }
  };

  let usedFallbackThumbnail =
    false;

  let baseResponse =
    await fetch(
      thumbnailUrl,
      OG_SOURCE_FETCH
    );

  if (
    !baseResponse.ok ||
    !baseResponse.body
  ) {
    if (
      thumbnailUrl !==
      OG_DEFAULT_THUMBNAIL
    ) {
      usedFallbackThumbnail =
        true;

      baseResponse =
        await fetch(
          OG_DEFAULT_THUMBNAIL,
          OG_SOURCE_FETCH
        );
    }
  }

  if (
    !baseResponse.ok ||
    !baseResponse.body
  ) {
    return new Response(
      "MMicjMedia OG thumbnail could not be loaded.",
      {
        status:
          502,

        headers:
          textHeaders()
      }
    );
  }

  const logoResponse =
    await fetch(
      OG_LOGO,
      OG_SOURCE_FETCH
    );

  if (
    !logoResponse.ok ||
    !logoResponse.body
  ) {
    return new Response(
      "MMicjMedia OG logo could not be loaded.",
      {
        status:
          502,

        headers:
          textHeaders()
      }
    );
  }

  /*
   * The Images binding bills every .output() call and, once the
   * free allowance is used up, throws. A link preview with a plain
   * (un-badged) thumbnail is far better than a broken one, so any
   * failure while composing sends the crawler to the thumbnail
   * itself. The redirect is cached briefly so a burst of crawlers
   * does not retry the transform each time.
   */
  const ogFallbackUrl =
    baseResponse.url ||
    thumbnailUrl;

  try {
    const composed =
      await composeOgImage(
        env,
        baseResponse,
        logoResponse
      );

    /* Keep it for next time, but never pin the stand-in picture
       used when the real thumbnail could not be loaded: it would
       outlive the outage. */
    if (
      composed.ok &&
      !usedFallbackThumbnail
    ) {
      try {
        const bytes =
          await composed
            .clone()
            .arrayBuffer();

        if (
          bytes.byteLength
        ) {
          const pending =
            storeOgImage(
              env,
              ctx,
              cacheKey,
              bytes
            );

          if (
            pending
          ) {
            await pending;
          }
        }
      } catch (error) {
        logLimited(
          "warn",
          "og-store",
          "MMicjMedia OG image store step failed:",
          error
        );
      }
    }

    return composed;
  } catch (error) {
    logLimited(
      "warn",
      "og-compose-failed",
      "MMicjMedia OG image composition failed; redirecting to the thumbnail:",
      error
    );

    return new Response(
      null,
      {
        status:
          302,

        headers: {
          "Location":
            ogFallbackUrl,

          "Cache-Control":
            "public, max-age=300"
        }
      }
    );
  }
}

async function composeOgImage(
  env,
  baseResponse,
  logoResponse
) {
  const baseStreams =
    baseResponse.body.tee();

  let imageInfo =
    null;

  try {
    imageInfo =
      await env.IMAGES.info(
        baseStreams[0]
      );
  } catch (error) {
    console.error(
      "MMicjMedia OG image info failed:",
      error
    );
  }

  let logoWidth =
    160;

  if (
    imageInfo &&
    Number.isFinite(
      Number(
        imageInfo.width
      )
    )
  ) {
    logoWidth =
      Math.round(
        Number(
          imageInfo.width
        ) * 0.16
      );

    logoWidth =
      Math.max(
        80,
        Math.min(
          240,
          logoWidth
        )
      );
  }

  let imagePipeline =
    env.IMAGES.input(
      baseStreams[1]
    );

  imagePipeline =
    imagePipeline.draw(
      env.IMAGES
        .input(
          logoResponse.body
        )
        .transform({
          width:
            logoWidth,

          fit:
            "contain"
        }),
      {
        bottom:
          18,

        right:
          18,

        opacity:
          0.88
      }
    );

  const result =
    await imagePipeline.output(
      {
        format:
          "image/webp",

        quality:
          85
      }
    );

  return result.response(
    {
      headers: {
        "Cache-Control":
          OG_CACHE_CONTROL
      }
    }
  );
}

/* =========================================================
   PDF RANGE PROXY (handler)
========================================================= */

async function handlePdfProxy(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const src =
    url.searchParams.get(
      "src"
    );

  if (!src) {
    return new Response(
      "Missing src parameter.",
      { status: 400 }
    );
  }

  let target;

  try {
    target =
      new URL(
        src
      );
  }
  catch (error) {
    return new Response(
      "Invalid src URL.",
      { status: 400 }
    );
  }

  if (
    target.protocol !== "https:" ||
    !PDF_PROXY_ALLOWED_HOSTS.has(
      target.hostname
    )
  ) {
    return new Response(
      "Source host is not allowed.",
      { status: 403 }
    );
  }

  if (
    !pdfProxyPathAllowed(
      env,
      target.pathname
    )
  ) {
    return new Response(
      "Source path is not allowed.",
      { status: 403 }
    );
  }

  /*
   * STREAMING PASS-THROUGH (no Worker-side caching)
   *
   * The previous version of this proxy downloaded the WHOLE PDF from
   * GCS on every request, tried to store it with the Cache API, and
   * then let the Cache API slice byte ranges out of that stored copy.
   * That cannot work on a *.workers.dev address: the Cache API is only
   * functional on custom domains there, so cache.put() stored nothing
   * and cache.match() never hit. Every request therefore fell through
   * to "return the full 200 body", and cloning that body for
   * cache.put() forced the Worker to hold the unread half of the copy
   * in memory. For a small PDF that goes unnoticed; for a large one
   * (a book with an embedded video, say) it exceeds the Worker's
   * memory limit and the visitor sees a bare HTTP 500.
   *
   * Instead, the visitor's Range header is forwarded to GCS, which
   * natively answers 206 Partial Content, and the response body is
   * streamed straight back without ever being buffered. Nothing is
   * cached by this code, so the original cache-poisoning problem (one
   * cached byte range served back for every other range) cannot occur
   * either. PDF.js gets real 206 responses and streams the book.
   */
  const upstreamHeaders=new Headers();
  const rangeHeader=request.headers.get("Range");
  if(rangeHeader) upstreamHeaders.set("Range",rangeHeader);
  const ifRangeHeader=request.headers.get("If-Range");
  if(ifRangeHeader) upstreamHeaders.set("If-Range",ifRangeHeader);
  /* Keep byte offsets and Content-Length meaning what they say. */
  upstreamHeaders.set("Accept-Encoding","identity");
  let upstreamResponse;
  try{
    upstreamResponse=await fetch(
      target.toString(),
      {
        method:request.method==="HEAD" ? "HEAD" : "GET",
        headers:upstreamHeaders
      }
    );
  }
  catch(error){
    return new Response(
      "Upstream PDF fetch failed: "+
        (error && error.message ? error.message : String(error)),
      { status: 502 }
    );
  }
  /* 200 and 206 are ok. 416 (range not satisfiable) is passed on to
     the browser as-is; anything else is an upstream failure. */
  if(!upstreamResponse.ok && upstreamResponse.status!==416){
    return new Response(
      "Upstream PDF fetch failed with status "+upstreamResponse.status+".",
      { status: 502 }
    );
  }
  const headers=new Headers();
  const passthroughHeaders=[
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "last-modified"
  ];
  for(const name of passthroughHeaders){
    const value=upstreamResponse.headers.get(name);
    if(value) headers.set(name,value);
  }
  if(!headers.has("content-type")) headers.set("content-type","application/pdf");
  headers.set("accept-ranges","bytes");
  headers.set("cache-control","public, max-age=86400");
  return new Response(
    upstreamResponse.body,
    {
      status:upstreamResponse.status,
      headers
    }
  );
}

/* =========================================================
   SHARE PRIME
========================================================= */

async function handleSharePrime(
  request,
  env
) {
  const corsHeaders = {
    "access-control-allow-origin":
      "*",

    "access-control-allow-methods":
      "POST, OPTIONS",

    "access-control-allow-headers":
      "Content-Type",

    "content-type":
      "application/json; charset=UTF-8",

    "cache-control":
      "no-store, no-cache, must-revalidate"
  };

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status:
          204,

        headers:
          corsHeaders
      }
    );
  }

  if (
    request.method !==
    "POST"
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Share-prime requires POST."
      }),
      {
        status:
          405,

        headers:
          corsHeaders
      }
    );
  }

  /* A prime may create the record an earlier miss was remembered for. */
  kvMissMemo.clear();

  let body;

  try {
    body =
      await request.json();
  } catch (_) {
    return new Response(
      JSON.stringify({
        error:
          "Invalid share-prime JSON."
      }),
      {
        status:
          400,

        headers:
          corsHeaders
      }
    );
  }

  const section =
    normalizeSection(
      body?.section
    );

  const id =
    String(
      body?.id || ""
    ).trim();

  const item =
    normalizeShareItem(
      body?.item
    );

  if (
    section &&
    id &&
    item
  ) {
    if (
      item.id !== id ||
      sectionFromItem(item) !==
        section
    ) {
      return new Response(
        JSON.stringify({
          error:
            "Share item identity does not match section/id."
        }),
        {
          status:
            400,

          headers:
            corsHeaders
        }
      );
    }

    const key =
      makeShareRecordKey(
        section,
        id
      );

    const record =
      JSON.stringify({
        version:
          1,

        section,

        id,

        item
      });

    try {
      await env.MEDIA_KV.put(
        key,
        record
      );

      const stored =
        await env.MEDIA_KV.get(
          key
        );

      if (
        stored !== record
      ) {
        throw new Error(
          "KV verification failed: stored value did not match the value written."
        );
      }
    } catch (error) {
      console.error(
        "MMicjMedia direct-share KV write failure:",
        error
      );

      return new Response(
        JSON.stringify({
          error:
            "MMicjMedia KV write failed.",

          detail:
            error instanceof Error
              ? error.message
              : String(error),

          key
        }),
        {
          status:
            500,

          headers:
            corsHeaders
        }
      );
    }

    const shareUrl =
      SKYMEDIA_BASE_URL +
      SHARE_PATH_PREFIX +
      encodeURIComponent(
        section
      ) +
      "/" +
      encodeURIComponent(
        id
      );

    return new Response(
      JSON.stringify({
        url:
          shareUrl,

        section,

        id
      }),
      {
        status:
          200,

        headers:
          corsHeaders
      }
    );
  }

  /* =======================================================
     LEGACY SR2 REGISTRATION
  ======================================================= */

  const payload =
    String(
      body?.contractz || ""
    ).trim();

  if (
    !isValidPayload(
      payload
    )
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Invalid share contract."
      }),
      {
        status:
          400,

        headers:
          corsHeaders
      }
    );
  }

  const key =
    makeKey(
      payload
    );

  try {
    await env.MEDIA_KV.put(
      key,
      payload
    );

    const stored =
      await kvGet(
        env,
        key
      );

    if (
      stored !== payload
    ) {
      throw new Error(
        "KV verification failed."
      );
    }
  } catch (error) {
    console.error(
      "MMicjMedia share-prime KV failure:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          "MMicjMedia KV write failed.",

        detail:
          error instanceof Error
            ? error.message
            : String(error)
      }),
      {
        status:
          500,

        headers:
          corsHeaders
      }
    );
  }

  return new Response(
    JSON.stringify({
      url:
        SKYMEDIA_BASE_URL +
        SHARE_PATH_PREFIX +
        key,

      key
    }),
    {
      status:
        200,

      headers:
        corsHeaders
    }
  );
}

/* =========================================================
   LEGACY ?k=<key>&contractz=<payload>
========================================================= */

async function handleLegacyPrime(
  request,
  env,
  keyParam,
  contractz
) {
  const key =
    String(
      keyParam || ""
    )
      .trim()
      .toUpperCase();

  if (
    !isValidKey(key) ||
    !isValidPayload(contractz)
  ) {
    return new Response(
      "MMicjMedia publication link is invalid.",
      {
        status:
          400,

        headers:
          textHeaders()
      }
    );
  }

  if (
    makeKey(contractz) !==
    key
  ) {
    return new Response(
      "MMicjMedia publication link is invalid.",
      {
        status:
          400,

        headers:
          textHeaders()
      }
    );
  }

  try {
    await env.MEDIA_KV.put(
      key,
      contractz
    );
  } catch (error) {
    console.error(
      "MMicjMedia legacy KV write failed:",
      error
    );

    return new Response(
      "MMicjMedia KV write failed: " +
      (
        error instanceof Error
          ? error.message
          : String(error)
      ),
      {
        status:
          500,

        headers:
          textHeaders()
      }
    );
  }

  const cleanUrl =
    new URL(
      request.url
    );

  cleanUrl.searchParams.delete(
    "contractz"
  );

  cleanUrl.searchParams.delete(
    "section"
  );

  cleanUrl.searchParams.delete(
    "id"
  );

  cleanUrl.searchParams.delete(
    "k"
  );

  cleanUrl.pathname =
    SHARE_PATH_PREFIX +
    key;

  return Response.redirect(
    cleanUrl.toString(),
    302
  );
}

/* =========================================================
   SHARE SUBRESOURCE FALLBACK
========================================================= */

async function serveShareSubresource(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const parts =
    url.pathname
      .slice(
        SHARE_PATH_PREFIX.length
      )
      .split("/")
      .filter(Boolean);

  if (
    parts.length < 2
  ) {
    return null;
  }

  const last =
    parts[parts.length - 1];

  if (
    !/\.[A-Za-z0-9]{2,6}$/.test(
      last
    )
  ) {
    return null;
  }

  for (
    let i = 0;
    i < parts.length;
    i++
  ) {
    const candidate =
      new URL(
        "/" +
          parts
            .slice(i)
            .join("/"),
        url
      );

    candidate.search =
      url.search;

    const assetResponse =
      await env.ASSETS.fetch(
        new Request(
          candidate.toString(),
          {
            method:
              "GET",

            headers:
              request.headers
          }
        )
      );

    if (
      assetResponse.ok
    ) {
      return assetResponse;
    }
  }

  return null;
}

/* =========================================================
   DIRECT SHARE ROUTER
========================================================= */

async function handleDirectShare(
  request,
  env
) {
  const target =
    getDirectShareTarget(
      new URL(
        request.url
      )
    );

  if (!target) {
    return null;
  }

  /*
   * Share Mode switched off: every /s/<section>/<id> link goes to the
   * main app instead (no KV read at all).
   */
  if (
    !isShareModeEnabled(
      env
    )
  ) {
    return redirectToAppItem(
      request,
      target
    );
  }

  /*
   * Catalog takes priority.
   *
   * This allows the canonical short URL to work from the
   * Catalog Source without requiring ShareManager to write
   * a share:v1 record first.
   */
  const catalogResponse =
    await serveCatalogShare(
      request,
      env,
      target
    );

  if (catalogResponse) {
    return catalogResponse;
  }

  return serveDirectShare(
    request,
    env,
    target
  );
}

/* =========================================================
   LEGACY /s/<16-character-key>
========================================================= */

async function handleShortShare(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const prefix =
    SHARE_PATH_PREFIX;

  if (
    !url.pathname.startsWith(
      prefix
    )
  ) {
    return null;
  }

  const key =
    url.pathname
      .slice(
        prefix.length
      )
      .split("/")[0]
      .trim()
      .toUpperCase();

  if (
    !isValidKey(
      key
    )
  ) {
    return new Response(
      "MMicjMedia publication key is invalid.",
      {
        status:
          400,

        headers:
          textHeaders()
      }
    );
  }

  let payload =
    null;

  try {
    payload =
      await kvGet(
        env,
        key
      );
  } catch (error) {
    console.error(
      "MMicjMedia short-link KV read failed:",
      error
    );

    return new Response(
      "MMicjMedia KV read failed: " +
      (
        error instanceof Error
          ? error.message
          : String(error)
      ),
      {
        status:
          500,

        headers:
          textHeaders()
      }
    );
  }

  if (!payload) {
    return friendlyResponse("unavailable", request, "MMicjMedia publication not found.");
  }

  if (
    !isValidPayload(
      payload
    )
  ) {
    return new Response(
      "MMicjMedia publication data is invalid.",
      {
        status:
          500,

        headers:
          textHeaders()
      }
    );
  }

  return serveWithContract(
    request,
    env,
    payload,
    key
  );
}

/* =========================================================
   TEMPORARY CATALOG PUBLISH TEST
========================================================= */

function catalogTestCorsHeaders() {
  return {
    "access-control-allow-origin":
      "*",

    "access-control-allow-methods":
      "POST, GET, OPTIONS",

    "access-control-allow-headers":
      "Content-Type, X-Sky-Catalog-Test-Token",

    "content-type":
      "application/json; charset=UTF-8",

    "cache-control":
      "no-store, no-cache, must-revalidate"
  };
}

/* ---------------------------------------------------------
   SNAPSHOT HELPERS
--------------------------------------------------------- */

async function sha256Hex(text) {
  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(
        text
      )
    );

  return Array.from(
    new Uint8Array(
      digest
    )
  )
    .map(
      byte =>
        byte
          .toString(16)
          .padStart(
            2,
            "0"
          )
    )
    .join("");
}

/*
 * Build the snapshot from the SAME cleaned items the per-item
 * records use (buildCatalogPreview), so the snapshot and the
 * share records can never disagree about an item.
 *
 * The payload has no timestamps, so identical catalogs always
 * produce the identical hash.
 */
async function buildCatalogSnapshot(
  contract,
  body
) {
  const preview =
    buildCatalogPreview(
      contract
    );

  const payload = {
    version:
      "1.0",

    content:
      preview.contract
  };

  /*
   * Optional extras. The Glide generator does not send these today;
   * they are accepted so the Front Page categories / background can
   * be carried later without another worker change.
   */
  const categories =
    Array.isArray(
      body?.frontPage?.categories
    )
      ? body.frontPage.categories
          .map(
            value =>
              cleanString(
                value
              )
          )
          .filter(
            Boolean
          )
      : [];

  if (
    categories.length
  ) {
    payload.frontPage = {
      categories
    };
  }

  const background =
    cleanString(
      body?.background
    );

  if (
    background
  ) {
    payload.background =
      background;
  }

  const json =
    JSON.stringify(
      payload
    );

  return {
    json,

    hash:
      await sha256Hex(
        CATALOG_SNAPSHOT_FORMAT +
        "\n" +
        json
      ),

    count:
      preview.contract.length,

    skippedCount:
      preview.skippedCount
  };
}

/*
 * KV allows roughly one write per second to the same key. A second
 * publish landing inside that window is retried once instead of
 * failing the whole publish.
 */
async function kvPutWithRetry(
  env,
  key,
  value,
  options
) {
  try {
    await env.MEDIA_KV.put(
      key,
      value,
      options
    );
  } catch (_) {
    await new Promise(
      resolve =>
        setTimeout(
          resolve,
          1100
        )
    );

    await env.MEDIA_KV.put(
      key,
      value,
      options
    );
  }
}

/*
 * Items the PREVIOUS snapshot already recorded, keyed exactly like the
 * per-item KV records. Because the snapshot is written LAST (after every
 * item record), an item that is identical in the previous snapshot is
 * known to be stored already, so the publish can skip its KV read.
 *
 * Returns null (=> fall back to the full per-item comparison) when the
 * previous snapshot is missing, unreadable, or from another format.
 */
function buildPreviousItemMap(
  snapshotValue
) {
  try {
    const parsed =
      JSON.parse(
        snapshotValue
      );

    if (
      !parsed ||
      !Array.isArray(
        parsed.content
      )
    ) {
      return null;
    }

    const map =
      new Map();

    for (
      const item of
      parsed.content
    ) {
      const section =
        sectionFromItem(
          item
        );

      if (
        !section ||
        !item ||
        !item.id
      ) {
        continue;
      }

      map.set(
        makeCatalogRecordKey(
          section,
          item.id
        ),
        item
      );
    }

    return map;
  } catch (_) {
    return null;
  }
}

/* Isolate-local copy of the snapshot (see CATALOG_SNAPSHOT_MEMORY_TTL_MS). */
let catalogSnapshotMemo =
  null;

function snapshotEtagMatches(
  request,
  etag
) {
  const header =
    request.headers.get(
      "If-None-Match"
    );

  if (!header) {
    return false;
  }

  return header
    .split(",")
    .map(
      value =>
        value
          .trim()
          .replace(
            /^W\//,
            ""
          )
    )
    .includes(
      etag
    );
}

async function handleCatalogSnapshot(
  request,
  env
) {
  const method =
    request.method;

  if (
    method !== "GET" &&
    method !== "HEAD"
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Catalog snapshot requires GET."
      }),
      {
        status:
          405,

        headers: {
          "Content-Type":
            "application/json; charset=utf-8",

          "Allow":
            "GET, HEAD",

          "Cache-Control":
            "no-store"
        }
      }
    );
  }

  const now =
    Date.now();

  let entry =
    catalogSnapshotMemo &&
    now -
      catalogSnapshotMemo.at <
      CATALOG_SNAPSHOT_MEMORY_TTL_MS
      ? catalogSnapshotMemo
      : null;

  if (!entry) {
    let stored;

    try {
      stored =
        await env.MEDIA_KV.getWithMetadata(
          CATALOG_SNAPSHOT_KEY
        );
    } catch (error) {
      logLimited(
        "error",
        "snapshot-kv-read",
        "MMicjMedia catalog snapshot KV read failure:",
        error
      );

      /*
       * Prefer an out-of-date snapshot over an error page: the
       * catalog changes rarely, so stale is almost always fine.
       */
      if (
        catalogSnapshotMemo
      ) {
        entry =
          catalogSnapshotMemo;
      } else {
        return new Response(
          JSON.stringify({
            error:
              "Catalog snapshot is temporarily unavailable."
          }),
          {
            status:
              503,

            headers: {
              "Content-Type":
                "application/json; charset=utf-8",

              "Retry-After":
                "30",

              "Cache-Control":
                "no-store"
            }
          }
        );
      }
    }

    if (!entry) {
      if (
        !stored ||
        stored.value === null
      ) {
        return new Response(
          JSON.stringify({
            error:
              "No catalog snapshot has been published yet."
          }),
          {
            status:
              404,

            headers: {
              "Content-Type":
                "application/json; charset=utf-8",

              "Cache-Control":
                "no-store"
            }
          }
        );
      }

      const hash =
        stored.metadata?.hash
          ? String(
              stored.metadata.hash
            )
          : await sha256Hex(
              stored.value
            );

      entry =
        catalogSnapshotMemo = {
          value:
            stored.value,

          etag:
            '"' +
            hash.slice(
              0,
              32
            ) +
            '"',

          at:
            now
        };
    }
  }

  const headers = {
    "Content-Type":
      "application/json; charset=utf-8",

    "Cache-Control":
      "public, max-age=" +
      CATALOG_SNAPSHOT_CLIENT_MAX_AGE,

    "ETag":
      entry.etag,

    "X-Content-Type-Options":
      "nosniff"
  };

  if (
    snapshotEtagMatches(
      request,
      entry.etag
    )
  ) {
    return new Response(
      null,
      {
        status:
          304,

        headers
      }
    );
  }

  return new Response(
    method === "HEAD"
      ? null
      : entry.value,
    {
      status:
        200,

      headers
    }
  );
}

/* ---------------------------------------------------------
   PUBLISH AUTHORIZATION

   The publish token can now be a Worker secret:

     npx wrangler secret put CATALOG_PUBLISH_TOKEN

   While the secret is set, both it and the original built-in
   token are accepted, so the Glide generator can be switched
   over without a gap. Once the generator sends the secret,
   set the plain variable CATALOG_DISABLE_LEGACY_TOKEN to any
   value (dashboard -> Variables) to stop accepting the
   built-in token.
--------------------------------------------------------- */

function tokensEqual(
  provided,
  expected
) {
  if (
    !provided ||
    !expected ||
    provided.length !== expected.length
  ) {
    return false;
  }

  let diff =
    0;

  for (
    let i = 0;
    i < expected.length;
    i++
  ) {
    diff |=
      provided.charCodeAt(i) ^
      expected.charCodeAt(i);
  }

  return diff === 0;
}

function catalogTestAuthorized(
  request,
  url,
  env
) {
  const headerToken =
    String(
      request.headers.get(
        "X-Sky-Catalog-Test-Token"
      ) || ""
    ).trim();

  const queryToken =
    String(
      url.searchParams.get(
        "token"
      ) || ""
    ).trim();

  const secret =
    String(
      env?.CATALOG_PUBLISH_TOKEN || ""
    ).trim();

  const acceptLegacy =
    !(
      secret &&
      env?.CATALOG_DISABLE_LEGACY_TOKEN
    );

  return [
    headerToken,
    queryToken
  ].some(
    token =>
      (
        secret &&
        tokensEqual(
          token,
          secret
        )
      ) ||
      (
        acceptLegacy &&
        tokensEqual(
          token,
          CATALOG_TEST_TOKEN
        )
      )
  );
}

async function handleCatalogPublishTest(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  const headers =
    catalogTestCorsHeaders();

  if (
    request.method ===
    "OPTIONS"
  ) {
    return new Response(
      null,
      {
        status:
          204,

        headers
      }
    );
  }

  if (
    !catalogTestAuthorized(
      request,
      url,
      env
    )
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Catalog publish authorization failed."
      }),
      {
        status:
          401,

        headers
      }
    );
  }

  /* =======================================================
     GET
  ======================================================= */

  if (
    request.method ===
    "GET"
  ) {
    const section =
      normalizeSection(
        url.searchParams.get(
          "section"
        ) || ""
      );

    const id =
      String(
        url.searchParams.get(
          "id"
        ) || ""
      ).trim();

    if (
      section &&
      id
    ) {
      const key =
        makeCatalogRecordKey(
          section,
          id
        );

      let stored;

      try {
        stored =
          await env.MEDIA_KV.get(
            key
          );
      } catch (error) {
        console.error(
          "MMicjMedia catalog item KV read failure:",
          error
        );

        return new Response(
          JSON.stringify({
            error:
              "Catalog item KV read failed.",

            detail:
              error instanceof Error
                ? error.message
                : String(error),

            key
          }),
          {
            status:
              500,

            headers
          }
        );
      }

      if (!stored) {
        return new Response(
          JSON.stringify({
            found:
              false,

            section,

            id,

            key
          }),
          {
            status:
              404,

            headers
          }
        );
      }

      return new Response(
        stored,
        {
          status:
            200,

          headers
        }
      );
    }

    let statusRecord;

    try {
      statusRecord =
        await env.MEDIA_KV.get(
          CATALOG_TEST_STATUS_KEY
        );
    } catch (error) {
      console.error(
        "MMicjMedia catalog status KV read failure:",
        error
      );

      return new Response(
        JSON.stringify({
          error:
            "Catalog status KV read failed.",

          detail:
            error instanceof Error
              ? error.message
              : String(error),

          key:
            CATALOG_TEST_STATUS_KEY
        }),
        {
          status:
            500,

          headers
        }
      );
    }

    return new Response(
      statusRecord ||
        JSON.stringify({
          received:
            false,

          message:
            "No catalog publish has been received yet."
        }),
      {
        status:
          200,

        headers
      }
    );
  }

  /* =======================================================
     POST
  ======================================================= */

  if (
    request.method !==
    "POST"
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Catalog publish requires POST."
      }),
      {
        status:
          405,

        headers
      }
    );
  }

  let body;

  try {
    body =
      await request.json();
  } catch (_) {
    return new Response(
      JSON.stringify({
        error:
          "Invalid catalog publish JSON."
      }),
      {
        status:
          400,

        headers
      }
    );
  }

  const contract =
    Array.isArray(
      body?.contract
    )
      ? body.contract
      : null;

  if (
    !contract ||
    contract.length === 0
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Catalog publish contains no contract items."
      }),
      {
        status:
          400,

        headers
      }
    );
  }

  /* =======================================================
     STAGE 1 — PREVIEW ONLY
  ======================================================= */

  /*
   * IMPORTANT:
   *
   * Preview must perform ZERO KV writes.
   *
   * This lets us verify the Glide cleanup independently
   * before allowing the catalog publisher to modify KV.
   */
  if (
    body?.preview === true
  ) {
    const preview =
      buildCatalogPreview(
        contract
      );

    return new Response(
      JSON.stringify(
        preview
      ),
      {
        status:
          200,

        headers
      }
    );
  }

  /* =======================================================
     ACTUAL CATALOG PUBLISH
  ======================================================= */

  const publishedAt =
    new Date()
      .toISOString();

  /* =======================================================
     SNAPSHOT GATE

     1 KV read decides whether anything needs doing at all:

       - same catalog as the stored snapshot -> nothing is
         read or written per item, and no write happens.
       - far fewer items than before -> refused, nothing is
         written (send force:true to replace anyway).

     Items are written first and the snapshot LAST, so a
     matching hash always means the items were fully written.
  ======================================================= */

  let snapshot;

  try {
    snapshot =
      await buildCatalogSnapshot(
        contract,
        body
      );
  } catch (error) {
    console.error(
      "MMicjMedia catalog snapshot build failure:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          "Catalog snapshot could not be built.",

        detail:
          error instanceof Error
            ? error.message
            : String(error)
      }),
      {
        status:
          500,

        headers
      }
    );
  }

  if (
    snapshot.count === 0
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Catalog publish contains no valid items; nothing was written.",

        contractItemCount:
          contract.length,

        skippedCount:
          snapshot.skippedCount
      }),
      {
        status:
          422,

        headers
      }
    );
  }

  let previousSnapshot;

  try {
    previousSnapshot =
      await env.MEDIA_KV.getWithMetadata(
        CATALOG_SNAPSHOT_KEY
      );
  } catch (error) {
    console.error(
      "MMicjMedia catalog snapshot KV read failure:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          "Catalog snapshot KV read failed.",

        detail:
          error instanceof Error
            ? error.message
            : String(error),

        key:
          CATALOG_SNAPSHOT_KEY
      }),
      {
        status:
          500,

        headers
      }
    );
  }

  const previousMeta =
    previousSnapshot?.metadata &&
    typeof previousSnapshot.metadata === "object"
      ? previousSnapshot.metadata
      : null;

  const hadPrevious =
    previousSnapshot?.value !== null &&
    previousSnapshot?.value !== undefined;

  if (
    hadPrevious &&
    body?.force !== true &&
    previousMeta?.hash === snapshot.hash
  ) {
    return new Response(
      JSON.stringify({
        received:
          true,

        phase:
          2,

        receivedAt:
          publishedAt,

        method:
          request.method,

        test:
          body?.test === true,

        source:
          String(
            body?.source || ""
          ),

        contractItemCount:
          contract.length,

        storedCount:
          0,

        unchangedCount:
          snapshot.count,

        skippedCount:
          snapshot.skippedCount,

        sample:
          [],

        snapshot: {
          action:
            "unchanged",

          count:
            snapshot.count,

          hash:
            snapshot.hash
        }
      }),
      {
        status:
          200,

        headers
      }
    );
  }

  const previousCount =
    Number(
      previousMeta?.count
    ) || 0;

  if (
    hadPrevious &&
    body?.force !== true &&
    previousCount >=
      CATALOG_SNAPSHOT_GUARD_MIN_PREVIOUS &&
    snapshot.count <
      previousCount *
        CATALOG_SNAPSHOT_MIN_RETAIN_RATIO
  ) {
    return new Response(
      JSON.stringify({
        error:
          "Catalog publish refused: it keeps far fewer items than the current snapshot. Nothing was written.",

        previousItemCount:
          previousCount,

        incomingItemCount:
          snapshot.count,

        hint:
          "If this reduction is intended, publish again with force (generator p3 = publish-force)."
      }),
      {
        status:
          409,

        headers
      }
    );
  }

  /*
   * Compare against the previous snapshot in memory instead of reading
   * every item record from KV. publish-force (force:true) skips this
   * shortcut and re-checks every record against KV, which also repairs
   * any record that was deleted by hand.
   */
  const previousItems =
    hadPrevious &&
    body?.force !== true &&
    previousMeta?.v ===
      CATALOG_SNAPSHOT_FORMAT
      ? buildPreviousItemMap(
          previousSnapshot.value
        )
      : null;

  let storedCount =
    0;

  let skippedCount =
    0;

  let unchangedCount =
    0;

  const sample =
    [];

  try {
    for (
      const rawItem of
      contract
    ) {
      /*
       * IMPORTANT:
       *
       * Use the proven Glide cleanup BEFORE
       * normalizeShareItem().
       */
      const item =
        normalizeCatalogPublishItem(
          rawItem
        );

      if (!item) {
        skippedCount++;
        continue;
      }

      const section =
        sectionFromItem(
          item
        );

      if (!section) {
        skippedCount++;
        continue;
      }

      const key =
        makeCatalogRecordKey(
          section,
          item.id
        );

      const record = {
        version:
          "1.0",

        section,

        id:
          item.id,

        item,

        publishedAt
      };

      /*
       * Identical to the previous snapshot -> already stored; no read.
       */
      if (
        previousItems
      ) {
        const previousItem =
          previousItems.get(
            key
          );

        if (
          previousItem &&
          catalogRecordsEqual(
            {
              version:
                record.version,

              section,

              id:
                item.id,

              item:
                previousItem
            },
            record
          )
        ) {
          unchangedCount++;

          if (
            sample.length < 10
          ) {
            sample.push({
              section,
              id:
                item.id,
              key,
              action:
                "unchanged"
            });
          }

          continue;
        }
      }

      /*
       * Idempotent publish: read the existing record first and
       * write only when the catalog content is new or changed.
       *
       * This means a repeated request with the same contract is
       * effectively a zero-item-write operation.
       */
      let existingRaw;

      try {
        existingRaw =
          await getCatalogRecordForPublish(
            env,
            key
          );
      } catch (error) {
        throw new Error(
          "Catalog comparison KV read failed for " +
          key +
          ": " +
          (
            error instanceof Error
              ? error.message
              : String(error)
          )
        );
      }

      let existingRecord = null;

      if (existingRaw) {
        try {
          existingRecord =
            JSON.parse(existingRaw);
        } catch (_) {
          /*
           * A malformed existing record is treated as changed so
           * the publish can repair it.
           */
          existingRecord = null;
        }
      }

      if (
        catalogRecordsEqual(
          existingRecord,
          record
        )
      ) {
        unchangedCount++;

        if (
          sample.length < 10
        ) {
          sample.push({
            section,

            id:
              item.id,

            key,

            action:
              "unchanged"
          });
        }

        continue;
      }

      await env.MEDIA_KV.put(
        key,
        JSON.stringify(
          record
        )
      );

      storedCount++;

      if (
        sample.length < 10
      ) {
        sample.push({
          section,

          id:
            item.id,

          key,

          action:
            existingRecord
              ? "updated"
              : "created"
        });
      }
    }

    /* -------------------------------------------------------
       SNAPSHOT WRITE (last)

       Keep the previous snapshot as a one-step rollback copy,
       then write the new one and verify it with an uncached read.
    ------------------------------------------------------- */

    if (
      hadPrevious
    ) {
      await kvPutWithRetry(
        env,
        CATALOG_SNAPSHOT_PREV_KEY,
        previousSnapshot.value,
        {
          metadata:
            previousMeta || {}
        }
      );
    }

    await kvPutWithRetry(
      env,
      CATALOG_SNAPSHOT_KEY,
      snapshot.json,
      {
        metadata: {
          hash:
            snapshot.hash,

          count:
            snapshot.count,

          at:
            publishedAt,

          v:
            CATALOG_SNAPSHOT_FORMAT
        }
      }
    );

    const snapshotReadBack =
      await env.MEDIA_KV.getWithMetadata(
        CATALOG_SNAPSHOT_KEY
      );

    if (
      snapshotReadBack?.metadata?.hash !==
      snapshot.hash
    ) {
      throw new Error(
        "Catalog snapshot KV verification failed."
      );
    }

    /* This isolate serves the new snapshot immediately. */
    catalogSnapshotMemo =
      null;

    /* ...and no longer trusts an earlier "not found". */
    kvMissMemo.clear();

    const snapshotResult = {
      action:
        hadPrevious
          ? "updated"
          : "created",

      count:
        snapshot.count,

      hash:
        snapshot.hash
    };

    const statusRecord = {
      received:
        true,

      phase:
        2,

      receivedAt:
        publishedAt,

      method:
        request.method,

      test:
        body?.test === true,

      source:
        String(
          body?.source || ""
        ),

      contractItemCount:
        contract.length,

      storedCount,

      unchangedCount,

      skippedCount,

      sample,

      snapshot:
        snapshotResult
    };

    const statusJson =
  JSON.stringify(
    statusRecord
  );

if (storedCount > 0) {
  await env.MEDIA_KV.put(
    CATALOG_TEST_STATUS_KEY,
    statusJson
  );

  /*
   * Uncached verification of the status record.
   *
   * Only verify it when this publish actually wrote
   * catalog data and therefore wrote a new status record.
   */
  const statusReadBack =
    await env.MEDIA_KV.get(
      CATALOG_TEST_STATUS_KEY
    );

  if (
    statusReadBack !==
    statusJson
  ) {
    throw new Error(
      "Catalog status KV verification failed."
    );
  }
}

    if (
      sample.length > 0
    ) {
      const firstStored =
        await env.MEDIA_KV.get(
          sample[0].key
        );

      if (!firstStored) {
        throw new Error(
          "First catalog item KV verification failed."
        );
      }
    }

    return new Response(
      JSON.stringify(
        statusRecord
      ),
      {
        status:
          200,

        headers
      }
    );
  } catch (error) {
    console.error(
      "MMicjMedia catalog publish KV failure:",
      error
    );

    return new Response(
      JSON.stringify({
        error:
          "Catalog publish KV write/verification failed.",

        detail:
          error instanceof Error
            ? error.message
            : String(error)
      }),
      {
        status:
          500,

        headers
      }
    );
  }
}

/* =========================================================
   BASE URL PREVIEW (handlers)
========================================================= */

let basePreviewMemo =
  null;

/* The parsed catalog snapshot, kept for as long as the snapshot text
   is unchanged, so looking up the item a state link points at does
   not re-parse the whole catalog on every request. */
let baseParsedMemo =
  null;

/* "now" as YYYYMMDDHHmm in BASE_PREVIEW_TIMEZONE. */
function baseNowKey(
  date = new Date()
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          BASE_PREVIEW_TIMEZONE,

        year:
          "numeric",

        month:
          "2-digit",

        day:
          "2-digit",

        hour:
          "2-digit",

        minute:
          "2-digit",

        hourCycle:
          "h23"
      }
    ).formatToParts(
      date
    );

  const p = {};

  for (
    const part of
    parts
  ) {
    p[part.type] =
      part.value;
  }

  return (
    p.year +
    p.month +
    p.day +
    p.hour +
    p.minute
  );
}

/* Same rules as SkyDate.key() / SkyDate.validKey() in
   js/dateVisibility.js. Returns "" for a missing or invalid date. */
function baseDateKey(
  value
) {
  let d =
    String(
      value ?? ""
    )
      .trim()
      .replace(
        /[^0-9]/g,
        ""
      );

  if (
    /^\d{8}$/.test(
      d
    )
  ) {
    d += "0000";
  }

  if (
    !/^\d{12}$/.test(
      d
    )
  ) {
    return "";
  }

  const y =
    Number(d.slice(0, 4));

  const mo =
    Number(d.slice(4, 6));

  const day =
    Number(d.slice(6, 8));

  const h =
    Number(d.slice(8, 10));

  const mi =
    Number(d.slice(10, 12));

  if (
    mo < 1 ||
    mo > 12 ||
    day < 1 ||
    h > 23 ||
    mi > 59
  ) {
    return "";
  }

  const daysInMonth =
    new Date(
      Date.UTC(
        y,
        mo,
        0
      )
    ).getUTCDate();

  return day > daysInMonth
    ? ""
    : d;
}

/*
 * Mirrors resolveDoors() in js/frontPage.js: the newest visible item
 * of each of the seven categories, and of those seven the newest one
 * is the centerpiece. Ties go to the earlier item, as in the app.
 */
function pickBaseCenterpiece(
  snapshot,
  nowKey
) {
  const items =
    Array.isArray(
      snapshot?.content
    )
      ? snapshot.content
      : [];

  const configured =
    Array.isArray(
      snapshot?.frontPage?.categories
    )
      ? snapshot.frontPage.categories
          .map(
            value =>
              cleanString(
                value
              )
          )
          .filter(
            Boolean
          )
      : [];

  const categories =
    configured.length === 7
      ? configured
      : BASE_PREVIEW_CATEGORIES;

  const visible =
    [];

  for (
    const item of
    items
  ) {
    const category =
      cleanString(
        item?.category
      ).toLowerCase();

    const date =
      baseDateKey(
        item?.date
      );

    if (
      !category ||
      !date ||
      date > nowKey
    ) {
      continue;
    }

    visible.push({
      item,
      category,
      date
    });
  }

  let best =
    null;

  for (
    const name of
    categories
  ) {
    const wanted =
      name.toLowerCase();

    let categoryBest =
      null;

    for (
      const entry of
      visible
    ) {
      if (
        entry.category ===
          wanted &&
        (
          !categoryBest ||
          entry.date >
            categoryBest.date
        )
      ) {
        categoryBest =
          entry;
      }
    }

    if (
      categoryBest &&
      (
        !best ||
        categoryBest.date >
          best.date
      )
    ) {
      best =
        categoryBest;
    }
  }

  return best
    ? best.item
    : null;
}

/* The catalog snapshot text, through the same per-isolate memory the
   /__sky_catalog route uses (so the two share one KV read a minute). */
async function getCatalogSnapshotText(
  env
) {
  const now =
    Date.now();

  if (
    catalogSnapshotMemo &&
    now -
      catalogSnapshotMemo.at <
      CATALOG_SNAPSHOT_MEMORY_TTL_MS
  ) {
    return catalogSnapshotMemo.value;
  }

  try {
    const stored =
      await env.MEDIA_KV.getWithMetadata(
        CATALOG_SNAPSHOT_KEY
      );

    if (
      !stored ||
      stored.value === null
    ) {
      return catalogSnapshotMemo
        ? catalogSnapshotMemo.value
        : null;
    }

    const hash =
      stored.metadata?.hash
        ? String(
            stored.metadata.hash
          )
        : await sha256Hex(
            stored.value
          );

    catalogSnapshotMemo = {
      value:
        stored.value,

      etag:
        '"' +
        hash.slice(
          0,
          32
        ) +
        '"',

      at:
        now
    };

    return stored.value;
  } catch (error) {
    logLimited(
      "error",
      "base-preview-snapshot-kv",
      "MMicjMedia base preview snapshot KV read failure:",
      error
    );

    return catalogSnapshotMemo
      ? catalogSnapshotMemo.value
      : null;
  }
}

/* The current Front Page centerpiece item, or null. Never throws. */
async function getBaseCenterpiece(
  env
) {
  const now =
    Date.now();

  if (
    basePreviewMemo &&
    now -
      basePreviewMemo.at <
      BASE_PREVIEW_MEMORY_TTL_MS
  ) {
    return basePreviewMemo.item;
  }

  let item =
    null;

  try {
    const text =
      await getCatalogSnapshotText(
        env
      );

    if (text) {
      item =
        pickBaseCenterpiece(
          JSON.parse(
            text
          ),
          baseNowKey()
        );
    }
  } catch (error) {
    logLimited(
      "warn",
      "base-preview-pick",
      "MMicjMedia base preview could not choose a centerpiece:",
      error
    );
  }

  basePreviewMemo = {
    item,
    at:
      now
  };

  return item;
}

/*
 * STATE LINKS  ( /?view=<section>[&item=<section>/<id>] )
 *
 * The app keeps the browser's address bar in step with what is
 * open (js/browserAddress.js), so the browser's own share command
 * shares a link that reflects the open item or section. For such a
 * link the card shows that item's own thumbnail and title, or the
 * base logo when no item is open (or it cannot be found).
 *
 * The bare base URL (no parameters) is unchanged: it keeps the
 * Front Page centerpiece card used by the in-app Front Page share.
 */
const BASE_STATE_VIEWS =
  new Set([
    "front",
    "reader",
    "video",
    "slideshow"
  ]);

/* "video/abc" -> { section: "video", id: "abc" }, or null. */
function parseBaseStateItem(
  value
) {
  const text =
    String(
      value || ""
    ).trim();

  const cut =
    text.indexOf(
      "/"
    );

  if (
    cut < 1
  ) {
    return null;
  }

  const section =
    normalizeSection(
      text.slice(
        0,
        cut
      )
    );

  const id =
    text.slice(
      cut + 1
    );

  return isPlausibleShareTarget(
    section,
    id
  )
    ? {
        section,
        id
      }
    : null;
}

/* The catalog item with this section and id, from the snapshot the
   base preview already reads. Never throws; null when not found. */
/* =========================================================
   R2 PUBLISHED CATALOG  (preview fallback)

   The admin portal publishes the catalog to R2 as one public
   file (the same file the app reads in js/manifest.js). The
   KV catalog snapshot only knows what the Glide publish wrote,
   so an item that exists only in R2 had no preview card.

   Preview lookups therefore fall back to that file when KV has
   no match: no KV read, no R2 binding, and at most one fetch
   per isolate per PUBLISHED_CATALOG_MEMORY_TTL_MS (5 minutes,
   the same as the file's own max-age). Items that are not
   released yet are never previewed, the same rule the app
   applies (SkyDate.isVisible).

   The memory copy is the ONLY cache layer on purpose: the
   subrequest is not edge-cached as well, so the two never add
   up. When an item is deleted in the admin portal (which
   rewrites published.json straight away), its preview card and
   its /s/ link stop working within 5 minutes.
========================================================= */

/* =========================================================
   SHARE MODE SWITCH

   true   Individual-item links are Share Mode links:
            /s/<section>/<id>  ->  the standalone Share Viewer.
          The in-app and in-viewer Share buttons create /s/ links,
          and a link copied from the browser address bar
          (/?view=<section>&item=<section>/<id>) is handed to the
          Share Viewer when someone arrives at it (see the small
          script at the top of index.html).

   false  Individual-item links open the item inside the main app:
            /?view=<section>&item=<section>/<id>
          The Share buttons create those links, and any /s/ link
          still in circulation is redirected to them.
          (Old 16-character /s/<key> links keep working either way.)

   To switch: change the constant below and deploy, or set a
   Worker variable named SHARE_MODE_ENABLED to "true" / "false"
   (when it is set it wins; no deploy needed). The page tells the
   browser which way it is set, so the Worker and the app can
   never disagree.
========================================================= */

const SHARE_MODE_ENABLED =
  true;

function isShareModeEnabled(
  env
) {
  const raw =
    env &&
    env.SHARE_MODE_ENABLED !== undefined &&
    env.SHARE_MODE_ENABLED !== null
      ? String(
          env.SHARE_MODE_ENABLED
        )
          .trim()
          .toLowerCase()
      : "";

  if (
    [
      "false",
      "0",
      "off",
      "no"
    ].includes(
      raw
    )
  ) {
    return false;
  }

  if (
    [
      "true",
      "1",
      "on",
      "yes"
    ].includes(
      raw
    )
  ) {
    return true;
  }

  return SHARE_MODE_ENABLED;
}

const PUBLISHED_CATALOG_URL =
  "https://media.mmicj.com/catalog/published.json";

const PUBLISHED_CATALOG_MEMORY_TTL_MS =
  300000;

/* After a failed read, try again after this long, not on every request. */
const PUBLISHED_CATALOG_RETRY_MS =
  30000;

const PUBLISHED_CATALOG_TIMEOUT_MS =
  4000;

/* { items: Map("<section>/<id>" -> cleaned item), at } */
let publishedCatalogMemo =
  null;

let publishedCatalogPending =
  null;

async function loadPublishedCatalogIndex() {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      PUBLISHED_CATALOG_TIMEOUT_MS
    );

  try {
    const response =
      await fetch(
        PUBLISHED_CATALOG_URL,
        {
          signal:
            controller.signal
        }
      );

    if (!response.ok) {
      throw new Error(
        "Published catalog request failed (" +
        response.status +
        ")."
      );
    }

    const data =
      await response.json();

    if (
      !data ||
      !Array.isArray(
        data.content
      )
    ) {
      throw new Error(
        "Published catalog has no content list."
      );
    }

    const items =
      new Map();

    for (
      const raw of
      data.content
    ) {
      const item =
        normalizeCatalogPublishItem(
          raw
        );

      if (!item) {
        continue;
      }

      const section =
        sectionFromItem(
          item
        );

      if (!section) {
        continue;
      }

      items.set(
        section +
          "/" +
          item.id,
        item
      );
    }

    return items;
  } finally {
    clearTimeout(
      timer
    );
  }
}

async function getPublishedCatalogItem(
  target
) {
  try {
    const now =
      Date.now();

    if (
      !publishedCatalogMemo ||
      now -
        publishedCatalogMemo.at >=
        PUBLISHED_CATALOG_MEMORY_TTL_MS
    ) {
      if (!publishedCatalogPending) {
        publishedCatalogPending =
          loadPublishedCatalogIndex()
            .then(
              items => {
                publishedCatalogMemo = {
                  items,
                  at:
                    Date.now()
                };
              }
            )
            .catch(
              error => {
                logLimited(
                  "warn",
                  "published-catalog",
                  "MMicjMedia could not read the R2 published catalog:",
                  error
                );

                publishedCatalogMemo = {
                  items:
                    publishedCatalogMemo
                      ? publishedCatalogMemo.items
                      : new Map(),

                  at:
                    Date.now() -
                    (
                      PUBLISHED_CATALOG_MEMORY_TTL_MS -
                      PUBLISHED_CATALOG_RETRY_MS
                    )
                };
              }
            )
            .finally(
              () => {
                publishedCatalogPending =
                  null;
              }
            );
      }

      await publishedCatalogPending;
    }

    const item =
      publishedCatalogMemo
        ? publishedCatalogMemo.items.get(
            target.section +
              "/" +
              target.id
          )
        : null;

    if (!item) {
      return null;
    }

    const date =
      baseDateKey(
        item.date
      );

    return date &&
      date <=
        baseNowKey()
      ? item
      : null;
  } catch (error) {
    return null;
  }
}

/* The item a state link points at: the KV catalog snapshot first
   (unchanged behaviour), then the R2 published catalog. */
async function getBaseSnapshotItem(
  env,
  target
) {
  const fromSnapshot =
    await getKvSnapshotItem(
      env,
      target
    );

  if (fromSnapshot) {
    return fromSnapshot;
  }

  return getPublishedCatalogItem(
    target
  );
}

async function getKvSnapshotItem(
  env,
  target
) {
  try {
    const text =
      await getCatalogSnapshotText(
        env
      );

    if (!text) {
      return null;
    }

    if (
      !baseParsedMemo ||
      baseParsedMemo.text !==
        text
    ) {
      const parsed =
        JSON.parse(
          text
        );

      baseParsedMemo = {
        text,

        items:
          Array.isArray(
            parsed?.content
          )
            ? parsed.content
            : []
      };
    }

    for (
      const item of
      baseParsedMemo.items
    ) {
      if (
        cleanString(
          item?.id
        ) ===
          target.id &&
        sectionFromItem(
          item
        ) ===
          target.section
      ) {
        return item;
      }
    }

    return null;
  } catch (error) {
    logLimited(
      "warn",
      "base-state-item",
      "MMicjMedia base preview could not look up the item:",
      error
    );

    return null;
  }
}

function buildBaseOgTags(
  origin,
  item,
  options = {}
) {
  const section =
    item
      ? sectionFromItem(
          item
        )
      : "";

  const id =
    item
      ? cleanString(
          item.id
        )
      : "";

  const thumbnail =
    item
      ? cleanMediaUrl(
          item.thumbnail
        )
      : "";

  let imageUrl;
  let width;
  let height;

  /* Only an absolute http(s) thumbnail can be composed by the OG
     image route; anything else goes straight to the fallback. */
  if (
    section &&
    isPlausibleShareTarget(
      section,
      id
    ) &&
    /^https?:\/\//i.test(
      thumbnail
    )
  ) {
    const image =
      new URL(
        OG_IMAGE_PATH,
        origin
      );

    image.searchParams.set(
      "section",
      section
    );

    image.searchParams.set(
      "id",
      id
    );

    image.searchParams.set(
      "base",
      "1"
    );

    imageUrl =
      image.toString();

    width =
      1200;

    height =
      630;
  } else {
    const fallback =
      options.fallbackImage || {
        path:
          BASE_LOGO_PATH,

        size:
          BASE_LOGO_SIZE
      };

    imageUrl =
      origin +
      fallback.path;

    width =
      fallback.size;

    height =
      fallback.size;
  }

  const pageUrl =
    options.pageUrl ||
    (
      origin +
      "/"
    );

  const title =
    options.title ||
    BASE_PREVIEW_TITLE;

  return (
    `<meta property="og:type" content="website">` +
    `<meta property="og:title" content="${escapeHtml(title)}">` +
    `<meta property="og:site_name" content="${escapeHtml(OG_SITE_NAME)}">` +
    `<meta property="og:url" content="${escapeHtml(pageUrl)}">` +
    `<meta property="og:image" content="${escapeHtml(imageUrl)}">` +
    `<meta property="og:image:width" content="${width}">` +
    `<meta property="og:image:height" content="${height}">` +
    `<meta name="twitter:card" content="summary_large_image">`
  );
}

/*
 * GET / : the normal application page with the preview tags added.
 *
 * Any failure serves the plain page exactly as before this existed,
 * and links carrying a Glide contract (?contractz=, ?contract=, ?k=)
 * are passed straight through untouched.
 */
async function serveBasePage(
  request,
  env
) {
  const url =
    new URL(
      request.url
    );

  if (
    url.searchParams.has(
      "contractz"
    ) ||
    url.searchParams.has(
      "contract"
    ) ||
    url.searchParams.has(
      "k"
    )
  ) {
    return env.ASSETS.fetch(
      request
    );
  }

  try {
    let assetResponse =
      null;

    for (
      const path of
      [
        "/index.html",
        "/"
      ]
    ) {
      const candidate =
        await env.ASSETS.fetch(
          new Request(
            new URL(
              path,
              url.origin
            ).toString(),
            {
              method:
                "GET"
            }
          )
        );

      if (
        candidate.ok
      ) {
        assetResponse =
          candidate;

        break;
      }
    }

    if (
      !assetResponse
    ) {
      return env.ASSETS.fetch(
        request
      );
    }

    /* Link-preview crawlers can arrive over plain http (a pasted
       "mmicj.com" is treated as http://). The preview image and
       page address must always be https. */
    const origin =
      url.origin.replace(
        /^http:/i,
        "https:"
      );

    const view =
      normalizeSection(
        url.searchParams.get(
          "view"
        )
      );

    const stateItem =
      parseBaseStateItem(
        url.searchParams.get(
          "item"
        )
      );

    let tags;

    if (
      BASE_STATE_VIEWS.has(
        view
      ) ||
      stateItem
    ) {
      /* State link: the open item's own card, else the base logo. */
      const item =
        stateItem
          ? await getBaseSnapshotItem(
              env,
              stateItem
            )
          : null;

      const pageUrl =
        new URL(
          "/",
          origin
        );

      if (
        BASE_STATE_VIEWS.has(
          view
        )
      ) {
        pageUrl.searchParams.set(
          "view",
          view
        );
      }

      if (
        item
      ) {
        pageUrl.searchParams.set(
          "item",
          stateItem.section +
            "/" +
            stateItem.id
        );
      }

      tags =
        buildBaseOgTags(
          origin,
          item,
          {
            pageUrl:
              pageUrl.toString(),

            title:
              cleanString(
                item?.title
              )
          }
        );
    } else {
      tags =
        buildBaseOgTags(
          origin,
          FRONT_PREVIEW_USES_CENTERPIECE
            ? await getBaseCenterpiece(
                env
              )
            : null,
          {
            fallbackImage: {
              path:
                FRONT_PREVIEW_IMAGE_PATH,

              size:
                FRONT_PREVIEW_IMAGE_SIZE
            }
          }
        );
    }

    const transformed =
      new HTMLRewriter()
        .on(
          "head",
          {
            element(
              element
            ) {
              /* First thing in <head>, so the arrival script at the top
                 of index.html can read it. */
              element.prepend(
                "<script>window.__SKY_SHARE_MODE_ENABLED = " +
                  (
                    isShareModeEnabled(
                      env
                    )
                      ? "true"
                      : "false"
                  ) +
                  ";</script>",
                {
                  html:
                    true
                }
              );

              element.append(
                tags,
                {
                  html:
                    true
                }
              );
            }
          }
        )
        .transform(
          assetResponse
        );

    return new Response(
      transformed.body,
      {
        status:
          200,

        headers: {
          "content-type":
            "text/html; charset=UTF-8",

          "cache-control":
            "public, max-age=0, must-revalidate"
        }
      }
    );
  } catch (error) {
    logLimited(
      "error",
      "base-page",
      "MMicjMedia base page preview failed; serving the plain page:",
      error
    );

    return env.ASSETS.fetch(
      request
    );
  }
}

/*
 * The base URL's preview image: the existing OG image route, except
 * that any failure sends the crawler to assets/base-logo.jpg instead
 * of an error page or the Glide default thumbnail.
 */
async function serveBaseOgImage(
  request,
  env,
  ctx
) {
  const fallback =
    new Response(
      null,
      {
        status:
          302,

        headers: {
          "Location":
            new URL(
              BASE_LOGO_PATH,
              request.url
            ).toString(),

          "Cache-Control":
            "public, max-age=300"
        }
      }
    );

  try {
    const response =
      await serveOgImage(
        request,
        env,
        ctx
      );

    return (
      response.ok ||
      (
        response.status >=
          300 &&
        response.status <
          400
      )
    )
      ? response
      : fallback;
  } catch (error) {
    logLimited(
      "warn",
      "base-og-image",
      "MMicjMedia base preview image failed; using the base logo:",
      error
    );

    return fallback;
  }
}

/* =========================================================
   WORKER
========================================================= */

/* =========================================================
   FRIENDLY ERROR PAGES

   People who land on a page that cannot be shown (a share link whose
   item was removed, a Worker error, or maintenance mode) see a short
   picture page instead of a line of plain text. Anything that is not a
   page load (scripts, fetches, images, crawlers' API calls) still gets
   the same short plain-text answer and the same status code as before.

   Pictures: /assets/errors/{unavailable,error,maintenance}.webp (static
   files: free, never counted as Worker requests). The words are in the
   picture; the <h1>/<p> are for screen readers (class "sr"). If your
   final artwork has no words, remove class="sr" in friendlyHtml().

   MAINTENANCE MODE: add a plain variable  MAINTENANCE = 1  to the
   mmicj Worker (Settings -> Variables and Secrets) and Deploy: the base
   address and share links answer with the maintenance page and a 503
   until you delete the variable (or set it to 0). Static files such as
   /index.html and the PDF/OG endpoints are not affected.
========================================================= */

const FRIENDLY_PAGES = {
  unavailable: {
    status: 404,
    image: "unavailable",
    alt: "Link no longer available. This item was moved or removed.",
    title: "Link no longer available",
    line: "This item was moved or removed.",
    retry: false
  },
  error: {
    status: 500,
    image: "error",
    alt: "Something went wrong. It\u2019s on our side. Please try again in a moment.",
    title: "Something went wrong",
    line: "It\u2019s on our side. Please try again in a moment.",
    retry: true
  },
  maintenance: {
    status: 503,
    image: "maintenance",
    alt: "Be right back. We\u2019re tending the garden. Back shortly.",
    title: "Be right back",
    line: "We\u2019re tending the garden. Back shortly.",
    retry: true
  }
};

/* A page load asks for text/html. Scripts, styles, images, fetch() calls and the like never do, so that alone is the test.
   The Sec-Fetch-Dest header is only used to rule OUT things that are plainly not pages: some browsers change it to "empty"
   when the service worker forwards a page load, and an older version of this check then wrongly showed plain text. */
const NON_PAGE_DESTINATIONS = new Set([
  "script", "style", "image", "font", "audio", "video", "track", "manifest",
  "worker", "sharedworker", "serviceworker", "audioworklet", "paintworklet",
  "object", "embed", "report", "xslt"
]);

function wantsHtml(request) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return false;
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  return !NON_PAGE_DESTINATIONS.has(dest);
}

function friendlyHtml(page) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${page.title} \u00b7 MMicj</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700&display=swap" rel="stylesheet">
<style>
:root{--page:#f3fbfa;--ink:#107740;--btn:#107740;--btn-ink:#fff;--btn2:#d9efed}
@media (prefers-color-scheme:dark){:root{--page:#0e2a1f;--ink:#d9efed;--btn:#36b84c;--btn-ink:#0e2a1f;--btn2:#17402f}}
*{box-sizing:border-box}html,body{margin:0;min-height:100%}
body{display:grid;place-items:center;min-height:100vh;padding:24px;background:var(--page);color:var(--ink);font:500 16px/1.5 Montserrat,Poppins,system-ui,-apple-system,"Segoe UI",sans-serif;text-align:center}
main{width:min(100%,560px)}img{display:block;width:100%;height:auto;aspect-ratio:4/3;border-radius:28px}
.sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
h1{margin:20px 0 4px;font-size:1.6rem}p{margin:0 0 4px}.actions{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:24px}
.btn{display:inline-block;padding:12px 22px;border:0;border-radius:999px;background:var(--btn);color:var(--btn-ink);font:700 16px/1.2 Montserrat,Poppins,system-ui,sans-serif;text-decoration:none;cursor:pointer}
.btn.alt{background:var(--btn2);color:var(--ink)}.btn:focus-visible{outline:3px solid #e3be09;outline-offset:3px}
</style></head><body><main>
<img src="/assets/errors/${page.image}.webp" width="1200" height="900" alt="${page.alt}">
<h1 class="sr">${page.title}</h1><p class="sr">${page.line}</p>
<div class="actions">${page.retry ? '<button type="button" class="btn" onclick="location.reload()">Try again</button><a class="btn alt" href="/">Go to MMicj</a>' : '<a class="btn" href="/">Go to MMicj</a>'}</div>
</main></body></html>`;
}

function friendlyResponse(kind, request, plainText) {
  const page = FRIENDLY_PAGES[kind];
  const headers = {
    "cache-control": "no-store, no-cache, must-revalidate",
    "pragma": "no-cache"
  };
  if (kind === "maintenance") headers["retry-after"] = "600";

  if (!request || !wantsHtml(request)) {
    return new Response(plainText || page.title, {
      status: page.status,
      headers: { ...headers, "content-type": "text/plain; charset=UTF-8" }
    });
  }
  return new Response(friendlyHtml(page), {
    status: page.status,
    headers: { ...headers, "content-type": "text/html; charset=UTF-8" }
  });
}

function maintenanceOn(env) {
  const v = env && env.MAINTENANCE;
  if (v === undefined || v === null) return false;
  return !["", "0", "false", "off", "no"].includes(String(v).trim().toLowerCase());
}

const workerHandlers = {

  async fetch(
    request,
    env,
    ctx
  ) {
    const url =
      new URL(
        request.url
      );

    /* -----------------------------------------------------
       OG image
    ----------------------------------------------------- */

    if (
      url.pathname ===
      OG_IMAGE_PATH
    ) {
      if (
        url.searchParams.get(
          "base"
        ) === "1"
      ) {
        return serveBaseOgImage(
          request,
          env,
          ctx
        );
      }

      return serveOgImage(
        request,
        env,
        ctx
      );
    }

    /* -----------------------------------------------------
       Base URL (needs run_worker_first: ["/"] in
       wrangler.jsonc, otherwise the asset layer answers
       "/" before the Worker is ever invoked)
    ----------------------------------------------------- */

    if (
      url.pathname ===
        "/" &&
      (
        request.method ===
          "GET" ||
        request.method ===
          "HEAD"
      )
    ) {
      return serveBasePage(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       PDF range proxy
    ----------------------------------------------------- */

    if (
      url.pathname ===
      PDF_PROXY_PATH
    ) {
      return handlePdfProxy(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       Catalog snapshot (read by the app on the base URL)
    ----------------------------------------------------- */

    if (
      url.pathname ===
      CATALOG_SNAPSHOT_PATH
    ) {
      return handleCatalogSnapshot(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       Temporary catalog publish test
    ----------------------------------------------------- */

    if (
      url.pathname ===
      "/__sky_catalog_publish"
    ) {
      return handleCatalogPublishTest(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       Share prime
    ----------------------------------------------------- */

    if (
      url.pathname ===
      "/__sky_share_prime"
    ) {
      return handleSharePrime(
        request,
        env
      );
    }

    /* -----------------------------------------------------
       Canonical /s/<section>/<id>
    ----------------------------------------------------- */

    if (
      url.pathname.startsWith(
        SHARE_PATH_PREFIX
      )
    ) {
      const assetResponse =
        await serveShareSubresource(
          request,
          env
        );

      if (assetResponse) {
        return assetResponse;
      }

      const directResponse =
        await handleDirectShare(
          request,
          env
        );

      if (directResponse) {
        return directResponse;
      }

      return handleShortShare(
        request,
        env
      );
    }

    const keyParam =
      url.searchParams.get(
        "k"
      );

    const contractz =
      url.searchParams.get(
        "contractz"
      );

    /* -----------------------------------------------------
       Legacy ?k=<key>&contractz=<payload>
    ----------------------------------------------------- */

    if (
      keyParam &&
      contractz
    ) {
      return handleLegacyPrime(
        request,
        env,
        keyParam,
        contractz
      );
    }

    /* -----------------------------------------------------
       Legacy ?k=<key>
    ----------------------------------------------------- */

    if (
      keyParam
    ) {
      const key =
        keyParam
          .trim()
          .toUpperCase();

      if (
        !isValidKey(
          key
        )
      ) {
        return new Response(
          "MMicjMedia publication key is invalid.",
          {
            status:
              400,

            headers:
              textHeaders()
          }
        );
      }

      let payload =
        null;

      try {
        payload =
          await kvGet(
            env,
            key
          );
      } catch (error) {
        console.error(
          "MMicjMedia KV read failed:",
          error
        );

        return new Response(
          "MMicjMedia KV read failed: " +
          (
            error instanceof Error
              ? error.message
              : String(error)
          ),
          {
            status:
              500,

            headers:
              textHeaders()
          }
        );
      }

      if (!payload) {
        return friendlyResponse("unavailable", request, "MMicjMedia publication not found.");
      }

      return serveWithContract(
        request,
        env,
        payload,
        key
      );
    }

    /* -----------------------------------------------------
       Legacy direct contract
    ----------------------------------------------------- */

    if (
      contractz
    ) {
      if (
        !isValidPayload(
          contractz
        )
      ) {
        return new Response(
          "MMicjMedia contract is invalid.",
          {
            status:
              400,

            headers:
              textHeaders()
          }
        );
      }

      const contractKey =
        makeKey(
          contractz
        );

      return serveWithContract(
        request,
        env,
        contractz,
        contractKey
      );
    }

    /* -----------------------------------------------------
       Normal application
    ----------------------------------------------------- */

    return env.ASSETS.fetch(
      request
    );
  }
};

/* The public entry point: maintenance switch first, then the normal handler,
   and any error the handler throws becomes a friendly page (with the real
   status) instead of Cloudflare's own Worker-error page. */
export default {
  async fetch(request, env, ctx) {
    try {
      if (maintenanceOn(env)) {
        const path = new URL(request.url).pathname;
        if (path === "/" || path.startsWith(SHARE_PATH_PREFIX)) {
          return friendlyResponse("maintenance", request, "MMicj is briefly down for maintenance. Please try again shortly.");
        }
      }
      return await workerHandlers.fetch(request, env, ctx);
    } catch (error) {
      console.error("MMicjMedia unhandled Worker error:", error);
      return friendlyResponse("error", request, "MMicj: something went wrong on our side. Please try again in a moment.");
    }
  }
};
