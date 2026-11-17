// Build-time view of the scraped catalog shared by the content pages
// (material pages, price summary, llms.txt): typed products, formatting and
// the price statistics those pages quote.

import productsData from '../data/products.json';
import companiesData from '../data/companies.json';

export interface Product {
  store: string;
  storeType: string;
  brand: string;
  material: string;
  color: string | null;
  weightKg: number | null;
  lengthM: number | null;
  diameterMm: number | null;
  pricePerSpool: number | null;
  pricePerKg: number | null;
  currency: string;
  sku: string | null;
  url: string;
  image: string | null;
  inStock: boolean | null;
  name: string | null;
  checkedAt?: string;
}

export interface Company {
  id: string;
  name: string;
  type: 'manufacturer' | 'shop';
  city: string;
  url: string;
  materials: string[];
}

export const products = productsData.products as Product[];
export const companies = companiesData as Company[];
export const lastChecked: string = productsData.lastChecked;

/** "14 листопада 2026" — the date the prices were collected. */
export const dataDate = new Date(lastChecked)
  .toLocaleDateString('uk-UA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Kyiv' })
  .replace(/\s*р\.$/, '');

/** Companies that have products in the catalog, i.e. are actually scraped. */
export const trackedCompanies = companies.filter(c => products.some(p => p.store === c.id));

export const uah = (n: number) => `${Math.round(n).toLocaleString('uk-UA')} грн`;

const pluralRules = new Intl.PluralRules('uk');
/** plural(3, 'пропозиція', 'пропозиції', 'пропозицій') → "3 пропозиції" */
export function plural(n: number, one: string, few: string, many: string): string {
  const form = pluralRules.select(n);
  return `${n} ${form === 'one' ? one : form === 'few' ? few : many}`;
}

/** "PLA" → "pla", "ABS+" → "abs-plus" */
export const materialSlug = (material: string) =>
  material.toLowerCase().replace(/\+/g, '-plus').replace(/[^a-z0-9-]/g, '-');

// Price statistics count full spools only: the 100–250 g samples some
// manufacturers sell cost several times more per kg and would skew them.
const MIN_SPOOL_KG = 0.5;

export type Offer = Product & { pricePerSpool: number; pricePerKg: number; weightKg: number };

/** In-stock spools (≥ 0.5 kg) with a known price, cheapest per kg first. */
export function offersOf(items: Product[]): Offer[] {
  return items
    .filter(
      (p): p is Offer =>
        p.inStock === true && !!p.pricePerSpool && !!p.pricePerKg && !!p.weightKg && p.weightKg >= MIN_SPOOL_KG,
    )
    .sort((a, b) => a.pricePerKg - b.pricePerKg);
}

export interface PriceStats {
  offers: Offer[];
  min: number;
  median: number;
  max: number;
  brands: string[];
}

/** Price-per-kg statistics over `offersOf(items)`; null when there are none. */
export function priceStats(items: Product[]): PriceStats | null {
  const offers = offersOf(items);
  if (offers.length === 0) return null;
  const mid = offers.length >> 1;
  const median = offers.length % 2 ? offers[mid].pricePerKg : (offers[mid - 1].pricePerKg + offers[mid].pricePerKg) / 2;
  return {
    offers,
    min: offers[0].pricePerKg,
    median,
    max: offers[offers.length - 1].pricePerKg,
    brands: [...new Set(offers.map(o => o.brand))],
  };
}

export interface MaterialSummary {
  material: string;
  slug: string;
  total: number;
  inStock: number;
  brands: string[];
  stats: PriceStats | null;
}

// Materials with too few products don't get a page of their own.
const MIN_PRODUCTS_FOR_PAGE = 5;

/** Every material that gets its own page, most products first. */
export const materialSummaries: MaterialSummary[] = [...Map.groupBy(products, p => p.material)]
  .filter(([, items]) => items.length >= MIN_PRODUCTS_FOR_PAGE)
  .map(([material, items]) => ({
    material,
    slug: materialSlug(material),
    total: items.length,
    inStock: items.filter(p => p.inStock === true).length,
    brands: [...new Set(items.map(p => p.brand))].sort((a, b) => a.localeCompare(b, 'uk')),
    stats: priceStats(items),
  }))
  .sort((a, b) => b.total - a.total);

/** What a product photo shows, in words: brand, material, colour, spool size. */
export function imageAlt(p: { brand: string; material: string; color: string | null; weightKg: number | null }) {
  const weight = p.weightKg ? `, котушка ${String(p.weightKg).replace('.', ',')} кг` : '';
  return `Філамент ${p.brand} ${p.material}${p.color ? ` ${p.color}` : ''}${weight}`;
}

