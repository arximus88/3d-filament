// schema.org extraction. Most Ukrainian shop platforms (Prom, OpenCart,
// Shop-Express, WooCommerce) embed Product data as JSON-LD, which is far
// more stable than their markup.

/** Every JSON-LD node on the page, with arrays and @graph flattened. */
export function extractJsonLd(html) {
  const nodes = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch {
      continue; // broken block on the page — not ours to fix
    }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) stack.push(...node);
      else if (node && typeof node === "object") {
        if (Array.isArray(node["@graph"])) stack.push(...node["@graph"]);
        else nodes.push(node);
      }
    }
  }
  return nodes.reverse();
}

function isType(node, type) {
  const t = node["@type"];
  return Array.isArray(t) ? t.includes(type) : t === type;
}

function firstString(v) {
  if (!v) return null;
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return firstString(v[0]);
  if (typeof v === "object") return firstString(v.url ?? v.name ?? v["@id"]);
  return null;
}

// Some shops emit image URLs with raw spaces; others pre-encode them.
function safeEncode(url) {
  try {
    return encodeURI(decodeURI(url));
  } catch {
    return url;
  }
}

/** schema.org availability URL → true / false / null (unknown). */
export function parseAvailability(value) {
  const v = String(value ?? "").toLowerCase();
  if (!v) return null;
  if (/instock|limitedavailability|onlineonly/.test(v)) return true;
  if (/outofstock|soldout|discontinued|preorder|backorder/.test(v)) return false;
  return null;
}

/**
 * Product nodes of a page as flat records. `pageUrl` resolves the relative
 * offer URLs some platforms emit.
 */
export function extractProducts(html, pageUrl) {
  const out = [];
  for (const node of extractJsonLd(html)) {
    if (!isType(node, "Product") || !node.name) continue;
    const offer = Array.isArray(node.offers) ? node.offers[0] : node.offers;
    if (!offer) continue;
    const price = Number(offer.price ?? offer.lowPrice);
    const rawUrl = firstString(offer.url) ?? firstString(node.url) ?? firstString(node["@id"]);
    let url = null;
    try {
      url = rawUrl ? new URL(rawUrl, pageUrl).href : pageUrl;
    } catch {
      url = pageUrl;
    }
    const image = firstString(node.image);
    out.push({
      name: String(node.name).replace(/\s+/g, " ").trim(),
      sku: node.sku != null ? String(node.sku) : null,
      price: Number.isFinite(price) && price > 0 ? price : null,
      currency: offer.priceCurrency || "UAH",
      inStock: parseAvailability(offer.availability),
      url,
      image: image ? safeEncode(image) : null,
      brand: firstString(node.brand),
    });
  }
  return out;
}
