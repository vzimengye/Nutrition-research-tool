# UPC Nutrition Google Sheets Tool

This tool improves UPC nutrition collection with a three-layer workflow:

```text
1. Exact UPC source cache -> write final columns
2. Exact UPC online lookup -> write final columns
3. Name/brand or OCR candidate -> candidate columns, needs review
```

## Exact Match Rule

An exact match means the source returns either the same UPC digits as the sheet
`upc`, or the same UPC with leading zeros added to standard GTIN lengths
`12`, `13`, or `14`.

For example, if the sheet has:

```text
3663202019
```

then these are treated as exact-equivalent:

```text
3663202019
003663202019
0003663202019
00003663202019
```

The tool does not generate or accept check-digit variants as exact matches.

Only exact matches write directly to:

```text
ServingsPerContainer
ServSize_q
ServSize_uom
calories
totalfat
totalcarb
sugar
addedsugar
protein
year
source
```

Name/brand matches, retailer pages, brand pages, and OCR results are candidates only.

## Build Local Source Cache

Use the local script:

```powershell
python local_tools/build_nutrition_source_cache.py `
  --input icecream_upc_all.csv `
  --input yogurt_upc_all.csv `
  --output nutrition_source_cache.csv `
  --openfoodfacts-csv en.openfoodfacts.org.products.csv `
  --fdc-dir FoodData_Central_branded_food_csv
```

You can use either Open Food Facts, USDA FoodData Central, or both:

```powershell
python local_tools/build_nutrition_source_cache.py `
  --input icecream_upc_all.csv `
  --output nutrition_source_cache.csv `
  --openfoodfacts-csv en.openfoodfacts.org.products.csv
```

```powershell
python local_tools/build_nutrition_source_cache.py `
  --input icecream_upc_all.csv `
  --output nutrition_source_cache.csv `
  --fdc-dir FoodData_Central_branded_food_csv
```

After generating the cache:

1. Open the Google Sheet.
2. Import `nutrition_source_cache.csv`.
3. Rename the imported tab exactly:

```text
nutrition_source_cache
```

## Apps Script Installation

1. Open the shared Google Sheet.
2. Go to `Extensions > Apps Script`.
3. Paste the contents of `NutritionTools.gs`.
4. Save.
5. Refresh the Google Sheet.

The menu will appear as:

```text
Nutrition Tools
```

## Recommended Sheet Workflow

1. Run:

```text
Nutrition Tools > Set up columns
```

2. Generate links:

```text
Nutrition Tools > Generate search links
```

3. Use cache first:

```text
Nutrition Tools > Lookup selected rows from source cache
```

4. For rows still missing, run online lookup:

```text
Nutrition Tools > Lookup selected rows online
```

5. For rows with candidate values, review manually and run:

```text
Nutrition Tools > Approve selected candidates
```

## Candidate Search Links

The script creates targeted links:

```text
"{upc}" or leading-zero GTIN candidates nutrition facts UPC
"{brand_descr}" "{upc_descr}" nutrition facts
"{brand_descr}" "{upc_descr}" site:walmart.com nutrition facts
"{brand_descr}" "{upc_descr}" site:target.com nutrition facts
"{brand_descr}" "{upc_descr}" site:kroger.com nutrition facts
"{brand_descr}" "{upc_descr}" nutrition facts label
```

Retailer and brand pages are candidates unless they expose the same exact UPC.

## OCR Fallback

If a product page only has a nutrition label image:

1. Copy the direct image URL.
2. Paste it into `ocr_image_url`.
3. Select the row.
4. Run:

```text
Nutrition Tools > Parse OCR image URLs
```

The parsed values go into `candidate_*` columns and must be reviewed.

OCR requires Google Apps Script Drive advanced service:

1. In Apps Script, click `Services`.
2. Add `Drive API`.
3. Save.

## Statuses

```text
Exact UPC auto-filled:
Exact structured source matched the same UPC and final columns were filled.

Needs review:
Candidate was found by name/brand search or manual OCR.

OCR parsed - needs review:
Nutrition fields came from an image OCR attempt.

Verified:
Candidate was reviewed and copied to final columns.

Not found:
No cache, exact online match, or candidate was found.
```

Verified rows are skipped by lookup commands to avoid overwriting reviewed work.