/** schema.org Product for one catalog record, with the facts a photo is matched against. */
export function productSchema(p: (typeof products)[number]) {
  return {
    '@type': 'Product',
    name: p.name ?? `${p.material} ${p.color ?? ''}`.trim(),
    url: p.url,
    image: p.image ?? undefined,
    sku: p.sku ?? undefined,
    category: 'Філамент для 3D-друку',
    material: p.material,
    color: p.color ?? undefined,
    weight: p.weightKg ? { '@type': 'QuantitativeValue', value: p.weightKg, unitCode: 'KGM' } : undefined,
    brand: { '@type': 'Brand', name: p.brand },
    offers: {
      '@type': 'Offer',
      priceCurrency: p.currency,
      price: p.pricePerSpool,
      url: p.url,
      itemCondition: 'https://schema.org/NewCondition',
      availability: 'https://schema.org/InStock',
    },
  };
}

// ── Colour landing pages ────────────────────────────────────────────────
// A material × colour page exists only when it compares something: at least
// MIN_COLOR_OFFERS spools in stock from MIN_COLOR_SELLERS different sellers.
// Everything thinner stays a catalog filter and gets no URL of its own.
const MIN_COLOR_OFFERS = 5;
const MIN_COLOR_SELLERS = 3;

const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', є: 'ie', ж: 'zh', з: 'z', и: 'y', і: 'i', ї: 'i',
  й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh',
  ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '', ю: 'iu', я: 'ia', "'": '', 'ʼ': '',
};
/** "чорний" → "chornyi", "світло-сірий" → "svitlo-siryi" */
export const colorSlug = (color: string) =>
  [...color.toLowerCase()].map(ch => TRANSLIT[ch] ?? ch).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** "Чорний PETG філамент", or "PETG філамент кольору хакі" when the colour isn't an adjective. */
export function colorHeading(material: string, color: string) {
  const adjective = /(ий|ій)$/.test(color) && !color.includes(' ');
  return adjective
    ? `${color[0].toUpperCase()}${color.slice(1)} ${material} філамент`
    : `${material} філамент кольору ${color}`;
}

export interface ColorLanding {
  material: string;
  materialSlug: string;
  color: string;
  slug: string;
  stats: PriceStats;
}

export const colorLandings: ColorLanding[] = materialSummaries.flatMap(m =>
  [...Map.groupBy(m.stats?.offers ?? [], o => o.color)]
    .flatMap(([color, offers]) => {
      const stats = color ? priceStats(offers) : null;
      return stats && stats.offers.length >= MIN_COLOR_OFFERS && stats.brands.length >= MIN_COLOR_SELLERS
        ? [{ material: m.material, materialSlug: m.slug, color: color!, slug: colorSlug(color!), stats }]
        : [];
    })
    .sort((a, b) => b.stats.offers.length - a.stats.offers.length),
);

// ── Material comparisons ────────────────────────────────────────────────
/** Pairs people actually weigh against each other; each gets /compare/a-vs-b/. */
export const COMPARISONS: Array<{ a: string; b: string; verdict: string }> = [
  {
    a: 'PLA',
    b: 'PETG',
    verdict:
      'PLA беріть для декору, прототипів і першого досвіду друку: він найпростіший у налаштуванні. PETG — коли деталь має тримати навантаження, вологу або нагрів до 75–80 °C: кріплення, корпуси, вироби для вулиці.',
  },
  {
    a: 'PETG',
    b: 'ABS',
    verdict:
      'PETG простіший: друкується без закритої камери й майже не дає усадки. ABS варто обирати заради термостійкості близько 95–100 °C і можливості шліфувати та згладжувати деталь ацетоном — за умови, що є гарячий стіл і провітрювання.',
  },
  {
    a: 'PLA',
    b: 'ABS',
    verdict:
      'PLA друкується на будь-якому принтері й без запаху, але розм\'якшується вже при 55–60 °C. ABS витримує близько 95–100 °C і краще тримає удар, проте потребує гарячого столу, бажано закритої камери й провітрювання.',
  },
];
export const comparisonSlug = (a: string, b: string) => `${materialSlug(a)}-vs-${materialSlug(b)}`;
/** Comparisons where both materials have a page, so every link resolves. */
export const comparisons = COMPARISONS.flatMap(c => {
  const a = materialSummaries.find(m => m.material === c.a);
  const b = materialSummaries.find(m => m.material === c.b);
  return a && b ? [{ ...c, slug: comparisonSlug(c.a, c.b), left: a, right: b }] : [];
});
