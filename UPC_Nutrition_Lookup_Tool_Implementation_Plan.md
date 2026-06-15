# UPC Nutrition Lookup Tool Implementation Plan

## Goal

Build a shared tool that helps the research team collect UPC-level nutrition information more efficiently and accurately.

The tool should help users:

- Search a product by UPC.
- Find reliable nutrition information sources.
- Extract standardized nutrition fields.
- Track source links and confidence levels.
- Let non-CS teammates review and verify results easily.
- Eventually write verified results back to the shared Google Sheets.

The recommended path is to start with a Google Sheets MVP, then build a simple web app as a stronger resume project.

---

## Project Context

The research project studies whether added sugar labeling affects consumer demand, especially for products such as yogurt and ice cream. Existing nutrition datasets only cover part of the Nielsen product universe, so the SPUR task is to collect additional nutrition information for UPC-level products.

The available product-level inputs are:

- `upc`: unique product barcode.
- `upc_descr`: product description.
- `brand_descr`: product or sub-brand description.

The target fields to collect are:

- `ServingsPerContainer`
- `ServSize_q`
- `ServSize_uom`
- `calories`
- `totalfat`
- `totalcarb`
- `sugar`
- `added sugar`
- `protein`
- `year`
- `source`

---

## Recommended Strategy

Do not begin with a fully complex web app or scraper.

Instead, build the tool in three stages:

1. Google Sheets automation MVP
2. UPC lookup web app
3. Google Sheets API write-back workflow

This approach gives the team something usable quickly, while still creating a more impressive technical project for your resume.

---

## Phase 1: Google Sheets MVP

### Objective

Create a team-friendly workflow directly inside the existing Google Sheets so non-CS teammates can use it immediately.

### Why Start Here

- The team is already working in Google Sheets.
- No one needs to install software.
- It avoids version-control and file-merging issues.
- It is easier for non-CS teammates to use.
- It can be built quickly.

### Sheet Structure

Keep the original input columns:

```text
upc
upc_descr
brand_descr
```

Add search helper columns:

```text
search_google_upc
search_google_name
search_google_added_sugar
open_food_facts_link
usda_search_link
```

Add automatic lookup columns:

```text
auto_match_name
auto_brand
auto_servings_per_container
auto_serving_size
auto_serving_unit
auto_calories
auto_totalfat
auto_totalcarb
auto_sugar
auto_added_sugar
auto_protein
auto_year
auto_source
match_confidence
```

Add final human-verified columns:

```text
final_servings_per_container
final_serving_size
final_serving_unit
final_calories
final_totalfat
final_totalcarb
final_sugar
final_added_sugar
final_protein
final_year
final_source
human_verified
notes
```

### Search Link Formulas

For each row, generate clickable search links such as:

```text
{UPC} nutrition facts
{UPC} calories
{brand_descr} {upc_descr} nutrition facts
{brand_descr} {upc_descr} added sugar
```

These links give teammates a fast fallback even when automatic lookup fails.

### Status System

Add a dropdown status column:

```text
Not started
Auto-filled
Needs review
Verified
Not found
Duplicate
```

Suggested colors:

```text
Not started = white
Auto-filled = blue
Needs review = yellow
Verified = green
Not found = red
Duplicate = gray
```

### Google Apps Script Menu

Create a custom Google Sheets menu:

```text
Nutrition Tools
- Generate search links
- Lookup selected UPCs
- Mark selected as verified
- Clear auto-filled fields
- Open source link
```

The most important feature is `Lookup selected UPCs`, which should take selected rows, query a nutrition source, and fill the `auto_*` columns.

---

## Phase 2: Automatic UPC Lookup

### Objective

Automatically query public nutrition databases by UPC and pre-fill candidate nutrition information.

### Primary Data Source

Start with Open Food Facts API:

```text
https://world.openfoodfacts.org/api/v2/product/{UPC}.json
```

Useful fields may include:

```text
product.product_name
product.brands
product.serving_size
product.nutriments.energy-kcal_serving
product.nutriments.fat_serving
product.nutriments.carbohydrates_serving
product.nutriments.sugars_serving
product.nutriments.proteins_serving
product.nutriments.energy-kcal_100g
product.nutriments.fat_100g
product.nutriments.carbohydrates_100g
product.nutriments.sugars_100g
product.nutriments.proteins_100g
```

### Fallback Search Sources

If UPC lookup fails, generate links for:

```text
Google search
Brand website
Retailer product pages
Open Food Facts search
USDA FoodData Central search
```

### Match Confidence Rules

Use a simple confidence label:

```text
High:
UPC exact match and product name or brand appears consistent.

Medium:
UPC match exists, but product name or brand is incomplete or slightly inconsistent.

Low:
Only name-based search result exists, no exact UPC match.

Not found:
No usable nutrition information found.
```

### Important Data Quality Rule

Automatic results should fill only the `auto_*` columns.

They should not overwrite the `final_*` columns. The final values should be entered or approved by a human reviewer.

---

## Phase 3: Simple UPC Lookup Website

