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

const SHARE_PATH_PREFIX =
  "/s/";

const SHARE_RECORD_PREFIX =
  "share:v1:";

const CATALOG_RECORD_PREFIX =
  "catalog:v1:";

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
    id.length > 512
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
  const key =
    makeShareRecordKey(
      target.section,
      target.id
    );

  let raw;

  try {
    raw =
      await kvGet(
        env,
        key
      );
  } catch (error) {
    console.error(
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
      await kvGet(
        env,
        key
      );
  } catch (error) {
    console.error(
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
    console.warn(
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
    null;

  const section =
    sectionFromItem(
      item
    );

  const id =
    String(
      item?.id || ""
    ).trim();

  const script = `
<script>
(function () {
  "use strict";

  window.SkyMediaContract = ${JSON.stringify(manifest)};

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
        key
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

  if (!record) {
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
        target
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
        target
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

async function serveOgImage(
  request,
  env
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
      !target.section ||
      !target.id
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

    if (!record) {
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
      record.item;
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

  const OG_SOURCE_FETCH = {
    cf: {
      cacheTtl:
        86400,

      cacheEverything:
        true
    }
  };

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
          "public, max-age=86400, stale-while-revalidate=604800"
      }
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

function catalogTestAuthorized(
  request,
  url
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

  return (
    headerToken ===
      CATALOG_TEST_TOKEN ||

    queryToken ===
      CATALOG_TEST_TOKEN
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
      url
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

  let storedCount =
    0;

  let skippedCount =
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

          key
        });
      }
    }

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

      skippedCount,

      sample
    };

    const statusJson =
      JSON.stringify(
        statusRecord
      );

    await env.MEDIA_KV.put(
      CATALOG_TEST_STATUS_KEY,
      statusJson
    );

    /*
     * Uncached verification.
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
   WORKER
========================================================= */

export default {

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
      return serveOgImage(
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
