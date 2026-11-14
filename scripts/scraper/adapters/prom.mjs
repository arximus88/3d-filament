// Prom.ua storefronts (u3df.com.ua, 3dfilament.com.ua, …).
//
// Listing pages embed a JSON-LD Product (name, price, availability, sku,
// image, url) for each of their 24 cards, so a store costs a few dozen
// requests and we never open product pages. `/ua/product_list` alone is not
// the whole catalog on every store, so the group listings from the sitemap
// are walked too. Listings also carry nozzles, pens and sample sets — only
// filament spools are kept.

import { extractProducts } from "../jsonld.mjs";
import { buildProduct, looksLikeFilament } from "../normalise.mjs";

const MAX_PAGES = 80;

const locs = (xml) => [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);

// Ukrainian-language group (category) listings from the store's sitemap.
async function groupUrls(store, http) {
  const index = await http.get(`${store.base}/sitemap.xml`);
  const urls = [];
  for (const sitemap of locs(index).filter((u) => /sitemap_groups-\d+\.xml$/.test(u))) {
    urls.push(...locs(await http.get(sitemap)).filter((u) => u.startsWith(`${store.base}/ua/g`)));
  }
  return urls;
}

/**
 * @param {object} store  registry entry; `store.base` is the origin
 * @param {{ http: ReturnType<import("../http.mjs").createClient>, log: Function }} ctx
 */
export async function scrapeProm(store, { http, log }) {
  const products = [];
  const errors = [];
  const seen = new Set();
  let skipped = 0;

  const listings = [`${store.base}/ua/product_list`];
  try {
    listings.push(...(await groupUrls(store, http)));
  } catch (err) {
    errors.push({ url: `${store.base}/sitemap.xml`, error: String(err.message ?? err) });
  }

  for (const [i, listing] of listings.entries()) {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = page > 1 ? `${listing}/page_${page}` : listing;
      let html;
      try {
        html = await http.get(url);
      } catch (err) {
        // The very first page failing means the store is unreachable;
        // anything later just leaves the catalog partial.
        if (i === 0 && page === 1) throw err;
        errors.push({ url, error: String(err.message ?? err) });
        break;
      }
      const fresh = extractProducts(html, url).filter((it) => !seen.has(it.url));
      // Past the last page Prom serves the first one again.
      if (fresh.length === 0) break;
      for (const it of fresh) {
        seen.add(it.url);
        if (!looksLikeFilament(it.name)) {
          skipped++;
          continue;
        }
        products.push(buildProduct(store, { ...it, brand: store.brand }));
      }
    }
  }
  log(`  ${listings.length} listings: ${products.length} filaments, ${skipped} other items skipped`);
  return { products, errors };
}
