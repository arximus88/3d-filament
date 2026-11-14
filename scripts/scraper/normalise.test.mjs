import { describe, expect, test } from "bun:test";
import {
  buildProduct,
  detectMaterial,
  findColor,
  looksLikeFilament,
  normaliseColor,
  parseSpecs,
} from "./normalise.mjs";
import { extractProducts, parseAvailability } from "./jsonld.mjs";
import { parseHoroshopColor } from "./adapters/horoshop.mjs";
import { colorFromTitle, parseListing } from "./adapters/monofilament.mjs";
import { deriveStock } from "./stock.mjs";

// Names below are real listings from the scraped stores.

describe("detectMaterial", () => {
  test.each([
    ["Нитка PETG (CoPET, ПЕТГ) пластик для 3D друку, Койот (1.75 мм/3 кг)", "PETG"],
    ["Пластик PetG (Copet) Темно сірий (графіт) 1,75mm 0,75кг", "PETG"],
    ["ФАЙНИЙ PLA Пластик для 3D принтера 0.850 кг /245 м / 1.75 мм Білий", "PLA"],
    ["CoPET пластик для 3D принтера 3.0 кг", "PETG"],
    ["ABS+ пластик чорний 1 кг", "ABS+"],
    ["Нитка PCTG пластик для 3D-друку, Прозора (1.75 мм/0.5 кг)", "PCTG"],
    ["PLA CF10 філамент чорний", "PLA-CF"],
    ["ASA Pro (АСА Про) пластик для 3D-друку / Оливково-сірий 1 кг", "ASA"],
    ["Гайка Т-подібна M4", null],
    ["Хотенд 3D принтера E3D V6 1.75 мм 12V", null],
  ])("%s → %s", (name, material) => {
    expect(detectMaterial(name)).toBe(material);
  });
});

describe("parseSpecs", () => {
  test("Prom layout with brackets", () => {
    expect(parseSpecs("Нитка PLA, Жовтий (1.75 мм/3 кг)")).toEqual({ weightKg: 3, diameterMm: 1.75, lengthM: null });
  });
  test("weight / length / diameter triple", () => {
    expect(parseSpecs("ФАЙНИЙ PLA 0.850 кг /245 м / 1.75 мм Білий")).toEqual({ weightKg: 0.85, diameterMm: 1.75, lengthM: 245 });
  });
  test("glued Latin units and decimal comma", () => {
    expect(parseSpecs("PLA Чорний 1,75mm 0,75кг")).toEqual({ weightKg: 0.75, diameterMm: 1.75, lengthM: null });
  });
  test("Monofilament pill text", () => {
    expect(parseSpecs("Ø1,75мм / 1,0кг")).toEqual({ weightKg: 1, diameterMm: 1.75, lengthM: null });
  });
  test("grams", () => {
    expect(parseSpecs("TPU 500 г 1.75 мм").weightKg).toBe(0.5);
  });
  test("a nozzle size is not a filament diameter", () => {
    expect(parseSpecs("Гнучка голка для прочищення сопла 0,4 мм").diameterMm).toBeNull();
  });
  test("nothing to find", () => {
    expect(parseSpecs("PLA пластик Синій метелик")).toEqual({ weightKg: null, diameterMm: null, lengthM: null });
  });
});

describe("findColor", () => {
  test.each([
    ["Нитка PETG (CoPET, ПЕТГ) пластик для 3D друку, Койот (1.75 мм/3 кг)", "койот"],
    ["Пластик PetG (Copet) Темно сірий (графіт) 1,75mm 0,75кг", "темно-сірий"],
    ["PLA (ПЛА) пластик для 3D принтера Темно-синій (індиго) 1,75 mm", "темно-синій"],
    ["PLA філамент Pochatok Filament 1,75мм Хакі Оліва 3 кг", "хакі оліва"],
    ["ФАЙНИЙ PLA Пластик для 3D принтера 0.850 кг /245 м / 1.75 мм Трав'яний", "трав'яний"],
    ["Пластик PetG (Copet) напівпрозорий зелений 1,75mm 0,75кг", "напівпрозорий зелений"],
    ["Нитка PETG пластик для 3D-друку, Прозоро-зелений (1.75 мм/0.5 кг)", "прозоро-зелений"],
    ["ASA Pro (АСА Про) пластик для 3D-друку / Оливково-сірий 1 кг", "оливково-сірий"],
    ["PLA (ПЛА) пластик для 3D принтера Бронзовий 1,75 mm 0,75 кг", "бронза"],
    ["PETG філамент Натуральний Прозорий 074 Techfil 1.75 мм 1 кг", "натуральний прозорий"],
    // Latin "C" typed instead of the Cyrillic one.
    ["PLA (ПЛА) пластик для 3D принтера Cиній метелік", "синій"],
    ["PLA пластик для 3D принтера 1 кг", null],
  ])("%s → %s", (name, color) => {
    expect(findColor(name)).toBe(color);
  });
});

