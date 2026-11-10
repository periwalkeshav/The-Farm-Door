/**
 * The shop's categories, in menu order, with their Hindi names, and the
 * filter collections shown inside them (Whole / Ground / Masala blends inside
 * Spices). Used by the development seed, and safe to run against the live
 * database to create them there (it only adds what doesn't exist yet; it
 * never changes or removes anything):
 *
 *   npm run catalog:categories
 *
 * After that, manage them in Admin > Categories & collections. A category shows
 * to shoppers once it has a product on sale.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { categories, collections } from "@/db/schema";

export const DEFAULT_CATEGORIES = [
  { slug: "spices", name: "Spices", nameHi: "मसाले", description: "Whole spices, ground spices and masala blends for everyday cooking.", descriptionHi: "रोज़ के खाने के लिए साबुत मसाले, पिसे मसाले और मसाला ब्लेंड।", sortOrder: 1 },
  { slug: "oils", name: "Oils", nameHi: "तेल", description: "Cooking oils for tadka, frying and pickles.", descriptionHi: "तड़के, तलने और अचार के लिए खाने के तेल।", sortOrder: 2 },
  { slug: "pulses", name: "Pulses", nameHi: "दाल", description: "Dals and lentils for the everyday thali.", descriptionHi: "रोज़ की थाली के लिए दालें।", sortOrder: 3 },
  { slug: "grains", name: "Grains", nameHi: "अनाज", description: "Rice, millets and other grains.", descriptionHi: "चावल, मोटे अनाज और दूसरे अनाज।", sortOrder: 4 },
  { slug: "honey", name: "Honey", nameHi: "शहद", description: "Honey for your tea, toast and sweets.", descriptionHi: "चाय, टोस्ट और मिठाइयों के लिए शहद।", sortOrder: 5 },
  { slug: "dry-fruits", name: "Dry Fruits", nameHi: "मेवे", description: "Almonds, cashews and more for snacking and sweets.", descriptionHi: "खाने और मिठाइयों के लिए बादाम, काजू और बहुत कुछ।", sortOrder: 6 },
  { slug: "others", name: "Others", nameHi: "अन्य", description: "Jaggery and other kitchen essentials.", descriptionHi: "गुड़ और रसोई की दूसरी ज़रूरी चीज़ें।", sortOrder: 7 },
];

/** Collections shown as filter buttons on a category's page. */
export const DEFAULT_FILTERS = [
  { slug: "whole-spices", category: "spices", name: "Whole spices", nameHi: "साबुत मसाले", description: "Seeds, pods, barks and leaves, ready for tadka or your grinder.", descriptionHi: "बीज, फली, छाल और पत्ते, तड़के या पीसने के लिए तैयार।", sortOrder: 20 },
  { slug: "ground-spices", category: "spices", name: "Ground spices", nameHi: "पिसे मसाले", description: "Everyday powders for colour, heat and flavour.", descriptionHi: "रंग, तीखेपन और स्वाद के लिए रोज़ के पाउडर।", sortOrder: 21 },
  { slug: "masala-blends", category: "spices", name: "Masala blends", nameHi: "मसाला ब्लेंड", description: "Balanced blends for curries, biryanis and more.", descriptionHi: "करी, बिरयानी और बहुत कुछ के लिए संतुलित मसाले।", sortOrder: 22 },
];

/** Adds any of the categories and filter collections above that are missing (matched by web address). Returns how many were added. */
export async function ensureDefaultCategories(db = getDb()): Promise<number> {
  const added = await db.insert(categories).values(DEFAULT_CATEGORIES).onConflictDoNothing({ target: categories.slug }).returning({ id: categories.id });
  let filters = 0;
  for (const { category, ...f } of DEFAULT_FILTERS) {
    const [parent] = await db.select({ id: categories.id }).from(categories).where(eq(categories.slug, category));
    if (!parent) continue;
    filters += (await db.insert(collections).values({ ...f, categoryId: parent.id }).onConflictDoNothing({ target: collections.slug }).returning({ id: collections.id })).length;
  }
  return added.length + filters;
}

if (process.argv[1]?.endsWith("categories.ts")) {
  ensureDefaultCategories().then(
    (n) => {
      console.log(n ? `Added ${n} categories and filters. Manage them in Admin > Categories & collections.` : "All the categories were already there; nothing changed.");
      process.exit(0);
    },
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
