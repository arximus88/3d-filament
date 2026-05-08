// Plexiwire catalog scraper.
// Fetches each per-material category page, collects product URLs,
// then fetches each product page and parses schema.org microdata
// (price, sku, brand, availability) plus color/weight/length/diameter
// from the product name.

const BASE = "https://shop.plexiwire.com.ua";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Plexiwire serves an inline JS challenge that writes a server-issued hash
// into a `challenge_passed` cookie and reloads. The hash rotates per
// request, so we make a warmup fetch, scrape the hash from the response
// body, and reuse it for the rest of the crawl (cookie max-age=1800s).

const CATEGORIES = [
  { slug: "pla-filament", material: "PLA" },
  { slug: "petg-filament", material: "PETG" },
  { slug: "abs-filament", material: "ABS" },
  { slug: "abs-plus-filament", material: "ABS+" },
  { slug: "asa-filament", material: "ASA" },
  { slug: "flex-filament", material: "FLEX" },
  { slug: "nylon-filament", material: "Nylon" },
  { slug: "pla-cf10-filament", material: "PLA-CF" },
  { slug: "petg-cf10-filament", material: "PETG-CF" },
  { slug: "nylon-cf-10-filament", material: "Nylon-CF" },
  { slug: "abs-cf10-filament", material: "ABS-CF" },
];

const DELAY_MIN_MS = 800;
const DELAY_MAX_MS = 1600;
const TIMEOUT_MS = 20_000;

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

async function obtainChallengeCookie() {
  // Warmup: fetch any URL without a cookie; response body inlines the hash.
  const html = await fetchRaw(BASE + "/", null);
  const m = html.match(/defaultHash\s*=\s*"([0-9a-f]{32,})"/i);
  if (!m) throw new Error("Plexiwire challenge hash not found in warmup response");
  return m[1];
}

async function fetchHtml(url, cookie) {
  let html = await fetchRaw(url, cookie);
  // If the cookie expired/rotated, the server returns the challenge page (~518B).
  // Detect and refetch with a fresh cookie one time.
  if (html.length < 2000 && /defaultHash\s*=/.test(html)) {
    throw new Error(`challenge page returned for ${url}`);
  }
  return html;
}

function extractProductCards(html) {
  // Extract { path, altName } pairs from category-page cards.
  // The img alt attribute carries the canonical product name with
  // colour, length, weight, and diameter — far more reliable than og:title.
  const re =
    /href=['"](\/[a-z0-9-]+-filament\/[a-z0-9-]+\/)['"][^>]*class=['"]catalogCard-image[^'"]*['"][\s\S]*?<img\s+alt=['"]([^'"]+)['"]/g;
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

// Parse fields encoded into the canonical product name (img alt) like
// "PLA пластик для 3D принтера натуральний 400м / 1.185кг / 1.75мм"
function parseName(name) {
  if (!name) return {};
  const diameter = pickFirst(name, /([0-9](?:[.,][0-9]+)?)\s*мм/iu);
  const weight = pickFirst(name, /([0-9](?:[.,][0-9]+)?)\s*кг/iu);
  const length = pickFirst(name, /(\d+)\s*м(?=[\s/]|$)/iu);
  // Colour: the segment after "принтера" up to the first number with a unit.
  let color = null;
  const colorMatch = name.match(/принтера\s+(.+?)\s+\d/iu);
  if (colorMatch) color = colorMatch[1].trim();
  return {
    color: color || null,
    weightKg: weight ? Number(weight.replace(",", ".")) : null,
    lengthM: length ? Number(length) : null,
    diameterMm: diameter ? Number(diameter.replace(",", ".")) : null,
  };
}

function parseProduct(html, url, material, altName) {
  // Microdata fields
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
  // Brand from <div itemprop="brand">…<meta itemprop="name" content="Plexiwire">
  const brand = (() => {
    const block = html.match(
      /<div[^>]*itemprop=["']brand["'][^>]*>[\s\S]{0,400}?<meta\s+itemprop=["']name["']\s+content=["']([^"']+)["']/i,
    );
    return block ? block[1] : null;
  })();
  // Image — og:image
  const image = pickFirst(
    html,
    /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i,
  );
  // Use the alt name from the category card — it carries the real
  // colour/length/weight/diameter encoding. og:title is SEO-only and unreliable.
  const name = altName ?? null;
  const dims = parseName(name);
  const pricePerSpool = price ? Number(price) : null;
  const pricePerKg =
    pricePerSpool && dims.weightKg
      ? Math.round((pricePerSpool / dims.weightKg) * 100) / 100
      : null;
  return {
    store: "plexiwire",
    storeType: "manufacturer",
    brand: brand || "Plexiwire",
    material,
    color: dims.color,
    weightKg: dims.weightKg,
    lengthM: dims.lengthM,
    diameterMm: dims.diameterMm,
    pricePerSpool,
    pricePerKg,
    currency: currency || "UAH",
    sku: sku || null,
    url,
    image: image || null,
    inStock: availability ? availability.toLowerCase().includes("instock") : null,
    name,
  };
}

export async function crawlPlexiwire({ verbose = true } = {}) {
  const log = (...a) => verbose && process.stderr.write(a.join(" ") + "\n");
  const products = [];
  const errors = [];
  const seen = new Set();

  let cookie = await obtainChallengeCookie();
  log(`→ challenge cookie: ${cookie.slice(0, 12)}…`);

  const safeFetch = async (url) => {
    try {
      return await fetchHtml(url, cookie);
    } catch (err) {
      if (String(err.message).includes("challenge page")) {
        cookie = await obtainChallengeCookie();
        log(`  ↻ refreshed cookie: ${cookie.slice(0, 12)}…`);
        return await fetchHtml(url, cookie);
      }
      throw err;
    }
  };

  for (const cat of CATEGORIES) {
    const catUrl = `${BASE}/${cat.slug}/`;
    log(`→ category ${cat.material} ${catUrl}`);
    let listHtml;
    try {
      listHtml = await safeFetch(catUrl);
    } catch (err) {
      errors.push({ url: catUrl, error: String(err.message ?? err) });
      log(`  ! ${err.message}`);
      continue;
    }
    const cards = extractProductCards(listHtml);
    log(`  ${cards.length} products`);
    for (const { path, altName } of cards) {
      const productUrl = `${BASE}${path}`;
      if (seen.has(productUrl)) continue;
      seen.add(productUrl);
      await new Promise((r) => setTimeout(r, jitter()));
      try {
        const html = await safeFetch(productUrl);
        const p = parseProduct(html, productUrl, cat.material, altName);
        products.push(p);
        log(
          `    ${p.material.padEnd(8)} ${(p.color ?? "?").padEnd(20)} ${p.pricePerSpool ?? "?"} грн  ${p.weightKg ?? "?"}кг  ${p.inStock === false ? "OUT" : p.inStock ? "in" : "?"}`,
        );
      } catch (err) {
        errors.push({ url: productUrl, error: String(err.message ?? err) });
        log(`    ! ${err.message}`);
      }
    }
  }
  return { products, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { products, errors } = await crawlPlexiwire();
  process.stdout.write(JSON.stringify({ products, errors }, null, 2) + "\n");
  process.stderr.write(
    `\n✓ ${products.length} products, ${errors.length} errors\n`,
  );
}