describe("normaliseColor", () => {
  test("Russian → Ukrainian", () => {
    expect(normaliseColor("Жёлтый")).toBe("жовтий");
    expect(normaliseColor("светло-серый")).toBe("світло-сірий");
    expect(normaliseColor("Мятний")).toBe("м'ятний");
  });
  test("metal adjectives become nouns only when standalone", () => {
    expect(normaliseColor("Золотий")).toBe("золото");
    expect(normaliseColor("Жовто-золотий")).toBe("жовто-золотий");
  });
  test("empty input", () => {
    expect(normaliseColor("")).toBeNull();
    expect(normaliseColor(null)).toBeNull();
  });
});

describe("looksLikeFilament", () => {
  test.each([
    ["Нитка PLA (ПЛА) пластик для 3D друку, Жовтий (1.75 мм/3 кг)", true],
    ["PLA філамент нитка пластик для ЗD друку Pochatok Filament 1,75 мм. Коричневий", true],
    ["Подарунковий набір пластику PLA для 3d ручки, 16 кольорів", false],
    ["PLA пластик для 3D ручки люмінесцентний зелений (10 метрів)", false],
    ["Адгезійний спрей клей G-3DP для 3D друку ABS, PLA, PETG пластиками 50ml", false],
    ["Квадрокоптер FPV CDUC 8\" модель Сutter 8.3", false],
    ["Термобар'єр хотенда E3D V6 з тефлоновою трубкою у сопла", false],
  ])("%s → %s", (name, expected) => {
    expect(looksLikeFilament(name)).toBe(expected);
  });
});

describe("buildProduct", () => {
  const store = { id: "u3df", type: "manufacturer", brand: "U3DF" };
  test("fills everything from the name", () => {
    const p = buildProduct(store, {
      name: "Нитка PETG (CoPET, ПЕТГ) пластик для 3D друку, Койот (1.75 мм/3 кг)",
      url: "https://u3df.com.ua/ua/p1.html",
      price: 1500,
      inStock: true,
    });
    expect(p).toMatchObject({
      store: "u3df",
      storeType: "manufacturer",
      brand: "U3DF",
      material: "PETG",
      color: "койот",
      weightKg: 3,
      diameterMm: 1.75,
      pricePerSpool: 1500,
      pricePerKg: 500,
      currency: "UAH",
      inStock: true,
    });
  });
  test("adapter-supplied fields win; no weight → no price per kg", () => {
    const p = buildProduct(store, { name: "PLA пластик синій", url: "x", price: 400, material: "PLA+", color: "індиго" });
    expect(p.material).toBe("PLA+");
    expect(p.color).toBe("індиго");
    expect(p.pricePerKg).toBeNull();
    expect(p.inStock).toBeNull();
  });
});

describe("JSON-LD", () => {
  const html = `
    <script type="application/ld+json">{"@type":"Organization","name":"Shop"}</script>
    <script type="application/ld+json">{ broken json </script>
    <script type="application/ld+json">[{"@context":"http://schema.org","@type":"Product",
      "name":"Нитка  PLA, Жовтий","sku":423,"image":"https://img/a b.jpg",
      "offers":{"@type":"Offer","availability":"http://schema.org/OutOfStock","price":"1500.00",
                "url":"/ua/p1-nit.html","priceCurrency":"UAH"}}]</script>`;
  test("extracts products, resolves relative URLs, survives broken blocks", () => {
    expect(extractProducts(html, "https://u3df.com.ua/ua/product_list")).toEqual([
      {
        name: "Нитка PLA, Жовтий",
        sku: "423",
        price: 1500,
        currency: "UAH",
        inStock: false,
        url: "https://u3df.com.ua/ua/p1-nit.html",
        image: "https://img/a%20b.jpg",
        brand: null,
      },
    ]);
  });
  test("availability", () => {
    expect(parseAvailability("https://schema.org/InStock")).toBe(true);
    expect(parseAvailability("http://schema.org/OutOfStock")).toBe(false);
    expect(parseAvailability(undefined)).toBeNull();
  });
});

