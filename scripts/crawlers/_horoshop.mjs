// Shared crawler for stores running on the Horoshop platform.
// Identifying markers: 518-byte JS challenge with a `challenge_passed`
// cookie + rotating `defaultHash`; product cards with `catalogCard-*`
// classes; product pages with full schema.org microdata
// (price/priceCurrency/sku/availability/brand).
//
// Stores known to use it: shop.plexiwire.com.ua, lbl-corp.com.

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const TIMEOUT_MS = 20_000;
const DELAY_MIN_MS = 800;
const DELAY_MAX_MS = 1600;

function jitter() {
  return DELAY_MIN_MS + Math.random() * (DELAY_MAX_MS - DELAY_MIN_MS);
}

async function fetchRaw(url, cookie) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        ...(cookie ? { Cookie: `challenge_passed=${cookie}` } : {}),
        "Accept-Language": "uk,en;q=0.8",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      },
      signal: ctrl.signal,
      redirect: "follow",
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

async function obtainChallengeCookie(base) {
  const html = await fetchRaw(base + "/", null);
  const m = html.match(/defaultHash\s*=\s*"([0-9a-f]{32,})"/i);
  if (!m) throw new Error(`challenge hash not found at ${base}`);
  return m[1];
}

async function fetchHtml(url, cookie) {
  const html = await fetchRaw(url, cookie);
  if (html.length < 2000 && /defaultHash\s*=/.test(html)) {
    throw new Error(`challenge page returned for ${url}`);
  }
  return html;
}

function extractProductCards(html, productPathRegex) {
  // Pair the product link href with the img alt — alt carries the canonical
  // product name (colour, length, weight, diameter), which the SEO-tweaked
  // og:title on the product page typically does not.
  const re = new RegExp(
    `href=['"](${productPathRegex.source})['"][^>]*class=['"]catalogCard-image[^'"]*['"][\\s\\S]*?<img\\s+alt=['"]([^'"]+)['"]`,
    "g",
  );
  const seen = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!seen.has(m[1])) seen.set(m[1], m[2]);
  }
  return [...seen.entries()].map(([path, altName]) => ({ path, altName }));
}

function pickFirst(html, re) {
  const m = html.match(re);
  return m ? m[1] : null;
}

// Parse colour/length/weight/diameter from the canonical product name.
// Tolerant of two formats seen in the wild:
//   "PLA пластик для 3D принтера натуральний 400м / 1.185кг / 1.75мм"   (Plexiwire)
//   "PLA філамент Зелений пластик для 3D принтера 0.800 кг / 260 м / 1.75 мм"  (LBL)
export function parseName(name) {
  if (!name) return {};
  const diameter = pickFirst(name, /([0-9](?:[.,][0-9]+)?)\s*мм/iu);
  const weight = pickFirst(name, /([0-9](?:[.,][0-9]+)?)\s*кг/iu);
  const length = pickFirst(name, /(\d+(?:[.,]\d+)?)\s*м(?=[\s/]|$)/iu);
  let color = null;
  // Format A: ...принтера <colour> <number><unit>...
  const a = name.match(/принтера\s+([^\d/]+?)\s+\d/iu);
  if (a) color = a[1].trim();
  // Format B: ...філамент <Colour> пластик/філамент для 3D принтера...
  if (!color) {
    const b = name.match(/(?:філамент|пластик)\s+([^\s][^\d/]+?)\s+(?:пластик|філамент|для)/iu);
    if (b) color = b[1].trim();
  }
  // Strip trailing tokens that are not real colours.
  if (color) color = color.replace(/^\(.*?\)\s*/u, "").toLowerCase();
  return {
    color: color || null,
    weightKg: weight ? Number(weight.replace(",", ".")) : null,
    lengthM: length ? Number(length.replace(",", ".")) : null,
    diameterMm: diameter ? Number(diameter.replace(",", ".")) : null,
  };
}

