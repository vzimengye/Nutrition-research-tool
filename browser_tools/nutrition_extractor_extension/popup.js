const CANDIDATE_COLUMNS = [
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
];

let currentResult = null;
let currentImages = [];

document.addEventListener("DOMContentLoaded", async () => {
  document.getElementById("copy-row").addEventListener("click", copyCandidateRow);
  document.getElementById("copy-text").addEventListener("click", copyPageText);
  await runExtraction();
});

async function runExtraction() {
  const status = document.getElementById("status");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: collectPageText,
    });

    currentResult = parseNutrition(result);
    renderResult(currentResult);
    status.textContent = "Candidate extracted from current page text.";
  } catch (error) {
    status.textContent = `Could not extract page: ${error.message}`;
  }
}

function collectPageText() {
  const images = Array.from(document.images)
    .map((img) => ({
      src: img.currentSrc || img.src || "",
      alt: img.alt || "",
      title: img.title || "",
      ariaLabel: img.getAttribute("aria-label") || "",
      width: img.naturalWidth || img.width || 0,
      height: img.naturalHeight || img.height || 0,
    }))
    .filter((img) => img.src && !img.src.startsWith("data:"));
  const jsonLd = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
    .map((node) => node.textContent || "")
    .join(" ");
  const imageText = images
    .map((img) => [img.alt, img.title, img.ariaLabel, img.src].filter(Boolean).join(" "))
    .join(" ");
  const metaText = Array.from(document.querySelectorAll("meta"))
    .map((meta) => meta.content || "")
    .join(" ");
  const bodyText = document.body ? document.body.innerText : "";
  return {
    url: location.href,
    title: document.title || "",
    images,
    text: `${document.title || ""} ${metaText} ${jsonLd} ${imageText} ${bodyText}`
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 100000),
  };
}

function parseNutrition(page) {
  const text = page.text || "";
  const serving = servingSizeFromText(text);
  const values = {
    candidate_servings_per_container: numberAfter(text, /servings?\s+per\s+container/i),
    candidate_serving_size_q: serving.quantity,
    candidate_serving_size_uom: serving.unit,
    candidate_calories: nutrientNumber(text, /calories/i),
    candidate_totalfat: nutrientNumber(text, /total\s+fat|fat/i),
    candidate_totalcarb: nutrientNumber(text, /total\s+carbohydrate|carbohydrate|carbs?/i),
    candidate_sugar: zeroIfPhrase(text, /\b(no|zero)\s+sugar\b/i, nutrientNumber(text, /total\s+sugars?|sugars?|sugar/i)),
    candidate_addedsugar: zeroIfPhrase(text, /\b(no|zero)\s+added\s+sugars?\b/i, nutrientNumber(text, /added\s+sugars?/i)),
    candidate_protein: nutrientNumber(text, /protein/i),
    candidate_year: "",
    candidate_source: page.url,
  };
  currentImages = rankLikelyNutritionImages(page.images || []);
  return {
    page,
    values,
    tsv: CANDIDATE_COLUMNS.map((column) => emptyIfNull(values[column])).join("\t"),
  };
}

function renderResult(result) {
  const rows = CANDIDATE_COLUMNS.map((column) => {
    const value = emptyIfNull(result.values[column]);
    return `<tr><th>${escapeHtml(column)}</th><td>${escapeHtml(value)}</td></tr>`;
  }).join("");

  document.getElementById("result").innerHTML = `<table>${rows}</table>`;
  document.getElementById("tsv").value = result.tsv;
  renderImages(currentImages);
}

async function copyCandidateRow() {
  if (!currentResult) return;
  await navigator.clipboard.writeText(currentResult.tsv);
  document.getElementById("status").textContent = "Candidate row copied.";
}

async function copyPageText() {
  if (!currentResult) return;
  await navigator.clipboard.writeText(currentResult.page.text);
  document.getElementById("status").textContent = "Page text copied.";
}

