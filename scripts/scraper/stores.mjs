// Store registry: which stores are scraped, with which adapter, and the
// store-specific bits each adapter needs. `id` must match companies.json —
// the store type (manufacturer / shop) is read from there.
//
// Adding a store: find its platform (view-source: Prom → `prom.ua` assets,
// Horoshop → `catalogCard-` classes), add an entry here, then run
// `bun run scrape <id>` and check the output.

import { scrapeProm } from "./adapters/prom.mjs";
import { scrapeHoroshop } from "./adapters/horoshop.mjs";
import { scrapeMonofilament } from "./adapters/monofilament.mjs";
import { scrapeJsonLd } from "./adapters/jsonld.mjs";

export const STORES = [
  // ---- Horoshop ----------------------------------------------------------
  {
    id: "plexiwire",
    adapter: scrapeHoroshop,
    brand: "Plexiwire",
    base: "https://shop.plexiwire.com.ua",
    productPath: /\/[a-z0-9-]+-filament\/[a-z0-9-]+\//,
    categories: [
      { url: "/pla-filament/", material: "PLA" },
      { url: "/pla-glitter-filament/", material: "PLA" },
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
    ],
  },
  {
    // Flat URL space (/petg-3-kh-bilyi/), one umbrella catalog page;
    // material comes from the product name.
    id: "lbl-corp",
    adapter: scrapeHoroshop,
    brand: "LBL",
    base: "https://lbl-corp.com",
    productPath: /\/(?:copy_)?(?:pla|petg|copet|asa|abs|flex|nylon|tpu|hips|pet)[a-z0-9._-]*\//,
    categories: [{ url: "/plastyk-dlia-3d-druku/" }],
  },
  {
    id: "techfil",
    adapter: scrapeHoroshop,
    brand: "Techfil",
    base: "https://techfil.com.ua",
    productPath: /\/(?:pla|petg|abs|asa|tpu|pa|pc)[a-z0-9]*-[a-z0-9-]+\//,
    categories: [
      { url: "/petg/", material: "PETG" },
      { url: "/abs/", material: "ABS" },
      { url: "/asa/", material: "ASA" },
    ],
  },

  // ---- Prom.ua -----------------------------------------------------------
  { id: "u3df", adapter: scrapeProm, brand: "U3DF", base: "https://u3df.com.ua" },
  { id: "3dfilament", adapter: scrapeProm, brand: "3DFilament", base: "https://3dfilament.com.ua" },
  { id: "pochatok-filament", adapter: scrapeProm, brand: "Pochatok Filament", base: "https://pochatok-filament.com" },
  { id: "fainyi-3d", adapter: scrapeProm, brand: "Файний 3D", base: "https://fainyi3d.com" },

  // ---- Shop-Express (generic JSON-LD) ------------------------------------
  {
    // Partial catalog: listing pages 2+ sit behind a proof-of-work browser
    // check ("Checking your browser…"), which we don't try to defeat, so
    // only the first 12 products of each category are covered.
    id: "polydream",
    adapter: scrapeJsonLd,
    brand: "Polydream",
    base: "https://polydream.com.ua",
    productPath: /\/shop\/[a-z0-9-]*plastik[a-z0-9-]*\//,
    categories: ["petg", "pla", "abs", "mabs", "asa", "tpu", "nylon", "kompozitni-materiali"].map(
      (slug) => ({ url: `/shop/${slug}/` }),
    ),
  },

  // ---- OpenCart ----------------------------------------------------------
  {
    id: "monofilament",
    adapter: scrapeMonofilament,
    brand: "Monofilament",
    base: "https://monofilament.com.ua",
    // Slower pacing: the site sits behind Cloudflare rate limiting.
    http: { minDelayMs: 1000, maxDelayMs: 2200 },
    categories: [
      { url: "/ua/products/standartnye-materialy/pla/", material: "PLA" },
      { url: "/ua/products/standartnye-materialy/abs/", material: "ABS" },
      { url: "/ua/products/standartnye-materialy/abs-plus/", material: "ABS+" },
      { url: "/ua/products/standartnye-materialy/abs-pro/", material: "ABS-PRO" },
      { url: "/ua/products/standartnye-materialy/copet/", material: "PETG" }, // CoPET = PETG
      { url: "/ua/products/standartnye-materialy/hips/", material: "HIPS" },
      { url: "/ua/products/standartnye-materialy/pctg/", material: "PCTG" },
      { url: "/ua/products/standartnye-materialy/pla-flex/", material: "PLA-FLEX" },
      { url: "/ua/products/standartnye-materialy/pla-lw/", material: "PLA-LW" },
      { url: "/ua/products/inzhinernye-plastiki/asa-plastic/", material: "ASA" },
      { url: "/ua/products/inzhinernye-plastiki/nylon/", material: "Nylon" },
      { url: "/ua/products/inzhinernye-plastiki/pc/", material: "PC" },
      { url: "/ua/products/inzhinernye-plastiki/pa/", material: "PA" },
      { url: "/ua/products/inzhinernye-plastiki/pet/", material: "PET" },
      { url: "/ua/products/inzhinernye-plastiki/pp/", material: "PP" },
      { url: "/ua/products/inzhinernye-plastiki/pbt/", material: "PBT" },
      { url: "/ua/products/inzhinernye-plastiki/elastan/", material: "TPE" },
      { url: "/ua/products/inzhinernye-plastiki/thermoplastic-polyurethane/", material: "TPU" },
      { url: "/ua/products/inzhinernye-plastiki/kompozitsionnye-materialy-dlja-3d-printera/", material: "Composite" },
    ],
  },
];
