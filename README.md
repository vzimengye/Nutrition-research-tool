# Nutrition Research Tool

This repository contains a Google Sheets-based workflow for collecting UPC-level nutrition information for the yogurt and ice cream research project.

The tool is designed to help the team:

- Search product nutrition information by UPC, brand, and product description.
- Auto-fill final nutrition columns only when an exact UPC match is found.
- Save non-exact product matches into review columns instead of overwriting final data.
- Generate targeted search links for brand sites, retailers, and nutrition label images.
- Optionally parse nutrition label images through OCR when a direct image URL is available.

## Current Status

This is an active prototype and is still being tested and improved. Major workflow changes will be shared with the team by email. Smaller updates will be documented here and in `google_sheets_apps_script/README.md`.

## Main Google Sheets Workflow

1. Open the shared Google Sheet.
2. Use the `Nutrition Tools` menu.
3. Start with:

```text
Set up columns
Generate search links
```

4. For selected rows, run:

```text
Lookup selected rows online
```

5. Review any rows marked:

```text
Needs review
```

6. After confirming a candidate is correct, run:

```text
Approve selected candidates
```

## Match Rules

Exact UPC matches are written directly to the final nutrition columns. The tool treats leading-zero GTIN variants as exact-equivalent because scanner datasets may omit leading zeros.

Name/brand matches, retailer pages, brand pages, and OCR results are treated as candidates and must be reviewed manually before approval.

## Files

- `google_sheets_apps_script/NutritionTools.gs`: Apps Script code to paste into Google Sheets.
- `google_sheets_apps_script/README.md`: Detailed setup and usage instructions.
- `local_tools/build_nutrition_source_cache.py`: Optional script for building a local exact-UPC source cache from public nutrition data exports.
- `local_tools/add_automation_columns.py`: Optional local CSV helper for previewing automation columns.