### Objective

Build a small web app where users can enter a UPC and see nutrition results in a clear interface.

This is less necessary for immediate team workflow, but it has stronger resume value.

### Core Features

The first version should include:

```text
UPC search box
Product match panel
Nutrition facts panel
Source links
Confidence badge
Copy-to-Sheet button
```

### Suggested Page Layout

```text
[UPC Search Bar]

Product Match
- Product name
- Brand
- UPC
- Source
- Confidence

Nutrition Facts
- Servings per container
- Serving size
- Calories
- Total fat
- Total carbs
- Sugar
- Added sugar
- Protein

Actions
- Copy standardized values
- Open source link
- Mark uncertain
```

### Recommended Tech Stack

Practical resume-friendly version:

```text
Frontend: React or Next.js
Backend: Next.js API routes
Data source: Open Food Facts API plus generated fallback search links
Deployment: Vercel
```

Simpler version:

```text
Frontend: plain HTML/CSS/JavaScript
Backend: none
Data source: Open Food Facts API directly from browser
Deployment: GitHub Pages
```

### Recommended Choice

Use Next.js if you want a stronger portfolio project.

Use plain HTML/CSS/JavaScript if your priority is speed and simplicity.

---

## Phase 4: Google Sheets API Integration

### Objective

Turn the website from a lookup tool into a review workflow.

### Features

The web app should be able to:

```text
Load assigned rows from Google Sheets
Show one incomplete product at a time
Run UPC lookup automatically
Display candidate nutrition fields
Let user approve, edit, or reject
Write approved values back to Google Sheets
Move to the next product
```

### Ideal User Workflow

```text
1. User selects category: yogurt or ice cream.
2. User enters assigned row range.
3. App loads the first incomplete row.
4. App searches by UPC.
5. User checks product match and source.
6. User clicks Approve, Needs Review, or Not Found.
7. App writes result back to Google Sheets.
8. App moves to the next product.
```

This version is the most polished and team-friendly, but it requires more setup because of Google Sheets API permissions.

---

## Suggested Timeline

### Day 1

- Add helper columns to Google Sheets.
- Add status dropdowns.
- Add conditional formatting.
- Add search-link formulas.

### Day 2

- Write basic Google Apps Script menu.
- Add `Generate search links`.
- Add `Mark selected as verified`.
- Test workflow on 20 rows.

### Day 3

- Add Open Food Facts API lookup.
- Fill `auto_*` columns.
- Add confidence labels.
- Test lookup quality on 50-100 UPCs.

### Day 4-5

- Build simple UPC lookup website.
- Add UPC input.
- Display product match and nutrition values.
- Add source links and copy button.
- Deploy to Vercel or GitHub Pages.

### Optional Week 2

- Connect website to Google Sheets API.
- Add row-range loading.
- Add approve/write-back workflow.
- Add summary dashboard.

---

## Data Validation Checklist

For each product, verify:

- UPC match is exact when possible.
- Product name and brand are consistent with the row.
- Serving size unit is recorded correctly.
- Nutrition values are per serving, not per container or per 100g, unless clearly converted.
- Added sugar is not confused with total sugar.
- Source link is included.
- If nutrition year is available, it is recorded.
- Uncertain products are marked `Needs review`, not forced into the dataset.

---

## Risks and Mitigation

### Risk: Public databases may contain incorrect or outdated entries.

Mitigation:

- Use confidence labels.
- Keep source links.
- Require human verification for final columns.

### Risk: UPC may not return results.

Mitigation:

- Generate fallback search links using UPC, brand, and product description.
- Allow `Not found` status.

### Risk: Teammates may find the workflow too technical.

Mitigation:

- Keep the main workflow in Google Sheets first.
- Use clear status dropdowns.
- Avoid requiring teammates to run code.

### Risk: Website takes too long to build.

Mitigation:

- Treat the website as Phase 2 or 3.
- Start with a simple lookup and copy tool before adding Google Sheets write-back.

---

## Resume Framing

Potential resume bullet:

```text
Built a team-friendly UPC nutrition lookup and validation workflow using Google Sheets automation and a web-based search interface to streamline product-level nutrition data collection for a consumer demand research project.
```

More technical version:

```text
Developed a semi-automated UPC-level nutrition data enrichment pipeline using Google Sheets automation, public nutrition APIs, and a web-based review interface to collect and validate serving size, calories, macronutrients, sugar, and added sugar information for 50K+ food products.
```

Research-focused version:

```text
Designed a reproducible data collection and validation workflow to expand UPC-level nutrition coverage for a study estimating consumer demand responses to added sugar labeling.
```

---

## Recommended Final Scope

For the best balance of efficiency, feasibility, and resume value:

1. Build the Google Sheets automation first.
2. Add automatic UPC lookup from Open Food Facts.
3. Build a simple UPC lookup website with a copy-to-Sheet button.
4. Add Google Sheets write-back only if time allows.

This gives the team an immediately useful tool while also creating a strong technical project that can be described as data enrichment, workflow automation, and research infrastructure.
