# Nutrition Candidate Extractor Chrome Extension

This is a no-API-key browser helper for extracting candidate nutrition fields from a product page that a reviewer has already opened.

It does **not** use OpenAI, PPIO, paid APIs, or external services.

## What It Does

When opened on a Walmart, Target, Kroger, Amazon, or brand product page, the extension:

- Reads visible page text, image alt text, meta text, and JSON-LD text.
- Tries to parse nutrition values such as calories, fat, carbs, sugar, added sugar, protein, serving size, and servings per container.
- Shows the extracted candidate values.
- Copies a tab-separated row that can be pasted into the Google Sheet `candidate_*` columns.

The output is a candidate only. Review product flavor, size, and values before approving.

## Install Locally

1. Open Chrome.
2. Go to:

```text
chrome://extensions/
```

3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select this folder:

```text
browser_tools/nutrition_extractor_extension
```

6. Pin the extension if desired.

## Use

1. Open a product page, for example a Walmart product page.
2. Click the `Nutrition Candidate Extractor` extension icon.
3. Review the parsed values.
4. Click `Copy candidate row`.
5. Paste into the Google Sheet starting at:

```text
candidate_servings_per_container
```

The copied column order is:

```text
candidate_servings_per_container
candidate_serving_size_q
candidate_serving_size_uom
candidate_calories
candidate_totalfat
candidate_totalcarb
candidate_sugar
candidate_addedsugar
candidate_protein
candidate_year
candidate_source
```

## Limitations

- Some websites hide nutrition data in images only; this extension cannot OCR images.
- If values are only visible after clicking/expanding a section, expand it before running the extension.
- Retailer pages may mix flavors, sizes, or multipacks. Always verify before approval.
- This tool does not confirm exact UPC unless the page text itself contains the UPC.
