"use strict";

/*
=========================================================
 SkyMedia Catalog Publish Generator
 STAGE 1 — CLEANUP PREVIEW ONLY

 INPUTS

 p1 = Catalog Source
      (grouped comma-separated JSON objects)

 p2 = Worker base URL

 p3 = unused

 IMPORTANT

 Stage 1 sends the Catalog Source to:

     /__sky_catalog_publish

 with:

     preview: true

 The Worker cleans the catalog URLs and returns the
 cleaned catalog.

 NO KV RECORDS ARE WRITTEN IN STAGE 1.
=========================================================
*/

const DEFAULT_BASE_URL =
  "https://mmicj.meditation-mornings-icj.workers.dev";

const CATALOG_PATH =
  "/__sky_catalog_publish";

const CATALOG_TEST_TOKEN =
  "SMCAT-TEST-9f7b2d4c-20260918";

/* =========================================================
   BASIC CLEANUP
========================================================= */

function cleanText(value) {
  if (
    value === null ||
    value === undefined
  ) {
    return "";
  }

  return String(value).trim();
}

/* =========================================================
   PARSE CATALOG SOURCE
========================================================= */

function parseCatalogSource(raw) {
  const text =
    cleanText(raw);

  if (!text) {
    throw new Error(
      "Catalog Source is empty."
    );
  }

  /*
   * First try the complete value as JSON.
   *
   * Handles:
   *
   * [
   *   {...},
   *   {...}
   * ]
   *
   * or:
   *
   * {...}
   */
  try {
    const parsed =
      JSON.parse(text);

    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }

    if (
      parsed &&
      typeof parsed === "object"
    ) {
      return [parsed];
    }
  } catch (_) {
    /*
     * Continue below.
     */
  }

  /*
   * Catalog Source currently arrives as:
   *
   * {...},
   * {...},
   * {...}
   *
   * with no outer array.
   *
   * Add the brackets here.
   */
  try {
    const parsed =
      JSON.parse(
        "[" +
        text +
        "]"
      );

    if (
      Array.isArray(parsed)
    ) {
      return parsed;
    }
  } catch (error) {
    throw new Error(
      "Catalog Source could not be parsed as JSON: " +
      (
        error instanceof Error
          ? error.message
          : String(error)
      )
    );
  }

  throw new Error(
    "Catalog Source did not contain valid catalog objects."
  );
}

/* =========================================================
   NORMALIZE WORKER URL
========================================================= */

function cleanBaseUrl(value) {
  let base =
    cleanText(value);

  if (!base) {
    base =
      DEFAULT_BASE_URL;
  }

  return base.replace(
    /\/+$/,
    ""
  );
}

/* =========================================================
   MAIN
========================================================= */

async function main() {
  try {
    /*
     * p1 = Catalog Source
     */
    const contract =
      parseCatalogSource(
        p1
      );

    if (
      !contract.length
    ) {
      throw new Error(
        "Catalog Source contains no items."
      );
    }

    /*
     * Validate each object before sending it.
     */
    const invalidIndexes =
      [];

    for (
      let i = 0;
      i < contract.length;
      i++
    ) {
      const item =
        contract[i];

      if (
        !item ||
        typeof item !== "object" ||
        !cleanText(item.id) ||
        !cleanText(item.type)
      ) {
        invalidIndexes.push(
          i + 1
        );
      }
    }

    if (
      invalidIndexes.length
    ) {
      throw new Error(
        "Catalog Source contains invalid item(s) at position(s): " +
        invalidIndexes.join(", ")
      );
    }

    /*
     * p2 = Worker base URL
     */
    const baseUrl =
      cleanBaseUrl(
        p2
      );

    const endpoint =
      baseUrl +
      CATALOG_PATH;

    /*
     * =====================================================
     * STAGE 1 — PREVIEW ONLY
     *
     * preview:true is what prevents the Worker from
     * entering its KV-writing publish path.
     * =====================================================
     */
    const response =
      await fetch(
        endpoint,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            "X-Sky-Catalog-Test-Token":
              CATALOG_TEST_TOKEN
          },

          body:
            JSON.stringify({
              test:
                true,

              preview:
                true,

              source:
                "Glide Catalog Source",

              contract
            })
        }
      );

    const responseText =
      await response.text();

    let result;

    try {
      result =
        JSON.parse(
          responseText
        );
    } catch (_) {
      throw new Error(
        "Worker returned a non-JSON response: " +
        responseText
      );
    }

    if (
      !response.ok
    ) {
      throw new Error(
        result?.error ||
        (
          "Worker returned HTTP " +
          response.status
        )
      );
    }

    /*
     * Expected Stage 1 result:
     *
     * {
     *   "preview": true,
     *   "kvWrites": 0,
     *   "contractItemCount": 2,
     *   "cleanedItemCount": 2,
     *   "skippedCount": 0,
     *   "contract": [...]
     * }
     */
    return JSON.stringify(
      result,
      null,
      2
    );

  } catch (error) {
    return JSON.stringify(
      {
        status:
          "ERROR",

        message:
          error instanceof Error
            ? error.message
            : String(error)
      },
      null,
      2
    );
  }
}

/* =========================================================
   RUN
========================================================= */

return await main();

