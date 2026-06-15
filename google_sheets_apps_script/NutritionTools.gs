/**
 * UPC Nutrition Collection Tool for Google Sheets
 *
 * Matching policy:
 * 1. Exact UPC matches from structured sources write directly to final columns.
 *    Leading-zero GTIN variants are treated as exact-equivalent because some
 *    scanner datasets store UPCs without leading zeros.
 * 2. Name/brand matches and OCR results write only to candidate_* columns.
 * 3. Verified rows are not overwritten by lookup commands.
 *
 * To use local cache lookup, import nutrition_source_cache.csv as a sheet named
 * "nutrition_source_cache" in the same Google Sheets file.
 */

const CONFIG = {
  appUserAgent: "UPC-Nutrition-Research-Tool/1.0 (replace-with-your-email@example.com)",
  cacheSheetName: "nutrition_source_cache",
  input: {
    upc: "upc",
    description: "upc_descr",
    brand: "brand_descr",
  },
  final: {
    servingsPerContainer: "ServingsPerContainer",
    servingSizeQ: "ServSize_q",
    servingSizeUom: "ServSize_uom",
    calories: "calories",
    totalFat: "totalfat",
    totalCarb: "totalcarb",
    sugar: "sugar",
    addedSugar: "addedsugar",
    protein: "protein",
    year: "year",
    source: "source",
  },
  cache: {
    upc: "upc",
    sourceName: "source_name",
    sourceUrl: "source_url",
    matchedName: "matched_name",
    matchedBrand: "matched_brand",
    servingsPerContainer: "ServingsPerContainer",
    servingSizeQ: "ServSize_q",
    servingSizeUom: "ServSize_uom",
    calories: "calories",
    totalFat: "totalfat",
    totalCarb: "totalcarb",
    sugar: "sugar",
    addedSugar: "addedsugar",
    protein: "protein",
    year: "year",
    matchType: "match_type",
  },
  helperColumns: [
    "review_status",
    "match_type",
    "matched_upc",
    "matched_name",
    "matched_brand",
    "matched_source",
    "match_notes",
    "clean_search_terms",
    "upc_exact_candidates",
    "search_exact_upc",
    "search_name_brand",
    "search_brand_site",
    "search_walmart",
    "search_target",
    "search_kroger",
    "search_images_label",
    "candidate_servings_per_container",
    "candidate_serving_size_q",
    "candidate_serving_size_uom",
    "candidate_calories",
    "candidate_totalfat",
    "candidate_totalcarb",
    "candidate_sugar",
    "candidate_addedsugar",
    "candidate_protein",
    "candidate_year",
    "candidate_source",
    "candidate_page_url",
    "page_text",
    "ocr_image_url",
    "ocr_text",
  ],
  statusOptions: [
    "Not started",
    "Exact UPC auto-filled",
    "Exact UPC found - missing nutrition",
    "Needs review",
    "OCR parsed - needs review",
    "Verified",
    "Not found",
    "Skipped verified",
  ],
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Nutrition Tools")
    .addItem("Set up columns", "setupNutritionTool")
    .addItem("Generate search links", "generateSearchLinks")
    .addSeparator()
    .addItem("Lookup selected rows from source cache", "lookupSelectedRowsFromSourceCache")
    .addItem("Lookup selected rows online", "lookupSelectedRowsOnline")
    .addSeparator()
    .addItem("Parse product page URLs", "parseProductPageUrlsForSelectedRows")
    .addItem("Parse OCR image URLs", "parseOcrForSelectedRows")
    .addItem("Approve selected candidates", "approveSelectedCandidates")
    .addItem("Mark selected as not found", "markSelectedNotFound")
    .addItem("Show summary", "showStatusSummary")
    .addToUi();
}

function setupNutritionTool() {
  const sheet = SpreadsheetApp.getActiveSheet();
  assertRequiredColumns_(sheet);
  ensureColumns_(sheet, CONFIG.helperColumns);
  applyStatusValidation_(sheet);
  applyStatusFormatting_(sheet);
  formatUpcAsText_(sheet);
  generateSearchLinks();
  SpreadsheetApp.getUi().alert("Nutrition tool columns are ready.");
}

