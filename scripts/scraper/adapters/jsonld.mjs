// Generic adapter for any shop whose product pages embed JSON-LD Product
// data: open the configured category listings, collect product links, read
// every Product node on each product page (one per variant).
//
// Used for Shop-Express (polydream.com.ua); the fallback to try first when
// adding a store on a platform without a dedicated adapter. Only the first
// page of a listing is read — see the Polydream note in stores.mjs.

import { extractProducts } from "../jsonld.mjs";
import { buildProduct, looksLikeFilament } from "../normalise.mjs";

/**
 * @param {object} store
 * @param {string} store.base
 * @param {Array<{ url: string, material?: string }>} store.categories
 * @param {RegExp} store.productPath   matches product paths in listings
 */
export async function scrapeJsonLd(store, { http, log }) {
  const products = [];
  const errors = [];
  const seenPages = new Set();
  const seenOffers = new Set();
  const linkRe = new RegExp(`href=["'](${store.productPath.source})["']`, "g");

  for (const cat of store.categories) {
    const catUrl = store.base + cat.url;
    const paths = new Set();
    try {
      for (const m of (await http.get(catUrl)).matchAll(linkRe)) paths.add(m[1]);
    } catch (err) {
      errors.push({ url: catUrl, error: String(err.message ?? err) });
      log(`  ! ${cat.url}: ${err.message}`);
    }
    log(`  ${cat.url} (${cat.material ?? "auto"}): ${paths.size} product pages`);

    for (const path of paths) {
      const url = new URL(path, store.base).href;
      if (seenPages.has(url)) continue;
      seenPages.add(url);
      try {
        for (const item of extractProducts(await http.get(url), url)) {
          if (seenOffers.has(item.url)) continue;
          seenOffers.add(item.url);
          if (!cat.material && !looksLikeFilament(item.name)) continue;
          products.push(buildProduct(store, { ...item, material: cat.material }));
        }
      } catch (err) {
        errors.push({ url, error: String(err.message ?? err) });
        log(`    ! ${err.message}`);
      }
    }
  }
  return { products, errors };
}
