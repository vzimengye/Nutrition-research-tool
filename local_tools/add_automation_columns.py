"""Add UPC nutrition automation helper columns to a CSV file.

Usage:
    python local_tools/add_automation_columns.py icecream_upc_all.csv icecream_upc_all_automation_template.csv

The output CSV keeps the original columns and appends helper columns that mirror
the Google Sheets automation. It is useful for previewing the workflow before
installing the Apps Script in Google Sheets.
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path
from urllib.parse import quote_plus


HELPER_COLUMNS = [
    "review_status",
    "clean_search_terms",
    "upc_candidates",
    "search_google_upc",
    "search_google_name",
    "search_google_images",
    "search_google_added_sugar",
    "search_brand_site",
    "search_retailers",
    "barcode_lookup_link",
    "open_food_facts_link",
    "auto_match_name",
    "auto_brand",
    "auto_matched_upc",
    "auto_lookup_method",
    "auto_servings_per_container",
    "auto_serving_size_q",
    "auto_serving_size_uom",
    "auto_calories",
    "auto_totalfat",
    "auto_totalcarb",
    "auto_sugar",
    "auto_addedsugar",
    "auto_protein",
    "auto_year",
    "auto_source",
    "match_confidence",
    "human_verified",
    "notes",
]


def google_search_link(query: str, label: str) -> str:
    url = f"https://www.google.com/search?q={quote_plus(query)}"
    return f'=HYPERLINK("{url}","{label}")'


def open_food_facts_link(upc: str) -> str:
    url = f"https://world.openfoodfacts.org/product/{quote_plus(upc)}"
    return f'=HYPERLINK("{url}","Open Food Facts")'


def barcode_lookup_link(upc: str) -> str:
    url = f"https://www.barcodelookup.com/{quote_plus(upc)}"
    return f'=HYPERLINK("{url}","Barcode Lookup")'


def google_images_link(query: str, label: str) -> str:
    url = f"https://www.google.com/search?tbm=isch&q={quote_plus(query)}"
    return f'=HYPERLINK("{url}","{label}")'


def build_clean_search_terms(brand: str, product: str) -> str:
    import re

    text = f"{brand or ''} {product or ''}"
    text = re.sub(r"[-_/]", " ", text)
    text = re.sub(r"\b(sp|oz|ounce|fluid|fl|tub|box|cup|cups|ct|count|same|upc|all|flavors)\b", " ", text, flags=re.I)
    text = re.sub(r"\b([0-9]+)\s*(g|gram|grams|oz|ounce|ounces|ct|count|fl oz|ml)\b", " ", text, flags=re.I)
    words = re.sub(r"\s+", " ", text).strip().split()
    seen = set()
    deduped = []
    for word in words:
        key = word.lower()
        if key not in seen:
            seen.add(key)
            deduped.append(word)
    return " ".join(deduped)


def upc_candidates(upc: str) -> str:
    candidates = []

    def add(value: str) -> None:
        if value and value not in candidates:
            candidates.append(value)

    add(upc)
    if len(upc) < 12:
        add(upc.zfill(12))
    if len(upc) < 13:
        add(upc.zfill(13))
    return " OR ".join(candidates)


def guess_brand_domain(brand: str) -> str:
    clean = (brand or "").lower()
    if "chobani" in clean:
        return "chobani.com"
    if any(term in clean for term in ["oikos", "dannon", "activia", "light & fit"]):
        return "dannon.com"
    if "yoplait" in clean:
        return "yoplait.com"
    if "fage" in clean:
        return "usa.fage"
    if "blue bell" in clean:
        return "bluebell.com"
    if "breyers" in clean:
        return "breyers.com"
    if "haagen" in clean:
        return "icecream.com"
    if "ben" in clean and "jerry" in clean:
        return "benjerry.com"
    return ""


def add_helper_values(row: dict[str, str]) -> dict[str, str]:
    upc = "".join(ch for ch in row.get("upc", "") if ch.isdigit())
    product = row.get("upc_descr", "")
    brand = row.get("brand_descr", "")
    clean_terms = build_clean_search_terms(brand, product)
    name_query = " ".join(part for part in [clean_terms, "nutrition facts"] if part)
    image_query = " ".join(part for part in [clean_terms, "nutrition facts label"] if part)
    added_sugar_query = " ".join(part for part in [clean_terms, "added sugar nutrition"] if part)
    brand_site_query = " ".join(part for part in [clean_terms, "nutrition facts", "site:", guess_brand_domain(brand)] if part)
    retailer_query = " ".join(part for part in [clean_terms, "nutrition facts", "(walmart OR target OR kroger OR instacart OR safeway)"] if part)

    helper_values = {
        "review_status": "Not started",
        "clean_search_terms": clean_terms,
        "upc_candidates": upc_candidates(upc),
        "search_google_upc": google_search_link(f"{upc} nutrition facts", "UPC nutrition") if upc else "",
        "search_google_name": google_search_link(name_query, "Name nutrition") if name_query else "",
        "search_google_images": google_images_link(image_query, "Images label") if image_query else "",
        "search_google_added_sugar": google_search_link(added_sugar_query, "Added sugar") if added_sugar_query else "",
        "search_brand_site": google_search_link(brand_site_query, "Brand site") if brand_site_query else "",
        "search_retailers": google_search_link(retailer_query, "Retailers") if retailer_query else "",
        "barcode_lookup_link": barcode_lookup_link(upc) if upc else "",
        "open_food_facts_link": open_food_facts_link(upc) if upc else "",
    }

    for column in HELPER_COLUMNS:
        row[column] = helper_values.get(column, row.get(column, ""))

    return row


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__.strip())
        return 2

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    with input_path.open("r", newline="", encoding="utf-8-sig") as source_file:
        reader = csv.DictReader(source_file)
        if reader.fieldnames is None:
            raise ValueError("Input CSV has no header row.")

        fieldnames = list(reader.fieldnames)
        for column in HELPER_COLUMNS:
            if column not in fieldnames:
                fieldnames.append(column)

        with output_path.open("w", newline="", encoding="utf-8") as output_file:
            writer = csv.DictWriter(output_file, fieldnames=fieldnames)
            writer.writeheader()
            for row in reader:
                writer.writerow(add_helper_values(row))

    print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