function generateSearchLinks() {
  const sheet = SpreadsheetApp.getActiveSheet();
  setupWithoutRegeneratingLinks_(sheet);

  const map = getHeaderMap_(sheet);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getDisplayValues();
  const plain = {
    clean_search_terms: [],
    upc_exact_candidates: [],
  };
  const formulas = {
    search_exact_upc: [],
    search_name_brand: [],
    search_brand_site: [],
    search_walmart: [],
    search_target: [],
    search_kroger: [],
    search_images_label: [],
  };

  values.forEach((row) => {
    const upc = cleanUpc_(row[map[CONFIG.input.upc] - 1]);
    const description = row[map[CONFIG.input.description] - 1] || "";
    const brand = row[map[CONFIG.input.brand] - 1] || "";
    const cleanTerms = buildCleanSearchTerms_(brand, description);
    const quotedName = `"${brand}" "${description}"`;

    const exactCandidates = getExactUpcCandidates_(upc);

    plain.clean_search_terms.push([cleanTerms]);
    plain.upc_exact_candidates.push([exactCandidates.join(" OR ")]);
    formulas.search_exact_upc.push([hyperlink_(googleSearchUrl_(exactCandidates.map((candidate) => `"${candidate}"`).join(" OR ") + " nutrition facts UPC"), "Exact UPC search")]);
    formulas.search_name_brand.push([hyperlink_(googleSearchUrl_(`${quotedName} nutrition facts`), "Name/brand search")]);
    formulas.search_brand_site.push([hyperlink_(googleSearchUrl_(`${quotedName} nutrition facts brand official`), "Brand site")]);
    formulas.search_walmart.push([hyperlink_(googleSearchUrl_(`${quotedName} site:walmart.com nutrition facts`), "Walmart")]);
    formulas.search_target.push([hyperlink_(googleSearchUrl_(`${quotedName} site:target.com nutrition facts`), "Target")]);
    formulas.search_kroger.push([hyperlink_(googleSearchUrl_(`${quotedName} site:kroger.com nutrition facts`), "Kroger")]);
    formulas.search_images_label.push([hyperlink_(googleImagesUrl_(`${quotedName} nutrition facts label`), "Label images")]);
  });

  Object.keys(plain).forEach((header) => {
    sheet.getRange(2, map[header], plain[header].length, 1).setValues(plain[header]);
  });
  Object.keys(formulas).forEach((header) => {
    sheet.getRange(2, map[header], formulas[header].length, 1).setFormulas(formulas[header]);
  });
}

function lookupSelectedRowsFromSourceCache() {
  const sheet = SpreadsheetApp.getActiveSheet();
  setupWithoutRegeneratingLinks_(sheet);
  const cache = loadSourceCache_();
  if (!cache) return;

  const map = getHeaderMap_(sheet);
  const rowNums = getSelectedRowNumbers_(sheet);
  let exact = 0;
  let missing = 0;
  let skipped = 0;

  rowNums.forEach((rowNum) => {
    if (isVerifiedRow_(sheet, rowNum, map)) {
      skipped += 1;
      return;
    }

    const upc = cleanUpc_(sheet.getRange(rowNum, map[CONFIG.input.upc]).getDisplayValue());
    const result = findCacheResultForUpc_(cache, upc);
    if (result) {
      if (hasUsableNutritionResult_(result)) {
        writeExactResultToFinal_(sheet, rowNum, map, result);
        exact += 1;
      } else {
        writeExactMissingNutritionResult_(sheet, rowNum, map, result);
        missing += 1;
      }
    } else {
      writeNotFound_(sheet, rowNum, map, "No exact UPC match in nutrition_source_cache.");
      missing += 1;
    }
  });

  SpreadsheetApp.getUi().alert(
    `Source cache lookup complete.\nExact UPC auto-filled: ${exact}\nNot found in cache: ${missing}\nSkipped verified: ${skipped}`
  );
}

function lookupSelectedRowsOnline() {
  const sheet = SpreadsheetApp.getActiveSheet();
  setupWithoutRegeneratingLinks_(sheet);
  const map = getHeaderMap_(sheet);
  const rowNums = getSelectedRowNumbers_(sheet);
  if (rowNums.length === 0) {
    SpreadsheetApp.getUi().alert("Select data rows first.");
    return;
  }

  let exact = 0;
  let candidates = 0;
  let missing = 0;
  let skipped = 0;

  rowNums.forEach((rowNum) => {
    if (isVerifiedRow_(sheet, rowNum, map)) {
      skipped += 1;
      return;
    }

    const row = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
    const upc = cleanUpc_(row[map[CONFIG.input.upc] - 1]);
    const description = row[map[CONFIG.input.description] - 1] || "";
    const brand = row[map[CONFIG.input.brand] - 1] || "";
    if (!upc) return;

    const exactResult = findExactUpcResultOnline_(upc, description, brand);
    if (exactResult) {
      if (hasUsableNutritionResult_(exactResult)) {
        writeExactResultToFinal_(sheet, rowNum, map, exactResult);
        exact += 1;
      } else {
        writeExactMissingNutritionResult_(sheet, rowNum, map, exactResult);
        missing += 1;
      }
      Utilities.sleep(250);
      return;
    }

    const candidate = findNameBrandCandidate_(upc, description, brand);
    if (candidate) {
      writeCandidateResult_(sheet, rowNum, map, candidate);
      candidates += 1;
    } else {
      writeNotFound_(sheet, rowNum, map, "No exact online UPC match and no acceptable name/brand candidate.");
      missing += 1;
    }
    Utilities.sleep(250);
  });

  SpreadsheetApp.getUi().alert(
    `Online lookup complete.\nExact UPC auto-filled: ${exact}\nCandidates needing review: ${candidates}\nNot found: ${missing}\nSkipped verified: ${skipped}`
  );
}

function findExactUpcResultOnline_(upc, description, brand) {
  const off = lookupOpenFoodFactsExactUpc_(upc, description, brand);
  if (off) return off;

  const fdc = lookupFoodDataCentralExactUpc_(upc, description, brand);
  if (fdc) return fdc;

  return null;
}

function lookupOpenFoodFactsExactUpc_(upc, description, brand) {
  const fields = [
    "code",
    "product_name",
    "brands",
    "serving_size",
    "servings_per_package",
    "nutriments",
    "last_modified_t",
  ].join(",");
  const url = `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(upc)}.json?fields=${fields}`;

  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        Accept: "application/json",
        "User-Agent": CONFIG.appUserAgent,
      },
    });
    if (response.getResponseCode() !== 200) return null;

    const payload = JSON.parse(response.getContentText());
    if (!payload || payload.status !== 1 || !payload.product) return null;
    const returnedUpc = cleanUpc_(payload.product.code);
    if (!isExactUpcEquivalent_(upc, returnedUpc)) return null;

    return openFoodFactsProductToResult_(upc, payload.product, description, brand, "Open Food Facts exact UPC");
  } catch (error) {
    return null;
  }
}

