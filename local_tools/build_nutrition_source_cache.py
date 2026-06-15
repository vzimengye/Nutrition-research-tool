"""Build an exact-UPC nutrition source cache for the Google Sheets tool.

This script does not require API keys. It reads project UPC CSV files and
optional public data exports, then writes nutrition_source_cache.csv.

Examples:
    python local_tools/build_nutrition_source_cache.py ^
      --input icecream_upc_all.csv ^
      --input yogurt_upc_all.csv ^
      --output nutrition_source_cache.csv ^
      --openfoodfacts-csv en.openfoodfacts.org.products.csv

    python local_tools/build_nutrition_source_cache.py ^
      --input icecream_upc_all.csv ^
      --output nutrition_source_cache.csv ^
      --fdc-dir FoodData_Central_branded_food_csv

Expected USDA files inside --fdc-dir:
    food.csv
    branded_food.csv
    food_nutrient.csv
    nutrient.csv

Output columns match the Google Sheets nutrition_source_cache sheet schema.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import json
import re
from pathlib import Path
from typing import Iterable, Iterator


CACHE_COLUMNS = [
    "upc",
    "source_name",
    "source_url",
    "matched_name",
    "matched_brand",
    "ServingsPerContainer",
    "ServSize_q",
    "ServSize_uom",
    "calories",
    "totalfat",
    "totalcarb",
    "sugar",
    "addedsugar",
    "protein",
    "year",
    "match_type",
]


def clean_upc(value: object) -> str:
    return re.sub(r"\D", "", str(value or ""))


def exact_upc_candidates(upc: str) -> set[str]:
    clean = clean_upc(upc)
    candidates = {clean} if clean else set()
    for length in (12, 13, 14):
        if clean and len(clean) < length:
            candidates.add(clean.zfill(length))
    return candidates


def first_present(*values: object) -> str:
    for value in values:
        if value is not None and str(value).strip() != "":
            return str(value).strip()
    return ""


def open_text(path: Path):
    if path.suffix.lower() == ".gz":
        return gzip.open(path, "rt", encoding="utf-8", newline="")
    return path.open("r", encoding="utf-8-sig", newline="")


def load_project_upcs(input_paths: Iterable[Path]) -> set[str]:
    upcs: set[str] = set()
    for path in input_paths:
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if "upc" not in (reader.fieldnames or []):
                raise ValueError(f"{path} is missing required 'upc' column")
            for row in reader:
                upc = clean_upc(row.get("upc"))
                if upc:
                    upcs.update(exact_upc_candidates(upc))
    return upcs


def parse_serving_size(text: str) -> tuple[str, str]:
    match = re.search(r"([0-9]+(?:\.[0-9]+)?|[0-9]+/[0-9]+)\s*(g|gram|grams|oz|fl oz|ml|cup|cups|count|ct)?", text or "", re.I)
    if not match:
        return "", ""
    return parse_number_like(match.group(1)), normalize_unit(match.group(2) or "")


def parse_number_like(value: str) -> str:
    value = (value or "").strip()
    if "/" in value:
        left, _, right = value.partition("/")
        try:
            denominator = float(right)
            if denominator:
                return str(round(float(left) / denominator, 4)).rstrip("0").rstrip(".")
        except ValueError:
            return ""
    return value


def normalize_unit(unit: str) -> str:
    clean = (unit or "").strip().lower()
    if clean in {"gram", "grams"}:
        return "g"
    if clean in {"fluid ounce", "fl oz"}:
        return "fl oz"
    if clean in {"ounce", "ounces"}:
        return "oz"
    if clean in {"cup", "cups"}:
        return "cup"
    if clean in {"count", "ct"}:
        return "count"
    return clean


def iter_openfoodfacts_csv(path: Path, project_upcs: set[str]) -> Iterator[dict[str, str]]:
    with open_text(path) as handle:
        sample = handle.read(4096)
        handle.seek(0)
        delimiter = "\t" if sample.count("\t") > sample.count(",") else ","
        reader = csv.DictReader(handle, delimiter=delimiter)
        for row in reader:
            upc = clean_upc(row.get("code"))
            if not upc or upc not in project_upcs:
                continue
            yield openfoodfacts_row_to_cache(row, upc)


def iter_openfoodfacts_jsonl(path: Path, project_upcs: set[str]) -> Iterator[dict[str, str]]:
    with open_text(path) as handle:
        for line in handle:
            if not line.strip():
                continue
            product = json.loads(line)
            upc = clean_upc(product.get("code"))
            if not upc or upc not in project_upcs:
                continue
            yield openfoodfacts_row_to_cache(product, upc)


def openfoodfacts_row_to_cache(row: dict, upc: str) -> dict[str, str]:
    serving_q, serving_uom = parse_serving_size(str(row.get("serving_size", "")))
    nutriments = row.get("nutriments") if isinstance(row.get("nutriments"), dict) else {}

    def value(*keys: str) -> str:
        for key in keys:
            if isinstance(nutriments, dict) and first_present(nutriments.get(key)):
                return first_present(nutriments.get(key))
            if first_present(row.get(key)):
                return first_present(row.get(key))
        return ""

    year = ""
    modified = first_present(row.get("last_modified_t"), row.get("last_modified_datetime"))
    if modified.isdigit():
        from datetime import datetime

        year = str(datetime.utcfromtimestamp(int(modified)).year)
    elif len(modified) >= 4:
        year = modified[:4]

    return {
        "upc": upc,
        "source_name": "Open Food Facts export",
        "source_url": f"https://world.openfoodfacts.org/product/{upc}",
        "matched_name": first_present(row.get("product_name"), row.get("generic_name")),
        "matched_brand": first_present(row.get("brands")),
        "ServingsPerContainer": first_present(row.get("servings_per_package")),
        "ServSize_q": serving_q,
        "ServSize_uom": serving_uom,
        "calories": value("energy-kcal_serving", "energy-kcal", "energy-kcal_100g"),
        "totalfat": value("fat_serving", "fat", "fat_100g"),
        "totalcarb": value("carbohydrates_serving", "carbohydrates", "carbohydrates_100g"),
        "sugar": value("sugars_serving", "sugars", "sugars_100g"),
        "addedsugar": value("added-sugars_serving", "added-sugars", "added-sugars_100g"),
        "protein": value("proteins_serving", "proteins", "proteins_100g"),
        "year": year,
        "match_type": "Open Food Facts exact UPC cache",
    }


def load_fdc_lookup(fdc_dir: Path) -> tuple[dict[str, dict[str, str]], dict[str, str], dict[str, tuple[str, str]]]:
    food_path = fdc_dir / "food.csv"
    branded_path = fdc_dir / "branded_food.csv"
    nutrient_path = fdc_dir / "nutrient.csv"
    food_nutrient_path = fdc_dir / "food_nutrient.csv"

    for path in [food_path, branded_path, nutrient_path, food_nutrient_path]:
        if not path.exists():
            raise FileNotFoundError(f"Missing USDA file: {path}")

    foods: dict[str, dict[str, str]] = {}
    with food_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            foods[row["fdc_id"]] = row

    branded: dict[str, dict[str, str]] = {}
    with branded_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            branded[row["fdc_id"]] = row

    nutrients: dict[str, tuple[str, str]] = {}
    with nutrient_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            nutrients[row["id"]] = (row.get("name", ""), row.get("unit_name", ""))

    food_nutrients: dict[str, dict[str, str]] = {}
    wanted = {
        ("energy", "kcal"): "calories",
        ("total lipid (fat)", "g"): "totalfat",
        ("total fat", "g"): "totalfat",
        ("carbohydrate, by difference", "g"): "totalcarb",
        ("carbohydrate", "g"): "totalcarb",
        ("sugars, total including nlea", "g"): "sugar",
        ("sugars, total", "g"): "sugar",
        ("sugars, added", "g"): "addedsugar",
        ("added sugars", "g"): "addedsugar",
        ("protein", "g"): "protein",
    }
    with food_nutrient_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            name, unit = nutrients.get(row.get("nutrient_id", ""), ("", ""))
            target = wanted.get((name.lower(), unit.lower()))
            if not target:
                continue
            fdc_id = row.get("fdc_id", "")
            food_nutrients.setdefault(fdc_id, {})[target] = first_present(row.get("amount"))

    return branded, foods, food_nutrients


def iter_fdc_cache(fdc_dir: Path, project_upcs: set[str]) -> Iterator[dict[str, str]]:
    branded, foods, food_nutrients = load_fdc_lookup(fdc_dir)
    for fdc_id, branded_row in branded.items():
        upc = clean_upc(branded_row.get("gtin_upc"))
        if not upc or upc not in project_upcs:
            continue
        food_row = foods.get(fdc_id, {})
        nutrients = food_nutrients.get(fdc_id, {})
        yield {
            "upc": upc,
            "source_name": "USDA FoodData Central Branded Foods",
            "source_url": f"https://fdc.nal.usda.gov/fdc-app.html#/food-details/{fdc_id}/nutrients",
            "matched_name": first_present(food_row.get("description")),
            "matched_brand": first_present(branded_row.get("brand_name"), branded_row.get("brand_owner")),
            "ServingsPerContainer": "",
            "ServSize_q": first_present(branded_row.get("serving_size")),
            "ServSize_uom": normalize_unit(branded_row.get("serving_size_unit", "")),
            "calories": nutrients.get("calories", ""),
            "totalfat": nutrients.get("totalfat", ""),
            "totalcarb": nutrients.get("totalcarb", ""),
            "sugar": nutrients.get("sugar", ""),
            "addedsugar": nutrients.get("addedsugar", ""),
            "protein": nutrients.get("protein", ""),
            "year": first_present(branded_row.get("available_date"), branded_row.get("modified_date"))[:4],
            "match_type": "USDA FoodData Central exact UPC cache",
        }


def is_useful_cache_row(row: dict[str, str]) -> bool:
    fields = ["calories", "totalfat", "totalcarb", "sugar", "addedsugar", "protein", "ServSize_q"]
    return any(first_present(row.get(field)) for field in fields)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", action="append", required=True, type=Path, help="Project UPC CSV file")
    parser.add_argument("--output", required=True, type=Path, help="Output nutrition_source_cache.csv")
    parser.add_argument("--openfoodfacts-csv", type=Path, help="Open Food Facts CSV/TSV export, optionally .gz")
    parser.add_argument("--openfoodfacts-jsonl", type=Path, help="Open Food Facts JSONL export, optionally .gz")
    parser.add_argument("--fdc-dir", type=Path, help="USDA FoodData Central branded foods CSV directory")
    args = parser.parse_args()

    project_upcs = load_project_upcs(args.input)
    rows_by_upc: dict[str, dict[str, str]] = {}

    def add_rows(rows: Iterable[dict[str, str]]) -> None:
        for row in rows:
            upc = clean_upc(row.get("upc"))
            if not upc or upc in rows_by_upc or not is_useful_cache_row(row):
                continue
            rows_by_upc[upc] = {column: first_present(row.get(column)) for column in CACHE_COLUMNS}

    if args.openfoodfacts_csv:
        add_rows(iter_openfoodfacts_csv(args.openfoodfacts_csv, project_upcs))
    if args.openfoodfacts_jsonl:
        add_rows(iter_openfoodfacts_jsonl(args.openfoodfacts_jsonl, project_upcs))
    if args.fdc_dir:
        add_rows(iter_fdc_cache(args.fdc_dir, project_upcs))

    with args.output.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CACHE_COLUMNS)
        writer.writeheader()
        for upc in sorted(rows_by_upc):
            writer.writerow(rows_by_upc[upc])

    print(f"Project UPCs: {len(project_upcs)}")
    print(f"Cache rows written: {len(rows_by_upc)}")
    print(f"Output: {args.output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
