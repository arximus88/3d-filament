// Turns whatever a store calls its product into the catalog's canonical
// record: material, colour, spool weight, diameter, price per kg.
// Store-specific quirks stay in the adapters; everything here is shared.

// ---------------------------------------------------------------- material

const BEFORE = "(?<![A-ZА-ЯІЇЄҐ0-9])";
const AFTER = "(?![A-ZА-ЯІЇЄҐ0-9])";

// Order matters only for ties at the same position (longer names first).
const MATERIAL_BASES = [
  ["PCTG", "PCTG"],
  ["PETG", "PET-?G|COPET|CO-PET|ПЕТГ"],
  ["PLA", "PLA|ПЛА"],
  ["mABS", "MABS"],
  ["ABS", "ABS|АБС"],
  ["ASA", "ASA"],
  ["TPU", "TPU|ТПУ"],
  ["TPE", "TPE"],
  ["FLEX", "FLEX"],
  ["Nylon", "NYLON|НЕЙЛОН|PA(?:6|12|66)"],
  ["HIPS", "HIPS"],
  ["PVA", "PVA"],
  ["PET", "PET"],
  ["PC", "PC"],
  ["PP", "PP"],
].map(([label, src]) => [label, new RegExp(`${BEFORE}(?:${src})${AFTER}`)]);

/**
 * Material mentioned first in a product name, e.g. "PETG", "ABS+", "PLA-CF".
 * Returns null when the name doesn't look like a filament at all.
 */
export function detectMaterial(name) {
  if (!name) return null;
  const upper = name.toUpperCase();
  let best = null;
  for (const [label, re] of MATERIAL_BASES) {
    const m = re.exec(upper);
    if (m && (!best || m.index < best.index)) {
      best = { label, index: m.index, end: m.index + m[0].length };
    }
  }
  if (!best) return null;
  let material = best.label;
  if (upper[best.end] === "+") material += "+";
  if (/(?<![A-Z])CF\d*(?![A-Z])|CARBON|КАРБОН|ВУГЛЕВОЛОК/.test(upper)) material += "-CF";
  else if (/(?<![A-Z])GF\d*(?![A-Z])|СКЛОВОЛОК/.test(upper)) material += "-GF";
  return material;
}

// ------------------------------------------------------------------- specs

const num = (s) => Number(s.replace(",", "."));
const END = "(?![\\p{L}\\d])";
const DIAMETERS = new Set([1.75, 2.85, 2.9, 3]);

/** Spool weight (kg), filament diameter (mm) and length (m) from a name. */
export function parseSpecs(name) {
  const specs = { weightKg: null, diameterMm: null, lengthM: null };
  if (!name) return specs;

  for (const m of name.matchAll(new RegExp(`(\\d(?:[.,]\\d+)?)\\s*(?:мм|mm)${END}`, "giu"))) {
    const d = num(m[1]);
    if (DIAMETERS.has(d)) {
      specs.diameterMm = d;
      break;
    }
  }

  const kg = name.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:кг|kg)${END}`, "iu"));
  if (kg) specs.weightKg = num(kg[1]);
  else {
    const g = name.match(new RegExp(`(\\d{2,4})\\s*(?:грам\\p{L}*|гр\\.?|г|g)${END}`, "iu"));
    if (g) specs.weightKg = Number(g[1]) / 1000;
  }

  const len = name.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(?:м|m)${END}`, "iu"));
  if (len) specs.lengthM = num(len[1]);

  return specs;
}

// ------------------------------------------------------------------ colour