function lookupFoodDataCentralExactUpc_(upc, description, brand) {
  const url = `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=DEMO_KEY&query=${encodeURIComponent(upc)}&dataType=Branded&pageSize=10`;

  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: "application/json" },
    });
    if (response.getResponseCode() !== 200) return null;

    const payload = JSON.parse(response.getContentText());
    const foods = payload.foods || [];
    const food = foods.find((item) => isExactUpcEquivalent_(upc, cleanUpc_(item.gtinUpc)));
    if (!food) return null;

    return foodDataCentralProductToResult_(upc, food, description, brand);
  } catch (error) {
    return null;
  }
}

function findNameBrandCandidate_(upc, description, brand) {
  const query = buildCleanSearchTerms_(brand, description);
  if (!query) return null;

  const fields = [
    "code",
    "product_name",
    "brands",
    "serving_size",
    "servings_per_package",
    "nutriments",
    "last_modified_t",
    "categories_tags_en",
  ].join(",");
  const url = `https://world.openfoodfacts.org/api/v2/search?search_terms=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}&page_size=25`;

  try {
    const response = UrlFetchApp.fetch(url, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        Accept: "application/json",
        "User-Agent": CONFIG.appUserAgent,
      },
    });
    if (response.getResponseCode() !== 200) return null;

    const payload = JSON.parse(response.getContentText());
    const products = payload.products || [];
    const ranked = products
      .map((product) => ({
        product,
        score: scoreCandidate_(product, description, brand),
      }))
      .filter((item) => item.score >= 0.28)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) return null;

    const best = ranked[0];
    const result = openFoodFactsProductToResult_(upc, best.product, description, brand, "Open Food Facts name/brand candidate");
    result.status = "candidate";
    result.matchType = "Name/brand candidate - review required";
    result.notes = `Not exact UPC. Candidate UPC: ${result.matchedUpc || "unknown"}. Similarity score: ${best.score.toFixed(2)}.`;
    return result;
  } catch (error) {
    return null;
  }
}

function parseOcrForSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  setupWithoutRegeneratingLinks_(sheet);
  const map = getHeaderMap_(sheet);
  const rowNums = getSelectedRowNumbers_(sheet);
  let parsed = 0;
  let skipped = 0;

  rowNums.forEach((rowNum) => {
    if (isVerifiedRow_(sheet, rowNum, map)) {
      skipped += 1;
      return;
    }

    const imageUrl = sheet.getRange(rowNum, map.ocr_image_url).getDisplayValue();
    if (!imageUrl) return;

    const text = ocrImageUrl_(imageUrl);
    if (!text) {
      setIfHeaderExists_(sheet, rowNum, map, "match_notes", "OCR failed. Check image URL and enable Apps Script Drive API advanced service.");
      return;
    }

    const result = parseNutritionText_(text);
    result.source = imageUrl;
    result.matchType = "Image OCR candidate - review required";
    result.notes = "Parsed from nutrition label image OCR. Review values before approval.";

    setIfHeaderExists_(sheet, rowNum, map, "ocr_text", text.slice(0, 4000));
    writeCandidateResult_(sheet, rowNum, map, result);
    setIfHeaderExists_(sheet, rowNum, map, "review_status", "OCR parsed - needs review");
    parsed += 1;
  });

  SpreadsheetApp.getUi().alert(`OCR parsed: ${parsed}\nSkipped verified: ${skipped}`);
}

function parseProductPageUrlsForSelectedRows() {
  const sheet = SpreadsheetApp.getActiveSheet();
  setupWithoutRegeneratingLinks_(sheet);
  const map = getHeaderMap_(sheet);
  const rowNums = getSelectedRowNumbers_(sheet);
  let parsed = 0;
  let skipped = 0;

  rowNums.forEach((rowNum) => {
    if (isVerifiedRow_(sheet, rowNum, map)) {
      skipped += 1;
      return;
    }

    const pageUrl = sheet.getRange(rowNum, map.candidate_page_url).getDisplayValue();
    if (!pageUrl) return;

    const pageText = fetchProductPageText_(pageUrl);
    if (!pageText) {
      setIfHeaderExists_(sheet, rowNum, map, "match_notes", "Could not read product page text. Try copying the nutrition label image URL into ocr_image_url.");
      return;
    }

    const result = parseNutritionText_(pageText);
    result.source = pageUrl;
    result.matchType = "Product page candidate - review required";
    result.notes = "Parsed from retailer/brand product page text. Review product, size, and values before approval.";

    setIfHeaderExists_(sheet, rowNum, map, "page_text", pageText.slice(0, 4000));
    writeCandidateResult_(sheet, rowNum, map, result);
    parsed += 1;
    Utilities.sleep(300);
  });

  SpreadsheetApp.getUi().alert(`Product pages parsed: ${parsed}\nSkipped verified: ${skipped}`);
}

