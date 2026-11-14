// Horoshop storefronts (shop.plexiwire.com.ua, lbl-corp.com, techfil.com.ua).
//
// A request without the right cookie gets a ~500-byte page whose script
// sets a `challenge_passed*` cookie from a `defaultHash` value and reloads;
// with the cookie the site serves normally. Category pages list product cards (`catalogCard-*`),
// product pages carry schema.org microdata with price / sku / availability.

import { buildProduct, normaliseColor } from "../normalise.mjs";

function pickFirst(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

const isChallenge = (html) => html.length < 2000 && /defaultHash\s*=/.test(html);

// Pair each product link with its image alt: the alt carries the canonical
// product name (colour, length, weight, diameter), which the SEO-tweaked
// title on the product page typically does not.
function extractProductCards(html, productPathRegex) {
  const re = new RegExp(
    `href=['"](${productPathRegex.source})['"][^>]*class=['"]catalogCard-image[^'"]*['"][\\s\\S]*?<img\\s+alt=['"]([^'"]+)['"]`,
    "g",
  );
  const cards = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    // Some themes append " фото" to the alt text.
    if (!cards.has(m[1])) cards.set(m[1], m[2].replace(/\s+фото$/u, ""));
  }
  return [...cards].map(([path, name]) => ({ path, name }));
}

// Horoshop paginates categories as `<category>filter/page=N/`.
function extractPageCount(html) {
  let max = 1;
  for (const m of html.matchAll(/\/filter\/page=(\d+)\//g)) max = Math.max(max, Number(m[1]));
  return max;
}

// Colour from the two name layouts seen on Horoshop stores:
//   "PLA пластик для 3D принтера натуральний 400м / 1.185кг / 1.75мм"          (Plexiwire)
//   "PLA філамент Зелений пластик для 3D принтера 0.800 кг / 260 м / 1.75 мм"  (LBL)
// Returns undefined when neither matches, so the shared dictionary lookup
// in buildProduct gets its turn.
export function parseHoroshopColor(name) {
  const a = name.match(/принтера\s+([^\d/]+?)\s+\d/iu);
  const b = a ?? name.match(/(?:філамент|пластик)\s+([^\s][^\d/]+?)\s+(?:пластик|філамент|для)/iu);
  if (!b) return undefined;
  return normaliseColor(b[1].replace(/^\(.*?\)\s*/u, "")) ?? undefined;
}

function parseMicrodata(html) {
  const price = pickFirst(html, /<meta\s+itemprop=["']price["']\s+content=["']([\d.]+)["']/i);
  const availability = pickFirst(
    html,
    /<link\s+itemprop=["']availability["']\s+href=["']https?:\/\/schema\.org\/(\w+)["']/i,
  );
  const brand = html.match(
    /<div[^>]*itemprop=["']brand["'][^>]*>[\s\S]{0,400}?<meta\s+itemprop=["']name["']\s+content=["']([^"']+)["']/i,
  );
  return {
    price: price ? Number(price) : null,
    currency: pickFirst(html, /<meta\s+itemprop=["']priceCurrency["']\s+content=["']([A-Z]{3})["']/i),
    sku: pickFirst(html, /<meta\s+itemprop=["']sku["']\s+content=["']([^"']+)["']/i),
    inStock: availability ? /instock/i.test(availability) : null,
    brand: brand ? brand[1] : null,
    image: pickFirst(html, /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i),
  };
}

/**
 * @param {object} store
 * @param {string} store.base
 * @param {Array<{ url: string, material?: string }>} store.categories
 *        A category without `material` gets it detected per product.
 * @param {RegExp} store.productPath  matches product URL paths in listings
 */
export async function scrapeHoroshop(store, { http, log }) {
  const products = [];
  const errors = [];
  const seen = new Set();
  // name → value. The site hands out `challenge_passed` on any page and a
  // second `challenge_passed_cat` on paginated listings.
  const cookies = new Map();

  const get = async (url) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
      const html = await http.get(url, cookie ? { headers: { Cookie: cookie } } : {});
      if (!isChallenge(html)) return html;
      // The challenge page sets `<name>=<defaultHash>` and reloads; the
      // hash rotates, so this can recur mid-crawl.
      const hash = html.match(/defaultHash\s*=\s*"([0-9a-f]{32,})"/i)?.[1];
      const name = html.match(/document\.cookie\s*=\s*"([\w-]+)="/)?.[1];
      if (!hash || !name) break;
      cookies.set(name, hash);
    }
    throw new Error(`challenge page returned for ${url}`);
  };

  for (const cat of store.categories) {
    const catUrl = store.base + cat.url;
    const cards = [];
    try {
      const first = await get(catUrl);
      cards.push(...extractProductCards(first, store.productPath));
      const pages = extractPageCount(first);
      for (let page = 2; page <= pages; page++) {
        cards.push(...extractProductCards(await get(`${catUrl}filter/page=${page}/`), store.productPath));
      }
    } catch (err) {
      errors.push({ url: catUrl, error: String(err.message ?? err) });
      log(`  ! ${cat.url}: ${err.message}`);
      if (cards.length === 0) continue;
    }
    log(`  ${cat.url} (${cat.material ?? "auto"}): ${cards.length} products`);

    for (const { path, name } of cards) {
      const url = store.base + path;
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const md = parseMicrodata(await get(url));
        products.push(
          buildProduct(store, {
            ...md,
            name,
            url,
            material: cat.material,
            color: parseHoroshopColor(name),
          }),
        );
      } catch (err) {
        errors.push({ url, error: String(err.message ?? err) });
        log(`    ! ${err.message}`);
      }
    }
  }
  return { products, errors };
}
