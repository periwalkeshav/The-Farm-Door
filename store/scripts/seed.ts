/**
 * Development seed: settings, a SAMPLE catalogue (made-up products, prices and
 * stock, with placeholder images), two sample coupons and the owner account.
 *
 *   npm run db:seed             # first run
 *   npm run db:seed -- --reset  # wipe the development database and reseed
 *   npm run db:seed -- --update # add any new sample categories/products to an existing demo database
 *
 * Refuses to run in production or against a database that has real orders.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { saveImage } from "@/server/media";
import { writeSettings } from "@/server/settings";
import { DEFAULT_CATEGORIES, ensureDefaultCategories } from "./categories";
import { productArt, type ArtKind } from "./sample-art";
import { COLLECTIONS_HI, productHindiColumns } from "./sample-hindi";
import sharp from "sharp";

const db = getDb();
const reset = process.argv.includes("--reset");
const update = process.argv.includes("--update");

/** `grams` is the net quantity: grams, or millilitres for a product sold by volume. `packed` is the packed weight in grams when it can't be guessed. */
type VariantSpec = { values: Record<string, string>; price: number; mrp: number; grams: number; packed?: number; stock?: number; hsn?: string; active?: boolean };
type ProductSpec = {
  slug: string;
  name: string;
  subtitle: string;
  category: string;
  collections: string[];
  /** "ml" for oils and other liquids. */
  unit?: "g" | "ml";
  /** Start of the stock codes (SKUs), when the first letters of the web address would clash with another product's. */
  code?: string;
  featured?: boolean;
  art: { kind: ArtKind; powder?: string; bg: string };
  description: string;
  ingredients: string;
  usage: string;
  storage?: string;
  shelfLife: string;
  tags: string[];
  options: t.ProductOption[];
  hsn: string;
  stock: { mode: "PACK" } | { mode: "GRAM"; poolBy?: string; grams: Record<string, number> | number; costPerKg?: number };
  variants: VariantSpec[];
};

const STORAGE = "Store in an airtight container in a cool, dry place, away from direct sunlight. Use a dry spoon.";
const OIL_STORAGE = "Store in a cool, dark place with the cap closed, away from direct sunlight.";
const SHELF = "Best before 12 months from packing (sample text, confirm for your products)";

const sizes = (list: [string, number, number, number, number?][]) =>
  list.map(([size, grams, price, mrp, stock]) => ({ values: { Size: size }, grams, price, mrp, stock }));

