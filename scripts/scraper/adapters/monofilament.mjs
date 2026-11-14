// Monofilament — custom OpenCart theme (`mfil-*` classes), Ukrainian
// catalog under /ua/.
//
// A category listing has one card per colour. The card links every
// diameter/weight variant as a "pill" (with an `out-of-stock` class when
// unavailable) but shows the price of the pre-selected variant only. So:
//   1. walk the listing pages → every variant with colour, size and stock;
//   2. open the product page only for in-stock variants whose price the
//      listing didn't show. Out-of-stock ones stay without a price — the
//      catalog doesn't display prices for those anyway.

import { buildProduct, normaliseColor } from "../normalise.mjs";

const CARD_START = '<div class="product-thumb mfil-catalog-card">';

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();

const parsePrice = (text) => {
  const digits = text?.replace(/[^\d.,]/g, "").replace(",", ".");
  return digits ? Number(digits) : null;
};

// "PLA Дуоколір Білий-Синій пастель" → "дуоколір білий-синій пастель";
// "PLA Wood Ø1,75мм Вага:0,75кг" → "wood". The leading all-caps Latin
// tokens are the material ("PLA", "ABS PRO", "PLA-LW").
export function colorFromTitle(title) {
  const words = title.split("Ø")[0].trim().split(/\s+/);
  while (words.length && /^[A-Z0-9+-]+$/.test(words[0])) words.shift();
  return normaliseColor(words.join(" "));
}

/** Variants listed by one category page. */
export function parseListing(html) {
  const variants = [];
  for (const card of html.split(CARD_START).slice(1)) {
    const head = card.match(/<h4><a href="([^"]+)">([^<]+)<\/a><\/h4>/);
    if (!head) continue;
    const title = decode(head[2]);
    const color = colorFromTitle(title);
    const image = card.match(/<img src="(https?:[^"]+)"/)?.[1] ?? null;
    const priceBlock = card.match(/<p class="price">([\s\S]*?)<\/p>/)?.[1] ?? "";
    // A discounted card shows old and new price; the new one is what you pay.
    const activePrice = parsePrice(
      priceBlock.match(/price-new[^>]*>([^<]+)/)?.[1] ?? priceBlock.replace(/<[^>]+>[^<]*<\/[^>]+>/g, ""),
    );

    const pills = [
      ...card.matchAll(
        /<a class="mfil-catalog-variant-pill([^"]*)"[^>]*?href="([^"]+)"[^>]*>\s*<span class="mfil-catalog-variant-pill__text">([^<]+)</g,
      ),
    ];
    if (pills.length === 0) {
      // Single-variant product: size is in the title, stock is the buy button.
      const buyHidden = /class="mfil-catalog-card__buy"\s+hidden/.test(card);
      variants.push({ url: head[1], color, size: title, image, inStock: !buyHidden, price: activePrice });
      continue;
    }
    for (const [, classes, url, size] of pills) {
      variants.push({
        url,
        color,
        size: decode(size),
        image,
        inStock: !/\bout-of-stock\b/.test(classes),
        price: /\bactive\b/.test(classes) ? activePrice : null,
      });
    }
  }
  return variants;
}

const pageCount = (html) =>
  Math.max(1, ...[...html.matchAll(/[?&]page=(\d+)"/g)].map((m) => Number(m[1])));

/**
 * @param {object} store
 * @param {string} store.base
 * @param {Array<{ url: string, material: string }>} store.categories
 */
export async function scrapeMonofilament(store, { http, log }) {
  const products = [];
  const errors = [];
  const seen = new Set();

  for (const cat of store.categories) {
    const catUrl = store.base + cat.url;
    const variants = [];
    try {
      const first = await http.get(catUrl);
      variants.push(...parseListing(first));
      const pages = pageCount(first);
      for (let page = 2; page <= pages; page++) {
        variants.push(...parseListing(await http.get(`${catUrl}?page=${page}`)));
      }
    } catch (err) {
      errors.push({ url: catUrl, error: String(err.message ?? err) });
      log(`  ! ${cat.material}: ${err.message}`);
    }

    let priceLookups = 0;
    for (const v of variants) {
      if (seen.has(v.url)) continue;
      seen.add(v.url);
      let sku = null;
      if (v.inStock && v.price === null) {
        try {
          const page = await http.get(v.url);
          priceLookups++;
          v.price = parsePrice(page.match(/itemprop="price"\s+content="([\d.,]+)"/)?.[1]);
          sku = page.match(/itemprop="sku"\s+content="([^"]+)"/)?.[1] ?? null;
        } catch (err) {
          errors.push({ url: v.url, error: String(err.message ?? err) });
        }
      }
      const product = buildProduct(store, {
        name: v.size,
        url: v.url,
        material: cat.material,
        color: v.color,
        price: v.price,
        sku,
        image: v.image,
        inStock: v.inStock,
        lengthM: null,
      });
      product.name = [
        cat.material,
        product.color,
        product.weightKg ? `${product.weightKg} кг` : null,
        product.diameterMm ? `${product.diameterMm} мм` : null,
      ]
        .filter(Boolean)
        .join(" • ");
      products.push(product);
    }
    log(`  ${cat.material}: ${variants.length} variants, ${priceLookups} price lookups`);
  }
  return { products, errors };
}
