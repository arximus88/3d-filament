#!/usr/bin/env bun
// Catalog scraper: runs every store in scraper/stores.mjs (or just the ones
// named on the command line) and rewrites
//   src/data/products.json — the product catalog
//   src/data/stock.json    — per-company material availability (derived)
//
// A store that fails or comes back empty keeps its previous products, so
// one site being down never wipes its part of the catalog.
//
// Usage:
//   bun run scrape                  all stores
//   bun run scrape u3df techfil     only these; the rest keep their data
//   bun run scrape --dry-run u3df   scrape and report, write nothing

import fs from "node:fs/promises";
import path from "node:path";
import { createClient } from "./scraper/http.mjs";
import { STORES } from "./scraper/stores.mjs";
import { deriveStock } from "./scraper/stock.mjs";

const root = path.resolve(import.meta.dir, "..");
const productsPath = path.join(root, "src/data/products.json");
const stockPath = path.join(root, "src/data/stock.json");
const companiesPath = path.join(root, "src/data/companies.json");

const readJson = async (file, fallback) => {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return fallback;
    throw err;
  }
};
const writeJson = (file, data) => fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
const log = (line) => process.stderr.write(line + "\n");

async function scrapeStore(entry, company) {
  const store = { ...entry, type: company.type };
  const http = createClient(entry.http);
  const started = Date.now();
  const { products, errors } = await entry.adapter(store, {
    http,
    log: (line) => log(`[${entry.id}] ${line}`),
  });
  return { products, errors, requests: http.requests, seconds: Math.round((Date.now() - started) / 1000) };
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const ids = args.filter((a) => !a.startsWith("--"));

  const unknown = ids.filter((id) => !STORES.some((s) => s.id === id));
  if (unknown.length) {
    log(`Unknown store: ${unknown.join(", ")}. Known: ${STORES.map((s) => s.id).join(", ")}`);
    process.exit(2);
  }
  const selected = ids.length ? STORES.filter((s) => ids.includes(s.id)) : STORES;

  const companies = await readJson(companiesPath);
  const previous = await readJson(productsPath, { products: [], stats: {} });
  const previousByStore = Map.groupBy(previous.products, (p) => p.store);
  const knownIds = new Set(STORES.map((s) => s.id));

  // Stores run in parallel (each has its own paced client, so every site
  // still sees one slow visitor).
  const results = await Promise.all(
    selected.map(async (entry) => {
      const company = companies.find((c) => c.id === entry.id);
      try {
        if (!company) throw new Error(`"${entry.id}" is missing from companies.json`);
        const r = await scrapeStore(entry, company);
        if (r.products.length === 0) throw new Error("no products found — markup changed?");
        log(`✓ ${entry.id}: ${r.products.length} products, ${r.errors.length} errors, ${r.requests} requests, ${r.seconds}s`);
        return { id: entry.id, ...r };
      } catch (err) {
        log(`✗ ${entry.id}: ${err.message ?? err}`);
        return { id: entry.id, fatal: String(err.message ?? err) };
      }
    }),
  );

  const checkedAt = new Date().toISOString();
  const byStore = new Map();
  const stats = {};
  const errors = [];
  for (const { id } of STORES) {
    const r = results.find((x) => x.id === id);
    const kept = previousByStore.get(id) ?? [];
    if (!r) {
      // Not selected this run — carry over untouched.
      if (kept.length) byStore.set(id, kept);
      if (previous.stats?.[id]) stats[id] = previous.stats[id];
    } else if (r.fatal) {
      if (kept.length) byStore.set(id, kept);
      stats[id] = { products: kept.length, errors: 1, fatal: r.fatal, stale: kept.length > 0 };
      errors.push({ store: id, fatal: r.fatal });
    } else {
      byStore.set(id, r.products.map((p) => ({ ...p, checkedAt })));
      stats[id] = { products: r.products.length, errors: r.errors.length };
      errors.push(...r.errors.map((e) => ({ store: id, ...e })));
    }
  }
  // Errors of stores that weren't re-run stay on record.
  errors.push(...(previous.errors ?? []).filter((e) => knownIds.has(e.store) && !results.some((r) => r.id === e.store)));

  const products = STORES.flatMap(({ id }) =>
    (byStore.get(id) ?? []).toSorted((a, b) => a.url.localeCompare(b.url)),
  );

  log(`\n${products.length} products from ${byStore.size} stores, ${errors.length} errors`);
  if (dryRun) {
    log("dry run — nothing written");
    return;
  }
  await writeJson(productsPath, { lastChecked: checkedAt, stats, products, errors });
  await writeJson(stockPath, { lastChecked: checkedAt, companies: deriveStock(companies, products) });
  log(`wrote ${path.relative(root, productsPath)}, ${path.relative(root, stockPath)}`);

  // Exit non-zero only when nothing at all worked, so a scheduled run with
  // one flaky store still publishes the rest.
  if (results.every((r) => r.fatal)) process.exit(1);
}

await main();