function parseMicrodata(html) {
  const price = pickFirst(
    html,
    /<meta\s+itemprop=["']price["']\s+content=["']([\d.]+)["']/i,
  );
  const currency = pickFirst(
    html,
    /<meta\s+itemprop=["']priceCurrency["']\s+content=["']([A-Z]{3})["']/i,
  );
  const sku = pickFirst(
    html,
    /<meta\s+itemprop=["']sku["']\s+content=["']([^"']+)["']/i,
  );
  const availability = pickFirst(
    html,
    /<link\s+itemprop=["']availability["']\s+href=["']https?:\/\/schema\.org\/(\w+)["']/i,
  );
  const brandBlock = html.match(
    /<div[^>]*itemprop=["']brand["'][^>]*>[\s\S]{0,400}?<meta\s+itemprop=["']name["']\s+content=["']([^"']+)["']/i,
  );
  const image = pickFirst(
    html,
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
  );
  return {
    pricePerSpool: price ? Number(price) : null,
    currency: currency || "UAH",
    sku: sku || null,
    inStock: availability ? availability.toLowerCase().includes("instock") : null,
    brand: brandBlock ? brandBlock[1] : null,
    image: image || null,
  };
}

/**
 * Crawl a Horoshop-based store.
 *
 * @param {object} cfg
 * @param {string} cfg.storeId               — id used in companies.json
 * @param {string} cfg.base                  — origin (no trailing slash)
 * @param {"manufacturer"|"shop"} cfg.storeType
 * @param {string} cfg.defaultBrand          — fallback brand name
 * @param {Array<{ url: string, material?: string }>} cfg.categories
 *        Each category page lists product cards. If `material` is omitted,
 *        the crawler infers it per-product from the product name (`detectMaterial`).
 * @param {RegExp} cfg.productPathRegex      — matches product URL paths
 * @param {(name: string) => string|null} [cfg.detectMaterial]
 *        Used when the category itself does not pin a material.
 * @param {boolean} [cfg.verbose]
 * @returns {Promise<{ products: any[], errors: any[] }>}
 */
export async function crawlHoroshop(cfg) {
  const log = (...a) =>
    cfg.verbose !== false && process.stderr.write(a.join(" ") + "\n");
  const products = [];
  const errors = [];
  const seen = new Set();

  let cookie = await obtainChallengeCookie(cfg.base);
  log(`→ challenge cookie: ${cookie.slice(0, 12)}…`);

  const safeFetch = async (url) => {
    try {
      return await fetchHtml(url, cookie);
    } catch (err) {
      if (String(err.message).includes("challenge page")) {
        cookie = await obtainChallengeCookie(cfg.base);
        log(`  ↻ refreshed cookie: ${cookie.slice(0, 12)}…`);
        return await fetchHtml(url, cookie);
      }
      throw err;
    }
  };

  for (const cat of cfg.categories) {
    const catUrl = cat.url.startsWith("http") ? cat.url : `${cfg.base}${cat.url}`;
    log(`→ category ${cat.material ?? "(auto)"} ${catUrl}`);
    let listHtml;
    try {
      listHtml = await safeFetch(catUrl);
    } catch (err) {
      errors.push({ url: catUrl, error: String(err.message ?? err) });
      log(`  ! ${err.message}`);
      continue;
    }
    const cards = extractProductCards(listHtml, cfg.productPathRegex);
    log(`  ${cards.length} products`);
    for (const { path, altName } of cards) {
      const productUrl = `${cfg.base}${path}`;
      if (seen.has(productUrl)) continue;
      seen.add(productUrl);
      await new Promise((r) => setTimeout(r, jitter()));
      try {
        const html = await safeFetch(productUrl);
        const md = parseMicrodata(html);
        const dims = parseName(altName);
        const material =
          cat.material ??
          (cfg.detectMaterial ? cfg.detectMaterial(altName) : null) ??
          "?";
        const pricePerKg =
          md.pricePerSpool && dims.weightKg
            ? Math.round((md.pricePerSpool / dims.weightKg) * 100) / 100
            : null;
        const p = {
          store: cfg.storeId,
          storeType: cfg.storeType,
          brand: md.brand || cfg.defaultBrand,
          material,
          color: dims.color,
          weightKg: dims.weightKg,
          lengthM: dims.lengthM,
          diameterMm: dims.diameterMm,
          pricePerSpool: md.pricePerSpool,
          pricePerKg,
          currency: md.currency,
          sku: md.sku,
          url: productUrl,
          image: md.image,
          inStock: md.inStock,
          name: altName,
        };
        products.push(p);
        log(
          `    ${String(p.material).padEnd(8)} ${(p.color ?? "?").padEnd(20)} ${p.pricePerSpool ?? "?"} грн  ${p.weightKg ?? "?"}кг  ${p.inStock === false ? "OUT" : p.inStock ? "in" : "?"}`,
        );
      } catch (err) {
        errors.push({ url: productUrl, error: String(err.message ?? err) });
        log(`    ! ${err.message}`);
      }
    }
  }
  return { products, errors };
}