function fetchProductPageText_(pageUrl) {
  try {
    const response = UrlFetchApp.fetch(pageUrl, {
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        "User-Agent": CONFIG.appUserAgent,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (response.getResponseCode() < 200 || response.getResponseCode() >= 400) return "";
    const html = response.getContentText();
    return htmlToSearchableText_(html);
  } catch (error) {
    return "";
  }
}

function htmlToSearchableText_(html) {
  const source = String(html || "");
  const jsonText = source
    .match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)
    ?.join(" ") || "";
  return decodeHtmlEntities_(
    `${jsonText} ${source}`
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\\u0026/g, "&")
      .replace(/\\u003c/gi, "<")
      .replace(/\\u003e/gi, ">")
      .replace(/\\"/g, '"')
      .replace(/\\n/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function decodeHtmlEntities_(text) {
  return String(text || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function ocrImageUrl_(imageUrl) {
  try {
    const blob = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true }).getBlob();
    const resource = {
      title: `nutrition_ocr_${Date.now()}`,
      mimeType: MimeType.GOOGLE_DOCS,
    };
    const file = Drive.Files.insert(resource, blob, { ocr: true });
    const doc = DocumentApp.openById(file.id);
    const text = doc.getBody().getText();
    DriveApp.getFileById(file.id).setTrashed(true);
    return text;
  } catch (error) {
    return "";
  }
}

function approveSelectedCandidates() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const map = getHeaderMap_(sheet);
  const rowNums = getSelectedRowNumbers_(sheet);
  let approved = 0;

  rowNums.forEach((rowNum) => {
    copyCandidateToFinal_(sheet, rowNum, map);
    setIfHeaderExists_(sheet, rowNum, map, "review_status", "Verified");
    approved += 1;
  });

  SpreadsheetApp.getUi().alert(`Approved ${approved} candidate row(s).`);
}

function markSelectedNotFound() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const map = getHeaderMap_(sheet);
  getSelectedRowNumbers_(sheet).forEach((rowNum) => {
    if (!isVerifiedRow_(sheet, rowNum, map)) {
      setIfHeaderExists_(sheet, rowNum, map, "review_status", "Not found");
    }
  });
}

function showStatusSummary() {
  const sheet = SpreadsheetApp.getActiveSheet();
  const map = getHeaderMap_(sheet);
  if (!map.review_status) {
    SpreadsheetApp.getUi().alert("No review_status column found. Run setup first.");
    return;
  }
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const values = sheet.getRange(2, map.review_status, lastRow - 1, 1).getDisplayValues().flat();
  const counts = {};
  values.forEach((value) => {
    const key = value || "Blank";
    counts[key] = (counts[key] || 0) + 1;
  });
  SpreadsheetApp.getUi().alert(Object.keys(counts).sort().map((key) => `${key}: ${counts[key]}`).join("\n"));
}

function loadSourceCache_() {
  const cacheSheet = SpreadsheetApp.getActive().getSheetByName(CONFIG.cacheSheetName);
  if (!cacheSheet) {
    SpreadsheetApp.getUi().alert(`Import nutrition_source_cache.csv as a sheet named "${CONFIG.cacheSheetName}" first.`);
    return null;
  }

  const map = getHeaderMap_(cacheSheet);
  const required = Object.values(CONFIG.cache);
  const missing = required.filter((header) => !map[header]);
  if (missing.length > 0) {
    SpreadsheetApp.getUi().alert(`Cache sheet is missing columns: ${missing.join(", ")}`);
    return null;
  }

  const lastRow = cacheSheet.getLastRow();
  if (lastRow < 2) return {};

  const rows = cacheSheet.getRange(2, 1, lastRow - 1, cacheSheet.getLastColumn()).getDisplayValues();
  const cache = {};
  rows.forEach((row) => {
    const upc = cleanUpc_(row[map[CONFIG.cache.upc] - 1]);
    if (!upc || cache[upc]) return;
    cache[upc] = {
      status: "exact",
      matchType: row[map[CONFIG.cache.matchType] - 1] || "Local source cache exact UPC",
      matchedUpc: upc,
      productName: row[map[CONFIG.cache.matchedName] - 1],
      brand: row[map[CONFIG.cache.matchedBrand] - 1],
      servingsPerContainer: row[map[CONFIG.cache.servingsPerContainer] - 1],
      servingSizeQ: row[map[CONFIG.cache.servingSizeQ] - 1],
      servingSizeUom: row[map[CONFIG.cache.servingSizeUom] - 1],
      calories: row[map[CONFIG.cache.calories] - 1],
      totalFat: row[map[CONFIG.cache.totalFat] - 1],
      totalCarb: row[map[CONFIG.cache.totalCarb] - 1],
      sugar: row[map[CONFIG.cache.sugar] - 1],
      addedSugar: row[map[CONFIG.cache.addedSugar] - 1],
      protein: row[map[CONFIG.cache.protein] - 1],
      year: row[map[CONFIG.cache.year] - 1],
      source: row[map[CONFIG.cache.sourceUrl] - 1],
      notes: `Exact UPC match from cache source: ${row[map[CONFIG.cache.sourceName] - 1]}`,
    };
  });
  return cache;
}

function findCacheResultForUpc_(cache, upc) {
  const candidates = getExactUpcCandidates_(upc);
  for (let i = 0; i < candidates.length; i += 1) {
    const result = cache[candidates[i]];
    if (result && isExactUpcEquivalent_(upc, result.matchedUpc)) return result;
  }
  return null;
}

function openFoodFactsProductToResult_(upc, product, description, brand, matchType) {
  const nutriments = product.nutriments || {};
  const serving = parseServingSize_(product.serving_size || "");
  const matchedUpc = cleanUpc_(product.code);

  return {
    status: "exact",
    matchType,
    matchedUpc,
    productName: product.product_name || "",
    brand: product.brands || "",
    servingsPerContainer: product.servings_per_package || inferServingsPerContainer_(description, serving),
    servingSizeQ: serving.quantity,
    servingSizeUom: serving.unit,
    calories: firstPresent_([nutriments["energy-kcal_serving"], nutriments["energy-kcal"]]),
    totalFat: firstPresent_([nutriments.fat_serving, nutriments.fat]),
    totalCarb: firstPresent_([nutriments.carbohydrates_serving, nutriments.carbohydrates]),
    sugar: firstPresent_([nutriments.sugars_serving, nutriments.sugars]),
    addedSugar: firstPresent_([nutriments["added-sugars_serving"], nutriments["added-sugars"]]),
    protein: firstPresent_([nutriments.proteins_serving, nutriments.proteins]),
    year: product.last_modified_t ? new Date(product.last_modified_t * 1000).getFullYear() : "",
    source: matchedUpc ? `https://world.openfoodfacts.org/product/${matchedUpc}` : "",
    notes: matchType.indexOf("exact UPC") !== -1 ? "Exact UPC match." : "Candidate found by name/brand search.",
  };
}

function foodDataCentralProductToResult_(upc, food, description, brand) {
  const nutrients = food.foodNutrients || [];
  const serving = {
    quantity: food.servingSize || "",
    unit: normalizeUnit_(food.servingSizeUnit || ""),
  };

  return {
    status: "exact",
    matchType: "USDA FoodData Central exact UPC",
    matchedUpc: cleanUpc_(food.gtinUpc),
    productName: food.description || "",
    brand: food.brandName || food.brandOwner || "",
    servingsPerContainer: inferServingsPerContainer_(description, serving),
    servingSizeQ: serving.quantity,
    servingSizeUom: serving.unit,
    calories: getFdcNutrient_(nutrients, ["Energy"], ["KCAL"]),
    totalFat: getFdcNutrient_(nutrients, ["Total lipid (fat)", "Total Fat"], ["G"]),
    totalCarb: getFdcNutrient_(nutrients, ["Carbohydrate, by difference", "Carbohydrate"], ["G"]),
    sugar: getFdcNutrient_(nutrients, ["Sugars, total including NLEA", "Sugars, Total"], ["G"]),
    addedSugar: getFdcNutrient_(nutrients, ["Sugars, added", "Added Sugars"], ["G"]),
    protein: getFdcNutrient_(nutrients, ["Protein"], ["G"]),
    year: food.publishedDate ? String(food.publishedDate).slice(0, 4) : "",
    source: `https://fdc.nal.usda.gov/fdc-app.html#/food-details/${food.fdcId}/nutrients`,
    notes: "Exact UPC match.",
  };
}

function writeExactResultToFinal_(sheet, rowNum, map, result) {
  writeMatchMetadata_(sheet, rowNum, map, result);
  writeFinalValues_(sheet, rowNum, map, result);
  setIfHeaderExists_(sheet, rowNum, map, "review_status", "Exact UPC auto-filled");
}

function writeExactMissingNutritionResult_(sheet, rowNum, map, result) {
  writeMatchMetadata_(sheet, rowNum, map, result);
  setIfHeaderExists_(sheet, rowNum, map, "review_status", "Exact UPC found - missing nutrition");
  setIfHeaderExists_(sheet, rowNum, map, "match_notes", `${result.notes || "Exact UPC match."} Source has no usable nutrition fields; use source/search links or OCR.`);
}

function writeCandidateResult_(sheet, rowNum, map, result) {
  writeMatchMetadata_(sheet, rowNum, map, result);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_servings_per_container", result.servingsPerContainer);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_serving_size_q", result.servingSizeQ);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_serving_size_uom", result.servingSizeUom);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_calories", result.calories);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_totalfat", result.totalFat);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_totalcarb", result.totalCarb);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_sugar", result.sugar);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_addedsugar", result.addedSugar);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_protein", result.protein);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_year", result.year);
  setIfHeaderExists_(sheet, rowNum, map, "candidate_source", result.source);
  setIfHeaderExists_(sheet, rowNum, map, "review_status", "Needs review");
}