const PRODUCTS: ProductSpec[] = [
  {
    slug: "turmeric-powder",
    name: "Turmeric Powder",
    subtitle: "Haldi · ground",
    category: "spices",
    collections: ["ground-spices", "bestsellers", "everyday-essentials", "everyday-tadka"],
    featured: true,
    art: { kind: "powder", powder: "#E2A21B", bg: "#F3E3BC" },
    description: "Ground turmeric for everyday cooking: dals, sabzis, rice and a warm cup of haldi doodh. A little goes a long way for colour and an earthy, gentle bitterness.",
    ingredients: "Turmeric",
    usage: "Add ¼–½ teaspoon to hot oil or ghee at the start of cooking, or stir into dal while it simmers.",
    shelfLife: SHELF,
    tags: ["haldi", "turmeric"],
    options: [{ name: "Size", values: ["100 g", "200 g", "500 g", "1 kg"] }],
    hsn: "091030",
    stock: { mode: "GRAM", grams: 12_000, costPerKg: 18_000 },
    variants: sizes([
      ["100 g", 100, 65, 75],
      ["200 g", 200, 120, 140],
      ["500 g", 500, 280, 330],
      ["1 kg", 1000, 540, 640],
    ]),
  },
  {
    slug: "red-chilli-powder",
    name: "Red Chilli Powder",
    subtitle: "Lal mirch · choose your heat",
    category: "spices",
    collections: ["ground-spices", "bestsellers", "everyday-essentials", "everyday-tadka", "south-indian"],
    featured: true,
    art: { kind: "powder", powder: "#B9361F", bg: "#F2D6C8" },
    description: "Ground red chilli in two heat levels. Mild gives colour with gentle warmth; Hot is for those who like real fire in their curries and chutneys.",
    ingredients: "Red chillies",
    usage: "Add to tadka, marinades, curries and chutneys. Start with a little and add to taste.",
    shelfLife: SHELF,
    tags: ["mirchi", "lal mirch", "chilli"],
    options: [
      { name: "Heat", values: ["Mild", "Hot"] },
      { name: "Size", values: ["100 g", "250 g", "500 g"] },
    ],
    hsn: "090422",
    stock: { mode: "PACK" },
    variants: [
      { values: { Heat: "Mild", Size: "100 g" }, grams: 100, price: 70, mrp: 80, stock: 40 },
      { values: { Heat: "Mild", Size: "250 g" }, grams: 250, price: 160, mrp: 185, stock: 30 },
      { values: { Heat: "Mild", Size: "500 g" }, grams: 500, price: 300, mrp: 350, stock: 12 },
      { values: { Heat: "Hot", Size: "100 g" }, grams: 100, price: 65, mrp: 75, stock: 35 },
      { values: { Heat: "Hot", Size: "250 g" }, grams: 250, price: 150, mrp: 175, stock: 3 },
      { values: { Heat: "Hot", Size: "500 g" }, grams: 500, price: 285, mrp: 330, stock: 0 },
    ],
  },
  {
    slug: "cumin",
    name: "Cumin",
    subtitle: "Jeera · whole or ground",
    category: "spices",
    collections: ["whole-spices", "everyday-essentials", "everyday-tadka", "biryani"],
    art: { kind: "seeds", powder: "#8A6A3E", bg: "#EADFC8" },
    description: "Cumin as whole seeds for tadka and jeera rice, or ground for raita, chaas and spice rubs.",
    ingredients: "Cumin seeds",
    usage: "Whole: crackle in hot oil before adding onions. Ground: sprinkle over raita, buttermilk or chaat.",
    shelfLife: SHELF,
    tags: ["jeera", "cumin"],
    options: [
      { name: "Form", values: ["Whole", "Powder"] },
      { name: "Size", values: ["100 g", "250 g", "500 g"] },
    ],
    hsn: "090931",
    stock: { mode: "GRAM", poolBy: "Form", grams: { Whole: 8_000, Powder: 4_000 }, costPerKg: 32_000 },
    variants: [
      { values: { Form: "Whole", Size: "100 g" }, grams: 100, price: 75, mrp: 90 },
      { values: { Form: "Whole", Size: "250 g" }, grams: 250, price: 175, mrp: 210 },
      { values: { Form: "Whole", Size: "500 g" }, grams: 500, price: 330, mrp: 400 },
      { values: { Form: "Powder", Size: "100 g" }, grams: 100, price: 85, mrp: 99, hsn: "090932" },
      { values: { Form: "Powder", Size: "250 g" }, grams: 250, price: 195, mrp: 230, hsn: "090932" },
      { values: { Form: "Powder", Size: "500 g" }, grams: 500, price: 370, mrp: 440, hsn: "090932" },
    ],
  },
  {
    slug: "coriander-powder",
    name: "Coriander Powder",
    subtitle: "Dhaniya · ground",
    category: "spices",
    collections: ["ground-spices", "everyday-essentials", "everyday-tadka"],
    art: { kind: "powder", powder: "#A98A4F", bg: "#ECE2C9" },
    description: "Ground coriander with a mild, citrusy warmth, the backbone of most North Indian curries.",
    ingredients: "Coriander seeds",
    usage: "Add with other ground spices once onions and tomatoes are cooked down.",
    shelfLife: SHELF,
    tags: ["dhaniya", "coriander"],
    options: [{ name: "Size", values: ["200 g", "500 g", "1 kg"] }],
    hsn: "090922",
    stock: { mode: "PACK" },
    variants: sizes([
      ["200 g", 200, 70, 80, 50],
      ["500 g", 500, 160, 185, 30],
      ["1 kg", 1000, 300, 350, 10],
    ]),
  },
  {
    slug: "garam-masala",
    name: "Garam Masala",
    subtitle: "Pouch or glass jar",
    category: "spices",
    collections: ["masala-blends", "bestsellers", "new-arrivals", "biryani"],
    featured: true,
    art: { kind: "masala", powder: "#7A4A2A", bg: "#EBDCCB" },
    description: "A warming blend of whole spices, roasted and ground. Finish curries, biryanis and dals with a pinch for aroma.",
    ingredients: "Coriander, cumin, black pepper, cinnamon, cardamom, cloves, bay leaf, nutmeg (sample list, confirm for your recipe)",
    usage: "Add a pinch towards the end of cooking, or sprinkle over a finished dish.",
    shelfLife: SHELF,
    tags: ["masala", "blend"],
    options: [
      { name: "Pack", values: ["Pouch", "Jar"] },
      { name: "Size", values: ["100 g", "200 g"] },
    ],
    hsn: "091091",
    stock: { mode: "PACK" },
    variants: [
      { values: { Pack: "Pouch", Size: "100 g" }, grams: 100, price: 110, mrp: 130, stock: 40 },
      { values: { Pack: "Pouch", Size: "200 g" }, grams: 200, price: 205, mrp: 240, stock: 25 },
      { values: { Pack: "Jar", Size: "100 g" }, grams: 100, price: 150, mrp: 175, stock: 15 },
      { values: { Pack: "Jar", Size: "200 g" }, grams: 200, price: 260, mrp: 300, stock: 8 },
    ],
  },
  {
    slug: "black-pepper",
    name: "Black Pepper",
    subtitle: "Kali mirch · whole or ground",
    category: "spices",
    collections: ["whole-spices", "everyday-essentials", "masala-chai", "south-indian"],
    art: { kind: "pepper", bg: "#E4DDD2" },
    description: "Bold, pungent black pepper. Keep whole peppercorns for your grinder or buy it freshly ground.",
    ingredients: "Black pepper",
    usage: "Grind fresh over eggs, salads and soups, or add whole to rice and gravies.",
    shelfLife: SHELF,
    tags: ["kali mirch", "pepper"],
    options: [
      { name: "Form", values: ["Whole", "Powder"] },
      { name: "Size", values: ["50 g", "100 g", "250 g"] },
    ],
    hsn: "090411",
    stock: { mode: "GRAM", poolBy: "Form", grams: { Whole: 3_000, Powder: 1_500 }, costPerKg: 60_000 },
    variants: [
      { values: { Form: "Whole", Size: "50 g" }, grams: 50, price: 70, mrp: 80 },
      { values: { Form: "Whole", Size: "100 g" }, grams: 100, price: 130, mrp: 150 },
      { values: { Form: "Whole", Size: "250 g" }, grams: 250, price: 310, mrp: 360 },
      { values: { Form: "Powder", Size: "50 g" }, grams: 50, price: 75, mrp: 85, hsn: "090412" },
      { values: { Form: "Powder", Size: "100 g" }, grams: 100, price: 140, mrp: 160, hsn: "090412" },
    ],
  },
  {
    slug: "green-cardamom",
    name: "Green Cardamom",
    subtitle: "Elaichi · whole pods",
    category: "spices",
    collections: ["whole-spices", "bestsellers", "biryani", "masala-chai"],
    art: { kind: "cardamom", bg: "#E1E8D2" },
    description: "Fragrant green cardamom pods for chai, kheer, biryani and sweets.",
    ingredients: "Green cardamom",
    usage: "Lightly crush 2–3 pods and add to chai or rice. Grind the seeds for desserts.",
    shelfLife: SHELF,
    tags: ["elaichi", "cardamom"],
    options: [{ name: "Size", values: ["25 g", "50 g", "100 g"] }],
    hsn: "090831",
    stock: { mode: "PACK" },
    variants: sizes([
      ["25 g", 25, 90, 105, 30],
      ["50 g", 50, 170, 199, 20],
      ["100 g", 100, 320, 375, 6],
    ]),
  },
  {
    slug: "cinnamon-sticks",
    name: "Cinnamon Sticks",
    subtitle: "Dalchini · whole",
    category: "spices",
    collections: ["whole-spices", "new-arrivals", "biryani", "masala-chai"],
    art: { kind: "cinnamon", bg: "#EEDCCB" },
    description: "Whole cinnamon sticks for pulao, biryani, masala chai and baking.",
    ingredients: "Cinnamon",
    usage: "Add a stick to hot oil with other whole spices, or simmer in chai.",
    shelfLife: SHELF,
    tags: ["dalchini", "cinnamon"],
    options: [{ name: "Size", values: ["50 g", "100 g"] }],
    hsn: "090619",
    stock: { mode: "PACK" },
    variants: sizes([
      ["50 g", 50, 60, 70, 25],
      ["100 g", 100, 110, 130, 15],
    ]),
  },
  {
    slug: "star-anise",
    name: "Star Anise",
    subtitle: "Chakri phool · whole",
    category: "spices",
    collections: ["whole-spices", "new-arrivals", "biryani"],
    art: { kind: "anise", bg: "#EDD9C6" },
    description: "Whole star anise with a sweet, liquorice-like aroma for biryanis and slow-cooked gravies.",
    ingredients: "Star anise",
    usage: "Add one or two whole stars while cooking; remove before serving.",
    shelfLife: SHELF,
    tags: ["chakri phool", "star anise", "badiyan"],
    options: [{ name: "Size", values: ["50 g", "100 g"] }],
    hsn: "090961",
    stock: { mode: "PACK" },
    variants: sizes([
      ["50 g", 50, 85, 99, 20],
      ["100 g", 100, 160, 185, 10],
    ]),
  },
  {
    slug: "bay-leaves",
    name: "Bay Leaves",
    subtitle: "Tej patta · whole",
    category: "spices",
    collections: ["whole-spices", "biryani"],
    art: { kind: "bay", bg: "#E3E6D2" },
    description: "Dried Indian bay leaves for rice, dals and gravies.",
    ingredients: "Bay leaves",
    usage: "Add 1–2 leaves to hot oil at the start of cooking; remove before serving.",
    shelfLife: SHELF,
    tags: ["tej patta", "bay leaf"],
    options: [{ name: "Size", values: ["25 g", "50 g"] }],
    hsn: "091099",
    stock: { mode: "PACK" },
    variants: sizes([
      ["25 g", 25, 35, 40, 0],
      ["50 g", 50, 60, 70, 0],
    ]),
  },
  {
    slug: "sambar-masala",
    name: "Sambar Masala",
    subtitle: "South Indian blend",
    category: "spices",
    collections: ["masala-blends", "new-arrivals", "south-indian"],
    art: { kind: "masala", powder: "#9A4B25", bg: "#EED8C4" },
    description: "A tangy, aromatic blend for sambar and vegetable curries.",
    ingredients: "Coriander, red chilli, chana dal, toor dal, cumin, fenugreek, black pepper, curry leaves, asafoetida (sample list, confirm for your recipe)",
    usage: "Add 1–2 tablespoons to simmering dal and vegetables with tamarind.",
    shelfLife: SHELF,
    tags: ["sambar", "masala", "blend"],
    options: [{ name: "Size", values: ["100 g", "200 g"] }],
    hsn: "091091",
    stock: { mode: "PACK" },
    variants: sizes([
      ["100 g", 100, 90, 105, 30],
      ["200 g", 200, 170, 199, 20],
    ]),
  },

  // ---- Beyond spices (SAMPLE products for the demo store) ----
  {
    slug: "cold-pressed-mustard-oil",
    code: "MUSOIL",
    name: "Cold-Pressed Mustard Oil",
    subtitle: "Kachi ghani · bottle or tin",
    category: "oils",
    collections: ["new-arrivals"],
    unit: "ml",
    art: { kind: "bottle", powder: "#D9A21B", bg: "#F3E3BC" },
    description: "Pungent, golden mustard oil for pickles, fish curries and North Indian tadka.",
    ingredients: "Mustard oil",
    usage: "Heat until it just starts to smoke, then lower the flame before adding spices.",
    storage: OIL_STORAGE,
    shelfLife: SHELF,
    tags: ["sarson ka tel", "kachi ghani", "mustard oil"],
    options: [
      { name: "Pack", values: ["Bottle", "Tin"] },
      { name: "Size", values: ["500 ml", "1 L", "5 L"] },
    ],
    hsn: "1514",
    stock: { mode: "PACK" },
    variants: [
      { values: { Pack: "Bottle", Size: "500 ml" }, grams: 500, packed: 760, price: 140, mrp: 165, stock: 30 },
      { values: { Pack: "Bottle", Size: "1 L" }, grams: 1000, packed: 1250, price: 260, mrp: 299, stock: 25 },
      { values: { Pack: "Tin", Size: "5 L" }, grams: 5000, packed: 5100, price: 1150, mrp: 1350, stock: 8 },
    ],
  },
  {
    slug: "cold-pressed-groundnut-oil",
    code: "GNTOIL",
    name: "Cold-Pressed Groundnut Oil",
    subtitle: "Moongphali tel · bottle or tin",
    category: "oils",
    collections: ["south-indian"],
    unit: "ml",
    art: { kind: "bottle", powder: "#E9C46A", bg: "#EBDCCB" },
    description: "Mild, nutty groundnut oil for everyday frying and South Indian cooking.",
    ingredients: "Groundnut oil",
    usage: "Use for frying, tadka and dosa.",
    storage: OIL_STORAGE,
    shelfLife: SHELF,
    tags: ["moongphali tel", "peanut oil", "groundnut oil"],
    options: [
      { name: "Pack", values: ["Bottle", "Tin"] },
      { name: "Size", values: ["1 L", "5 L"] },
    ],
    hsn: "1508",
    stock: { mode: "PACK" },
    variants: [
      { values: { Pack: "Bottle", Size: "1 L" }, grams: 1000, packed: 1250, price: 320, mrp: 360, stock: 20 },
      { values: { Pack: "Tin", Size: "5 L" }, grams: 5000, packed: 5100, price: 1480, mrp: 1650, stock: 6 },
    ],
  },
  {
    slug: "toor-dal",
    name: "Toor Dal",
    subtitle: "Arhar dal",
    category: "pulses",
    collections: ["everyday-essentials", "south-indian"],
    art: { kind: "dal", powder: "#E9B949", bg: "#F3E3BC" },
    description: "Split pigeon peas for everyday dal and sambar. Cooks soft and creamy.",
    ingredients: "Toor dal (split pigeon peas)",
    usage: "Rinse, soak for 30 minutes, then pressure-cook with turmeric and salt.",
    shelfLife: SHELF,
    tags: ["arhar", "tuvar", "toor dal", "pigeon peas"],
    options: [{ name: "Size", values: ["500 g", "1 kg"] }],
    hsn: "0713",
    stock: { mode: "PACK" },
    variants: sizes([
      ["500 g", 500, 95, 110, 40],
      ["1 kg", 1000, 180, 210, 30],
    ]),
  },
  {
    slug: "moong-dal",
    name: "Moong Dal",
    subtitle: "Split yellow moong",
    category: "pulses",
    collections: ["everyday-essentials"],
    art: { kind: "dal", powder: "#E8C547", bg: "#E5ECDC" },
    description: "Quick-cooking split moong for khichdi, dal tadka and halwa.",
    ingredients: "Split moong dal",
    usage: "Rinse and cook for 15–20 minutes, or 2 whistles in a pressure cooker.",
    shelfLife: SHELF,
    tags: ["moong", "mung", "yellow dal"],
    options: [{ name: "Size", values: ["500 g", "1 kg"] }],
    hsn: "0713",
    stock: { mode: "PACK" },
    variants: sizes([
      ["500 g", 500, 85, 99, 35],
      ["1 kg", 1000, 165, 190, 25],
    ]),
  },
  {
    slug: "basmati-rice",
    name: "Basmati Rice",
    subtitle: "Long grain",
    category: "grains",
    collections: ["biryani"],
    art: { kind: "rice", bg: "#EBDCCB" },
    description: "Long, fragrant grains that cook up separate and fluffy, for biryani and pulao.",
    ingredients: "Basmati rice",
    usage: "Rinse, soak for 20 minutes, and cook in 1¾ cups of water per cup of rice.",
    shelfLife: SHELF,
    tags: ["chawal", "basmati", "rice"],
    options: [{ name: "Size", values: ["1 kg", "5 kg"] }],
    hsn: "1006",
    stock: { mode: "PACK" },
    variants: sizes([
      ["1 kg", 1000, 160, 185, 30],
      ["5 kg", 5000, 760, 880, 10],
    ]),
  },
  {
    slug: "multiflora-honey",
    name: "Multiflora Honey",
    subtitle: "Shahad · glass jar",
    category: "honey",
    collections: ["new-arrivals"],
    art: { kind: "jar", powder: "#E3A33B", bg: "#F3E3BC" },
    description: "Golden honey from the nectar of many flowers. Lovely in tea, on toast or in sweets.",
    ingredients: "Honey",
    usage: "Stir into warm (not boiling) drinks, or drizzle over breakfast.",
    storage: "Keep the lid tight and store at room temperature. Honey can crystallise over time; warm the jar gently in water to melt it.",
    shelfLife: SHELF,
    tags: ["shahad", "madhu", "honey"],
    options: [{ name: "Size", values: ["250 g", "500 g"] }],
    hsn: "0409",
    stock: { mode: "PACK" },
    variants: [
      { values: { Size: "250 g" }, grams: 250, packed: 480, price: 199, mrp: 240, stock: 25 },
      { values: { Size: "500 g" }, grams: 500, packed: 800, price: 349, mrp: 420, stock: 15 },
    ],
  },
  {
    slug: "almonds",
    name: "Almonds",
    subtitle: "Badam · whole",
    category: "dry-fruits",
    collections: [],
    art: { kind: "nuts", powder: "almond", bg: "#EBDCCB" },
    description: "Crunchy whole almonds for snacking, soaking overnight and sweets.",
    ingredients: "Almonds",
    usage: "Soak a handful overnight and peel in the morning, or toast lightly for snacking.",
    shelfLife: SHELF,
    tags: ["badam", "almond"],
    options: [{ name: "Size", values: ["250 g", "500 g"] }],
    hsn: "0802",
    stock: { mode: "PACK" },
    variants: sizes([
      ["250 g", 250, 299, 350, 30],
      ["500 g", 500, 579, 680, 20],
    ]),
  },
  {
    slug: "cashews",
    name: "Cashews",
    subtitle: "Kaju · whole",
    category: "dry-fruits",
    collections: ["new-arrivals"],
    art: { kind: "nuts", powder: "cashew", bg: "#F3E3BC" },
    description: "Creamy whole cashews for snacking, rich gravies and sweets.",
    ingredients: "Cashew nuts",
    usage: "Soak and blend for rich gravies, or roast with a pinch of salt.",
    shelfLife: SHELF,
    tags: ["kaju", "cashew"],
    options: [{ name: "Size", values: ["250 g", "500 g"] }],
    hsn: "0801",
    stock: { mode: "PACK" },
    variants: sizes([
      ["250 g", 250, 329, 385, 30],
      ["500 g", 500, 639, 750, 20],
    ]),
  },
  {
    slug: "jaggery-powder",
    name: "Jaggery Powder",
    subtitle: "Gur · powdered",
    category: "others",
    collections: ["masala-chai"],
    art: { kind: "powder", powder: "#A86A2C", bg: "#EBDCCB" },
    description: "Powdered jaggery for chai, laddoos and everyday sweetening.",
    ingredients: "Jaggery (sugarcane)",
    usage: "Use in place of sugar in tea, sweets and chutneys.",
    shelfLife: SHELF,
    tags: ["gur", "gud", "jaggery"],
    options: [{ name: "Size", values: ["500 g", "1 kg"] }],
    hsn: "1701",
    stock: { mode: "PACK" },
    variants: sizes([
      ["500 g", 500, 89, 105, 40],
      ["1 kg", 1000, 169, 199, 25],
    ]),
  },
  {
    slug: "rock-salt",
    name: "Rock Salt",
    subtitle: "Sendha namak · ground",
    category: "others",
    collections: ["everyday-essentials"],
    art: { kind: "powder", powder: "#F0C9C4", bg: "#F2D6C8" },
    description: "Rock salt for fasting days, chaat and raita.",
    ingredients: "Rock salt",
    usage: "Use in place of regular salt in fasting recipes, or sprinkle over chaat and raita.",
    shelfLife: SHELF,
    tags: ["sendha namak", "rock salt", "pink salt"],
    options: [{ name: "Size", values: ["500 g", "1 kg"] }],
    hsn: "2501",
    stock: { mode: "PACK" },
    variants: sizes([
      ["500 g", 500, 45, 55, 50],
      ["1 kg", 1000, 85, 99, 30],
    ]),
  },
];

