#!/usr/bin/env node
// Top-level product catalog crawler. Invokes each per-store module,
// merges results into a single src/data/products.json.
//
// Usage: node scripts/crawl-products.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crawlPlexiwire } from "./crawlers/plexiwire.mjs";
import { crawlLblCorp } from "./crawlers/lbl-corp.mjs";
import { crawlMonofilament } from "./crawlers/monofilament.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const out = path.join(root, "src/data/products.json");

const STORES = [
  { id: "plexiwire", run: crawlPlexiwire },
  { id: "lbl-corp", run: crawlLblCorp },
  { id: "monofilament", run: crawlMonofilament },
];

async function main() {
  const checkedAt = new Date().toISOString();
  const allProducts = [];
  const allErrors = [];
  const stats = {};

  for (const { id, run } of STORES) {
    process.stderr.write(`\n=== ${id} ===\n`);
    try {
      const { products, errors } = await run();
      for (const p of products) p.checkedAt = checkedAt;
      allProducts.push(...products);
      allErrors.push(...errors.map((e) => ({ store: id, ...e })));
      stats[id] = { products: products.length, errors: errors.length };
    } catch (err) {
      stats[id] = { products: 0, errors: 1, fatal: String(err.message ?? err) };
      allErrors.push({ store: id, fatal: String(err.message ?? err) });
    }
  }

  const payload = {
    lastChecked: checkedAt,
    stats,
    products: allProducts,
    errors: allErrors,
  };
  await fs.writeFile(out, JSON.stringify(payload, null, 2) + "\n");
  process.stderr.write(
    `\n✓ wrote ${out} — ${allProducts.length} products, ${allErrors.length} errors\n`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
