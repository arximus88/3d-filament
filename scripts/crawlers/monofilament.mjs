// Monofilament — OpenCart store with rich JSON-LD ProductGroup data.
// Strategy:
//   1. For each material category, fetch the category listing once to map
//      out-of-stock variant URLs (`hpm-button … out-stock`).
//   2. Fetch the first product page in that category — its JSON-LD payload
//      lists every variant in the whole category (sku, name, price, url,
//      image), saving us from visiting each variant individually.
//   3. Marry the two: variant data from JSON-LD, stock flag from category.

const BASE = "https://monofilament.com.ua";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TIMEOUT_MS = 25_000;
const DELAY_MIN_MS = 1000;
const DELAY_MAX_MS = 2200;

const CATEGORIES = [
  { url: "/products/standartnye-materialy/pla/", material: "PLA" },
  { url: "/products/standartnye-materialy/abs/", material: "ABS" },
  { url: "/products/standartnye-materialy/abs-plus/", material: "ABS+" },
  { url: "/products/standartnye-materialy/abs-pro/", material: "ABS-PRO" },
  { url: "/products/standartnye-materialy/copet/", material: "PETG" }, // CoPET = PETG
  { url: "/products/standartnye-materialy/hips/", material: "HIPS" },
  { url: "/products/standartnye-materialy/pctg/", material: "PCTG" },
  { url: "/products/standartnye-materialy/pla-flex/", material: "PLA-FLEX" },
  { url: "/products/standartnye-materialy/pla-lw/", material: "PLA-LW" },
  { url: "/products/inzhinernye-plastiki/asa-plastic/", material: "ASA" },
  { url: "/products/inzhinernye-plastiki/nylon/", material: "Nylon" },
  { url: "/products/inzhinernye-plastiki/pc/", material: "PC" },
  { url: "/products/inzhinernye-plastiki/pa/", material: "PA" },
  { url: "/products/inzhinernye-plastiki/pet/", material: "PET" },
  { url: "/products/inzhinernye-plastiki/pp/", material: "PP" },
  { url: "/products/inzhinernye-plastiki/pbt/", material: "PBT" },
  { url: "/products/inzhinernye-plastiki/elastan/", material: "TPE" },
  {
    url: "/products/inzhinernye-plastiki/thermoplastic-polyurethane/",
    material: "TPU",
  },
  {
    url: "/products/inzhinernye-plastiki/kompozitsionnye-materialy-dlja-3d-printera/",
    material: "Composite",
  },
];