const COLLECTIONS: { slug: string; name: string; description: string; showOnHome: boolean; showInShopBy?: boolean; sortOrder: number; category?: string }[] = [
  // (The Whole / Ground / Masala blends filters inside Spices come from categories.ts.)
  { slug: "bestsellers", name: "Bestsellers", description: "What everyone's cooking with.", showOnHome: true, sortOrder: 1 },
  { slug: "new-arrivals", name: "New arrivals", description: "Fresh additions to the shelf.", showOnHome: true, sortOrder: 2 },
  { slug: "everyday-essentials", name: "Everyday essentials", description: "The kitchen basics you'll reach for daily.", showOnHome: false, sortOrder: 3 },
  // Shown as "Shop by dish" chips on the home page.
  { slug: "biryani", name: "Biryani", description: "Whole spices and masala for a fragrant biryani.", showOnHome: false, showInShopBy: true, sortOrder: 10 },
  { slug: "masala-chai", name: "Masala chai", description: "Everything for a warming cup of chai.", showOnHome: false, showInShopBy: true, sortOrder: 11 },
  { slug: "everyday-tadka", name: "Everyday tadka", description: "The basics for dal and sabzi.", showOnHome: false, showInShopBy: true, sortOrder: 12 },
  { slug: "south-indian", name: "South Indian", description: "For sambar, rasam and more.", showOnHome: false, showInShopBy: true, sortOrder: 13 },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Refusing to seed a non-local database.");

  if (update) {
    const added = await seedCatalogue();
    console.log(`Demo catalogue up to date: ${added} new sample products added; categories and collections checked.`);
    return;
  }

  const [{ n: orderCount }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from orders`)).rows;
  if (reset) {
    const { rows } = await db.execute<{ tablename: string }>(sql`select tablename from pg_tables where schemaname = 'public' and tablename <> '__drizzle_migrations'`);
    await db.execute(sql.raw(`truncate ${rows.map((r) => `"${r.tablename}"`).join(", ")} restart identity cascade`));
    console.log("Development database emptied.");
  } else if (orderCount > 0) {
    throw new Error("This database already has orders. Use --reset to wipe it (development only).");
  }

  const [{ n: productCount }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from products`)).rows;
  if (productCount > 0) {
    console.log("Catalogue already seeded. Use --reset to start over.");
    return;
  }

  await writeSettings(db, "store", {
    tradeName: "The Farm Door",
    legalName: "",
    cin: "",
    gstin: "",
    fssaiNumber: "",
    addressLine1: "",
    addressLine2: "",
    city: "Jaipur",
    state: "Rajasthan",
    pincode: "",
    // DUMMY contact details for development only. The live site starts with a fresh
    // database, and the admin flags these sample values as missing until replaced.
    supportEmail: "support@example.com",
    supportPhone: "+91 00000 00000",
    supportHours: "Mon–Sat, 10 am – 6 pm",
    whatsappNumber: "",
    instagramUrl: "",
    facebookUrl: "",
    youtubeUrl: "",
  });
  await writeSettings(db, "shipping", {
    pickupPincode: "302001", // SAMPLE: replace with your actual pickup pincode
    freeShippingThresholdPaise: null,
    handlingFeePaise: 0,
    packagingWeightGrams: 80,
    boxLengthCm: 20,
    boxBreadthCm: 15,
    boxHeightCm: 10,
    courierChoice: "CHEAPEST",
  });
  await writeSettings(db, "cod", { enabled: true, feePaise: 0, maxOrderPaise: null, blockedPincodes: [], confirmationHours: 24 });
  await writeSettings(db, "checkout", { reservationMinutes: 15 });
  await writeSettings(db, "notifications", {
    ownerEmail: "owner@thefarmdoor.test",
    newOrderEmails: true,
    lowStockEmails: true,
    dailySummary: true,
    unpaidReminder: true,
    unpaidReminderHours: 3,
  });

  await seedCatalogue();

  await db.insert(t.coupons).values([
    { code: "WELCOME10", description: "SAMPLE: 10% off orders over ₹499", type: "PERCENT", value: 1000, minOrderPaise: 49_900, maxDiscountPaise: 20_000, usageLimitPerCustomer: 1 },
    { code: "FREESHIP", description: "SAMPLE: free shipping over ₹799", type: "FREE_SHIPPING", value: 0, minOrderPaise: 79_900 },
  ]);

  // Owner account: password generated here, 2-step verification set up at first sign-in.
  const password = `Farm-${randomBytes(9).toString("base64url")}`;
  await db.insert(t.staffUsers).values({ email: "owner@thefarmdoor.test", name: "Store Owner", passwordHash: await hashPassword(password), role: "OWNER" });
  // The automated browser tests seed their own database and don't need (or overwrite) your sign-in file.
  if (process.env.SEED_SKIP_CREDENTIALS === "1") {
    console.log(`Seeded ${PRODUCTS.length} sample products for automated tests.`);
    return;
  }
  writeFileSync(
    "DEV_CREDENTIALS.md",
    `# Development sign-in (local only; never used on the live site)\n\nAdmin: http://localhost:3000/admin/login\n\n- Email: owner@thefarmdoor.test\n- Password: ${password}\n\nOn first sign-in you'll be asked to scan a QR code with an authenticator app.\nCustomer sign-in codes appear in the terminal running \`npm run dev\` and in Admin > Email log.\n`,
  );
  console.log(`Seeded ${PRODUCTS.length} sample products, ${DEFAULT_CATEGORIES.length} categories, 2 sample coupons and the owner account.`);
  console.log("Owner sign-in details written to DEV_CREDENTIALS.md (git-ignored).");
}