function writeMatchMetadata_(sheet, rowNum, map, result) {
  setIfHeaderExists_(sheet, rowNum, map, "match_type", result.matchType);
  setIfHeaderExists_(sheet, rowNum, map, "matched_upc", result.matchedUpc);
  setIfHeaderExists_(sheet, rowNum, map, "matched_name", result.productName);
  setIfHeaderExists_(sheet, rowNum, map, "matched_brand", result.brand);
  setIfHeaderExists_(sheet, rowNum, map, "matched_source", result.source);
  setIfHeaderExists_(sheet, rowNum, map, "match_notes", result.notes);
}

function writeFinalValues_(sheet, rowNum, map, result) {
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.servingsPerContainer, result.servingsPerContainer);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.servingSizeQ, result.servingSizeQ);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.servingSizeUom, result.servingSizeUom);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.calories, result.calories);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.totalFat, result.totalFat);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.totalCarb, result.totalCarb);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.sugar, result.sugar);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.addedSugar, result.addedSugar);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.protein, result.protein);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.year, result.year);
  setIfHeaderExists_(sheet, rowNum, map, CONFIG.final.source, result.source);
}

function copyCandidateToFinal_(sheet, rowNum, map) {
  const result = {
    servingsPerContainer: getIfHeaderExists_(sheet, rowNum, map, "candidate_servings_per_container"),
    servingSizeQ: getIfHeaderExists_(sheet, rowNum, map, "candidate_serving_size_q"),
    servingSizeUom: getIfHeaderExists_(sheet, rowNum, map, "candidate_serving_size_uom"),
    calories: getIfHeaderExists_(sheet, rowNum, map, "candidate_calories"),
    totalFat: getIfHeaderExists_(sheet, rowNum, map, "candidate_totalfat"),
    totalCarb: getIfHeaderExists_(sheet, rowNum, map, "candidate_totalcarb"),
    sugar: getIfHeaderExists_(sheet, rowNum, map, "candidate_sugar"),
    addedSugar: getIfHeaderExists_(sheet, rowNum, map, "candidate_addedsugar"),
    protein: getIfHeaderExists_(sheet, rowNum, map, "candidate_protein"),
    year: getIfHeaderExists_(sheet, rowNum, map, "candidate_year"),
    source: getIfHeaderExists_(sheet, rowNum, map, "candidate_source"),
  };
  writeFinalValues_(sheet, rowNum, map, result);
}

