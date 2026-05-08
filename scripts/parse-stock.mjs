// Heuristic per-material stock parser shared between local testing and the
// n8n daily-crawler workflow. The active runtime copy lives inside the n8n
// "Code" node; this file is the canonical, reviewable source of truth.
//
// Usage: node scripts/parse-stock.mjs <url> [material1] [material2] ...
//   node scripts/parse-stock.mjs https://shop.plexiwire.com.ua PLA PETG

const IN_PATTERNS = [
  /є\s+в\s+наявн/iu,
  /в\s+наявності/iu,
  /є\s+на\s+склад/iu,
  /available/i,
  /in\s+stock/i,
];

const OUT_PATTERNS = [
  /немає\s+в\s+наявн/iu,
  /не\s+в\s+наявн/iu,
  /відсутн/iu,
  /під\s+замовлення/iu,
  /очікуєт/iu,
  /закінчив/iu,
  /out\s+of\s+stock/i,
  /sold\s+out/i,
];

const STRIP_TAGS = /<(script|style|noscript)[\s\S]*?<\/\1>/gi;
const WINDOW = 200;

// Per-site overrides go here when the generic heuristic is consistently wrong.
// Each override receives the cleaned HTML and the materials array, and returns
// a partial { [material]: "in"|"out"|"unknown" } map. Anything not returned
// falls back to the generic heuristic.
const OVERRIDES = {
  // "plexiwire": (html, materials) => ({ PLA: "in" }),
};

export function parseStock(html, materials, companyId = null) {
  const cleaned = String(html).replace(STRIP_TAGS, " ");
  const result = {};
  const override = companyId && OVERRIDES[companyId]
    ? OVERRIDES[companyId](cleaned, materials) || {}
    : {};

  for (const material of materials) {
    if (override[material]) {
      result[material] = override[material];
      continue;
    }
    result[material] = detectMaterialStatus(cleaned, material);
  }
  return result;
}

function detectMaterialStatus(html, material) {
  const needle = new RegExp(`\\b${escapeRegex(material)}\\b`, "giu");
  let match;
  let sawIn = false;
  let sawOut = false;
  let sawAny = false;

  while ((match = needle.exec(html)) !== null) {
    sawAny = true;
    const start = Math.max(0, match.index - WINDOW);
    const end = Math.min(html.length, match.index + match[0].length + WINDOW);
    const context = html.slice(start, end);

    if (OUT_PATTERNS.some((re) => re.test(context))) sawOut = true;
    else if (IN_PATTERNS.some((re) => re.test(context))) sawIn = true;
    if (sawIn) break;
  }

  if (!sawAny) return "unknown";
  if (sawIn) return "in";
  if (sawOut) return "out";
  return "unknown";
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// CLI entry — only runs when invoked directly, not when imported.
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , url, ...materials] = process.argv;
  if (!url) {
    console.error("Usage: node scripts/parse-stock.mjs <url> [material...]");
    process.exit(1);
  }
  const mats = materials.length ? materials : ["PLA", "PETG", "ABS", "TPU"];
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; 3d-filament-stock-bot/1.0; +https://3d-filament.pages.dev)",
      "Accept-Language": "uk,en;q=0.8",
    },
  });
  const html = await res.text();
  console.log(JSON.stringify(parseStock(html, mats), null, 2));
}
