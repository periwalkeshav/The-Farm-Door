import Link from "next/link";
import { Suspense } from "react";
import { CatalogImport } from "@/components/admin/catalog-import";
import { PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";

export const metadata = { title: "Import products" };

const COLUMNS: [string, string][] = [
  ["product", "Product name. Rows with the same product (or web_address) are one product, one row per pack size. Required."],
  ["web_address", "Optional, e.g. turmeric-powder. Used to find the product again when you re-import."],
  ["category", "Optional. Must match a category you've already created."],
  ["status", "Draft, Active or Archived. New products are drafts if left empty."],
  ["option1_name / option1_value", "e.g. Size / 250 g. Up to three options (Form, Heat, Size…). Leave empty for products that only vary by weight."],
  ["sku", "Your code for the pack, e.g. TURM-250. Required and unique. Re-importing a SKU updates that pack."],
  ["price, mrp", "In rupees, including GST, e.g. 149 or 149.50. MRP must be at least the price. Required."],
  ["net_weight_g, packed_weight_g", "Grams. Net weight is required; packed weight (with pouch/jar) defaults to net + 30 g."],
  ["hsn, gst_percent", "HSN code (4–8 digits) and GST rate (0, 5, 12, 18 or 28). Confirm both with your CA. Required."],
  ["on_sale", "Yes or No (default Yes)."],
  ["opening_stock", "Packs in stock, for new packs only. Change stock for existing packs under Inventory."],
  ["loose_stock_code", "Optional. The code of a loose (kg) stock pool this pack is filled from, instead of counting packs."],
  ["ingredients, how_to_use, storage, shelf_life, country_of_origin, allergens, tags", "Optional product details. Empty cells leave existing details unchanged."],
];

export default function ImportPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <ImportContent />
    </Suspense>
  );
}

async function ImportContent() {
  await requireStaff("products.manage");
  return (
    <>
      <PageHeader
        title="Import products from a spreadsheet"
        description="Prepare your catalogue in Excel or Google Sheets, check it here, then import. Nothing changes until you press Import, and nothing is ever deleted."
        actions={
          <Link href="/admin/products" className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
            Back to products
          </Link>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
        <div className="space-y-6">
          <Panel title="1. Get a spreadsheet">
            <div className="flex flex-wrap gap-3 text-sm">
              <a href="/admin/export/catalogue-template" download className="rounded-full border border-forest px-4 py-2 font-semibold text-forest">
                Download the template
              </a>
              <a href="/admin/export/catalogue" download className="rounded-full border border-forest px-4 py-2 font-semibold text-forest">
                Download current catalogue
              </a>
            </div>
            <p className="mt-3 text-sm text-muted">To change prices in bulk, download the current catalogue, edit the price and mrp columns, and import it back. Save as CSV before uploading.</p>
          </Panel>
          <Panel title="2. Check and import">
            <CatalogImport />
          </Panel>
        </div>
        <Panel title="Columns">
          <dl className="space-y-3 text-sm">
            {COLUMNS.map(([k, v]) => (
              <div key={k}>
                <dt className="font-mono text-xs font-semibold text-forest">{k}</dt>
                <dd className="text-muted">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">Photos are added per product after importing.</p>
        </Panel>
      </div>
    </>
  );
}
