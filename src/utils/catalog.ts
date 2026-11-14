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
