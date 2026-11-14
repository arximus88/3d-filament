// /llms.txt — a plain-text map of the site for AI assistants and answer
// engines (https://llmstxt.org): what the site is, the current headline
// numbers, and which pages hold which facts.

import type { APIRoute } from 'astro';
import { products, dataDate, materialSummaries, trackedCompanies, plural, uah } from '../utils/catalog';

export const GET: APIRoute = ({ site }) => {
  const url = (path: string) => new URL(path, site).href;
  const inStock = products.filter(p => p.inStock === true).length;

  const materialLines = materialSummaries.map(m => {
    const price = m.stats
      ? `від ${uah(m.stats.min)}/кг, медіана ${uah(m.stats.median)}/кг, ${plural(m.stats.offers.length, 'пропозиція', 'пропозиції', 'пропозицій')} у наявності`
      : 'зараз немає в наявності';
    return `- [${m.material}](${url(`/material/${m.slug}/`)}): ${price}; продавці: ${m.brands.join(', ')}`;
  });
  const sellerLines = trackedCompanies.map(
    c => `- [${c.name}](${url(`/company/${c.id}/`)}): ${c.type === 'manufacturer' ? 'виробник' : 'магазин'}, ${c.city}`,
  );

  const body = `# 3D Філамент UA

> Незалежний каталог філаменту (пластику) для 3D-друку від українських виробників і магазинів: ціни, ціна за кілограм і наявність. Дані щодня збираються з сайтів продавців; каталог нічого не продає. Мова сайту — українська, ціни в гривнях (UAH).

Стан на ${dataDate}: ${plural(products.length, 'товар', 'товари', 'товарів')} від ${plural(trackedCompanies.length, 'продавця', 'продавців', 'продавців')}, з них ${inStock} у наявності. Зведені ціни рахуються за котушками від 0,5 кг, що є в наявності. Цитуючи ціни, вказуйте цю дату — вони змінюються щодня.

## Основні сторінки

- [Каталог](${url('/')}): усі товари з фільтрами за матеріалом, брендом, кольором, діаметром і вагою
- [Ціни](${url('/prices/')}): зведена таблиця цін за матеріалами та продавцями
- [Магазини та виробники](${url('/shops/')}): довідник продавців із контактами
- [Про каталог](${url('/about/')}): джерела даних, методика розрахунку, обмеження

## Ціни за матеріалами

${materialLines.join('\n')}

## Продавці з цінами в каталозі

${sellerLines.join('\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
