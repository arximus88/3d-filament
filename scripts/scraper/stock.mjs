// Per-company, per-material stock summary for the shop directory, derived
// from the scraped catalog instead of guessing from homepage text.

// "PLA" on a company card covers PLA, PLA+, PLA-CF…; TPU also covers the
// generic "FLEX" label some stores use.
function matches(productMaterial, companyMaterial) {
  if (productMaterial === companyMaterial) return true;
  if (companyMaterial === "TPU" && productMaterial === "FLEX") return true;
  return productMaterial.startsWith(companyMaterial) && /^[+-]/.test(productMaterial.slice(companyMaterial.length));
}

/**
 * @param {Array<{ id: string, materials: string[] }>} companies
 * @param {Array<object>} products  canonical catalog records
 * @returns {Record<string, Record<string, string>>} companyId → material →
 *          "in" | "out" | "unknown", plus `checkedAt`. Companies without
 *          scraped products are omitted.
 */
export function deriveStock(companies, products) {
  const byStore = Map.groupBy(products, (p) => p.store);
  const out = {};
  for (const company of companies) {
    const items = byStore.get(company.id);
    if (!items?.length) continue;
    const entry = {};
    for (const material of company.materials) {
      const relevant = items.filter((p) => matches(p.material, material));
      if (relevant.some((p) => p.inStock === true)) entry[material] = "in";
      else if (relevant.length && relevant.every((p) => p.inStock === false)) entry[material] = "out";
      else entry[material] = "unknown";
    }
    entry.checkedAt = items.reduce((max, p) => (p.checkedAt > max ? p.checkedAt : max), "");
    out[company.id] = entry;
  }
  return out;
}