function jitter() {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept-Language": "uk,en;q=0.8",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

function pickFirst(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

// Parse Monofilament-specific name like:
//   "PLA  Натуральный Ø1,75мм Вес:0,75кг"
//   "ABS Carbon Black Ø1,75мм Вес:0,5кг"
function parseName(name) {
  if (!name) return {};
  const cleaned = name.replace(/\s+/g, " ").trim();
  const diameter = pickFirst(cleaned, /Ø\s*([0-9](?:[.,][0-9]+)?)\s*мм/iu);
  const weight = pickFirst(cleaned, /Вес\s*[:\s]\s*([0-9](?:[.,][0-9]+)?)\s*кг/iu);
  // Colour: text between material prefix and Ø.
  let color = null;
  const m = cleaned.match(/^(?:[A-Z]+(?:[-+][A-Z0-9]+)?\s+)+(.+?)\s+Ø/iu);
  if (m) color = m[1].trim();
  if (color) color = normaliseColor(color.replace(/\s+/g, " ").toLowerCase());
  return {
    color: color || null,
    weightKg: weight ? Number(weight.replace(",", ".")) : null,
    diameterMm: diameter ? Number(diameter.replace(",", ".")) : null,
    lengthM: null,
  };
}

// Each product-thumb on the category page contains hpm-button anchors/spans
// for every weight variant. <a class="… hpm-button">…</a> = in stock,
// <span class="… out-stock">…</span> = out of stock. The anchor's href is
// the variant's product URL; <a> attribute order is href-first OR class-first
// in the wild, so we match each <a> tag fully and inspect its attrs.
function extractStockMap(html) {
  const stock = new Map(); // URL → true (in-stock); absence = unknown
  const tagRe = /<a\b([^>]*)>/g;
  let m;
  while ((m = tagRe.exec(html)) !== null) {
    const attrs = m[1];
    if (!/class=['"][^'"]*hpm-button[^'"]*['"]/i.test(attrs)) continue;
    if (/class=['"][^'"]*out-stock[^'"]*['"]/i.test(attrs)) continue;
    const hrefM = attrs.match(/href=['"]([^'"]+)['"]/i);
    if (!hrefM) continue;
    const href = hrefM[1].startsWith("http") ? hrefM[1] : BASE + hrefM[1];
    stock.set(href, true);
  }
  return stock;
}

// Russian → Ukrainian colour normalisation. Keeps multi-word labels
// (e.g. "Carbon Black") as-is; translates single common tokens.
const COLOR_RU_UK = {
  "белый": "білий",
  "черный": "чорний",
  "красный": "червоний",
  "зеленый": "зелений",
  "синий": "синій",
  "жёлтый": "жовтий",
  "желтый": "жовтий",
  "оранжевый": "помаранчевий",
  "розовый": "рожевий",
  "фиолетовый": "фіолетовий",
  "голубой": "блакитний",
  "серый": "сірий",
  "коричневый": "коричневий",
  "натуральный": "натуральний",
  "бирюзовый": "бірюзовий",
  "мятный": "м'ятний",
  "салатовый": "салатовий",
  "хаки": "хакі",
  "бордовый": "бордовий",
  "медный": "мідь",
  "медь": "мідь",
  "золотой": "золото",
  "золото": "золото",
  "серебряный": "срібло",
  "серебро": "срібло",
  "стальной": "сталь",
  "сталь": "сталь",
  "прозрачный": "прозорий",
  "белая": "білий",
  "чёрный": "чорний",
  "бежевый": "бежевий",
  "переходной": "перехідний",
  "переходный": "перехідний",
  "металлик": "металік",
  "жемчуг": "перлинний",
  "перламутр": "перламутр",
  "мрамор": "мармуровий",
  "полупрозрачный": "напівпрозорий",
  "вишневый": "вишневий",
  "лимонный": "лимонний",
  "малиновый": "малиновий",
  "сиреневый": "бузковий",
  "графит": "графіт",
  "графитовый": "графіт",
  "пурпурный": "пурпуровий",
  "койот": "койот",
  "градиент": "градієнт",
  "неоновый": "неоновий",
  "пастельный": "пастельний",
  "термохромный": "термохромний",
  "матовый": "матовий",
  "оливковый": "оливковий",
  "коралловый": "кораловий",
  "светло-серый": "світло-сірий",
  "светло-зеленый": "світло-зелений",
  "светло-синий": "світло-синій",
  "темно-серый": "темно-сірий",
  "тёмно-серый": "темно-сірий",
  "темно-зеленый": "темно-зелений",
  "тёмно-зеленый": "темно-зелений",
  "темно-синий": "темно-синій",
  "тёмно-синий": "темно-синій",
  "случайный": "випадковий",
  "телесный": "тілесний",
  "фосфоресцентный": "фосфоресцентний",
  "цвет": "",
  "фиолетово-розовый": "фіолетово-рожевий",
  "коричневыйполупрозрачный": "коричневий напівпрозорий",
  // Single-token forms not normalised by the suffix transliteration
  "оранжевий": "помаранчевий",
  "синий": "синій",
  "желтий": "жовтий",
  "индиго": "індиго",
  "мятний": "м'ятний",
};

// Cheap transliteration for RU adjective endings we haven't whitelisted.
// Applied per-token AFTER the dictionary lookup, so dictionary entries win.
function transliterateRuTail(t) {
  return t
    .replace(/ё/gu, "е")
    .replace(/Ё/gu, "Е")
    .replace(/ы/gu, "и")
    .replace(/ый$/u, "ий")
    .replace(/ий$/u, "ий"); // no-op safeguard
}

function normaliseToken(t) {
  const k = t.toLowerCase();
  if (k in COLOR_RU_UK) return COLOR_RU_UK[k];
  return transliterateRuTail(k);
}

function normaliseColor(raw) {
  if (!raw) return raw;
  const tokens = raw.split(/\s+/).map((word) => {
    // Hyphenated compounds like "жёлтый-зелёный-синий" need per-segment lookup.
    if (word.includes("-")) {
      return word.split("-").map(normaliseToken).join("-");
    }
    return normaliseToken(word);
  });
  return tokens.filter(Boolean).join(" ").trim();
}

function extractFirstProductUrl(html) {
  // The first thumbnail's main link points to the product detail page.
  const m = html.match(
    /<div\s+class="image\s+hover">\s*<a\s+href="([^"]+)"/i,
  );
  return m ? m[1] : null;
}

function extractProductGroupVariants(html) {
  // Permissive multi-line match for the JSON-LD array.
  const m = html.match(
    /<script\s+type="application\/ld\+json"[^>]*>(\s*\[[\s\S]*?\])\s*<\/script>/i,
  );
  if (!m) return [];
  let data;
  try {
    data = JSON.parse(m[1]);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data.filter(
    (x) => x && x["@type"] === "Product" && x.offers?.price && x.name,
  );
}

export async function crawlMonofilament({ verbose = true } = {}) {
  const log = (...a) => verbose && process.stderr.write(a.join(" ") + "\n");
  const products = [];
  const errors = [];
  const seen = new Set();

  for (const cat of CATEGORIES) {
    const catUrl = BASE + cat.url;
    log(`→ category ${cat.material} ${catUrl}`);
    let listHtml;
    try {
      listHtml = await fetchHtml(catUrl);
    } catch (err) {
      errors.push({ url: catUrl, error: String(err.message ?? err) });
      log(`  ! ${err.message}`);
      continue;
    }
    const stockMap = extractStockMap(listHtml);
    const firstProductUrl = extractFirstProductUrl(listHtml);
    if (!firstProductUrl) {
      log(`  (no products in category)`);
      continue;
    }
    await new Promise((r) => setTimeout(r, jitter()));
    let prodHtml;
    try {
      prodHtml = await fetchHtml(firstProductUrl);
    } catch (err) {
      errors.push({ url: firstProductUrl, error: String(err.message ?? err) });
      log(`  ! product fetch: ${err.message}`);
      continue;
    }
    const variants = extractProductGroupVariants(prodHtml);
    log(`  ${stockMap.size} in-stock URLs, ${variants.length} variants`);
    for (const v of variants) {
      const url = v.offers?.url ?? v["@id"];
      if (!url || seen.has(url)) continue;
      seen.add(url);
      const dims = parseName(v.name);
      const pricePerSpool = Number(v.offers.price);
      const pricePerKg =
        pricePerSpool && dims.weightKg
          ? Math.round((pricePerSpool / dims.weightKg) * 100) / 100
          : null;
      // Monofilament's source data is Russian and the site has no UK
      // translation, so we don't reuse the JSON-LD name verbatim. Instead
      // we synthesise a clean Ukrainian display name from the parsed
      // fields, matching the bilingual conventions of the rest of the site.
      const synthName = [
        cat.material,
        dims.color,
        dims.weightKg ? `${dims.weightKg} кг` : null,
        dims.diameterMm ? `${dims.diameterMm} мм` : null,
      ]
        .filter(Boolean)
        .join(" • ");
      products.push({
        store: "monofilament",
        storeType: "manufacturer",
        brand: "Monofilament",
        material: cat.material,
        color: dims.color,
        weightKg: dims.weightKg,
        lengthM: null,
        diameterMm: dims.diameterMm,
        pricePerSpool,
        pricePerKg,
        currency: v.offers.priceCurrency || "UAH",
        sku: v.sku ?? null,
        url,
        image: v.image ?? null,
        // We can confirm in-stock from clickable category-page anchors but
        // cannot confidently mark out-of-stock (the page is partially JS-rendered),
        // so absence from the map maps to null/unknown rather than false.
        inStock: stockMap.has(url) ? true : null,
        name: synthName,
      });
    }
    await new Promise((r) => setTimeout(r, jitter()));
  }
  return { products, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { products, errors } = await crawlMonofilament();
  process.stdout.write(JSON.stringify({ products, errors }, null, 2) + "\n");
  process.stderr.write(`\n✓ ${products.length} products, ${errors.length} errors\n`);
}
