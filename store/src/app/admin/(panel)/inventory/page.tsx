import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import Link from "next/link";
import { Suspense } from "react";
import { NewPoolForm } from "@/components/admin/inventory-forms";
import { Badge, DataTable, PageHeader, Panel, Td } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { inventoryItems, productVariants } from "@/db/schema";
import { formatINR } from "@/lib/money";
import { formatUnits } from "@/lib/units";
import { can } from "@/server/permissions";

export const metadata = { title: "Inventory" };

export default function InventoryPage({ searchParams }: PageProps<"/admin/inventory">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading inventory…</p>}>
      <InventoryList searchParams={searchParams} />
    </Suspense>
  );
}

async function InventoryList({ searchParams }: { searchParams: PageProps<"/admin/inventory">["searchParams"] }) {
  const staff = await requireStaff("inventory.view");
  const sp = await searchParams;
  const filter = typeof sp.show === "string" ? sp.show : "all";
  const where: (SQL | undefined)[] = [];
  if (filter === "low") where.push(sql`${inventoryItems.isActive} and (${inventoryItems.onHand} - ${inventoryItems.reserved}) <= ${inventoryItems.lowStockThreshold}`);
  if (filter === "loose") where.push(eq(inventoryItems.unit, "GRAM"));
  if (filter !== "inactive") where.push(eq(inventoryItems.isActive, true));
  else where.push(eq(inventoryItems.isActive, false));
  const rows = await getDb()
    .select({
      pool: inventoryItems,
      usedBy: sql<number>`(select count(*) from ${productVariants} v where v.inventory_item_id = ${inventoryItems.id} and v.is_active)::int`,
    })
    .from(inventoryItems)
    .where(and(...where))
    .orderBy(asc(sql`(${inventoryItems.onHand} - ${inventoryItems.reserved}) > ${inventoryItems.lowStockThreshold}`), asc(inventoryItems.name));

  const tabs = [
    ["all", "All"],
    ["low", "Low stock"],
    ["loose", "Loose stock"],
    ["inactive", "Inactive"],
  ];
  return (
    <>
      <PageHeader
        title="Inventory"
        description="Each pack size draws from a stock pool. Packed pools count ready packs; loose pools hold grams shared by several pack sizes. Held = reserved for orders awaiting payment or COD confirmation."
        actions={
          can(staff.role, "exports") ? (
            <a href="/admin/export/inventory" download className="rounded-full border border-forest px-4 py-2 text-sm font-semibold text-forest">
              Export CSV
            </a>
          ) : null
        }
      />
      {can(staff.role, "inventory.manage") && (
        <Panel title="New loose-stock pool" className="mb-6">
          <NewPoolForm />
          <p className="mt-2 text-xs text-muted">Packed-stock pools are created automatically when you add pack sizes to a product.</p>
        </Panel>
      )}
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map(([k, label]) => (
          <Link key={k} href={`/admin/inventory?show=${k}`} className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${filter === k ? "border-forest bg-forest text-ivory" : "border-line bg-paper text-forest"}`}>
            {label}
          </Link>
        ))}
      </div>
      <DataTable head={["Stock pool", "Type", "On hand", "Held", "Available", "Alert at", "Cost", "Used by"]} empty={rows.length === 0}>
        {rows.map(({ pool, usedBy }) => {
          const available = pool.onHand - pool.reserved;
          const low = available <= pool.lowStockThreshold;
          return (
            <tr key={pool.id} className="hover:bg-ivory">
              <Td>
                <Link href={`/admin/inventory/${pool.id}`} className="font-semibold text-forest hover:underline">
                  {pool.name}
                </Link>
                <span className="block font-mono text-xs text-muted">{pool.sku}</span>
              </Td>
              <Td>{pool.unit === "GRAM" ? "Loose" : "Packed"}</Td>
              <Td className="whitespace-nowrap">{formatUnits(pool.onHand, pool.unit)}</Td>
              <Td className="whitespace-nowrap text-muted">{pool.reserved ? formatUnits(pool.reserved, pool.unit) : "—"}</Td>
              <Td className="whitespace-nowrap">{low ? <Badge tone={available <= 0 ? "bad" : "warn"}>{available <= 0 ? "Out of stock" : formatUnits(available, pool.unit)}</Badge> : formatUnits(available, pool.unit)}</Td>
              <Td className="whitespace-nowrap text-muted">{formatUnits(pool.lowStockThreshold, pool.unit)}</Td>
              <Td className="whitespace-nowrap text-muted">{pool.unitCostPaise === null ? "—" : `${formatINR(pool.unitCostPaise)}/${pool.unit === "GRAM" ? "kg" : "pack"}`}</Td>
              <Td className="text-muted">{usedBy} variant{usedBy === 1 ? "" : "s"}</Td>
            </tr>
          );
        })}
      </DataTable>
    </>
  );
}