function renderImages(images) {
  const container = document.getElementById("images");
  if (!images.length) {
    container.innerHTML = `<p class="hint">No likely nutrition label images found on this page. Try opening the product image gallery first.</p>`;
    return;
  }

  container.innerHTML = images.slice(0, 8).map((image, index) => `
    <div class="image-item">
      <img src="${escapeHtml(image.src)}" alt="">
      <div class="image-meta">
        <strong>Score: ${escapeHtml(image.score)}</strong>
        <code>${escapeHtml(image.src)}</code>
        <button type="button" data-image-index="${index}">Copy image URL</button>
      </div>
    </div>
  `).join("");

  container.querySelectorAll("button[data-image-index]").forEach((button) => {
    button.addEventListener("click", async () => {
      const image = images[Number(button.dataset.imageIndex)];
      await navigator.clipboard.writeText(image.src);
      document.getElementById("status").textContent = "Image URL copied. Paste it into ocr_image_url.";
    });
  });
}

function rankLikelyNutritionImages(images) {
  return images
    .map((image) => ({
      ...image,
      score: scoreNutritionImage(image),
    }))
    .filter((image) => image.score >= 2)
    .sort((a, b) => b.score - a.score);
}

function scoreNutritionImage(image) {
  const text = `${image.src} ${image.alt} ${image.title} ${image.ariaLabel}`.toLowerCase();
  let score = 0;
  if (/nutrition|nutritional|facts|label/.test(text)) score += 8;
  if (/ingredient|panel|back|secondary|image|fullcontent/.test(text)) score += 2;
  if (/front|hero|main|primary/.test(text)) score -= 2;
  if (image.width >= 250 && image.height >= 120) score += 1;
  if (image.width > 0 && image.height > 0) {
    const ratio = image.width / image.height;
    if (ratio > 1.2 && ratio < 4.5) score += 1;
  }
  return score;
}

function servingSizeFromText(text) {
  const source = normalizeText(text);
  const match = source.match(/serving\s+size\D*([0-9]+(?:\.[0-9]+)?|[0-9]+\/[0-9]+)\s*(g|gram|grams|oz|fl oz|ml|cup|cups)/i);
  if (!match) return { quantity: "", unit: "" };
  return {
    quantity: parseNumberLike(match[1]),
    unit: normalizeUnit(match[2]),
  };
}

function numberAfter(text, labelRegex) {
  const source = normalizeText(text);
  const match = source.match(new RegExp(`${labelRegex.source}\\D*([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? Number(match[1]) : "";
}

function nutrientNumber(text, labelRegex) {
  const source = normalizeText(text);
  const after = source.match(new RegExp(`${labelRegex.source}\\D*([0-9]+(?:\\.[0-9]+)?)\\s*(?:g|gram|grams|mg|kcal)?`, "i"));
  if (after) return Number(after[1]);
  const before = source.match(new RegExp(`([0-9]+(?:\\.[0-9]+)?)\\s*(?:g|gram|grams|mg|kcal)?\\s*${labelRegex.source}`, "i"));
  return before ? Number(before[1]) : "";
}

function zeroIfPhrase(text, phraseRegex, fallback) {
  return phraseRegex.test(normalizeText(text)) ? 0 : fallback;
}

function parseNumberLike(value) {
  const clean = String(value || "").trim();
  if (clean.includes("/")) {
    const [left, right] = clean.split("/").map(Number);
    return right ? round(left / right) : "";
  }
  const parsed = Number(clean);
  return Number.isNaN(parsed) ? "" : parsed;
}

function normalizeUnit(unit) {
  const clean = String(unit || "").trim().toLowerCase();
  if (["gram", "grams"].includes(clean)) return "g";
  if (["cup", "cups"].includes(clean)) return "cup";
  return clean;
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function emptyIfNull(value) {
  return value === undefined || value === null ? "" : String(value);
}

function escapeHtml(value) {
  return emptyIfNull(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
