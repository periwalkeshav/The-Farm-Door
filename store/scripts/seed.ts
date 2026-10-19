/**
 * Development seed: settings, a SAMPLE catalogue (made-up products, prices and
 * stock, with placeholder images), two sample coupons and the owner account.
 *
 *   npm run db:seed            # first run
 *   npm run db:seed -- --reset # wipe the development database and reseed
 *
 * Refuses to run in production or against a database that has real orders.
 */
import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { hashPassword } from "@/lib/crypto";
import { saveImage } from "@/server/media";
import { writeSettings } from "@/server/settings";
import { productArt, type ArtKind } from "./sample-art";
import sharp from "sharp";

const db = getDb();
const reset = process.argv.includes("--reset");

type VariantSpec = { values: Record<string, string>; price: number; mrp: number; grams: number; stock?: number; hsn?: string; active?: boolean };
type ProductSpec = {
  slug: string;
  name: string;
  subtitle: string;
  category: string;
  collections: string[];
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
const SHELF = "Best before 12 months from packing (sample text, confirm for your products)";

const sizes = (list: [string, number, number, number, number?][]) =>
  list.map(([size, grams, price, mrp, stock]) => ({ values: { Size: size }, grams, price, mrp, stock }));

const PRODUCTS: ProductSpec[] = [
  {
    slug: "turmeric-powder",
    name: "Turmeric Powder",
    subtitle: "Haldi · ground",
    category: "ground-spices",
    collections: ["bestsellers", "everyday-essentials"],
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
    category: "ground-spices",
    collections: ["bestsellers", "everyday-essentials"],
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
    category: "whole-spices",
    collections: ["everyday-essentials"],
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
    category: "ground-spices",
    collections: ["everyday-essentials"],
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
    category: "masala-blends",
    collections: ["bestsellers", "new-arrivals"],
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
    category: "whole-spices",
    collections: ["everyday-essentials"],
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
    category: "whole-spices",
    collections: ["bestsellers"],
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
    category: "whole-spices",
    collections: ["new-arrivals"],
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
    category: "whole-spices",
    collections: ["new-arrivals"],
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
    category: "whole-spices",
    collections: [],
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
    category: "masala-blends",
    collections: ["new-arrivals"],
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
];

const CATEGORIES = [
  { slug: "whole-spices", name: "Whole Spices", description: "Seeds, pods, barks and leaves, ready for tadka or your grinder.", sortOrder: 1 },
  { slug: "ground-spices", name: "Ground Spices", description: "Everyday powders for colour, heat and flavour.", sortOrder: 2 },
  { slug: "masala-blends", name: "Masala Blends", description: "Balanced blends for curries, biryanis and more.", sortOrder: 3 },
];

const COLLECTIONS = [
  { slug: "bestsellers", name: "Bestsellers", description: "What everyone's cooking with.", showOnHome: true, sortOrder: 1 },
  { slug: "new-arrivals", name: "New arrivals", description: "Fresh additions to the shelf.", showOnHome: true, sortOrder: 2 },
  { slug: "everyday-essentials", name: "Everyday essentials", description: "The spices you'll reach for daily.", showOnHome: false, sortOrder: 3 },
];

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed in production.");
  if (!process.env.DATABASE_URL?.includes("localhost")) throw new Error("Refusing to seed a non-local database.");

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
    gstin: "",
    fssaiNumber: "",
    addressLine1: "",
    addressLine2: "",
    city: "Jaipur",
    state: "Rajasthan",
    pincode: "",
    supportEmail: "",
    supportPhone: "",
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
    courierChoice: "RECOMMENDED",
  });
  await writeSettings(db, "cod", { enabled: true, feePaise: 0, maxOrderPaise: null, blockedPincodes: [], confirmationHours: 24 });
  await writeSettings(db, "checkout", { reservationMinutes: 15 });
  await writeSettings(db, "notifications", { ownerEmail: "owner@thefarmdoor.test", newOrderEmails: true, lowStockEmails: true, dailySummary: true });

  const categoryIds = new Map<string, number>();
  for (const c of CATEGORIES) {
    const [row] = await db.insert(t.categories).values(c).returning({ id: t.categories.id });
    categoryIds.set(c.slug, row.id);
  }
  const collectionIds = new Map<string, number>();
  for (const c of COLLECTIONS) {
    const [row] = await db.insert(t.collections).values(c).returning({ id: t.collections.id });
    collectionIds.set(c.slug, row.id);
  }

  let seedNo = 1;
  for (const p of PRODUCTS) {
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
    const code = p.slug.replace(/[^a-z]/g, "").slice(0, 6).toUpperCase();
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
        shippingWeightGrams: v.grams + (v.values.Pack === "Jar" ? 180 : 20),
        hsnCode: v.hsn ?? p.hsn,
        gstRateBp: 500,
        inventoryItemId,
        unitsPerSale,
        sortOrder: i,
        isActive: v.active ?? true,
      });
    }
    seedNo++;
  }

  await db.insert(t.coupons).values([
    { code: "WELCOME10", description: "SAMPLE: 10% off orders over ₹499", type: "PERCENT", value: 1000, minOrderPaise: 49_900, maxDiscountPaise: 20_000, usageLimitPerCustomer: 1 },
    { code: "FREESHIP", description: "SAMPLE: free shipping over ₹799", type: "FREE_SHIPPING", value: 0, minOrderPaise: 79_900 },
  ]);

  // Owner account: password generated here, 2-step verification set up at first sign-in.
  const password = `Farm-${randomBytes(9).toString("base64url")}`;
  await db.insert(t.staffUsers).values({ email: "owner@thefarmdoor.test", name: "Store Owner", passwordHash: await hashPassword(password), role: "OWNER" });
  writeFileSync(
    "DEV_CREDENTIALS.md",
    `# Development sign-in (local only; never used on the live site)\n\nAdmin: http://localhost:3000/admin/login\n\n- Email: owner@thefarmdoor.test\n- Password: ${password}\n\nOn first sign-in you'll be asked to scan a QR code with an authenticator app.\nCustomer sign-in codes appear in the terminal running \`npm run dev\` and in Admin > Email log.\n`,
  );
  console.log(`Seeded ${PRODUCTS.length} sample products, ${CATEGORIES.length} categories, 2 sample coupons and the owner account.`);
  console.log("Owner sign-in details written to DEV_CREDENTIALS.md (git-ignored).");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