/**
 * The categories, collections and SAMPLE products. Only adds what's missing,
 * so it also brings an existing demo database up to date (--update): sample
 * products already there are moved to their current category and collections,
 * and get Hindi text where theirs is still empty. Returns how many products it added.
 */
async function seedCatalogue(): Promise<number> {
  await ensureDefaultCategories(db);
  const categoryIds = new Map((await db.select({ id: t.categories.id, slug: t.categories.slug }).from(t.categories)).map((c) => [c.slug, c.id]));
  for (const { category, ...c } of COLLECTIONS) {
    const categoryId = category ? categoryIds.get(category)! : null;
    await db
      .insert(t.collections)
      .values({ ...c, ...COLLECTIONS_HI[c.slug], categoryId })
      .onConflictDoNothing({ target: t.collections.slug });
    if (category) await db.update(t.collections).set({ categoryId }).where(eq(t.collections.slug, c.slug));
  }
  const collectionIds = new Map((await db.select({ id: t.collections.id, slug: t.collections.slug }).from(t.collections)).map((c) => [c.slug, c.id]));

  let added = 0;
  for (const [index, p] of PRODUCTS.entries()) {
    const seedNo = index + 1;
    const [existing] = await db.select({ id: t.products.id, nameHi: t.products.nameHi }).from(t.products).where(eq(t.products.slug, p.slug));
    if (existing) {
      await db
        .update(t.products)
        .set({ categoryId: categoryIds.get(p.category)!, netUnit: p.unit ?? "g", ...(existing.nameHi ? {} : productHindiColumns(p.slug, !!p.storage)) })
        .where(eq(t.products.id, existing.id));
      for (const [i, col] of p.collections.entries()) {
        await db.insert(t.collectionProducts).values({ collectionId: collectionIds.get(col)!, productId: existing.id, sortOrder: seedNo * 10 + i }).onConflictDoNothing();
      }
      continue;
    }
    added++;
    const [product] = await db
      .insert(t.products)
      .values({
        slug: p.slug,
        name: p.name,
        subtitle: p.subtitle,
        description: p.description,
        categoryId: categoryIds.get(p.category)!,
        status: "ACTIVE",
        tags: [...p.tags, "sample"],
        ingredients: p.ingredients,
        usageInstructions: p.usage,
        storageInstructions: p.storage ?? STORAGE,
        shelfLife: p.shelfLife,
        options: p.options,
        isFeatured: p.featured ?? false,
        netUnit: p.unit ?? "g",
        ...productHindiColumns(p.slug, !!p.storage),
        publishedAt: new Date(Date.now() - seedNo * 86_400_000),
      })
      .returning();

    const svg = productArt({ ...p.art, seed: seedNo * 7919 });
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const mediaId = await saveImage(db, png, "image/png", `${p.name} (sample image)`);
    await db.insert(t.productImages).values({ productId: product.id, mediaId, alt: `${p.name} (sample image)` });

    for (const [i, col] of p.collections.entries()) {
      await db.insert(t.collectionProducts).values({ collectionId: collectionIds.get(col)!, productId: product.id, sortOrder: seedNo * 10 + i });
    }

    // Stock pools.
    const code = p.code ?? p.slug.replace(/[^a-z]/g, "").slice(0, 6).toUpperCase();
    const bulkPools = new Map<string, number>();
    if (p.stock.mode === "GRAM") {
      const stock = p.stock;
      const groups = stock.poolBy ? p.options.find((o) => o.name === stock.poolBy)!.values : ["all"];
      for (const g of groups) {
        const grams = typeof stock.grams === "number" ? stock.grams : stock.grams[g];
        const [pool] = await db
          .insert(t.inventoryItems)
          .values({
            name: `${p.name}${g === "all" ? "" : ` (${g})`}, loose stock`,
            sku: `${code}${g === "all" ? "" : `-${g.slice(0, 3).toUpperCase()}`}-BULK`,
            unit: "GRAM",
            onHand: grams,
            lowStockThreshold: 1000,
            unitCostPaise: stock.costPerKg ?? null,
          })
          .returning({ id: t.inventoryItems.id });
        bulkPools.set(g, pool.id);
      }
    }

    for (const [i, v] of p.variants.entries()) {
      const suffix = Object.values(v.values)
        .map((x) => x.replace(/\s+/g, "").toUpperCase().slice(0, 5))
        .join("-");
      const sku = `${code}-${suffix}`;
      let inventoryItemId: number;
      let unitsPerSale = 1;
      if (p.stock.mode === "GRAM") {
        inventoryItemId = bulkPools.get(p.stock.poolBy ? v.values[p.stock.poolBy] : "all")!;
        unitsPerSale = v.grams;
      } else {
        const [pool] = await db
          .insert(t.inventoryItems)
          .values({ name: `${p.name} ${Object.values(v.values).join(" ")}`, sku, unit: "PACK", onHand: v.stock ?? 20, lowStockThreshold: 5, unitCostPaise: Math.round(v.price * 100 * 0.55) })
          .returning({ id: t.inventoryItems.id });
        inventoryItemId = pool.id;
      }
      await db.insert(t.productVariants).values({
        productId: product.id,
        sku,
        optionValues: v.values,
        pricePaise: v.price * 100,
        mrpPaise: v.mrp * 100,
        netWeightGrams: v.grams,
        shippingWeightGrams: v.packed ?? v.grams + (v.values.Pack === "Jar" ? 180 : 20),
        hsnCode: v.hsn ?? p.hsn,
        gstRateBp: 500,
        inventoryItemId,
        unitsPerSale,
        sortOrder: i,
        isActive: v.active ?? true,
      });
    }
  }


  // The first sample catalogue had three spice categories; their products are now in Spices (with these as collections).
  for (const slug of ["whole-spices", "ground-spices", "masala-blends"]) {
    const [old] = await db.select({ id: t.categories.id }).from(t.categories).where(eq(t.categories.slug, slug));
    if (!old) continue;
    const [{ n }] = (await db.execute<{ n: number }>(sql`select count(*)::int as n from products where category_id = ${old.id}`)).rows;
    if (n === 0) await db.delete(t.categories).where(eq(t.categories.id, old.id));
  }
  return added;
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
