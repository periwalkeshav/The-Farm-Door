import { and, asc, desc, eq, ne } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AdjustStockForm, PoolSettingsForm } from "@/components/admin/inventory-forms";
import { AssembleForm, RecipeEditor } from "@/components/admin/kit-forms";
import { getRecipe } from "@/server/kits";
import { DataTable, PageHeader, Panel, StatTile, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { inventoryItems, orders, products, productVariants, staffUsers, stockMovements } from "@/db/schema";
import { variantTitle } from "@/server/catalog/variant-title";
import { can } from "@/server/permissions";
import { formatUnits } from "@/lib/units";

export const metadata = { title: "Stock pool" };

const REASONS: Record<string, string> = {
  RESERVE: "Held for order",
  RELEASE: "Hold released",
  SALE: "Sold",
  RESTOCK: "Restocked",
  ADJUSTMENT: "Correction",
  RETURN: "Returned to stock",
  ASSEMBLY: "Gift boxes made up / taken apart",
};

export default function PoolPage({ params }: PageProps<"/admin/inventory/[id]">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading…</p>}>
      <Pool params={params} />
    </Suspense>
  );
}

async function Pool({ params }: { params: PageProps<"/admin/inventory/[id]">["params"] }) {
  const staff = await requireStaff("inventory.view");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const db = getDb();
  const [pool] = await db.select().from(inventoryItems).where(eq(inventoryItems.id, id));
  if (!pool) notFound();
  const [variants, moves] = await Promise.all([
    db
      .select({ id: productVariants.id, productId: products.id, productName: products.name, options: products.options, optionValues: productVariants.optionValues, isActive: productVariants.isActive, unitsPerSale: productVariants.unitsPerSale })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(productVariants.inventoryItemId, id)),
    db
      .select({ m: stockMovements, orderNumber: orders.orderNumber, staffName: staffUsers.name })
      .from(stockMovements)
      .leftJoin(orders, eq(orders.id, stockMovements.orderId))
      .leftJoin(staffUsers, eq(staffUsers.id, stockMovements.staffUserId))
      .where(eq(stockMovements.inventoryItemId, id))
      .orderBy(desc(stockMovements.createdAt), desc(stockMovements.id))
      .limit(200),
  ]);
  const available = pool.onHand - pool.reserved;
  const manage = can(staff.role, "inventory.manage");
  const [recipe, otherPools] =
    pool.unit === "PACK"
      ? await Promise.all([
          getRecipe(db, pool.id),
          db.select({ id: inventoryItems.id, name: inventoryItems.name, unit: inventoryItems.unit }).from(inventoryItems).where(and(eq(inventoryItems.isActive, true), ne(inventoryItems.id, pool.id))).orderBy(asc(inventoryItems.name)),
        ])
      : [[], []];

  return (
    <>
      <Link href="/admin/inventory" className="text-sm text-muted hover:underline">
        ← Inventory
      </Link>
      <PageHeader title={pool.name} description={`${pool.unit === "GRAM" ? "Loose stock, counted in grams" : "Packed stock, counted in packs"} · Code ${pool.sku}${pool.isActive ? "" : " · inactive"}`} />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="On hand" value={formatUnits(pool.onHand, pool.unit)} />
        <StatTile label="Held for unpaid / unconfirmed orders" value={formatUnits(pool.reserved, pool.unit)} />
        <StatTile label="Available to sell" value={formatUnits(available, pool.unit)} hint={available <= pool.lowStockThreshold ? "At or below the alert level" : undefined} />
      </div>
      {manage && (
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <Panel title="Change stock">
            <AdjustStockForm poolId={pool.id} unit={pool.unit} />
          </Panel>
          <Panel title="Settings">
            <PoolSettingsForm pool={pool} />
          </Panel>
        </div>
      )}
      {pool.unit === "PACK" && (manage || recipe.length > 0) && (
        <Panel title="Gift box / combo contents" className="mb-6">
          <p className="mb-4 text-sm text-muted">
            For boxes packed in advance (a Diwali hamper, a starter combo). Record what one box holds, then make up boxes from stock. For a normal pack size, leave this empty. Ask your CA which GST rate applies to a mixed box.
          </p>
          {manage ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <RecipeEditor kitItemId={pool.id} initial={recipe} pools={otherPools} />
              <AssembleForm kitItemId={pool.id} hasRecipe={recipe.length > 0} />
            </div>
          ) : (
            <ul className="list-disc pl-5 text-sm">
              {recipe.map((r) => (
                <li key={r.componentItemId}>{r.unit === "GRAM" ? `${formatUnits(r.quantity, "GRAM")} ${r.name}` : `${r.quantity} × ${r.name}`}</li>
              ))}
            </ul>
          )}
        </Panel>
      )}
      <Panel title="Sold as" className="mb-6">
        {variants.length ? (
          <ul className="space-y-1 text-sm">
            {variants.map((v) => (
              <li key={v.id}>
                <Link href={`/admin/products/${v.productId}`} className="font-semibold text-forest hover:underline">
                  {v.productName} · {variantTitle(v.options, v.optionValues)}
                </Link>
                <span className="text-muted">
                  {" "}
                  — uses {formatUnits(v.unitsPerSale, pool.unit)} per item{v.isActive ? "" : " (archived)"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">Not linked to any pack size yet. Choose this pool in a product&apos;s variant editor.</p>
        )}
      </Panel>
      <h2 className="mb-3 font-sans text-base font-bold text-forest">Stock history</h2>
      <DataTable head={["When", "Change", "On hand after", "Held after", "Reason", "By / order"]} empty={moves.length === 0}>
        {moves.map(({ m, orderNumber, staffName }) => (
          <tr key={m.id}>
            <Td className="whitespace-nowrap text-muted">{m.createdAt.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" })}</Td>
            <Td className="whitespace-nowrap">
              {m.changeOnHand !== 0 && (
                <span className={m.changeOnHand > 0 ? "text-[#1d6b2e]" : "text-chilli"}>
                  {m.changeOnHand > 0 ? "+" : "−"}
                  {formatUnits(Math.abs(m.changeOnHand), pool.unit)}
                </span>
              )}
              {m.changeOnHand === 0 && m.changeReserved !== 0 && (
                <span className="text-muted">
                  hold {m.changeReserved > 0 ? "+" : "−"}
                  {formatUnits(Math.abs(m.changeReserved), pool.unit)}
                </span>
              )}
            </Td>
            <Td>{formatUnits(m.onHandAfter, pool.unit)}</Td>
            <Td className="text-muted">{formatUnits(m.reservedAfter, pool.unit)}</Td>
            <Td>
              {REASONS[m.reason] ?? m.reason}
              {m.note && <span className="block text-xs text-muted">{m.note}</span>}
            </Td>
            <Td className="text-muted">
              {orderNumber ? (
                <Link href={`/admin/orders/${m.orderId}`} className="underline">
                  Order {orderNumber}
                </Link>
              ) : (
                (staffName ?? "System")
              )}
            </Td>
          </tr>
        ))}
      </DataTable>
    </>
  );
}
