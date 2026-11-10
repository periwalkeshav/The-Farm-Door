import { asc } from "drizzle-orm";
import { Suspense } from "react";
import { SaleForm, SaleRowActions, type SaleValues } from "@/components/admin/sale-forms";
import { Badge, PageHeader, Panel } from "@/components/admin/ui";
import { requireStaff } from "@/data/session";
import { getDb } from "@/db";
import { categories, products } from "@/db/schema";
import { listSales, type Sale } from "@/server/sales";

export const metadata = { title: "Sales" };

/** A Date as the value of a datetime-local field, in India time. */
function istInput(d: Date) {
  return new Date(d.getTime() + 330 * 60_000).toISOString().slice(0, 16);
}

function when(d: Date) {
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default function SalesPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading sales…</p>}>
      <Sales />
    </Suspense>
  );
}

async function Sales() {
  await requireStaff("coupons.manage");
  const db = getDb();
  const [rows, prods, cats] = await Promise.all([
    listSales(db),
    db.select({ id: products.id, name: products.name }).from(products).orderBy(asc(products.name)),
    db.select({ id: categories.id, name: categories.name }).from(categories).orderBy(asc(categories.sortOrder)),
  ]);
  const now = new Date();
  const values = (s: Sale): SaleValues => ({ id: s.id, name: s.name, percent: String(s.percentOffBp / 100), startsAt: istInput(s.startsAt), endsAt: istInput(s.endsAt), scope: s.scope, productIds: s.productIds, categoryIds: s.categoryIds, isActive: s.isActive });
  const covers = (s: Sale) =>
    s.scope === "ALL"
      ? "Everything"
      : s.scope === "CATEGORIES"
        ? cats.filter((c) => s.categoryIds.includes(c.id)).map((c) => c.name).join(", ")
        : `${s.productIds.length} product${s.productIds.length === 1 ? "" : "s"}`;
  const tomorrow = new Date(now.getTime() + 24 * 3600_000);
  tomorrow.setUTCHours(18, 30, 0, 0); // midnight IST

  return (
    <>
      <PageHeader
        title="Sales"
        description="Lower prices for a set time, like a Diwali sale. Products show the sale price and name, crossed out against MRP. Sales don't stack (the biggest discount wins); coupons and points still apply on top. Prices change within a couple of minutes of the start and end times; checkout always charges the exact price."
      />
      {rows.length === 0 ? (
        <p className="mb-6 rounded-2xl border border-line bg-paper p-6 text-sm text-muted">No sales yet.</p>
      ) : (
        <ul className="mb-6 space-y-3">
          {rows.map((s) => {
            const live = s.isActive && s.startsAt <= now && s.endsAt > now;
            const upcoming = s.isActive && s.startsAt > now;
            return (
              <li key={s.id} className="rounded-2xl border border-line bg-paper p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-forest">
                      {s.name} · {s.percentOffBp / 100}% off{" "}
                      {live ? <Badge tone="good">live</Badge> : upcoming ? <Badge tone="info">scheduled</Badge> : !s.isActive ? <Badge>off</Badge> : <Badge tone="neutral">ended</Badge>}
                    </p>
                    <p className="mt-1 text-sm text-muted">
                      {when(s.startsAt)} to {when(s.endsAt)} · {covers(s)}
                    </p>
                  </div>
                  <SaleRowActions sale={values(s)} products={prods} categories={cats} canEnd={live || upcoming} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Panel title="Schedule a sale">
        <SaleForm
          sale={{ id: null, name: "", percent: "", startsAt: istInput(tomorrow), endsAt: istInput(new Date(tomorrow.getTime() + 7 * 24 * 3600_000 - 60_000)), scope: "ALL", productIds: [], categoryIds: [], isActive: true }}
          products={prods}
          categories={cats}
        />
      </Panel>
    </>
  );
}
