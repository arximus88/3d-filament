// Plexiwire — Horoshop-based store. See _horoshop.mjs for shared logic.
import { crawlHoroshop } from "./_horoshop.mjs";

const BASE = "https://shop.plexiwire.com.ua";

const CATEGORIES = [
  { url: "/pla-filament/", material: "PLA" },
  { url: "/petg-filament/", material: "PETG" },
  { url: "/abs-filament/", material: "ABS" },
  { url: "/abs-plus-filament/", material: "ABS+" },
  { url: "/asa-filament/", material: "ASA" },
  { url: "/flex-filament/", material: "FLEX" },
  { url: "/nylon-filament/", material: "Nylon" },
  { url: "/pla-cf10-filament/", material: "PLA-CF" },
  { url: "/petg-cf10-filament/", material: "PETG-CF" },
  { url: "/nylon-cf-10-filament/", material: "Nylon-CF" },
  { url: "/abs-cf10-filament/", material: "ABS-CF" },
];

export function crawlPlexiwire(opts = {}) {
  return crawlHoroshop({
    storeId: "plexiwire",
    storeType: "manufacturer",
    defaultBrand: "Plexiwire",
    base: BASE,
    categories: CATEGORIES,
    productPathRegex: /\/[a-z0-9-]+-filament\/[a-z0-9-]+\//,
    ...opts,
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { products, errors } = await crawlPlexiwire();
  process.stdout.write(JSON.stringify({ products, errors }, null, 2) + "\n");
  process.stderr.write(`\n✓ ${products.length} products, ${errors.length} errors\n`);
}
