// Swatch colour for a Ukrainian colour label from the catalog.
//
// Labels are free-form ("оливково-сірий", "сірий металік", "напівпрозорий
// зелений"), so the lookup goes word by word and takes the first word whose
// base colour is known; in a compound the base is the last part
// ("оливково-сірий" → сірий). "темно-" / "світло-" shade the result.

const BASE: Record<string, string> = {
  'білий': '#ffffff',
  'білосніжний': '#ffffff',
  'молочний': '#fbf6e9',
  'кремовий': '#f4e8c8',
  'натуральний': '#f1e3c0',
  'прозорий': '#e8f1f5',
  'безкольоровий': '#e8f1f5',
  'бежевий': '#d9c3a0',
  'пісочний': '#cdb588',
  'тілесний': '#e8b99a',
  'персиковий': '#ffb890',
  'жовтий': '#ffd400',
  'лимонний': '#f6e94b',
  'гірчичний': '#c99a1e',
  'золото': '#d4af37',
  'золотий': '#d4af37',
  'жовтогарячий': '#ff9d1c',
  'помаранчевий': '#ff7a00',
  'кораловий': '#ff6f61',
  'червоний': '#d92020',
  'малиновий': '#c2185b',
  'вишневий': '#8e1b2e',
  'бордовий': '#7a0f25',
  'теракотовий': '#b4532a',
  'рожевий': '#ff7fb5',
  'бузковий': '#b79ad6',
  'лавандовий': '#a99be0',
  'фіолетовий': '#7b2cbf',
  'пурпуровий': '#8e24aa',
  'індиго': '#33308f',
  'синій': '#1f4fbf',
  'блакитний': '#5cb6e6',
  'бірюзовий': '#1abc9c',
  "м'ятний": '#9be3c6',
  'смарагдовий': '#0f8f5f',
  'зелений': '#2e9b4f',
  "трав'яний": '#5fae2e',
  'салатовий': '#a4e04f',
  'оливковий': '#7a7f35',
  'оліва': '#6b6f3a',
  'хакі': '#6b6a41',
  'койот': '#9a7b55',
  'коричневий': '#7b4a2a',
  'шоколадний': '#4e2f1f',
  'бронза': '#b0743a',
  'мідь': '#b87333',
  'срібло': '#c0c4c8',
  'срібний': '#c0c4c8',
  'металік': '#a9afb6',
  'сталь': '#71797e',
  'перламутр': '#e6dfe8',
  'перлинний': '#e6dfe8',
  'мармуровий': '#d8d8d4',
  'сірий': '#8a8f96',
  'графіт': '#474b51',
  'антрацит': '#33363a',
  'чорний': '#1a1a1a',
};

const MULTI = 'conic-gradient(#d92020, #ffd400, #2e9b4f, #1f4fbf, #7b2cbf, #d92020)';
const MULTICOLOR = /градієнт|перехідний|мультиколор|райдуж|веселк|хамелеон|випадковий/u;

const UNKNOWN_COLOR = '#9aa0a6';

function mix(hex: string, target: number, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => {
    const c = (n >> shift) & 255;
    return Math.round(c + (target - c) * amount).toString(16).padStart(2, '0');
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

/** CSS `background` value for a colour label; grey when unknown. */
export function colorHex(name: string | null | undefined): string {
  if (!name) return UNKNOWN_COLOR;
  const label = name.toLowerCase();
  if (MULTICOLOR.test(label)) return MULTI;
  for (const word of label.split(/\s+/)) {
    const parts = word.split('-');
    const hex = BASE[word] ?? BASE[parts[parts.length - 1]];
    if (!hex) continue;
    if (parts[0] === 'темно') return mix(hex, 0, 0.4);
    if (parts[0] === 'світло') return mix(hex, 255, 0.45);
    return hex;
  }
  return UNKNOWN_COLOR;
}

/** Like `colorHex`, but always a plain colour (usable as CSS `color`). */
export function solidColorHex(name: string | null | undefined): string {
  const value = colorHex(name);
  return value.startsWith('#') ? value : UNKNOWN_COLOR;
}
