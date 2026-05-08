#!/usr/bin/env node
// End-to-end crawler: reads src/data/companies.json, fetches each store's
// homepage with the generic Ukrainian-language heuristic, and writes the
// resulting per-material stock map to src/data/stock.json.
//
// Same logic the n8n workflow runs in its Code node — kept here so the
// crawl can be invoked locally or from CI without a running n8n instance.
//
// Usage: node scripts/crawl-stock.mjs

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseStock } from "./parse-stock.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const companiesPath = path.join(root, "src/data/companies.json");
const stockPath = path.join(root, "src/data/stock.json");

const UA =
  "Mozilla/5.0 (compatible; 3d-filament-stock-bot/1.0; +https://3d-filament.pages.dev)";
const TIMEOUT_MS = 15_000;
const DELAY_MS = 1500;

async function fetchHtml(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept-Language": "uk,en;q=0.8" },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const companies = JSON.parse(await fs.readFile(companiesPath, "utf8"));
  const out = { lastChecked: new Date().toISOString(), companies: {} };

  for (const c of companies) {
    process.stderr.write(`→ ${c.id} ${c.url}\n`);
    const checkedAt = new Date().toISOString();
    try {
      const html = await fetchHtml(c.url);
      const stock = parseStock(html, c.materials, c.id);
      out.companies[c.id] = { ...stock, checkedAt };
    } catch (err) {
      out.companies[c.id] = {
        _error: String(err.message ?? err),
        checkedAt,
      };
    }
    await new Promise((r) => setTimeout(r, DELAY_MS));
  }

  await fs.writeFile(stockPath, JSON.stringify(out, null, 2) + "\n");
  process.stderr.write(`✓ wrote ${stockPath}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