describe("Horoshop colour layouts", () => {
  test("Plexiwire: colour after «принтера»", () => {
    expect(parseHoroshopColor("PLA пластик для 3D принтера натуральний 400м / 1.185кг / 1.75мм")).toBe("натуральний");
  });
  test("LBL: colour after «філамент»", () => {
    expect(parseHoroshopColor("PLA філамент Зелений пластик для 3D принтера 0.800 кг / 260 м / 1.75 мм")).toBe("зелений");
  });
  test("unknown layout defers to the dictionary", () => {
    expect(parseHoroshopColor("PETG філамент Чорний 074 Techfil 1.75 мм 1.0 кг")).toBeUndefined();
  });
});

describe("Monofilament", () => {
  test("colour from card title", () => {
    expect(colorFromTitle("PLA Білий")).toBe("білий");
    expect(colorFromTitle("ABS PRO Чорний")).toBe("чорний");
    expect(colorFromTitle("CoPET Чорний")).toBe("чорний");
    expect(colorFromTitle("PLA Wood Ø1,75мм Вага:0,75кг")).toBe("wood");
  });

  const card = (inner) => `<div class="product-thumb mfil-catalog-card">${inner}</div>`;
  const listing =
    card(`<div class="image"><a href="https://m/ua/pla-bilij-075"><img src="https://m/white.webp" /></a></div>
      <h4><a href="https://m/ua/pla-bilij-075">PLA Білий</a></h4>
      <a class="mfil-catalog-variant-pill" href="https://m/ua/pla-bilij-10" title="x"><span class="mfil-catalog-variant-pill__text">Ø1,75мм / 1,0кг</span></a>
      <a class="mfil-catalog-variant-pill active out-of-stock" aria-current="true" href="https://m/ua/pla-bilij-075" title="x"><span class="mfil-catalog-variant-pill__text">Ø1,75мм / 0,75кг</span></a>
      <p class="price"> 490грн </p>
      <button type="button" class="mfil-catalog-card__buy" hidden onclick="cart.add('1')">Купити</button>`) +
    card(`<div class="image"><a href="https://m/ua/pla-wood"><img src="https://m/wood.webp" /></a></div>
      <h4><a href="https://m/ua/pla-wood">PLA Wood Ø1,75мм Вага:0,75кг</a></h4>
      <p class="price"> 820грн </p>
      <button type="button" class="mfil-catalog-card__buy" onclick="cart.add('2')">Купити</button>`);

  test("variants, per-variant stock, price only for the active one", () => {
    expect(parseListing(listing)).toEqual([
      { url: "https://m/ua/pla-bilij-10", color: "білий", size: "Ø1,75мм / 1,0кг", image: "https://m/white.webp", inStock: true, price: null },
      { url: "https://m/ua/pla-bilij-075", color: "білий", size: "Ø1,75мм / 0,75кг", image: "https://m/white.webp", inStock: false, price: 490 },
      { url: "https://m/ua/pla-wood", color: "wood", size: "PLA Wood Ø1,75мм Вага:0,75кг", image: "https://m/wood.webp", inStock: true, price: 820 },
    ]);
  });
});

describe("deriveStock", () => {
  const companies = [
    { id: "a", materials: ["PLA", "PETG", "TPU", "ABS"] },
    { id: "b", materials: ["PLA"] },
  ];
  const p = (material, inStock) => ({ store: "a", material, inStock, checkedAt: "2026-11-14T00:00:00.000Z" });
  test("in / out / unknown per material; unscraped companies omitted", () => {
    const stock = deriveStock(companies, [p("PLA", false), p("PLA-CF", true), p("PETG", false), p("FLEX", null)]);
    expect(stock).toEqual({
      a: { PLA: "in", PETG: "out", TPU: "unknown", ABS: "unknown", checkedAt: "2026-11-14T00:00:00.000Z" },
    });
  });
});