function writeNotFound_(sheet, rowNum, map, note) {
  setIfHeaderExists_(sheet, rowNum, map, "review_status", "Not found");
  setIfHeaderExists_(sheet, rowNum, map, "match_type", "");
  setIfHeaderExists_(sheet, rowNum, map, "matched_upc", "");
  setIfHeaderExists_(sheet, rowNum, map, "matched_name", "");
  setIfHeaderExists_(sheet, rowNum, map, "matched_brand", "");
  setIfHeaderExists_(sheet, rowNum, map, "matched_source", "");
  setIfHeaderExists_(sheet, rowNum, map, "match_notes", note);
}

function parseNutritionText_(text) {
  const serving = servingSizeFromText_(text);
  return {
    status: "candidate",
    matchType: "Image OCR candidate - review required",
    productName: "",
    brand: "",
    matchedUpc: "",
    servingsPerContainer: numberAfter_(text, /servings?\s+per\s+container/i),
    servingSizeQ: serving.quantity,
    servingSizeUom: serving.unit,
    calories: nutrientNumber_(text, /calories/i),
    totalFat: nutrientNumber_(text, /total\s+fat|fat/i),
    totalCarb: nutrientNumber_(text, /total\s+carbohydrate|carbohydrate|carbs?/i),
    sugar: zeroIfPhrase_(text, /\b(no|zero)\s+sugar\b/i, nutrientNumber_(text, /total\s+sugars?|sugars?|sugar/i)),
    addedSugar: zeroIfPhrase_(text, /\b(no|zero)\s+added\s+sugars?\b/i, nutrientNumber_(text, /added\s+sugars?/i)),
    protein: nutrientNumber_(text, /protein/i),
    year: "",
    source: "",
    notes: "Parsed from OCR.",
  };
}

function numberAfter_(text, labelRegex) {
  const source = String(text || "").replace(/\n/g, " ");
  const match = source.match(new RegExp(`${labelRegex.source}\\D*([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? Number(match[1]) : "";
}

function nutrientNumber_(text, labelRegex) {
  const source = String(text || "").replace(/\n/g, " ");
  const after = source.match(new RegExp(`${labelRegex.source}\\D*([0-9]+(?:\\.[0-9]+)?)\\s*(?:g|gram|grams|mg|kcal)?`, "i"));
  if (after) return Number(after[1]);
  const before = source.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*(?:g|gram|grams|mg|kcal)?\\s*${labelRegex.source}`, "i"));
  return before ? Number(before[1]) : "";
}

function zeroIfPhrase_(text, phraseRegex, fallback) {
  return phraseRegex.test(String(text || "")) ? 0 : fallback;
}

