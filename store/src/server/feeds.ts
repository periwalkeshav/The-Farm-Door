/**
 * Product feed for Google Merchant Center (free Shopping listings). One item per
 * pack, grouped by product. Only active products with at least one photo are
 * listed, because Google rejects items without an image.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { DbOrTx } from "@/db";
import { categories, inventoryItems, productImages, products, productVariants } from "@/db/schema";
import { mediaUrl } from "@/lib/media-url";
import { variantTitle } from "./catalog/variant-title";
import { activeSales, priceWithSale } from "./sales";

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
const money = (paise: number) => `${(paise / 100).toFixed(2)} INR`;

export async function googleMerchantFeed(db: DbOrTx, baseUrl: string) {
  const rows = await db
    .select({ p: products, v: productVariants, pool: inventoryItems, category: categories.name, categorySlug: categories.slug })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .innerJoin(inventoryItems, eq(inventoryItems.id, productVariants.inventoryItemId))
    .leftJoin(categories, eq(categories.id, products.categoryId))
    .where(and(eq(products.status, "ACTIVE"), eq(productVariants.isActive, true)))
    .orderBy(asc(products.name), asc(productVariants.sortOrder));
  const ids = [...new Set(rows.map((r) => r.p.id))];
  const running = await activeSales(db);
  const images = ids.length ? await db.select().from(productImages).where(inArray(productImages.productId, ids)).orderBy(asc(productImages.sortOrder), asc(productImages.id)) : [];

  let skipped = 0;
  const items: string[] = [];
  for (const { p, v, pool, category, categorySlug } of rows) {
    const pics = images.filter((i) => i.productId === p.id);
    if (!pics.length) {
      skipped++;
      continue;
    }
    const title = variantTitle(p.options, v.optionValues);
    const available = pool.isActive && pool.onHand - pool.reserved >= v.unitsPerSale;
    const description = (p.description || p.subtitle || p.name).slice(0, 4900);
    const { pricePaise: price, sale } = priceWithSale(v.pricePaise, p, running);
    const onSale = price < v.mrpPaise;
    // With the sale's dates, Google falls back to <g:price> once it ends. That's only right when the
    // normal price is the MRP; otherwise the feed (refreshed hourly) carries the change.
    const saleWindow = sale && v.pricePaise === v.mrpPaise ? running.find((x) => x.id === sale.id) : undefined;
    items.push(
      [
        "<item>",
        `<g:id>${xml(v.sku)}</g:id>`,
        `<g:item_group_id>${xml(p.slug)}</g:item_group_id>`,
        `<title>${xml(`${p.name}${title ? ` – ${title}` : ""}`.slice(0, 150))}</title>`,
        `<description>${xml(description)}</description>`,
        `<link>${xml(`${baseUrl}/products/${p.slug}?pack=${v.id}`)}</link>`,
        `<g:image_link>${xml(`${baseUrl}${mediaUrl(pics[0].mediaId, "full")}`)}</g:image_link>`,
        ...pics.slice(1, 10).map((i) => `<g:additional_image_link>${xml(`${baseUrl}${mediaUrl(i.mediaId, "full")}`)}</g:additional_image_link>`),
        `<g:availability>${available ? "in_stock" : "out_of_stock"}</g:availability>`,
        `<g:price>${money(onSale ? v.mrpPaise : price)}</g:price>`,
        onSale ? `<g:sale_price>${money(price)}</g:sale_price>` : "",
        saleWindow ? `<g:sale_price_effective_date>${saleWindow.startsAt.toISOString()}/${saleWindow.endsAt.toISOString()}</g:sale_price_effective_date>` : "",
        "<g:condition>new</g:condition>",
        "<g:brand>The Farm Door</g:brand>",
        "<g:identifier_exists>no</g:identifier_exists>",
        // Spices get Google's spice category; for oils, dals, honey and the rest Google picks one from the title.
        /spice|masala/.test(categorySlug ?? "") ? "<g:google_product_category>Food, Beverages &amp; Tobacco &gt; Food Items &gt; Seasonings &amp; Spices</g:google_product_category>" : "",
        category ? `<g:product_type>${xml(category)}</g:product_type>` : "",
        `<g:shipping_weight>${v.shippingWeightGrams} g</g:shipping_weight>`,
        `<g:unit_pricing_measure>${v.netWeightGrams} ${p.netUnit}</g:unit_pricing_measure>`,
        `<g:unit_pricing_base_measure>100 ${p.netUnit}</g:unit_pricing_base_measure>`,
        "</item>",
      ]
        .filter(Boolean)
        .join(""),
    );
  }
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel><title>The Farm Door</title><link>${xml(baseUrl)}</link><description>Indian spices and pantry essentials</description>
${items.join("\n")}
</channel></rss>`;
  return { body, listed: items.length, skipped };
}
