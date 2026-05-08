// LBL Corp — Horoshop-based store. See _horoshop.mjs for shared logic.
//
// Unlike Plexiwire, LBL keeps every filament product under a flat root
// path (e.g. /petg-3-kh-bilyi/) rather than under a per-material category
// path. We therefore crawl the umbrella catalog page and infer material
// from the product name.
import { crawlHoroshop } from "./_horoshop.mjs";

const BASE = "https://lbl-corp.com";

const CATEGORIES = [
  { url: "/plastyk-dlia-3d-druku/" }, // umbrella catalog: PLA + CoPET/PETG + variants
];

// Product paths look like:
//   /pla-plastyk-dlia-3d-pryntera-zelenyi-0.800-kh-230-m-1.75-mm/
//   /copet-plastyk-dlia-3d-pryntera-3.0-kh-960-m-1.75-mm-pomaranchevyi/
//   /petg-3-kh-bilyi/
const PRODUCT_PATH = /\/(?:copy_)?(?:pla|petg|copet|asa|abs|flex|nylon|tpu|hips|pet)[a-z0-9._-]*\//;

function detectMaterial(name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/\bcopet\b|\bpetg\b/.test(n)) return "PETG";
  if (/\bpla\+?\b/.test(n)) return "PLA";
  if (/\babs\+?\b/.test(n)) return "ABS";
  if (/\basa\b/.test(n)) return "ASA";
  if (/\bflex\b|\btpu\b/.test(n)) return "FLEX";
  if (/\bnylon\b/.test(n)) return "Nylon";
  if (/\bhips\b/.test(n)) return "HIPS";
  return null;
}

export function crawlLblCorp(opts = {}) {
  return crawlHoroshop({
    storeId: "lbl-corp",
    storeType: "manufacturer",
    defaultBrand: "LBL",
    base: BASE,
    categories: CATEGORIES,
    productPathRegex: PRODUCT_PATH,
    detectMaterial,
    ...opts,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { products, errors } = await crawlLblCorp();
  process.stdout.write(JSON.stringify({ products, errors }, null, 2) + "\n");
  process.stderr.write(`\n✓ ${products.length} products, ${errors.length} errors\n`);
}