function servingSizeFromText_(text) {
  const source = String(text || "").replace(/\n/g, " ");
  const match = source.match(/serving\s+size\D*([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(g|gram|grams|oz|fl oz|ml|cup|cups)/i);
  if (!match) return { quantity: "", unit: "" };
  return { quantity: parseNumberLike_(match[1]), unit: normalizeUnit_(match[2]) };
}

function scoreCandidate_(product, description, brand) {
  const candidateTerms = buildCleanSearchTerms_(product.brands || "", product.product_name || "");
  const expectedTerms = buildCleanSearchTerms_(brand, description);
  const nameScore = tokenOverlap_(candidateTerms, expectedTerms);
  const brandScore = tokenOverlap_(product.brands || "", brand);
  const nutritionScore = hasNutrition_(product) ? 0.15 : 0;
  return Math.min(1, nameScore * 0.55 + brandScore * 0.3 + nutritionScore);
}

function hasNutrition_(product) {
  const n = product.nutriments || {};
  return Boolean(firstPresent_([
    n["energy-kcal_serving"],
    n["energy-kcal"],
    n.fat_serving,
    n.carbohydrates_serving,
    n.sugars_serving,
    n.proteins_serving,
  ]));
}

function hasUsableNutritionResult_(result) {
  return Boolean(firstPresent_([
    result.servingSizeQ,
    result.calories,
    result.totalFat,
    result.totalCarb,
    result.sugar,
    result.addedSugar,
    result.protein,
  ]));
}

function getFdcNutrient_(nutrients, names, units) {
  const normalizedNames = names.map((name) => String(name).toLowerCase());
  const normalizedUnits = units.map((unit) => String(unit).toLowerCase());
  const match = nutrients.find((item) => {
    const name = String(item.nutrientName || item.name || "").toLowerCase();
    const unit = String(item.unitName || item.unit || "").toLowerCase();
    return normalizedNames.indexOf(name) !== -1 && normalizedUnits.indexOf(unit) !== -1;
  });
  return match ? firstPresent_([match.value, match.amount]) : "";
}

function inferServingsPerContainer_(description, serving) {
  const text = String(description || "").toLowerCase();
  const countMatch = text.match(/\b([0-9]+)\s*(count|ct|pack|pk)\b/i);
  if (countMatch) return Number(countMatch[1]);

  const packageSize = parsePackageSize_(text);
  if (!packageSize.quantity || !serving.quantity || !serving.unit) return "";

  const packageFlOz = toFluidOunces_(packageSize.quantity, packageSize.unit);
  const servingFlOz = toFluidOunces_(serving.quantity, serving.unit);
  if (packageFlOz && servingFlOz) return roundServingCount_(packageFlOz / servingFlOz);

  const packageGrams = toGrams_(packageSize.quantity, packageSize.unit);
  const servingGrams = toGrams_(serving.quantity, serving.unit);
  if (packageGrams && servingGrams) return roundServingCount_(packageGrams / servingGrams);

  return "";
}

function parsePackageSize_(text) {
  const match = String(text || "").match(/\b([0-9]+(?:\.[0-9]+)?)\s*(fluid ounce|fl oz|ounce|ounces|oz|gram|grams|g|ml|milliliter|milliliters)\b/i);
  if (!match) return { quantity: "", unit: "" };
  return { quantity: Number(match[1]), unit: normalizePackageUnit_(match[2]) };
}

function parseServingSize_(text) {
  const match = String(text || "").match(/([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(g|gram|grams|oz|fl oz|ml|cup|cups|count|ct)?/i);
  if (!match) return { quantity: "", unit: "" };
  return { quantity: parseNumberLike_(match[1]), unit: normalizeUnit_(match[2] || "") };
}

function normalizeUnit_(unit) {
  const clean = String(unit || "").trim().toLowerCase();
  if (["gram", "grams"].indexOf(clean) !== -1) return "g";
  if (["fluid ounce", "fl oz"].indexOf(clean) !== -1) return "fl oz";
  if (["ounce", "ounces", "oz"].indexOf(clean) !== -1) return "oz";
  if (["cup", "cups"].indexOf(clean) !== -1) return "cup";
  if (["count", "ct"].indexOf(clean) !== -1) return "count";
  return clean;
}

function normalizePackageUnit_(unit) {
  return normalizeUnit_(unit);
}

function toFluidOunces_(quantity, unit) {
  if (unit === "fl oz") return quantity;
  if (unit === "cup") return quantity * 8;
  if (unit === "ml") return quantity / 29.5735;
  return "";
}

function toGrams_(quantity, unit) {
  if (unit === "g") return quantity;
  if (unit === "oz") return quantity * 28.3495;
  return "";
}

function roundServingCount_(value) {
  if (!value || !Number.isFinite(value)) return "";
  const rounded = Math.round(value);
  return Math.abs(value - rounded) <= 0.15 ? rounded : Math.round(value * 10) / 10;
}

function parseNumberLike_(value) {
  const clean = String(value || "").trim();
  if (clean.indexOf("/") !== -1) {
    const parts = clean.split("/").map(Number);
    return parts.length === 2 && parts[1] !== 0 ? parts[0] / parts[1] : "";
  }
  const parsed = Number(clean);
  return Number.isNaN(parsed) ? "" : parsed;
}

function buildCleanSearchTerms_(brand, description) {
  const text = `${brand || ""} ${description || ""}`
    .replace(/[-_/]/g, " ")
    .replace(/\b(sp|oz|ounce|fluid|fl|tub|box|cup|cups|ct|count|same|upc|all|flavors)\b/gi, " ")
    .replace(/\b([0-9]+)\s*(g|gram|grams|oz|ounce|ounces|ct|count|fl oz|ml)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return dedupeWords_(text);
}

function dedupeWords_(text) {
  const seen = {};
  return String(text || "")
    .split(/\s+/)
    .filter((word) => {
      const key = word.toLowerCase();
      if (seen[key]) return false;
      seen[key] = true;
      return true;
    })
    .join(" ");
}

function tokenOverlap_(left, right) {
  const leftTokens = usefulTokens_(left);
  const rightTokens = usefulTokens_(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) return 0;
  const rightSet = {};
  rightTokens.forEach((token) => {
    rightSet[token] = true;
  });
  const matches = leftTokens.filter((token) => rightSet[token]).length;
  return matches / Math.max(leftTokens.length, rightTokens.length);
}

function usefulTokens_(text) {
  const stop = {
    yogurt: true,
    yoghurt: true,
    ice: true,
    cream: true,
    frozen: true,
    dairy: true,
    dessert: true,
    tub: true,
    box: true,
    cup: true,
    count: true,
  };
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stop[token]);
}

function firstPresent_(values) {
  for (let i = 0; i < values.length; i += 1) {
    if (values[i] !== undefined && values[i] !== null && values[i] !== "") return values[i];
  }
  return "";
}

function setupWithoutRegeneratingLinks_(sheet) {
  assertRequiredColumns_(sheet);
  ensureColumns_(sheet, CONFIG.helperColumns);
  applyStatusValidation_(sheet);
  formatUpcAsText_(sheet);
}

function assertRequiredColumns_(sheet) {
  const map = getHeaderMap_(sheet);
  const required = [CONFIG.input.upc, CONFIG.input.description, CONFIG.input.brand];
  const missing = required.filter((header) => !map[header]);
  if (missing.length > 0) throw new Error(`Missing required columns: ${missing.join(", ")}`);
}

function ensureColumns_(sheet, headers) {
  const map = getHeaderMap_(sheet);
  const missing = headers.filter((header) => !map[header]);
  if (missing.length === 0) return;
  const startCol = sheet.getLastColumn() + 1;
  sheet.insertColumnsAfter(sheet.getLastColumn(), missing.length);
  sheet.getRange(1, startCol, 1, missing.length).setValues([missing]).setFontWeight("bold");
}

function getHeaderMap_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const map = {};
  headers.forEach((header, index) => {
    const key = String(header || "").trim();
    if (key) map[key] = index + 1;
  });
  return map;
}

function getSelectedRowNumbers_(sheet) {
  const list = sheet.getActiveRangeList();
  const ranges = list ? list.getRanges() : [sheet.getActiveRange()];
  const rows = {};
  ranges.forEach((range) => {
    if (!range) return;
    const start = Math.max(range.getRow(), 2);
    const end = range.getLastRow();
    for (let row = start; row <= end; row += 1) rows[row] = true;
  });
  return Object.keys(rows).map(Number).sort((a, b) => a - b);
}

function isVerifiedRow_(sheet, rowNum, map) {
  return map.review_status && sheet.getRange(rowNum, map.review_status).getDisplayValue() === "Verified";
}

function applyStatusValidation_(sheet) {
  const map = getHeaderMap_(sheet);
  if (!map.review_status) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(CONFIG.statusOptions, true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(2, map.review_status, Math.max(sheet.getMaxRows() - 1, 1), 1).setDataValidation(rule);
}

function applyStatusFormatting_(sheet) {
  const map = getHeaderMap_(sheet);
  if (!map.review_status) return;
  const range = sheet.getRange(2, map.review_status, Math.max(sheet.getMaxRows() - 1, 1), 1);
  const rules = [
    statusRule_(range, "Exact UPC auto-filled", "#d1e7dd"),
    statusRule_(range, "Exact UPC found - missing nutrition", "#fce5cd"),
    statusRule_(range, "Needs review", "#fff3cd"),
    statusRule_(range, "OCR parsed - needs review", "#fff3cd"),
    statusRule_(range, "Verified", "#b6d7a8"),
    statusRule_(range, "Not found", "#f8d7da"),
    statusRule_(range, "Skipped verified", "#e2e3e5"),
  ];
  sheet.setConditionalFormatRules(sheet.getConditionalFormatRules().concat(rules));
}

function statusRule_(range, text, color) {
  return SpreadsheetApp.newConditionalFormatRule()
    .whenTextEqualTo(text)
    .setBackground(color)
    .setRanges([range])
    .build();
}

function formatUpcAsText_(sheet) {
  const map = getHeaderMap_(sheet);
  if (map[CONFIG.input.upc]) sheet.getRange(2, map[CONFIG.input.upc], Math.max(sheet.getMaxRows() - 1, 1), 1).setNumberFormat("@");
}

function setIfHeaderExists_(sheet, rowNum, map, header, value) {
  if (map[header] && value !== undefined) sheet.getRange(rowNum, map[header]).setValue(value);
}

function getIfHeaderExists_(sheet, rowNum, map, header) {
  return map[header] ? sheet.getRange(rowNum, map[header]).getValue() : "";
}

function cleanUpc_(value) {
  return String(value || "").replace(/[^0-9]/g, "");
}

function getExactUpcCandidates_(upc) {
  const clean = cleanUpc_(upc);
  const candidates = [];
  addUnique_(candidates, clean);
  if (clean && clean.length < 12) addUnique_(candidates, clean.padStart(12, "0"));
  if (clean && clean.length < 13) addUnique_(candidates, clean.padStart(13, "0"));
  if (clean && clean.length < 14) addUnique_(candidates, clean.padStart(14, "0"));
  return candidates;
}

function isExactUpcEquivalent_(sheetUpc, sourceUpc) {
  const source = cleanUpc_(sourceUpc);
  if (!source) return false;
  return getExactUpcCandidates_(sheetUpc).indexOf(source) !== -1;
}

function addUnique_(values, value) {
  if (value && values.indexOf(value) === -1) values.push(value);
}

function hyperlink_(url, label) {
  return `=HYPERLINK("${url}", "${label}")`;
}

function googleSearchUrl_(query) {
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function googleImagesUrl_(query) {
  return `https://www.google.com/search?tbm=isch&q=${encodeURIComponent(query)}`;
}