// Russian → Ukrainian. Stores with Russian-only catalogs (Monofilament)
// and the occasional Russian word on Ukrainian ones both go through this.
const COLOR_RU_UK = {
  "белый": "білий", "белая": "білий",
  "черный": "чорний", "чёрный": "чорний",
  "красный": "червоний",
  "зеленый": "зелений", "зелёный": "зелений",
  "синий": "синій",
  "жёлтый": "жовтий", "желтый": "жовтий", "желтий": "жовтий",
  "оранжевый": "помаранчевий", "оранжевий": "помаранчевий",
  "розовый": "рожевий",
  "фиолетовый": "фіолетовий", "фиолетовий": "фіолетовий",
  "голубой": "блакитний",
  "серый": "сірий",
  "коричневый": "коричневий",
  "натуральный": "натуральний",
  "бирюзовый": "бірюзовий",
  "мятный": "м'ятний", "мятний": "м'ятний",
  "салатовый": "салатовий",
  "хаки": "хакі",
  "бордовый": "бордовий",
  "медь": "мідь",
  "серебро": "срібло",
  "прозора": "прозорий",
  "перламутровий": "перламутр",
  "пурпурний": "пурпуровий",
  "коричнивий": "коричневий",
  "прозрачный": "прозорий",
  "бежевый": "бежевий",
  "переходной": "перехідний", "переходный": "перехідний",
  "металлик": "металік",
  "жемчуг": "перлинний",
  "мрамор": "мармуровий",
  "полупрозрачный": "напівпрозорий",
  "вишневый": "вишневий",
  "лимонный": "лимонний",
  "малиновый": "малиновий",
  "сиреневый": "бузковий",
  "графит": "графіт", "графитовый": "графіт", "графітовий": "графіт",
  "пурпурный": "пурпуровий",
  "градиент": "градієнт",
  "неоновый": "неоновий",
  "пастельный": "пастельний",
  "термохромный": "термохромний",
  "матовый": "матовий",
  "оливковый": "оливковий",
  "коралловый": "кораловий",
  "светло": "світло",
  "тёмно": "темно",
  "случайный": "випадковий",
  "телесный": "тілесний",
  "фосфоресцентный": "фосфоресцентний",
  "цвет": "",
  "коричневыйполупрозрачный": "коричневий напівпрозорий",
  "индиго": "індиго",
};

// Cheap fallback for Russian adjectives missing from the dictionary.
function transliterateRuTail(t) {
  return t.replace(/ё/gu, "е").replace(/ы/gu, "и");
}

// Metal adjectives become the catalog's noun label ("золотий" → "золото"),
// but only as standalone words: "жовто-золотий" stays an adjective.
const METALS = {
  "золотой": "золото", "золотий": "золото",
  "серебряный": "срібло", "срібний": "срібло",
  "медный": "мідь", "мідний": "мідь",
  "стальной": "сталь", "сталевий": "сталь",
  "бронзовий": "бронза", "бронзовый": "бронза",
};

function normaliseSegment(t) {
  const k = t.toLowerCase();
  return k in COLOR_RU_UK ? COLOR_RU_UK[k] : transliterateRuTail(k);
}

function normaliseWord(word) {
  const k = word.toLowerCase();
  if (k in METALS) return METALS[k];
  return k.split("-").map(normaliseSegment).filter(Boolean).join("-");
}

/** Lower-case a colour label and translate Russian words to Ukrainian. */
export function normaliseColor(raw) {
  if (!raw) return null;
  const out = raw
    .replace(/[’ʼ`]/gu, "'")
    .trim()
    .split(/\s+/)
    .map(normaliseWord)
    .filter(Boolean)
    .join(" ");
  return out || null;
}

const COLORS = new Set([
  "білий", "чорний", "червоний", "зелений", "синій", "жовтий", "помаранчевий",
  "рожевий", "фіолетовий", "блакитний", "сірий", "коричневий", "натуральний",
  "бірюзовий", "м'ятний", "салатовий", "хакі", "бордовий", "мідь", "золото",
  "срібло", "сталь", "бронза", "прозорий", "напівпрозорий", "бежевий",
  "перламутр", "перлинний", "мармуровий", "вишневий", "лимонний", "малиновий",
  "бузковий", "графіт", "пурпуровий", "койот", "оліва", "оливковий",
  "кораловий", "тілесний", "індиго", "трав'яний", "шоколадний", "кремовий",
  "молочний", "пісочний", "смарагдовий", "лавандовий", "персиковий",
  "гірчичний", "теракотовий", "антрацит", "слонова", "кістка", "мультиколор",
  "градієнт", "перехідний", "металік", "золотий", "срібний", "жовтогарячий",
  "білосніжний", "безкольоровий",
]);
// Words that qualify a colour but aren't one by themselves.
const MODIFIERS = new Set([
  "люмінесцентний", "флуоресцентний", "фосфоресцентний", "неоновий",
  "матовий", "пастельний", "глянцевий", "теплий", "холодний", "темний",
  "світлий", "яскравий", "шовковий",
]);
// First halves of compound adjectives: "темно-", "оливково-", "прозоро-"…
const isPrefix = (s) => s.length >= 4 && s.endsWith("о") && !COLORS.has(s);

// Latin letters typed in place of identical-looking Cyrillic ones
// ("Cиній" with a Latin C) — only fixed inside otherwise-Cyrillic words.
const HOMOGLYPHS = { a: "а", c: "с", e: "е", i: "і", o: "о", p: "р", x: "х", y: "у" };
function fixHomoglyphs(word) {
  if (!/[а-яіїєґ]/u.test(word) || !/[a-z]/.test(word)) return word;
  return word.replace(/[aceiopxy]/g, (ch) => HOMOGLYPHS[ch]);
}

/**
 * Find the colour inside a free-form product name by dictionary: the first
 * run of adjacent colour words ("Темно сірий (графіт)" → "темно-сірий",
 * "Хакі Койот" → "хакі койот"). Returns null if no known colour is present.
 */
export function findColor(name) {
  if (!name) return null;
  const text = name.replace(/[’ʼ`]/gu, "'").toLowerCase();
  let run = [];
  let hasColor = false;
  const finish = () => {
    if (!hasColor) return null;
    // "темно сірий" is the same compound as "темно-сірий".
    return run.join(" ").replace(/(^| )(темно|світло|яскраво|блідо) /gu, "$1$2-");
  };
  let lastEnd = 0;
  for (const m of text.matchAll(/[\p{L}'-]+/gu)) {
    const adjacent = /^\s*$/u.test(text.slice(lastEnd, m.index));
    lastEnd = m.index + m[0].length;
    const word = normaliseColor(fixHomoglyphs(m[0])) ?? "";
    const parts = word.split("-").filter(Boolean);
    const last = parts.at(-1);
    const known =
      parts.length > 0 &&
      (COLORS.has(last) || MODIFIERS.has(last) || (parts.length === 1 && isPrefix(last) && /^(темно|світло|яскраво|блідо)$/u.test(last))) &&
      parts.slice(0, -1).every((s) => COLORS.has(s) || isPrefix(s));
    if (!known || !adjacent) {
      const done = finish();
      if (done) return done;
      run = [];
      hasColor = false;
    }
    if (known) {
      run.push(word);
      if (COLORS.has(last)) hasColor = true;
    }
  }
  return finish();
}

// ----------------------------------------------------------------- product

// Things that mention a material but aren't a spool of filament.
const NOT_A_SPOOL = /набір|набор|ручк|пробник|зразк|образц|моток|сопло|сушарк|сушилк|клей|спрей/iu;
const FILAMENT_WORD = /пластик|філамент|филамент|нитка|нить|filament|котушк|катушк/iu;

/** True when a product name describes a filament spool. */
export function looksLikeFilament(name) {
  return Boolean(name) && FILAMENT_WORD.test(name) && !NOT_A_SPOOL.test(name) && detectMaterial(name) !== null;
}

const round2 = (n) => Math.round(n * 100) / 100;

/**
 * Assemble the canonical catalog record. Adapters pass what they know for
 * sure (e.g. a category-pinned material); the rest is parsed from the name.
 *
 * @param {{ id: string, type: string, brand: string }} store
 * @param {object} raw  { name, url, price, currency?, sku?, image?, inStock?,
 *                        brand?, material?, color?, weightKg?, diameterMm?,
 *                        lengthM? }
 */
export function buildProduct(store, raw) {
  const specs = parseSpecs(raw.name);
  const weightKg = raw.weightKg ?? specs.weightKg;
  const price = raw.price ?? null;
  return {
    store: store.id,
    storeType: store.type,
    brand: raw.brand || store.brand,
    material: raw.material ?? detectMaterial(raw.name) ?? "?",
    color: raw.color !== undefined ? raw.color : findColor(raw.name),
    weightKg,
    lengthM: raw.lengthM ?? specs.lengthM,
    diameterMm: raw.diameterMm ?? specs.diameterMm,
    pricePerSpool: price,
    pricePerKg: price && weightKg ? round2(price / weightKg) : null,
    currency: raw.currency || "UAH",
    sku: raw.sku ?? null,
    url: raw.url,
    image: raw.image ?? null,
    inStock: raw.inStock ?? null,
    name: raw.name,
  };
}
